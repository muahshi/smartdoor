/**
 * Smart Door — Edge Function: admin-plate-status
 * supabase/functions/admin-plate-status/index.ts
 *
 * Plate Management → Suspend Plate / Reactivate Plate.
 *
 * Note: services/manufacturing.js already has client-side deactivateQR()/
 * reactivateQR() helpers, but they call supabase.from('plates').update(...)
 * directly with the anon key. Under the Phase 8 hardening in
 * sql/10_security_hardening.sql, `plates` has no anon/authenticated UPDATE
 * policy that matches an admin session (plates_update_own only matches the
 * real owner via auth.uid()) — so those calls silently fail under RLS.
 * This Edge Function is the working, service_role-backed replacement for
 * the new Plate Management UI; the legacy QR Management panel is left
 * as-is per "do not remove existing functionality".
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore — esm.sh resolves at runtime
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';

const APP_URL   = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET = 'qr-codes';

/**
 * Regenerates + uploads PNG/SVG for a plate and writes the public URLs
 * back onto plates.qr_image_url / qr_svg_url. Used for:
 *   (a) the "Download QR" action on legacy/order-provisioned plates that
 *       predate these columns (sql/15_admin_provisioning_schema.sql), and
 *   (b) re-issuing a QR after a physical plate is replaced.
 * Storage's qr-codes bucket is service_role-write-only
 * (sql/10_security_hardening.sql) — this is why it has to happen here
 * rather than in services/qr.js's client-side uploadQrToStorage().
 */
/**
 * Regenerates the premium gold-on-black SmartDoor QR for a plate.
 * Matches the design produced by services/qr.js and generate-qr edge function:
 *   • Gold (#D4AF37) modules on black (#000000)
 *   • 3 premium finder patterns
 *   • SmartDoor shield logo embedded (fetched from Storage)
 *   • Error correction H, quiet zone 4, 1500×1500 px
 *   • No text, no frame, no plaque
 */
