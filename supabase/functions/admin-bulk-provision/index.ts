/**
 * Smart Door — Edge Function: admin-bulk-provision
 * supabase/functions/admin-bulk-provision/index.ts
 *
 * Admin → Bulk Create Plates
 * Accepts JSON array of rows (parsed from CSV on the frontend):
 *   [{ name, phone, email, product_type, pin }, ...]
 *
 * For each row:
 *   1. Validate fields
 *   2. Generate unique Plate ID
 *   3. bcrypt hash PIN
 *   4. Insert users row
 *   5. Insert plates row
 *   6. Generate QR (PNG + SVG) → upload to qr-codes bucket
 *   7. Optionally insert subscription
 *   8. Audit log per row
 *
 * Returns: { success, results: [{ row, status, plate_id?, error? }] }
 * Frontend exports bulk-import-results.csv from the results array.
 *
 * Allowed roles: super_admin, ops_manager, dealer
 * Permission: customers.write
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import bcryptjs from 'npm:bcryptjs@2.4.3';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';
// G2 FIX: branded QR renderer (was: plain `qrcode` lib output — see premiumQr.ts header)
import { buildPremiumQrSvg, buildPremiumQrPngDataUrl } from '../_shared/premiumQr.ts';

const APP_URL   = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET = 'qr-codes';
const PLATE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROWS = 500; // Safety cap per batch

function randomPlateSuffix(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)];
  return `SD-${out}`;
}

async function generateUniquePlateId(supabaseAdmin: ReturnType<typeof getServiceClient>): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomPlateSuffix();
    const { data: u } = await supabaseAdmin.from('users').select('id').eq('plate_id', candidate).maybeSingle();
    const { data: p } = await supabaseAdmin.from('plates').select('id').eq('plate_id', candidate).maybeSingle();
    if (!u && !p) return candidate;
  }
  return null;
}

// G2 FIX: was plain `qrcode` output (ECL 'M', no color) — now uses the same
// shared branded renderer as admin-provision-customer so bulk-created plates
// match the premium gold-on-black shield-logo design.
async function uploadQr(supabaseAdmin: ReturnType<typeof getServiceClient>, plateId: string) {
  const url = `${APP_URL}/p/${plateId}`;
  const pngDataUrl: string = await buildPremiumQrPngDataUrl(url, { width: 400, margin: 4 });
  const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  await supabaseAdmin.storage.from(QR_BUCKET).upload(`${plateId}.png`, new Blob([pngBytes], { type: 'image/png' }), { upsert: true });
  const qrImageUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${plateId}.png`).data?.publicUrl || null;

  const svgString: string = await buildPremiumQrSvg(supabaseAdmin, url);
  await supabaseAdmin.storage.from(QR_BUCKET).upload(`${plateId}.svg`, new Blob([svgString], { type: 'image/svg+xml' }), { upsert: true });
  const qrSvgUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${plateId}.svg`).data?.publicUrl || null;

  return { qrImageUrl, qrSvgUrl };
}

interface BulkRow {
  name?: string;
  phone?: string;
  email?: string;
  product_type?: string;
  pin?: string;
  subscription_plan?: string;
}

interface BulkResult {
  row: number;
  status: 'success' | 'failed' | 'skipped';
  plate_id?: string;
  name?: string;
  phone?: string;
  qr_url?: string;
  error?: string;
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
      return Response.json({ success: false, message: 'You do not have permission to bulk provision customers.' }, { status: 403, headers });
    }

    let body: { rows?: BulkRow[] };
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ success: false, message: 'rows array is required and must not be empty.' }, { status: 400, headers });
    }
    if (rows.length > MAX_ROWS) {
      return Response.json({ success: false, message: `Maximum ${MAX_ROWS} rows per batch. Split your CSV and retry.` }, { status: 400, headers });
    }

    const results: BulkResult[] = [];
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      // ── Per-row validation ──
      const cleanName = String(row.name || '').trim();
      if (cleanName.length < 2) {
        results.push({ row: rowNum, status: 'failed', error: 'name is required (min 2 chars)' });
        continue;
      }
      const cleanPhone = String(row.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) {
        results.push({ row: rowNum, status: 'failed', name: cleanName, error: 'phone must be a valid 10-digit number' });
        continue;
      }
      const cleanEmail = row.email ? String(row.email).trim().toLowerCase() : null;
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        results.push({ row: rowNum, status: 'failed', name: cleanName, error: 'email format is invalid' });
        continue;
      }
      const productType = ['acrylic', 'stainless', 'teakwood'].includes(String(row.product_type || '').toLowerCase())
        ? String(row.product_type).toLowerCase()
        : 'acrylic';
      const pinStr = String(row.pin || '').trim();
      if (!/^\d{4}$/.test(pinStr)) {
        results.push({ row: rowNum, status: 'failed', name: cleanName, error: 'pin must be exactly 4 digits' });
        continue;
      }
      const plan = ['hardware_only', 'smartdoor_care'].includes(String(row.subscription_plan || '').toLowerCase())
        ? String(row.subscription_plan).toLowerCase()
        : 'hardware_only';

      // ── Generate unique Plate ID ──
      const plateId = await generateUniquePlateId(supabaseAdmin);
      if (!plateId) {
        results.push({ row: rowNum, status: 'failed', name: cleanName, error: 'Could not generate unique Plate ID after 10 attempts' });
        continue;
      }

      // ── Hash PIN ──
      const pinHash = bcryptjs.hashSync(pinStr, 12);

      // ── Insert user ──
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users')
        .insert({ full_name: cleanName, phone: cleanPhone, email: cleanEmail, plate_id: plateId, pin_hash: pinHash })
        .select()
        .single();

      if (userErr || !user) {
        results.push({ row: rowNum, status: 'failed', name: cleanName, error: userErr?.message || 'Failed to create user' });
        continue;
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
          provisioning_source: 'admin_bulk',
          fulfillment_status: 'created',
        })
        .select()
        .single();

      if (plateErr) {
        await supabaseAdmin.from('users').delete().eq('id', user.id);
        results.push({ row: rowNum, status: 'failed', name: cleanName, error: plateErr.message || 'Failed to create plate' });
        continue;
      }

      // ── QR (non-fatal) ──
      let qrImageUrl: string | null = null;
      try {
        const qr = await uploadQr(supabaseAdmin, plateId);
        qrImageUrl = qr.qrImageUrl;
        await supabaseAdmin.from('plates').update({ qr_image_url: qr.qrImageUrl, qr_svg_url: qr.qrSvgUrl }).eq('id', plate.id);
      } catch {
        // QR can be regenerated later
      }

      // ── Optional subscription ──
      if (plan) {
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);
        await supabaseAdmin.from('subscriptions').insert({
          owner_id: user.id,
          plan,
          status: 'active',
          start_date: new Date().toISOString(),
          expiry_date: expiry.toISOString(),
          renewal_price: plan === 'smartdoor_care' ? 299 : 0,
        });
      }

      // ── Audit ──
      await supabaseAdmin.from('activation_events').insert({
        plate_id: plateId,
        owner_id: user.id,
        event_type: 'activated',
        event_detail: 'Bulk provisioned via Internal Admin Portal',
        actor: 'admin',
        metadata: { provisioned_by: ctx.email, role: ctx.role_name, product_type: productType, batch_row: rowNum },
      });

      results.push({
        row: rowNum,
        status: 'success',
        plate_id: plateId,
        name: cleanName,
        phone: cleanPhone,
        qr_url: `${APP_URL}/p/${plateId}`,
      });
    }

    // ── Batch audit log ──
    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status === 'failed').length;
    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'bulk_provision',
      resource: 'customers',
      after_data: { total: rows.length, success: successCount, failed: failCount },
      notes: `Bulk import: ${successCount} success, ${failCount} failed out of ${rows.length} rows`,
      ip_address: ip,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
    });

    return Response.json({
      success: true,
      summary: { total: rows.length, success: successCount, failed: failCount },
      results,
    }, { headers });

  } catch (err) {
    console.error('[admin-bulk-provision] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
