/**
 * Smart Door — Edge Function: partner-data
 * supabase/functions/partner-data/index.ts
 *
 * PHASE 8C — PART 4: PARTNER PORTAL DASHBOARD (backend)
 *
 * Audit finding this closes: dealer/franchise/distributor admin_users can
 * already log in (admin-login is role-agnostic) and already have a
 * self-scoped commission ledger read (admin-data → commission_list already
 * filters `dealer_admin_id = ctx.id` for these three roles). There was no
 * partner-facing surface for anything else — no partner-scoped view of
 * their own orders/shipments/warranty/replacement/support/settlement data,
 * and no dedicated endpoint separating that from the admin-only surface in
 * admin-data/index.ts.
 *
 * This function is NEW and ADDITIVE:
 *   - Does not modify supabase/functions/admin-data/index.ts in any way.
 *   - Does not modify any SQL schema — every column/index this reads
 *     already exists (orders.created_by_admin_id from 37_dealer_order_
 *     visibility.sql, dealer_commissions.dealer_admin_id from
 *     34_enterprise_rbac_phase5.sql, commission_settlement_batches.
 *     partner_admin_id and partner_applications.resulting_admin_id from
 *     58/60_*.sql). Zero migrations required for this deliverable.
 *   - Every query is self-scoped to the calling partner (ctx.id) — a
 *     partner can only ever see their own rows. There is no list type
 *     here that returns another partner's data.
 *   - Reuses the same admin_users session/adminAuth.ts your other Edge
 *     Functions use — a dealer/franchise/distributor admin logs in via
 *     the existing admin-login flow and gets the same Bearer token.
 *
 * Explicitly NOT built here (real gaps, but not this table's data — see
 * the audit note returned to the user for why):
 *   - "Invoices" / "Credit Notes" for the partner themselves — the only
 *     invoices/credit_notes concept in this codebase is customer
 *     (owner_id) GST billing (58_gst_billing_phase8b.sql). SmartDoor does
 *     not invoice partners; partners are paid via commission settlement
 *     batches (payout_method/UTR/payout_date) — that IS the "Settlement
 *     History" / "Payout History" surface below. Inventing a parallel
 *     partner-invoice concept would be new financial logic no migration
 *     or business rule defines — left out per Golden Rule 4.
 *   - "Announcements" / "Knowledge Base" — no table, no authoring
 *     workflow, no content anywhere in the repo. Building these would be
 *     new product surfaces, not a portal-UI gap. Left out; flagged for a
 *     separate, explicitly-scoped deliverable.
 *   - "Notification Center" — the existing notification_center
 *     (48_notification_center.sql) is owner_id-scoped (end customers,
 *     driven by visitor/WebRTC/payment events) and structurally cannot
 *     serve admin_users rows without a new table + new triggers. Rather
 *     than duplicate that system speculatively, `partner_activity_feed`
 *     below reuses admin_audit_logs (already exists, already logs every
 *     action relevant to a partner) to give the portal a real activity
 *     feed with zero new schema.
 *
 * POST body: { type: string, ...params }
 * Auth: Authorization: Bearer <session token> (same as admin-data)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import {
  getServiceClient,
  verifyAdminSession,
  adminAuthError,
} from '../_shared/adminAuth.ts';

const PARTNER_ROLES = ['dealer', 'franchise', 'distributor'];

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  const db = getServiceClient();

  try {
    const ctx = await verifyAdminSession(req, db);
    if (!ctx) return adminAuthError(headers);

    // This entire function is the partner portal — every route below is
    // self-scoped by ctx.id, so gate the whole surface to partner roles.
    // Non-partner admin roles keep using admin.html / admin-data as before.
    if (!PARTNER_ROLES.includes(ctx.role_name)) {
      return Response.json({ success: false, message: 'Partner portal is only available to dealer, franchise, and distributor accounts.' }, { status: 403, headers });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { type } = body as { type?: string };

    // ══════════════════════════════════════════════
    // PROFILE
    // ══════════════════════════════════════════════
    if (type === 'partner_profile') {
      const { data: admin } = await db
        .from('admin_users')
        .select('id, email, full_name, is_active, created_at, admin_roles(name, label, color)')
        .eq('id', ctx.id)
        .maybeSingle();

      const { data: application } = await db
        .from('partner_applications')
        .select('application_number, partner_type, business_name, business_type, gst_number, gst_verified, pan_number, pan_verified, contact_name, contact_phone, contact_email, address, requested_territory, status, created_at')
        .eq('resulting_admin_id', ctx.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({ success: true, admin, application: application || null }, { headers });
    }

    // ══════════════════════════════════════════════
    // KYC STATUS
    // ══════════════════════════════════════════════
    if (type === 'partner_kyc_status') {
      const { data: application } = await db
        .from('partner_applications')
        .select('id, application_number, status, rejection_reason, gst_verified, pan_verified, reviewed_at')
        .eq('resulting_admin_id', ctx.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!application) {
        return Response.json({ success: true, application: null, documents: [] }, { headers });
      }

      const { data: documents } = await db
        .from('partner_kyc_documents')
        .select('id, doc_type, status, review_notes, expiry_date, reviewed_at, created_at')
        .eq('application_id', application.id)
        .order('created_at', { ascending: false });

      return Response.json({ success: true, application, documents: documents || [] }, { headers });
    }

    // ══════════════════════════════════════════════
    // ORDERS (own orders only — same scoping rule as admin-data's
    // dealer-only order_list branch, applied here for all three
    // partner roles since this endpoint is partner-only to begin with)
    // ══════════════════════════════════════════════
    if (type === 'partner_order_list') {
      const { status_filter = null, limit = 50, offset = 0 } = body as any;
      let qb = db.from('orders')
        .select('id, order_number, plate_id, product_type, total_amount, payment_status, manufacturing_status, tracking_status, customer_name, created_at', { count: 'exact' })
        .eq('created_by_admin_id', ctx.id)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (status_filter && status_filter !== 'all') qb = qb.eq('payment_status', status_filter);

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, orders: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // SHIPMENTS (join through own orders — shipments has no partner
    // column of its own, so resolve order ids first)
    // ══════════════════════════════════════════════
    if (type === 'partner_shipment_list') {
      const { limit = 50, offset = 0 } = body as any;
      const { data: myOrders } = await db.from('orders').select('id').eq('created_by_admin_id', ctx.id);
      const orderIds = (myOrders || []).map((o: any) => o.id);
      if (orderIds.length === 0) return Response.json({ success: true, shipments: [], total: 0 }, { headers });

      const { data, error, count } = await db.from('shipments')
        .select('id, order_id, provider, awb_number, tracking_url, status, estimated_delivery, created_at', { count: 'exact' })
        .in('order_id', orderIds)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, shipments: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // MANUFACTURING STATUS (per own order — reuses orders.
    // manufacturing_status directly, no separate table needed since
    // that's already the source of truth admin.html itself reads)
    // ══════════════════════════════════════════════
    if (type === 'partner_manufacturing_status') {
      const { data, error } = await db.from('orders')
        .select('id, order_number, plate_id, product_type, manufacturing_status, tracking_status, updated_at')
        .eq('created_by_admin_id', ctx.id)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, orders: data || [] }, { headers });
    }

    // ══════════════════════════════════════════════
    // COMMISSION SUMMARY (aggregate — pending/approved/paid totals)
    // ══════════════════════════════════════════════
    if (type === 'partner_commission_summary') {
      const { data, error } = await db.from('dealer_commissions')
        .select('status, entry_type, amount')
        .eq('dealer_admin_id', ctx.id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      const summary = { pending: 0, approved: 0, paid: 0, cancelled: 0, reversed: 0, lifetime_earned: 0 };
      for (const row of (data || [])) {
        const amt = Number(row.amount) || 0;
        if (row.status && Object.prototype.hasOwnProperty.call(summary, row.status)) {
          (summary as any)[row.status] += amt;
        }
        if (row.entry_type === 'commission' && (row.status === 'approved' || row.status === 'paid')) {
          summary.lifetime_earned += amt;
        }
      }
      return Response.json({ success: true, summary }, { headers });
    }

    // ══════════════════════════════════════════════
    // COMMISSION LIST (own ledger — same rows admin-data's
    // commission_list already scopes to this partner, exposed here so
    // the portal doesn't need admin-data at all)
    // ══════════════════════════════════════════════
    if (type === 'partner_commission_list') {
      const { status_filter = null, limit = 50, offset = 0 } = body as any;
      let qb = db.from('dealer_commissions')
        .select('id, plate_id, order_id, amount, status, entry_type, reason_code, gross_order_amount, settlement_batch_id, created_at', { count: 'exact' })
        .eq('dealer_admin_id', ctx.id)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });
      if (status_filter && status_filter !== 'all') qb = qb.eq('status', status_filter);

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, commissions: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // SETTLEMENT HISTORY (own settlement batches — draft through paid)
    // ══════════════════════════════════════════════
    if (type === 'partner_settlement_list') {
      const { limit = 50, offset = 0 } = body as any;
      const { data, error, count } = await db.from('commission_settlement_batches')
        .select('id, batch_reference, settlement_type, period_start, period_end, item_count, total_commission_amount, status, payout_method, utr_number, payout_date, failure_reason, created_at', { count: 'exact' })
        .eq('partner_admin_id', ctx.id)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, settlements: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // PAYOUT HISTORY (paid settlement batches only — same table,
    // different filter, kept separate to match the requested portal
    // section without the caller re-filtering client-side)
    // ══════════════════════════════════════════════
    if (type === 'partner_payout_list') {
      const { limit = 50, offset = 0 } = body as any;
      const { data, error, count } = await db.from('commission_settlement_batches')
        .select('id, batch_reference, total_commission_amount, payout_method, utr_number, payout_date, bank_name, bank_account_number', { count: 'exact' })
        .eq('partner_admin_id', ctx.id)
        .eq('status', 'paid')
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('payout_date', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, payouts: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // WARRANTY (owner_id-scoped table — no partner column exists, so
    // resolve via order_id → orders.created_by_admin_id, same pattern
    // as shipments above)
    // ══════════════════════════════════════════════
    if (type === 'partner_warranty_list') {
      const { limit = 50, offset = 0 } = body as any;
      const { data: myOrders } = await db.from('orders').select('id').eq('created_by_admin_id', ctx.id);
      const orderIds = (myOrders || []).map((o: any) => o.id);
      if (orderIds.length === 0) return Response.json({ success: true, warranties: [], total: 0 }, { headers });

      const { data, error, count } = await db.from('warranties')
        .select('id, plate_id, order_id, coverage_type, starts_at, ends_at, status', { count: 'exact' })
        .in('order_id', orderIds)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('starts_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, warranties: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // REPLACEMENT REQUESTS (no order_id link on the *original* order —
    // replacement_requests only stores plate_id + a nullable
    // replacement_order_id for the new order it spawns — so resolve via
    // plate_id against this partner's own plate_ids from their orders)
    // ══════════════════════════════════════════════
    if (type === 'partner_replacement_list') {
      const { limit = 50, offset = 0 } = body as any;
      const { data: myOrders } = await db.from('orders').select('plate_id').eq('created_by_admin_id', ctx.id).not('plate_id', 'is', null);
      const plateIds = [...new Set((myOrders || []).map((o: any) => o.plate_id))];
      if (plateIds.length === 0) return Response.json({ success: true, replacements: [], total: 0 }, { headers });

      const { data, error, count } = await db.from('replacement_requests')
        .select('id, plate_id, reason, status, old_qr_deactivated, replacement_order_id, requested_at, resolved_at', { count: 'exact' })
        .in('plate_id', plateIds)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('requested_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, replacements: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // SUPPORT TICKETS (own orders' tickets — read-only view; raising a
    // new ticket reuses the exact same insert admin-data's create_ticket
    // uses, scoped to this partner's own order_id)
    // ══════════════════════════════════════════════
    if (type === 'partner_ticket_list') {
      const { limit = 50, offset = 0 } = body as any;
      const { data: myOrders } = await db.from('orders').select('id').eq('created_by_admin_id', ctx.id);
      const orderIds = (myOrders || []).map((o: any) => o.id);
      if (orderIds.length === 0) return Response.json({ success: true, tickets: [], total: 0 }, { headers });

      const { data, error, count } = await db.from('support_tickets')
        .select('id, ticket_number, subject, category, priority, status, order_id, plate_id, created_at, resolved_at', { count: 'exact' })
        .in('order_id', orderIds)
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, tickets: data || [], total: count || 0 }, { headers });
    }

    if (type === 'partner_ticket_create') {
      const { order_id, subject, description, category = 'general', priority = 'medium', plate_id = null } = body as any;
      if (!order_id || !subject) {
        return Response.json({ success: false, message: 'order_id and subject are required' }, { status: 400, headers });
      }
      // Confirm this order belongs to the calling partner before allowing
      // a ticket to be filed against it.
      const { data: owned } = await db.from('orders').select('id').eq('id', order_id).eq('created_by_admin_id', ctx.id).maybeSingle();
      if (!owned) return Response.json({ success: false, message: 'Order not found for this account' }, { status: 404, headers });

      const { count } = await db.from('support_tickets').select('id', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().slice(0, 10));
      const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String((count || 0) + 1).padStart(4, '0')}`;

      const { data, error } = await db.from('support_tickets').insert({
        ticket_number: ticketNumber, order_id, plate_id, subject, description,
        category, priority, status: 'open',
      }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'partner_ticket_create',
        resource: 'support_tickets', resource_id: data?.id,
      });
      return Response.json({ success: true, ticket: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // ANALYTICS (aggregated from existing data — no new tables)
    // ══════════════════════════════════════════════
    if (type === 'partner_analytics') {
      const [ordersRes, commissionsRes, settlementsRes] = await Promise.all([
        db.from('orders').select('payment_status, manufacturing_status, total_amount, created_at').eq('created_by_admin_id', ctx.id),
        db.from('dealer_commissions').select('status, amount, entry_type').eq('dealer_admin_id', ctx.id),
        db.from('commission_settlement_batches').select('status, total_commission_amount').eq('partner_admin_id', ctx.id),
      ]);

      const orders = ordersRes.data || [];
      const commissions = commissionsRes.data || [];
      const settlements = settlementsRes.data || [];

      const totalOrders = orders.length;
      const paidOrders = orders.filter((o: any) => o.payment_status === 'paid').length;
      const deliveredOrders = orders.filter((o: any) => o.manufacturing_status === 'delivered').length;
      const totalCommissionEarned = commissions
        .filter((c: any) => c.entry_type === 'commission' && ['approved', 'paid'].includes(c.status))
        .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
      const totalPaidOut = settlements
        .filter((s: any) => s.status === 'paid')
        .reduce((sum: number, s: any) => sum + (Number(s.total_commission_amount) || 0), 0);

      return Response.json({
        success: true,
        analytics: { totalOrders, paidOrders, deliveredOrders, totalCommissionEarned, totalPaidOut },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // ACTIVITY FEED (reuses admin_audit_logs — see file header for why
    // this replaces a bespoke "Notification Center" for partners)
    // ══════════════════════════════════════════════
    if (type === 'partner_activity_feed') {
      const { limit = 30 } = body as any;
      const [application, commissions, settlements] = await Promise.all([
        db.from('partner_applications').select('id').eq('resulting_admin_id', ctx.id),
        db.from('dealer_commissions').select('id').eq('dealer_admin_id', ctx.id),
        db.from('commission_settlement_batches').select('id').eq('partner_admin_id', ctx.id),
      ]);
      const resourceIds = [
        ...(application.data || []).map((r: any) => r.id),
        ...(commissions.data || []).map((r: any) => r.id),
        ...(settlements.data || []).map((r: any) => r.id),
      ];
      if (resourceIds.length === 0) return Response.json({ success: true, activity: [] }, { headers });

      const { data, error } = await db.from('admin_audit_logs')
        .select('id, action, resource, resource_id, notes, created_at')
        .in('resource_id', resourceIds)
        .order('created_at', { ascending: false })
        .limit(Number(limit));
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, activity: data || [] }, { headers });
    }

    return Response.json({ success: false, message: `Unknown type: ${type}` }, { status: 400, headers });
  } catch (err) {
    console.error('[partner-data] Unhandled error:', err);
    return Response.json({ success: false, message: 'Internal server error' }, { status: 500, headers });
  }
});
