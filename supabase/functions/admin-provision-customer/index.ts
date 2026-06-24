/**
 * Smart Door — Edge Function: admin-provision-customer
 * supabase/functions/admin-provision-customer/index.ts
 *
 * The core of the Admin Internal Portal: SmartDoor staff (super_admin /
 * dealer) manually provision a customer who isn't coming through the
 * website checkout flow (e.g. dealer-installed, walk-in, bulk society
 * rollout). Does everything atomically, server-side, with service_role:
 *
 *   1. Generate a unique Plate ID (SD-XXXXXX), retrying on collision
 *   2. bcrypt-hash the initial PIN (never hashed client-side — same rule
 *      as set-owner-pin)
 *   3. Insert `users` row
 *   4. Insert `plates` row (provisioning_source = 'admin_manual')
 *   5. Generate QR (PNG + SVG), upload to the `qr-codes` storage bucket,
 *      write the public URLs back onto the plate row
 *   6. Optionally insert a `subscriptions` row for the chosen plan
 *   7. Log to `activation_events` (event_type = 'activated') and
 *      `admin_audit_logs` (action = 'customer_provisioned')
 *
 * Reuses sql/01_schema.sql + sql/08_admin_schema.sql + sql/12 tables —
 * no new tables created, only the additive columns in
 * sql/15_admin_provisioning_schema.sql.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import bcryptjs from 'npm:bcryptjs@2.4.3';
// @ts-ignore — esm.sh resolves at runtime
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';

const APP_URL    = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET  = 'qr-codes';

// Mirrors services/subscriptions.js PLANS — keep both in sync if pricing changes.
const PLAN_PRICES: Record<string, number> = { hardware_only: 0, smartdoor_care: 299 };

const PLATE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // matches services/plates.js generatePlateId() alphabet, no ambiguous 0/O/1/I

function randomPlateSuffix(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)];
  return `SD-${out}`;
}

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  const supabaseAdmin = getServiceClient();

  try {
    const ctx = await verifyAdminSession(req, supabaseAdmin);
    if (!ctx) return adminAuthError(headers);
    if (!adminCan(ctx, 'customers', 'write')) {
      return Response.json({ success: false, message: 'You do not have permission to create customers.' }, { status: 403, headers });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const {
      full_name, phone, email, address,
      product_type, initial_pin, subscription_plan,
    } = body as {
      full_name?: string; phone?: string; email?: string; address?: string;
      product_type?: string; initial_pin?: string; subscription_plan?: string;
    };

    // ── Validation ──
    if (!full_name || String(full_name).trim().length < 2) {
      return Response.json({ success: false, message: 'Full name is required.' }, { status: 400, headers });
    }
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return Response.json({ success: false, message: 'A valid 10-digit phone number is required.' }, { status: 400, headers });
    }
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return Response.json({ success: false, message: 'Email format is invalid.' }, { status: 400, headers });
    }
    const productType = ['acrylic', 'stainless', 'teakwood'].includes(String(product_type)) ? String(product_type) : 'acrylic';
    const pinStr = String(initial_pin || '').trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return Response.json({ success: false, message: 'Initial PIN must be exactly 4 digits.' }, { status: 400, headers });
    }
    const plan = ['hardware_only', 'smartdoor_care'].includes(String(subscription_plan)) ? String(subscription_plan) : 'hardware_only';

    // ── Generate a unique Plate ID (retry on collision, max 10 tries) ──
    let plateId = '';
    let isUnique = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomPlateSuffix();
      const { data: existingUser } = await supabaseAdmin.from('users').select('id').eq('plate_id', candidate).maybeSingle();
      const { data: existingPlate } = await supabaseAdmin.from('plates').select('id').eq('plate_id', candidate).maybeSingle();
      if (!existingUser && !existingPlate) {
        plateId = candidate;
        isUnique = true;
        break;
      }
    }
    if (!isUnique) {
      return Response.json({ success: false, message: 'Could not generate a unique Plate ID. Please try again.' }, { status: 500, headers });
    }

    // ── Hash PIN (bcrypt, cost 12 — matches set-owner-pin) ──
    const pinHash = bcryptjs.hashSync(pinStr, 12);

    // ── Insert user ──
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({
        full_name: String(full_name).trim(),
        phone: cleanPhone,
        email: cleanEmail,
        address: address ? String(address).trim() : null,
        plate_id: plateId,
        pin_hash: pinHash,
      })
      .select()
      .single();

    if (userErr || !user) {
      console.error('[admin-provision-customer] user insert failed:', userErr);
      return Response.json({ success: false, message: userErr?.message || 'Failed to create customer record.' }, { status: 500, headers });
    }

    // ── Insert plate ──
    const { data: plate, error: plateErr } = await supabaseAdmin
      .from('plates')
      .insert({
        plate_id: plateId,
        qr_slug: plateId,
        product_type: productType,
        status: 'active',
        owner_id: user.id,
        activation_date: new Date().toISOString(),
        provisioned_by: ctx.id,
        provisioning_source: 'admin_manual',
      })
      .select()
      .single();

    if (plateErr) {
      console.error('[admin-provision-customer] plate insert failed:', plateErr);
      // Roll back the user row so we don't leave an orphaned account behind.
      await supabaseAdmin.from('users').delete().eq('id', user.id);
      return Response.json({ success: false, message: 'Failed to create plate record.' }, { status: 500, headers });
    }

    // ── Generate + upload QR (PNG + SVG) ──
    const qrTargetUrl = `${APP_URL}/p/${plateId}`;
    let qrImageUrl: string | null = null;
    let qrSvgUrl: string | null = null;

    try {
      const pngDataUrl: string = await QRCode.toDataURL(qrTargetUrl, { width: 400, margin: 4, errorCorrectionLevel: 'M' });
      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const pngBlob = new Blob([pngBytes], { type: 'image/png' });
      const { error: pngErr } = await supabaseAdmin.storage.from(QR_BUCKET).upload(`${plateId}.png`, pngBlob, { contentType: 'image/png', upsert: true });
      if (!pngErr) qrImageUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${plateId}.png`).data?.publicUrl || null;

      const svgString: string = await QRCode.toString(qrTargetUrl, { type: 'svg', width: 400, margin: 4, errorCorrectionLevel: 'M' });
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
      const { error: svgErr } = await supabaseAdmin.storage.from(QR_BUCKET).upload(`${plateId}.svg`, svgBlob, { contentType: 'image/svg+xml', upsert: true });
      if (!svgErr) qrSvgUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${plateId}.svg`).data?.publicUrl || null;

      if (qrImageUrl || qrSvgUrl) {
        await supabaseAdmin.from('plates').update({ qr_image_url: qrImageUrl, qr_svg_url: qrSvgUrl }).eq('id', plate.id);
      }
    } catch (qrErr) {
      // Non-fatal — customer + plate already exist; QR can be regenerated later from QR Management.
      console.error('[admin-provision-customer] QR generation failed:', qrErr);
    }

    // ── Optional subscription ──
    let subscription = null;
    if (plan) {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          owner_id: user.id,
          plan,
          status: 'active',
          start_date: new Date().toISOString(),
          expiry_date: expiry.toISOString(),
          renewal_price: PLAN_PRICES[plan] ?? 0,
        })
        .select()
        .single();
      subscription = sub || null;
    }

    // ── Auto-create security_rules for the new owner ──
    // Visitor PWA reads security_rules to show night mode / status.
    // Without this row, getPlateBySlug falls back to defaults (fine), but
    // creating it here ensures realtime subscriptions and owner dashboard work immediately.
    await supabaseAdmin
      .from('security_rules')
      .upsert(
        {
          owner_id: user.id,
          night_mode_on: false,
          night_mode_start: '22:00:00',
          night_mode_end: '07:00:00',
          allow_sos: true,
          allow_voice: true,
          allow_calls: true,
          call_forwarding: true,
          current_status: 'available',
          custom_message: null,
        },
        { onConflict: 'owner_id', ignoreDuplicates: true }
      );

    // ── Audit trail ──
    await supabaseAdmin.from('activation_events').insert({
      plate_id: plateId,
      owner_id: user.id,
      event_type: 'activated',
      event_detail: 'Provisioned via Internal Admin Portal',
      actor: 'admin',
      metadata: { provisioned_by: ctx.email, role: ctx.role_name, product_type: productType },
    });

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'customer_provisioned',
      resource: 'customers',
      resource_id: user.id,
      after_data: { full_name: user.full_name, phone: user.phone, plate_id: plateId, product_type: productType, plan },
      notes: `Customer + plate ${plateId} created by ${ctx.role_name}`,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
    });

    return Response.json({
      success: true,
      customer: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        address: user.address,
        plate_id: plateId,
        product_type: productType,
        activation_date: plate.activation_date,
        subscription_plan: plan,
        qr_url: qrTargetUrl,
        qr_image_url: qrImageUrl,
        qr_svg_url: qrSvgUrl,
      },
    }, { headers });

  } catch (err) {
    console.error('[admin-provision-customer] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
