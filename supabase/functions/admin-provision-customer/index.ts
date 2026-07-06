/**
 * Smart Door — Edge Function: admin-provision-customer
 * supabase/functions/admin-provision-customer/index.ts
 *
 * PATCHED (Migration 25 / Master Stabilization):
 *   — Accepts order_source ('admin_manual'|'amazon'|'flipkart'|'offline'|'whatsapp')
 *   — Accepts external_order_id (Amazon/Flipkart order reference)
 *   — Auto-creates orders row (ONE SOURCE OF TRUTH — every customer has an order)
 *   — Auto-creates manufacturing row
 *
 * Original flow:
 *   1. Generate unique Plate ID
 *   2. bcrypt-hash initial PIN
 *   3. Insert users row
 *   4. Insert plates row
 *   5. Generate QR (PNG + SVG) → Storage
 *   6. Insert subscriptions row
 *   7. Create security_rules row
 *   8. Log activation_events + admin_audit_logs
 *
 * Added (this patch):
 *   9. Insert orders row (order_source, fulfilment_status='live')
 *  10. Insert manufacturing row (production_status='ready')
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import bcryptjs from 'npm:bcryptjs@2.4.3';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';
// G2 FIX: branded QR renderer (was: plain `qrcode` lib output — see premiumQr.ts header)
import { buildPremiumQrSvg, buildPremiumQrPngDataUrl } from '../_shared/premiumQr.ts';

const APP_URL   = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET = 'qr-codes';

const PLAN_PRICES: Record<string, number> = { hardware_only: 0, smartdoor_care: 299 };
const VALID_SOURCES = ['admin_manual', 'amazon', 'flipkart', 'offline', 'whatsapp'];

const PLATE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPlateSuffix(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)];
  return `SD-${out}`;
}

function makeOrderNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SD-ORD-${d}-${r}`;
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
      order_source,        // NEW: 'admin_manual'|'amazon'|'flipkart'|'offline'|'whatsapp'
      external_order_id,   // NEW: Amazon/Flipkart order number for reference
    } = body as {
      full_name?: string; phone?: string; email?: string; address?: string;
      product_type?: string; initial_pin?: string; subscription_plan?: string;
      order_source?: string; external_order_id?: string;
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
    const cleanSource = VALID_SOURCES.includes(String(order_source)) ? String(order_source) : 'admin_manual';
    const cleanExtOrderId = external_order_id ? String(external_order_id).trim() : null;

    // ── Generate a unique Plate ID ──
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

    // ── Hash PIN ──
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
        provisioning_source: cleanSource,
      })
      .select()
      .single();

    if (plateErr) {
      console.error('[admin-provision-customer] plate insert failed:', plateErr);
      await supabaseAdmin.from('users').delete().eq('id', user.id);
      return Response.json({ success: false, message: 'Failed to create plate record.' }, { status: 500, headers });
    }

    // ── Generate + upload QR (PNG + SVG) ──
    // G2 FIX: was plain `qrcode` output + a generic lock-icon overlay that did
    // not match the premium gold-on-black shield-logo design used elsewhere
    // (services/qr.js, generate-qr, admin-plate-status). Now uses the same
    // shared branded renderer so newly provisioned plates match the design
    // from the moment they're created.
    const qrTargetUrl = `${APP_URL}/p/${plateId}`;
    let qrImageUrl: string | null = null;
    let qrSvgUrl: string | null = null;

    try {
      const pngDataUrl: string = await buildPremiumQrPngDataUrl(qrTargetUrl, { width: 800, margin: 2 });
      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const pngBlob = new Blob([pngBytes], { type: 'image/png' });
      const { error: pngErr } = await supabaseAdmin.storage.from(QR_BUCKET).upload(`${plateId}.png`, pngBlob, { contentType: 'image/png', upsert: true });
      if (!pngErr) qrImageUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${plateId}.png`).data?.publicUrl || null;

      const svgStyled = await buildPremiumQrSvg(supabaseAdmin, qrTargetUrl);
      const svgBlob = new Blob([svgStyled], { type: 'image/svg+xml' });
      const { error: svgErr } = await supabaseAdmin.storage.from(QR_BUCKET).upload(`${plateId}.svg`, svgBlob, { contentType: 'image/svg+xml', upsert: true });
      if (!svgErr) qrSvgUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${plateId}.svg`).data?.publicUrl || null;

      if (qrImageUrl || qrSvgUrl) {
        await supabaseAdmin.from('plates').update({ qr_image_url: qrImageUrl, qr_svg_url: qrSvgUrl }).eq('id', plate.id);
      }
    } catch (qrErr) {
      console.error('[admin-provision-customer] QR generation failed (non-fatal):', qrErr);
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

    // ── Auto-create security_rules ──
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

    // ── AUTO-CREATE ORDER (ONE SOURCE OF TRUTH — every customer has an order row) ──
    // Admin-provisioned customers are already "paid + delivered" from business perspective.
    // This ensures the orders table has a complete record for every customer regardless of source.
    const orderNumber = makeOrderNumber();
    const { data: order } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        owner_id: user.id,
        plate_id: plateId,
        product_type: productType,
        product_price: 0,
        subscription_price: PLAN_PRICES[plan] ?? 0,
        shipping_price: 0,
        total_amount: PLAN_PRICES[plan] ?? 0,
        payment_status: 'paid',
        manufacturing_status: 'delivered',
        tracking_status: 'delivered',
        fulfilment_status: 'live',    // admin-provisioned = already live
        order_source: cleanSource,
        external_order_id: cleanExtOrderId,
        customer_name: user.full_name,
        customer_phone: user.phone,
        customer_email: user.email,
        created_by_admin_id: ctx.id,   // Phase 6 completion: lets dealer role see only their own orders
      })
      .select()
      .single();

    // ── AUTO-CREATE MANUFACTURING ROW ──
    if (order) {
      await supabaseAdmin.from('manufacturing').insert({
        order_id: order.id,
        plate_id: plateId,
        plate_name: user.full_name,
        product_type: productType,
        qr_slug: plateId,
        qr_png_path: qrImageUrl ? `${plateId}.png` : null,
        qr_svg_path: qrSvgUrl ? `${plateId}.svg` : null,
        production_status: 'ready',
      }).catch((e: Error) => {
        // Non-fatal — manufacturing row is for internal tracking only.
        console.warn('[admin-provision-customer] manufacturing insert failed (non-fatal):', e.message);
      });
    }

    // ── Lifecycle notifications ──
    // Notify the owner (in-app) that their order is ready and QR is generated.
    // These are fire-and-forget — provisioning must not fail if notifications fail.
    try {
      const notifBase = { owner_id: user.id, channels: ['in_app'], delivery_status: {} };
      const notifs: object[] = [
        {
          ...notifBase, id: crypto.randomUUID(), type: 'status_change', priority: 'normal',
          title: '🛒 Order Confirmed',
          body: `Order ${orderNumber} received. Your plate ${plateId} is being prepared.`,
          payload: { plateId, orderNumber },
        },
      ];
      if (qrImageUrl || qrSvgUrl) {
        notifs.push({
          ...notifBase, id: crypto.randomUUID(), type: 'status_change', priority: 'normal',
          title: '📱 QR Code Generated',
          body: `Your Smart Door QR code for ${plateId} is ready.`,
          payload: { plateId },
        });
      }
      await supabaseAdmin.from('notifications').insert(notifs);
    } catch (_ne) { /* non-fatal */ }

    // ── Audit trail ──
    await supabaseAdmin.from('activation_events').insert({
      plate_id: plateId,
      owner_id: user.id,
      event_type: 'activated',
      event_detail: `Provisioned via Internal Admin Portal (source: ${cleanSource})`,
      actor: 'admin',
      metadata: {
        provisioned_by: ctx.email,
        role: ctx.role_name,
        product_type: productType,
        order_source: cleanSource,
        external_order_id: cleanExtOrderId,
      },
    });

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'customer_provisioned',
      resource: 'customers',
      resource_id: user.id,
      after_data: {
        full_name: user.full_name,
        phone: user.phone,
        plate_id: plateId,
        product_type: productType,
        plan,
        order_source: cleanSource,
        order_number: orderNumber,
      },
      notes: `Customer + plate ${plateId} created by ${ctx.role_name} (source: ${cleanSource})`,
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
        order_source: cleanSource,
        order_number: orderNumber,
        order_id: order?.id || null,
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