async function regenerateQr(supabaseAdmin: ReturnType<typeof getServiceClient>, pid: string) {
  const targetUrl  = `${APP_URL}/p/${pid}`;
  const QR_BUCKET_LOCAL = QR_BUCKET;

  const GOLD   = '#D4AF37';
  const BLACK  = '#000000';
  const OUTPUT = 1500;
  const QUIET  = 4;
  const FINDER = 7;
  const LOGO_RATIO = 0.17;

  // @ts-ignore
  const qrData  = QRCode.create(targetUrl, { errorCorrectionLevel: 'H' });
  const modules = qrData.modules;
  const count: number = modules.size;

  const MOD_PX = OUTPUT / (count + QUIET * 2);
  const OFFSET = QUIET * MOD_PX;

  const finderOrigins = [
    { r: 0,             c: 0              },
    { r: 0,             c: count - FINDER  },
    { r: count - FINDER, c: 0             },
  ];

  function isInFinder(r: number, c: number) {
    return finderOrigins.some(f =>
      r >= f.r - 1 && r <= f.r + FINDER && c >= f.c - 1 && c <= f.c + FINDER
    );
  }

  const cx = Math.floor(count / 2);
  const hx = Math.ceil((count * LOGO_RATIO) / 2);
  function isInLogoZone(r: number, c: number) {
    return r >= cx - hx && r <= cx + hx && c >= cx - hx && c <= cx + hx;
  }

  // Data module rects
  const rects: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c) || isInFinder(r, c) || isInLogoZone(r, c)) continue;
      const x = OFFSET + c * MOD_PX, y = OFFSET + r * MOD_PX;
      const ms = MOD_PX - 1, br = ms * 0.25;
      rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${ms.toFixed(2)}" height="${ms.toFixed(2)}" rx="${br.toFixed(2)}" fill="${GOLD}"/>`);
    }
  }

  // Finder pattern SVG
  function finderSvg(sr: number, sc: number): string {
    const px = OFFSET + sc * MOD_PX, py = OFFSET + sr * MOD_PX;
    const sz = FINDER * MOD_PX, br = sz * 0.12;
    const g1 = MOD_PX, g2 = MOD_PX * 2;
    return [
      `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${sz.toFixed(2)}" height="${sz.toFixed(2)}" rx="${br.toFixed(2)}" fill="${GOLD}"/>`,
      `<rect x="${(px+g1).toFixed(2)}" y="${(py+g1).toFixed(2)}" width="${(sz-g1*2).toFixed(2)}" height="${(sz-g1*2).toFixed(2)}" rx="${(br*.5).toFixed(2)}" fill="${BLACK}"/>`,
      `<rect x="${(px+g2).toFixed(2)}" y="${(py+g2).toFixed(2)}" width="${(sz-g2*2).toFixed(2)}" height="${(sz-g2*2).toFixed(2)}" rx="${(br*.3).toFixed(2)}" fill="${GOLD}"/>`,
    ].join('\n');
  }

  const findersSvg = [
    finderSvg(0,             0            ),
    finderSvg(0,             count - FINDER),
    finderSvg(count - FINDER, 0            ),
  ].join('\n');

  // Logo — fetch from Storage, embed as base64
  let logoEl = '';
  try {
    const { data: logoUrlData } = supabaseAdmin.storage
      .from(QR_BUCKET_LOCAL).getPublicUrl('branding/smartdoor-shield.png');
    if (logoUrlData?.publicUrl) {
      const resp = await fetch(logoUrlData.publicUrl);
      if (resp.ok) {
        const buf   = await resp.arrayBuffer();
        const b64   = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const grid  = count * MOD_PX;
        const lpx   = grid * LOGO_RATIO;
        const lx    = OFFSET + (grid - lpx) / 2;
        const ly    = OFFSET + (grid - lpx) / 2;
        logoEl = `<image href="data:image/png;base64,${b64}" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${lpx.toFixed(2)}" height="${lpx.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
      }
    }
  } catch (_e) { /* logo non-fatal */ }

  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${OUTPUT}" height="${OUTPUT}" viewBox="0 0 ${OUTPUT} ${OUTPUT}">
  <rect width="${OUTPUT}" height="${OUTPUT}" fill="${BLACK}"/>
  ${rects.join('\n  ')}
  ${findersSvg}
  ${logoEl}
</svg>`;

  // Upload SVG
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  await supabaseAdmin.storage.from(QR_BUCKET_LOCAL)
    .upload(`${pid}.svg`, svgBlob, { contentType: 'image/svg+xml', upsert: true });
  const qrSvgUrl = supabaseAdmin.storage.from(QR_BUCKET_LOCAL)
    .getPublicUrl(`${pid}.svg`).data?.publicUrl || null;

  // PNG — gold/black via qrcode (no canvas in Deno)
  let qrImageUrl: string | null = null;
  try {
    const pngDataUrl: string = await QRCode.toDataURL(targetUrl, {
      width: 1500, margin: 4, errorCorrectionLevel: 'H',
      color: { dark: GOLD, light: BLACK },
    });
    const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), c => c.charCodeAt(0));
    const pngBlob  = new Blob([pngBytes], { type: 'image/png' });
    await supabaseAdmin.storage.from(QR_BUCKET_LOCAL)
      .upload(`${pid}.png`, pngBlob, { contentType: 'image/png', upsert: true });
    qrImageUrl = supabaseAdmin.storage.from(QR_BUCKET_LOCAL)
      .getPublicUrl(`${pid}.png`).data?.publicUrl || null;
  } catch (_e) { /* png non-fatal */ }

  await supabaseAdmin.from('plates').update({
    qr_image_url: qrImageUrl || qrSvgUrl,
    qr_svg_url:   qrSvgUrl,
  }).eq('plate_id', pid);

  return { qrImageUrl: qrImageUrl || qrSvgUrl, qrSvgUrl };
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
    if (!adminCan(ctx, 'plates', 'write')) {
      return Response.json({ success: false, message: 'You do not have permission to change plate status.' }, { status: 403, headers });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { plate_id, action, reason } = body as { plate_id?: string; action?: string; reason?: string };

    if (!plate_id || !['suspend', 'reactivate', 'regenerate_qr'].includes(String(action))) {
      return Response.json({ success: false, message: 'plate_id and a valid action (suspend|reactivate|regenerate_qr) are required.' }, { status: 400, headers });
    }

    const pid = String(plate_id).trim().toUpperCase();

    const { data: plate, error: plateErr } = await supabaseAdmin
      .from('plates')
      .select('id, plate_id, status, owner_id')
      .eq('plate_id', pid)
      .maybeSingle();

    if (plateErr || !plate) {
      return Response.json({ success: false, message: 'Plate not found.' }, { status: 404, headers });
    }

    // ── Regenerate QR (no status change) ──
    if (action === 'regenerate_qr') {
      try {
        const { qrImageUrl, qrSvgUrl } = await regenerateQr(supabaseAdmin, pid);
        await supabaseAdmin.from('admin_audit_logs').insert({
          admin_id: ctx.id,
          admin_email: ctx.email,
          action: 'qr_regenerated',
          resource: 'plates',
          resource_id: pid,
          notes: 'QR regenerated from Plate Management',
        });
        return Response.json({ success: true, qr_image_url: qrImageUrl, qr_svg_url: qrSvgUrl }, { headers });
      } catch (qrErr) {
        console.error('[admin-plate-status] QR regeneration failed:', qrErr);
        return Response.json({ success: false, message: 'Failed to regenerate QR.' }, { status: 500, headers });
      }
    }

    const isSuspend = action === 'suspend';
    const newStatus = isSuspend ? 'suspended' : 'active';

    if (isSuspend && (!reason || !String(reason).trim())) {
      return Response.json({ success: false, message: 'A reason is required to suspend a plate.' }, { status: 400, headers });
    }

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (isSuspend) {
      updatePayload.suspended_reason = String(reason).trim();
      updatePayload.suspended_at = new Date().toISOString();
      updatePayload.suspended_by = ctx.id;
    } else {
      updatePayload.suspended_reason = null;
      updatePayload.suspended_at = null;
      updatePayload.suspended_by = null;
      // FIX: isPlateActive() requires activation_date to be non-null.
      // Reactivation must stamp it so QR scan resolves to 'ready', not 'pending_activation'.
      updatePayload.activation_date = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('plates')
      .update(updatePayload)
      .eq('id', plate.id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin-plate-status] update failed:', updateErr);
      return Response.json({ success: false, message: 'Failed to update plate status.' }, { status: 500, headers });
    }

    await supabaseAdmin.from('activation_events').insert({
      plate_id: pid,
      owner_id: plate.owner_id,
      event_type: isSuspend ? 'deactivated' : 'activated',
      event_detail: isSuspend ? (reason || 'Suspended by admin') : 'Reactivated by admin',
      actor: 'admin',
      metadata: { admin_email: ctx.email, role: ctx.role_name },
    });

    if (plate.owner_id) {
      await supabaseAdmin.from('audit_logs').insert({
        owner_id: plate.owner_id,
        action: isSuspend ? 'plate_suspended' : 'plate_reactivated',
        details: { plate_id: pid, reason: reason || null, by: ctx.email },
      });
    }

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: isSuspend ? 'plate_suspended' : 'plate_reactivated',
      resource: 'plates',
      resource_id: pid,
      before_data: { status: plate.status },
      after_data: { status: newStatus },
      notes: isSuspend ? `Reason: ${reason}` : 'Reactivated',
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
    });

    return Response.json({ success: true, plate: updated }, { headers });

  } catch (err) {
    console.error('[admin-plate-status] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
