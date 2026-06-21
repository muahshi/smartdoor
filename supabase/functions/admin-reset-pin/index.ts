/**
 * Smart Door — Edge Function: admin-reset-pin
 * supabase/functions/admin-reset-pin/index.ts
 *
 * Admin-initiated PIN reset (Plate Management → Reset PIN). Same bcrypt
 * discipline as set-owner-pin / admin-provision-customer: PIN is never
 * hashed outside an Edge Function with the service_role key.
 *
 * Allowed roles: super_admin, support, dealer (per spec — support can
 * reset PINs even though they can't otherwise write customer records).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import bcryptjs from 'npm:bcryptjs@2.4.3';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';

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
    if (!adminCan(ctx, 'pin_reset', 'write')) {
      return Response.json({ success: false, message: 'You do not have permission to reset PINs.' }, { status: 403, headers });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { owner_id, new_pin } = body as { owner_id?: string; new_pin?: string };
    const pinStr = String(new_pin || '').trim();

    if (!owner_id) {
      return Response.json({ success: false, message: 'owner_id is required.' }, { status: 400, headers });
    }
    if (!/^\d{4}$/.test(pinStr)) {
      return Response.json({ success: false, message: 'New PIN must be exactly 4 digits.' }, { status: 400, headers });
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, plate_id, full_name')
      .eq('id', owner_id)
      .maybeSingle();

    if (userErr || !user) {
      return Response.json({ success: false, message: 'Customer not found.' }, { status: 404, headers });
    }

    const pinHash = bcryptjs.hashSync(pinStr, 12);

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ pin_hash: pinHash })
      .eq('id', owner_id);

    if (updateErr) {
      console.error('[admin-reset-pin] update failed:', updateErr);
      return Response.json({ success: false, message: 'Failed to reset PIN.' }, { status: 500, headers });
    }

    // Clear any pre-existing lockout so the customer can log in immediately with the new PIN.
    await supabaseAdmin.rpc('reset_pin_lockout', { p_plate_id: user.plate_id });

    await supabaseAdmin.from('audit_logs').insert({
      owner_id: user.id,
      action: 'pin_reset_admin',
      details: { reset_by: ctx.email, role: ctx.role_name },
    });

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'pin_reset_admin',
      resource: 'customers',
      resource_id: user.id,
      notes: `PIN reset for ${user.plate_id} (${user.full_name})`,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
    });

    return Response.json({ success: true, message: `PIN reset for ${user.plate_id}.` }, { headers });

  } catch (err) {
    console.error('[admin-reset-pin] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
