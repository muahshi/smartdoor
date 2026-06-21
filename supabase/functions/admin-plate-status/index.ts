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
async function regenerateQr(supabaseAdmin: ReturnType<typeof getServiceClient>, pid: string) {
  const targetUrl = `${APP_URL}/p/${pid}`;

  const pngDataUrl: string = await QRCode.toDataURL(targetUrl, { width: 400, margin: 4, errorCorrectionLevel: 'M' });
  const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const pngBlob = new Blob([pngBytes], { type: 'image/png' });
  await supabaseAdmin.storage.from(QR_BUCKET).upload(`${pid}.png`, pngBlob, { contentType: 'image/png', upsert: true });
  const qrImageUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${pid}.png`).data?.publicUrl || null;

  const svgString: string = await QRCode.toString(targetUrl, { type: 'svg', width: 400, margin: 4, errorCorrectionLevel: 'M' });
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  await supabaseAdmin.storage.from(QR_BUCKET).upload(`${pid}.svg`, svgBlob, { contentType: 'image/svg+xml', upsert: true });
  const qrSvgUrl = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(`${pid}.svg`).data?.publicUrl || null;

  await supabaseAdmin.from('plates').update({ qr_image_url: qrImageUrl, qr_svg_url: qrSvgUrl }).eq('plate_id', pid);

  return { qrImageUrl, qrSvgUrl };
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
