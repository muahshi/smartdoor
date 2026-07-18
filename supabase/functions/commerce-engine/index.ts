/**
 * Smart Door — Edge Function: commission-engine
 * supabase/functions/commission-engine/index.ts
 *
 * Phase 8C Part 3 — admin-authenticated management API for the Partner
 * Commission & Settlement Engine (sql/60_partner_commission_settlement_
 * engine_phase8c3.sql). NEW, DEDICATED Edge Function — same reasoning as
 * commerce-engine: a self-contained bounded context gets its own endpoint
 * rather than growing admin-data further. Does NOT duplicate or replace
 * the existing admin-data 'commission_list' / 'commission_update_status'
 * actions — those keep working for the simple dealer-facing read + manual
 * status flip they already provide. This function is the admin-side
 * review/rules/settlement surface layered on top of the same
 * dealer_commissions table.
 *
 * POST body: { action: string, ...params }
 * Auth: same as admin-data/commerce-engine — Bearer <admin session token>,
 * RBAC via the 'commission_management' resource key (rule + settlement
 * admin) added in migration 60, and the pre-existing 'commissions'
 * resource key (search/read) already granted to dealer/franchise/
 * distributor/ops_manager/analyst.
 *
 * Actions:
 *   commission_rule_list / commission_rule_upsert / commission_rule_toggle
 *   commission_search              (filterable ledger search — status, partner, date range, entry_type)
 *   commission_adjustment_create   (manual +/- correction with reason)
 *   commission_bulk_approve         (pending → approved, batched)
 *   settlement_batch_create / settlement_batch_list
 *   settlement_batch_approve / settlement_batch_mark_paid / settlement_batch_mark_failed
 *   commission_analytics            (rollup of the 6 views from migration 60)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import {
  getServiceClient,
  verifyAdminSession,
  adminCan,
  adminAuthError,
} from '../_shared/adminAuth.ts';

async function auditLog(
  db: ReturnType<typeof getServiceClient>,
  adminId: string,
  adminEmail: string,
  action: string,
  resource: string,
  resourceId: string | null,
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown> | null
) {
  await db.from('admin_audit_logs').insert({
    admin_id: adminId, admin_email: adminEmail, action, resource, resource_id: resourceId,
    before_data: beforeData || {}, after_data: afterData || {}, created_at: new Date().toISOString(),
  });
}

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

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { action } = body as { action?: string };
    const canManageRead  = adminCan(ctx, 'commission_management', 'read');
    const canManageWrite = adminCan(ctx, 'commission_management', 'write');
    const canLedgerRead  = adminCan(ctx, 'commissions', 'read'); // pre-existing resource, dealer/franchise/distributor/ops_manager/analyst

    // ══════════════════════════════════════════════
    // COMMISSION RULES
    // ══════════════════════════════════════════════
    if (action === 'commission_rule_list') {
      if (!canManageRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('commission_rules_with_status').select('*').order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, rules: data || [] }, { headers });
    }

    if (action === 'commission_rule_upsert') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const r = body.rule as Record<string, unknown>;
      if (!r?.name || !r?.commission_mode) {
        return Response.json({ success: false, message: 'name and commission_mode are required.' }, { status: 400, headers });
      }
      if (!['percentage', 'fixed', 'hybrid'].includes(r.commission_mode as string)) {
        return Response.json({ success: false, message: "commission_mode must be 'percentage', 'fixed', or 'hybrid'." }, { status: 400, headers });
      }
      if (!r.role_name && !r.admin_user_id) {
        return Response.json({ success: false, message: 'Either role_name (role-wide default) or admin_user_id (partner-specific override) is required.' }, { status: 400, headers });
      }
      if (r.role_name && !PARTNER_ROLES.includes(r.role_name as string)) {
        return Response.json({ success: false, message: "role_name must be 'dealer', 'franchise', or 'distributor'." }, { status: 400, headers });
      }

      let existing = null;
      if (r.id) {
        const res = await db.from('commission_rules').select('*').eq('id', r.id).maybeSingle();
        existing = res.data;
      }

      const row = { ...r, id: existing?.id ?? r.id, created_by_admin_id: existing ? undefined : ctx.id };
      const { data, error } = existing
        ? await db.from('commission_rules').update(row).eq('id', existing.id).select().single()
        : await db.from('commission_rules').insert(row).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, ctx.email, existing ? 'commission_rule_update' : 'commission_rule_create', 'commission_rules', data.id, existing, data);
      return Response.json({ success: true, rule: data }, { headers });
    }

    if (action === 'commission_rule_toggle') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { rule_id, is_active } = body as { rule_id?: string; is_active?: boolean };
      if (!rule_id || typeof is_active !== 'boolean') {
        return Response.json({ success: false, message: 'rule_id and is_active are required.' }, { status: 400, headers });
      }
      const { data: before } = await db.from('commission_rules').select('*').eq('id', rule_id).maybeSingle();
      const { data, error } = await db.from('commission_rules').update({ is_active }).eq('id', rule_id).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, ctx.email, 'commission_rule_toggle', 'commission_rules', rule_id, before, data);
      return Response.json({ success: true, rule: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // COMMISSION LEDGER — search / review / bulk approve / adjustments
    // ══════════════════════════════════════════════
    if (action === 'commission_search') {
      if (!canLedgerRead && !canManageRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const {
        status, role_name, entry_type, dealer_admin_id, order_id,
        date_from, date_to, settlement_batch_id, limit = 100,
      } = body as Record<string, unknown>;

      let qb = db.from('dealer_commissions').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(limit) || 100, 500));

      // Partner roles only ever see their own rows — mirrors the scoping
      // already applied to commission_list in admin-data for the dealer
      // role; extended here to franchise/distributor as well, since both
      // hold the same 'commissions':['read'] permission today and would
      // otherwise see every other partner's ledger through this endpoint.
      if (PARTNER_ROLES.includes(ctx.role_name)) {
        qb = qb.eq('dealer_admin_id', ctx.id);
      } else if (dealer_admin_id) {
        qb = qb.eq('dealer_admin_id', dealer_admin_id as string);
      }

      if (status) qb = qb.eq('status', status as string);
      if (role_name) qb = qb.eq('role_name', role_name as string);
      if (entry_type) qb = qb.eq('entry_type', entry_type as string);
      if (order_id) qb = qb.eq('order_id', order_id as string);
      if (settlement_batch_id) qb = qb.eq('settlement_batch_id', settlement_batch_id as string);
      if (date_from) qb = qb.gte('created_at', date_from as string);
      if (date_to) qb = qb.lte('created_at', date_to as string);

      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, commissions: data || [] }, { headers });
    }

    if (action === 'commission_bulk_approve') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { commission_ids } = body as { commission_ids?: string[] };
      if (!Array.isArray(commission_ids) || commission_ids.length === 0) {
        return Response.json({ success: false, message: 'commission_ids (non-empty array) is required.' }, { status: 400, headers });
      }
      const { data, error } = await db.from('dealer_commissions')
        .update({ status: 'approved', approved_by: ctx.id, approved_at: new Date().toISOString() })
        .in('id', commission_ids)
        .eq('status', 'pending') // only pending rows move — already-approved/paid/reversed rows are left untouched
        .select('id');
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, ctx.email, 'commission_bulk_approve', 'commissions', null, null, { approved_ids: (data || []).map((d: { id: string }) => d.id) });
      return Response.json({ success: true, approved_count: (data || []).length }, { headers });
    }

    if (action === 'commission_adjustment_create') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { dealer_admin_id, amount, reason, related_commission_id, order_id } = body as {
        dealer_admin_id?: string; amount?: number; reason?: string; related_commission_id?: string; order_id?: string;
      };
      if (!dealer_admin_id || !amount || !reason) {
        return Response.json({ success: false, message: 'dealer_admin_id, amount, and reason are required.' }, { status: 400, headers });
      }
      const { data, error } = await db.rpc('create_commission_adjustment', {
        p_dealer_admin_id: dealer_admin_id, p_amount: amount, p_reason: reason,
        p_related_commission_id: related_commission_id || null, p_order_id: order_id || null,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, ctx.email, 'commission_adjustment_create', 'dealer_commissions', data as string, null, { dealer_admin_id, amount, reason });
      return Response.json({ success: true, adjustment_id: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // SETTLEMENT ENGINE
    // ══════════════════════════════════════════════
    if (action === 'settlement_batch_list') {
      if (!canLedgerRead && !canManageRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      let qb = db.from('commission_settlement_history').select('*').limit(200);
      if (PARTNER_ROLES.includes(ctx.role_name)) qb = qb.eq('partner_admin_id', ctx.id);
      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, batches: data || [] }, { headers });
    }

    if (action === 'settlement_batch_create') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { partner_admin_id, settlement_type, period_start, period_end } = body as {
        partner_admin_id?: string; settlement_type?: string; period_start?: string; period_end?: string;
      };
      if (!partner_admin_id || !settlement_type) {
        return Response.json({ success: false, message: 'partner_admin_id and settlement_type are required.' }, { status: 400, headers });
      }
      if (!['weekly', 'monthly', 'manual'].includes(settlement_type)) {
        return Response.json({ success: false, message: "settlement_type must be 'weekly', 'monthly', or 'manual'." }, { status: 400, headers });
      }
      const { data, error } = await db.rpc('create_commission_settlement_batch', {
        p_partner_admin_id: partner_admin_id, p_settlement_type: settlement_type,
        p_period_start: period_start || null, p_period_end: period_end || null,
        p_created_by_admin_id: ctx.id,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      if (!(data as { success: boolean }).success) return Response.json(data, { status: 400, headers });

      await auditLog(db, ctx.id, ctx.email, 'settlement_batch_create', 'commission_settlement_batches', (data as { batch_id: string }).batch_id, null, data as Record<string, unknown>);
      return Response.json({ success: true, ...(data as Record<string, unknown>) }, { headers });
    }

    if (action === 'settlement_batch_approve') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { batch_id } = body as { batch_id?: string };
      if (!batch_id) return Response.json({ success: false, message: 'batch_id is required.' }, { status: 400, headers });

      const { data, error } = await db.rpc('approve_commission_settlement_batch', { p_batch_id: batch_id, p_admin_id: ctx.id });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      if (!(data as { success: boolean }).success) return Response.json(data, { status: 400, headers });

      await auditLog(db, ctx.id, ctx.email, 'settlement_batch_approve', 'commission_settlement_batches', batch_id, null, { status: 'approved' });
      return Response.json(data, { headers });
    }

    if (action === 'settlement_batch_mark_paid') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { batch_id, utr_number, payout_date } = body as { batch_id?: string; utr_number?: string; payout_date?: string };
      if (!batch_id || !utr_number) {
        return Response.json({ success: false, message: 'batch_id and utr_number are required.' }, { status: 400, headers });
      }
      const { data, error } = await db.rpc('mark_commission_settlement_paid', {
        p_batch_id: batch_id, p_utr: utr_number, p_payout_date: payout_date || null, p_paid_by_admin_id: ctx.id,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      if (!(data as { success: boolean }).success) return Response.json(data, { status: 400, headers });

      await auditLog(db, ctx.id, ctx.email, 'settlement_batch_mark_paid', 'commission_settlement_batches', batch_id, null, { utr_number, payout_date });
      return Response.json(data, { headers });
    }

    if (action === 'settlement_batch_mark_failed') {
      if (!canManageWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { batch_id, reason, release_items } = body as { batch_id?: string; reason?: string; release_items?: boolean };
      if (!batch_id || !reason) {
        return Response.json({ success: false, message: 'batch_id and reason are required.' }, { status: 400, headers });
      }
      const { data, error } = await db.rpc('mark_commission_settlement_failed', {
        p_batch_id: batch_id, p_reason: reason, p_release_items: !!release_items,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, ctx.email, 'settlement_batch_mark_failed', 'commission_settlement_batches', batch_id, null, { reason, release_items: !!release_items });
      return Response.json(data, { headers });
    }

    // ══════════════════════════════════════════════
    // ANALYTICS
    // ══════════════════════════════════════════════
    if (action === 'commission_analytics') {
      if (!canManageRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });

      const [summaryRes, topRes, byProductRes, byTypeRes, overviewRes] = await Promise.all([
        db.from('commission_summary_by_partner').select('*'),
        db.from('top_partners_by_commission').select('*').limit(20),
        db.from('commission_by_product_analytics').select('*'),
        db.from('commission_by_partner_type_analytics').select('*'),
        db.from('commission_pending_vs_paid_analytics').select('*'),
      ]);
      const firstError = summaryRes.error || topRes.error || byProductRes.error || byTypeRes.error || overviewRes.error;
      if (firstError) return Response.json({ success: false, message: firstError.message }, { status: 500, headers });

      return Response.json({
        success: true,
        summaryByPartner: summaryRes.data || [],
        topPartners: topRes.data || [],
        byProduct: byProductRes.data || [],
        byPartnerType: byTypeRes.data || [],
        overview: overviewRes.data || [],
      }, { headers });
    }

    return Response.json({ success: false, message: `Unknown action: ${action}` }, { status: 400, headers });

  } catch (err) {
    console.error('[commission-engine] Unexpected error:', err);
    return Response.json({ success: false, message: 'Unexpected error.' }, { status: 500, headers });
  }
});
