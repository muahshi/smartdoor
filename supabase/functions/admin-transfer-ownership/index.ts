/**
 * Smart Door — Edge Function: admin-transfer-ownership
 * supabase/functions/admin-transfer-ownership/index.ts
 *
 * Plate Management → Transfer Ownership (house sold / tenant changed /
 * new owner). super_admin only — most destructive of the new admin
 * actions, not granted to dealer/support in sql/15_admin_provisioning_schema.sql.
 *
 * IMPORTANT SCHEMA NOTE (read before changing this function):
 * sql/12_real_world_operations.sql describes ownership_transfers as
 * "QR + plate_id stay identical — only plates.owner_id changes". That
 * implies creating a brand-new `users` row for the new owner and
 * repointing plates.owner_id. But users.plate_id is UNIQUE NOT NULL
 * (sql/01_schema.sql) — it cannot be cleared on the outgoing owner's row
 * to free the value up, and login (services/auth.js loginOwner) resolves
 * identity by plate_id, not by a plate↔user join table. Two `users` rows
 * can never legally share one plate_id under the existing constraints.
 *
 * Given "do not rebuild the schema", this function instead updates the
 * SAME `users` row in place (new name/phone/email/PIN, same id, same
 * plate_id). That is what actually satisfies the task's requirement to
 * "preserve messages, notifications, activity history" — since owner_id
 * never changes, every historical row (message_logs, notifications,
 * visitor_logs, voice_notes, call_logs, orders) stays linked exactly as
 * it was, with zero migration risk. ownership_transfers.previous_owner_id
 * and .new_owner_id are both set to that same id — the row is a workflow/
 * audit record of the transfer event, not a record of two distinct
 * user identities.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';

const VALID_REASONS = ['house_sold', 'tenant_changed', 'new_owner'];

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
    if (!adminCan(ctx, 'ownership_transfer', 'write')) {
      return Response.json({ success: false, message: 'Only Super Admins can transfer plate ownership.' }, { status: 403, headers });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const {
      plate_id, reason, notes,
      new_owner_name, new_owner_phone, new_owner_email, new_owner_pin,
    } = body as {
      plate_id?: string; reason?: string; notes?: string;
      new_owner_name?: string; new_owner_phone?: string; new_owner_email?: string; new_owner_pin?: string;
    };

    if (!plate_id) {
      return Response.json({ success: false, message: 'plate_id is required.' }, { status: 400, headers });
    }
    const transferReason = VALID_REASONS.includes(String(reason)) ? String(reason) : 'new_owner';

    if (!new_owner_name || String(new_owner_name).trim().length < 2) {
      return Response.json({ success: false, message: 'New owner full name is required.' }, { status: 400, headers });
    }
    const cleanPhone = String(new_owner_phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return Response.json({ success: false, message: 'A valid 10-digit new owner phone number is required.' }, { status: 400, headers });
    }
    const cleanEmail = new_owner_email ? String(new_owner_email).trim().toLowerCase() : null;
    const pinStr = String(new_owner_pin || '').trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return Response.json({ success: false, message: 'A new 4-digit PIN for the incoming owner is required.' }, { status: 400, headers });
    }

    const pid = String(plate_id).trim().toUpperCase();

    const { data: plate, error: plateErr } = await supabaseAdmin
      .from('plates')
      .select('id, plate_id, owner_id, status')
      .eq('plate_id', pid)
      .maybeSingle();

    if (plateErr || !plate || !plate.owner_id) {
      return Response.json({ success: false, message: 'Plate not found or has no current owner.' }, { status: 404, headers });
    }

    const { data: oldUser, error: oldUserErr } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, address')
      .eq('id', plate.owner_id)
      .maybeSingle();

    if (oldUserErr || !oldUser) {
      return Response.json({ success: false, message: 'Current owner record not found.' }, { status: 404, headers });
    }

    const pinHash = await bcrypt.hash(pinStr, await bcrypt.genSalt(12));

    const { data: updatedUser, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        full_name: String(new_owner_name).trim(),
        phone: cleanPhone,
        email: cleanEmail,
        pin_hash: pinHash,
      })
      .eq('id', oldUser.id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin-transfer-ownership] update failed:', updateErr);
      return Response.json({ success: false, message: 'Failed to transfer ownership.' }, { status: 500, headers });
    }

    // Workflow/audit record — see schema note in the file header.
    await supabaseAdmin.from('ownership_transfers').insert({
      plate_id: pid,
      previous_owner_id: oldUser.id,
      new_owner_id: oldUser.id,
      reason: transferReason,
      status: 'completed',
      initiated_by: 'admin',
      notes: notes ? String(notes).trim() : null,
      transferred_at: new Date().toISOString(),
    });

    await supabaseAdmin.from('activation_events').insert({
      plate_id: pid,
      owner_id: oldUser.id,
      event_type: 'transferred',
      event_detail: `Ownership transferred (${transferReason})`,
      actor: 'admin',
      metadata: {
        by: ctx.email,
        previous: { full_name: oldUser.full_name, phone: oldUser.phone, email: oldUser.email },
        new: { full_name: updatedUser.full_name, phone: updatedUser.phone, email: updatedUser.email },
      },
    });

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'ownership_transferred',
      resource: 'plates',
      resource_id: pid,
      before_data: { full_name: oldUser.full_name, phone: oldUser.phone, email: oldUser.email },
      after_data: { full_name: updatedUser.full_name, phone: updatedUser.phone, email: updatedUser.email },
      notes: `Reason: ${transferReason}. ${notes || ''}`.trim(),
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
    });

    return Response.json({
      success: true,
      message: `Ownership of ${pid} transferred. Messages, notifications and activity history are preserved.`,
      family_members_warning: 'Family members / call routing were not changed — review them separately if the new owner needs different contacts.',
      plate: { plate_id: pid, owner_id: updatedUser.id, full_name: updatedUser.full_name, phone: updatedUser.phone },
    }, { headers });

  } catch (err) {
    console.error('[admin-transfer-ownership] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
