/**
 * Smart Door — Edge Function: admin-fulfillment-status
 * supabase/functions/admin-fulfillment-status/index.ts
 *
 * Order Fulfillment Flow — update plate lifecycle status.
 *
 * Lifecycle states (in order):
 *   created → manufacturing → printed → packed → shipped → delivered → activated
 *
 * Every status change is written to:
 *   1. plates.fulfillment_status (current state)
 *   2. activation_events (full timeline audit)
 *   3. admin_audit_logs (who changed what and when)
 *
 * Allowed roles: super_admin, ops_manager, manufacturing
 * Permission: manufacturing.write
 *
 * POST body:
 *   { plate_id: string, status: FulfillmentStatus, notes?: string, tracking_number?: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';

const FULFILLMENT_STATES = [
  'created',
  'manufacturing',
  'printed',
  'packed',
  'shipped',
  'delivered',
  'activated',
] as const;

type FulfillmentStatus = typeof FULFILLMENT_STATES[number];

// Valid forward + backward transitions (ops can backtrack for corrections)
const VALID_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  created:       ['manufacturing'],
  manufacturing: ['printed', 'created'],
  printed:       ['packed', 'manufacturing'],
  packed:        ['shipped', 'printed'],
  shipped:       ['delivered', 'packed'],
  delivered:     ['activated', 'shipped'],
  activated:     ['delivered'], // only backwards — activation itself is via activate-subscription
};

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
    if (!adminCan(ctx, 'manufacturing', 'write') && !adminCan(ctx, 'orders', 'write')) {
      return Response.json({ success: false, message: 'You do not have permission to update fulfillment status.' }, { status: 403, headers });
    }

    let body: { plate_id?: string; status?: string; notes?: string; tracking_number?: string };
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { plate_id, status, notes, tracking_number } = body;

    if (!plate_id) {
      return Response.json({ success: false, message: 'plate_id is required.' }, { status: 400, headers });
    }
    if (!status || !FULFILLMENT_STATES.includes(status as FulfillmentStatus)) {
      return Response.json({
        success: false,
        message: `status must be one of: ${FULFILLMENT_STATES.join(', ')}`,
      }, { status: 400, headers });
    }

    const newStatus = status as FulfillmentStatus;
    const pid = String(plate_id).trim().toUpperCase();

    // Fetch current plate state
    const { data: plate, error: plateErr } = await supabaseAdmin
      .from('plates')
      .select('id, plate_id, owner_id, status, fulfillment_status')
      .eq('plate_id', pid)
      .maybeSingle();

    if (plateErr || !plate) {
      return Response.json({ success: false, message: 'Plate not found.' }, { status: 404, headers });
    }

    const currentFulfillment = (plate.fulfillment_status || 'created') as FulfillmentStatus;

    // Validate transition
    if (currentFulfillment !== newStatus) {
      const allowed = VALID_TRANSITIONS[currentFulfillment] || [];
      if (!allowed.includes(newStatus)) {
        return Response.json({
          success: false,
          message: `Cannot transition from '${currentFulfillment}' to '${newStatus}'. Allowed next states: ${allowed.join(', ')}`,
        }, { status: 422, headers });
      }
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      fulfillment_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Auto-set tracking number when shipping
    if (newStatus === 'shipped' && tracking_number) {
      updatePayload.tracking_number = String(tracking_number).trim();
    }

    // Update plate
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('plates')
      .update(updatePayload)
      .eq('id', plate.id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin-fulfillment-status] update failed:', updateErr);
      return Response.json({ success: false, message: 'Failed to update fulfillment status.' }, { status: 500, headers });
    }

    // Also update matching manufacturing record if it exists
    await supabaseAdmin
      .from('manufacturing')
      .update({
        status: newStatus === 'delivered' ? 'completed' : newStatus === 'packed' ? 'packed' : newStatus === 'shipped' ? 'dispatched' : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('plate_id', pid)
      .not('status', 'eq', 'completed');

    // Timeline audit — activation_events
    const eventDetail = [
      `Fulfillment: ${currentFulfillment} → ${newStatus}`,
      notes ? `Note: ${notes}` : null,
      tracking_number ? `Tracking: ${tracking_number}` : null,
    ].filter(Boolean).join('. ');

    await supabaseAdmin.from('activation_events').insert({
      plate_id: pid,
      owner_id: plate.owner_id,
      event_type: newStatus === 'activated' ? 'activated' : 'status_changed',
      event_detail: eventDetail,
      actor: 'admin',
      metadata: {
        admin_email: ctx.email,
        role: ctx.role_name,
        from_status: currentFulfillment,
        to_status: newStatus,
        tracking_number: tracking_number || null,
      },
    });

    // Admin audit log
    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'fulfillment_status_updated',
      resource: 'plates',
      resource_id: pid,
      before_data: { fulfillment_status: currentFulfillment },
      after_data: { fulfillment_status: newStatus, tracking_number: tracking_number || null },
      notes: notes ? String(notes).slice(0, 500) : `${currentFulfillment} → ${newStatus}`,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
    });

    return Response.json({
      success: true,
      plate: {
        plate_id: pid,
        previous_status: currentFulfillment,
        fulfillment_status: newStatus,
        tracking_number: updated.tracking_number || null,
      },
      message: `${pid} moved from '${currentFulfillment}' to '${newStatus}'.`,
    }, { headers });

  } catch (err) {
    console.error('[admin-fulfillment-status] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
