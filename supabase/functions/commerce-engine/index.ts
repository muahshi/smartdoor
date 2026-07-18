/**
 * Smart Door — Edge Function: commerce-engine
 * supabase/functions/commerce-engine/index.ts
 *
 * Phase 8A Commerce Engine, extended in Phase 8C Part 2 — admin-authenticated
 * management API for coupons, pricing rules, campaigns, dealer/franchise/
 * distributor price lists, territory price lists, bulk pricing tiers,
 * partner product visibility, pricing change history, and commerce analytics.
 *
 * NEW, DEDICATED Edge Function rather than adding these actions to the
 * existing admin-data function — admin-data is already a 1700+ line
 * general admin-data reader/writer; Phase 8A is a self-contained bounded
 * context, so it gets its own endpoint (same auth/RBAC pattern, reused
 * from ../_shared/adminAuth.ts). This does NOT duplicate any existing
 * admin-data action — orders/customers/subscriptions reads still live
 * there untouched.
 *
 * POST body: { action: string, ...params }
 * Auth: same as admin-data — Bearer <admin session token>, RBAC via the
 * 'commerce' resource key added to admin_roles in
 * sql/57_commerce_engine_phase8a.sql (distributor granted read-only in
 * sql/59_partner_pricing_engine_phase8c2.sql — same pattern already used
 * for dealer/franchise).
 *
 * Actions:
 *   coupon_list / coupon_upsert / coupon_toggle
 *   pricing_rule_list / pricing_rule_upsert / pricing_rule_toggle
 *   campaign_list / campaign_upsert / campaign_toggle
 *   partner_price_list_list / partner_price_list_upsert   (dealer/franchise/distributor)
 *   territory_price_list_list / territory_price_list_upsert          [Phase 8C Part 2]
 *   partner_product_visibility_list / partner_product_visibility_upsert [Phase 8C Part 2]
 *   pricing_history_list                                              [Phase 8C Part 2]
 *   bulk_pricing_tier_list / bulk_pricing_tier_upsert
 *   commerce_analytics
 *   pricing_preview   — dry-run computePricing() for a hypothetical order, admin tool only
 *                       (now also accepts distributor role + territory)  [Phase 8C Part 2]
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import {
  getServiceClient,
  verifyAdminSession,
  adminCan,
  adminAuthError,
} from '../_shared/adminAuth.ts';
import { computePricing } from '../_shared/commercePricing.ts';
import { isValidProductType } from '../_shared/pricing.ts';

async function auditLog(db: ReturnType<typeof getServiceClient>, adminId: string, action: string, resource: string, resourceId: string | null, metadata: Record<string, unknown> = {}) {
  await db.from('admin_audit_logs').insert({
    admin_id: adminId, action, resource, resource_id: resourceId, metadata, created_at: new Date().toISOString(),
  });
}

// Phase 8C Part 2 — structured old-value/new-value diff for pricing entities.
// Additive to (not a replacement for) auditLog above, which already records
// the action + a small metadata blob; this records the full before/after
// row so an admin can see exactly what changed, by whom, and when.
type PricingHistoryEntity = 'partner_price_list' | 'territory_price_list' | 'pricing_rule' | 'bulk_pricing_tier' | 'coupon' | 'partner_product_visibility';

async function pricingHistoryLog(
  db: ReturnType<typeof getServiceClient>,
  entityType: PricingHistoryEntity,
  entityId: string,
  adminId: string,
  action: 'create' | 'update' | 'toggle',
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
) {
  await db.from('pricing_change_history').insert({
    entity_type: entityType, entity_id: entityId, admin_id: adminId, action,
    old_value: oldValue, new_value: newValue, created_at: new Date().toISOString(),
  });
}

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
    const canRead  = adminCan(ctx, 'commerce', 'read');
    const canWrite = adminCan(ctx, 'commerce', 'write');

    // ══════════════════════════════════════════════
    // COUPONS
    // ══════════════════════════════════════════════
    if (action === 'coupon_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('coupons').select('*').order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, coupons: data || [] }, { headers });
    }

    if (action === 'coupon_upsert') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const c = body.coupon as Record<string, unknown>;
      if (!c?.code || !c?.discount_type) {
        return Response.json({ success: false, message: 'code and discount_type are required.' }, { status: 400, headers });
      }
      if (c.applicable_product_types && Array.isArray(c.applicable_product_types)) {
        for (const pt of c.applicable_product_types as string[]) {
          if (!isValidProductType(pt)) {
            return Response.json({ success: false, message: `Invalid product type in applicable_product_types: ${pt}` }, { status: 400, headers });
          }
        }
      }

      let couponExisting = null;
      if (c.id) {
        const res = await db.from('coupons').select('*').eq('id', c.id).maybeSingle();
        couponExisting = res.data;
      }

      const row = { ...c, code: (c.code as string).toUpperCase(), created_by_admin_id: c.id ? undefined : ctx.id };
      const { data, error } = await db.from('coupons').upsert(row, { onConflict: 'code' }).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, c.id ? 'coupon_update' : 'coupon_create', 'coupons', data.id, { code: data.code });
      await pricingHistoryLog(db, 'coupon', data.id, ctx.id, couponExisting ? 'update' : 'create', couponExisting, data);
      return Response.json({ success: true, coupon: data }, { headers });
    }

    if (action === 'coupon_toggle') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { coupon_id, is_active } = body as { coupon_id?: string; is_active?: boolean };
      if (!coupon_id) return Response.json({ success: false, message: 'coupon_id is required.' }, { status: 400, headers });

      const { data: couponExisting } = await db.from('coupons').select('*').eq('id', coupon_id).maybeSingle();
      const { data: couponNew, error } = await db.from('coupons').update({ is_active, updated_at: new Date().toISOString() }).eq('id', coupon_id).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'coupon_toggle', 'coupons', coupon_id, { is_active });
      await pricingHistoryLog(db, 'coupon', coupon_id, ctx.id, 'toggle', couponExisting, couponNew);
      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PRICING RULES
    // ══════════════════════════════════════════════
    if (action === 'pricing_rule_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('pricing_rules').select('*').order('priority', { ascending: true });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, rules: data || [] }, { headers });
    }

    if (action === 'pricing_rule_upsert') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const r = body.rule as Record<string, unknown>;
      if (!r?.name || !r?.rule_type || !r?.discount_type) {
        return Response.json({ success: false, message: 'name, rule_type, and discount_type are required.' }, { status: 400, headers });
      }

      let ruleExisting = null;
      if (r.id) {
        const res = await db.from('pricing_rules').select('*').eq('id', r.id).maybeSingle();
        ruleExisting = res.data;
      }

      const row = { ...r, created_by_admin_id: r.id ? undefined : ctx.id };
      const { data, error } = await db.from('pricing_rules').upsert(row).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, r.id ? 'pricing_rule_update' : 'pricing_rule_create', 'pricing_rules', data.id, { name: data.name, rule_type: data.rule_type });
      await pricingHistoryLog(db, 'pricing_rule', data.id, ctx.id, ruleExisting ? 'update' : 'create', ruleExisting, data);
      return Response.json({ success: true, rule: data }, { headers });
    }

    if (action === 'pricing_rule_toggle') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { rule_id, is_active } = body as { rule_id?: string; is_active?: boolean };
      if (!rule_id) return Response.json({ success: false, message: 'rule_id is required.' }, { status: 400, headers });

      const { data: ruleExisting } = await db.from('pricing_rules').select('*').eq('id', rule_id).maybeSingle();
      const { data: ruleNew, error } = await db.from('pricing_rules').update({ is_active, updated_at: new Date().toISOString() }).eq('id', rule_id).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'pricing_rule_toggle', 'pricing_rules', rule_id, { is_active });
      await pricingHistoryLog(db, 'pricing_rule', rule_id, ctx.id, 'toggle', ruleExisting, ruleNew);
      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // CAMPAIGNS
    // ══════════════════════════════════════════════
    if (action === 'campaign_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('campaigns_with_status').select('*').order('starts_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, campaigns: data || [] }, { headers });
    }

    if (action === 'campaign_upsert') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const camp = body.campaign as Record<string, unknown>;
      if (!camp?.name || !camp?.slug || !camp?.starts_at || !camp?.ends_at) {
        return Response.json({ success: false, message: 'name, slug, starts_at, and ends_at are required.' }, { status: 400, headers });
      }

      const row = { ...camp, created_by_admin_id: camp.id ? undefined : ctx.id };
      const { data, error } = await db.from('campaigns').upsert(row, { onConflict: 'slug' }).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, camp.id ? 'campaign_update' : 'campaign_create', 'campaigns', data.id, { slug: data.slug });
      return Response.json({ success: true, campaign: data }, { headers });
    }

    if (action === 'campaign_toggle') {
      // Manual kill switch — sets/clears status_override; the automatic
      // scheduled/active/ended lifecycle otherwise runs off starts_at/ends_at.
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { campaign_id, disabled } = body as { campaign_id?: string; disabled?: boolean };
      if (!campaign_id) return Response.json({ success: false, message: 'campaign_id is required.' }, { status: 400, headers });

      const { error } = await db.from('campaigns')
        .update({ status_override: disabled ? 'disabled' : null, updated_at: new Date().toISOString() })
        .eq('id', campaign_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'campaign_toggle', 'campaigns', campaign_id, { disabled: !!disabled });
      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PARTNER (DEALER / FRANCHISE) PRICE LISTS
    // ══════════════════════════════════════════════
    if (action === 'partner_price_list_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });

      let qb = db.from('partner_price_lists_with_status').select('*').order('created_at', { ascending: false });
      // Dealers/franchise/distributor partners only ever see their OWN price
      // list rows — same scoping pattern as 37_dealer_order_visibility.sql's order_list.
      if (ctx.role_name === 'dealer' || ctx.role_name === 'franchise' || ctx.role_name === 'distributor') {
        qb = qb.eq('admin_user_id', ctx.id);
      }
      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, priceLists: data || [] }, { headers });
    }

    if (action === 'partner_price_list_upsert') {
      // Setting partner pricing/margins is an ops/super-admin decision, not
      // something a dealer/franchise/distributor can grant themselves —
      // full 'commerce' write is required here regardless of role_name.
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const p = body.priceList as Record<string, unknown>;
      if (!p?.admin_user_id || !p?.role_name || !p?.product_type) {
        return Response.json({ success: false, message: 'admin_user_id, role_name, and product_type are required.' }, { status: 400, headers });
      }
      if (!['dealer', 'franchise', 'distributor'].includes(p.role_name as string)) {
        return Response.json({ success: false, message: "role_name must be 'dealer', 'franchise', or 'distributor'." }, { status: 400, headers });
      }
      if (!isValidProductType(p.product_type as string)) {
        return Response.json({ success: false, message: 'Invalid product type.' }, { status: 400, headers });
      }
      if (p.partner_price == null && p.discount_percent == null) {
        return Response.json({ success: false, message: 'Provide either partner_price or discount_percent.' }, { status: 400, headers });
      }
      if (p.effective_from && p.effective_until && new Date(p.effective_from as string) > new Date(p.effective_until as string)) {
        return Response.json({ success: false, message: 'effective_from must be before effective_until.' }, { status: 400, headers });
      }

      // Fetch the prior row (if any) before overwriting, for pricing_change_history.
      const { data: existing } = await db.from('partner_price_lists').select('*')
        .eq('admin_user_id', p.admin_user_id).eq('product_type', p.product_type).maybeSingle();

      const row = { ...p, updated_by_admin_id: ctx.id };
      const { data, error } = await db.from('partner_price_lists').upsert(row, { onConflict: 'admin_user_id,product_type' }).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'partner_price_list_upsert', 'partner_price_lists', data.id, { admin_user_id: data.admin_user_id, product_type: data.product_type });
      await pricingHistoryLog(db, 'partner_price_list', data.id, ctx.id, existing ? 'update' : 'create', existing || null, data);
      return Response.json({ success: true, priceList: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // TERRITORY PRICE LISTS  [Phase 8C Part 2]
    // ══════════════════════════════════════════════
    if (action === 'territory_price_list_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('territory_price_lists_with_status').select('*').order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, territoryPriceLists: data || [] }, { headers });
    }

    if (action === 'territory_price_list_upsert') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const t = body.territoryPriceList as Record<string, unknown>;
      if (!t?.territory_type || !t?.territory_value || !t?.product_type) {
        return Response.json({ success: false, message: 'territory_type, territory_value, and product_type are required.' }, { status: 400, headers });
      }
      if (!['state', 'city', 'zone', 'pincode'].includes(t.territory_type as string)) {
        return Response.json({ success: false, message: "territory_type must be 'state', 'city', 'zone', or 'pincode'." }, { status: 400, headers });
      }
      if (t.role_name && !['dealer', 'franchise', 'distributor'].includes(t.role_name as string)) {
        return Response.json({ success: false, message: "role_name must be 'dealer', 'franchise', 'distributor', or omitted (applies to all)." }, { status: 400, headers });
      }
      if (!isValidProductType(t.product_type as string)) {
        return Response.json({ success: false, message: 'Invalid product type.' }, { status: 400, headers });
      }
      if (t.partner_price == null && t.discount_percent == null) {
        return Response.json({ success: false, message: 'Provide either partner_price or discount_percent.' }, { status: 400, headers });
      }
      if (t.effective_from && t.effective_until && new Date(t.effective_from as string) > new Date(t.effective_until as string)) {
        return Response.json({ success: false, message: 'effective_from must be before effective_until.' }, { status: 400, headers });
      }

      // NOTE: the DB-side uniqueness guard (uq_territory_price_lists_scope in
      // 59_partner_pricing_engine_phase8c2.sql) is a COALESCE(role_name,'')
      // expression index because role_name is nullable — PostgREST's
      // upsert(...).onConflict() can only target a plain column-list
      // constraint, not an expression index, so conflict resolution is done
      // explicitly here instead of via onConflict.
      let existing = null;
      if (t.id) {
        const res = await db.from('territory_price_lists').select('*').eq('id', t.id).maybeSingle();
        existing = res.data;
      } else {
        let findQb = db.from('territory_price_lists').select('*')
          .eq('territory_type', t.territory_type).eq('territory_value', t.territory_value).eq('product_type', t.product_type);
        findQb = t.role_name ? findQb.eq('role_name', t.role_name as string) : findQb.is('role_name', null);
        const res = await findQb.maybeSingle();
        existing = res.data;
      }

      const row = { ...t, id: existing?.id ?? t.id, created_by_admin_id: existing ? undefined : ctx.id };
      const { data, error } = existing
        ? await db.from('territory_price_lists').update(row).eq('id', existing.id).select().single()
        : await db.from('territory_price_lists').insert(row).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'territory_price_list_upsert', 'territory_price_lists', data.id, { territory_type: data.territory_type, territory_value: data.territory_value, product_type: data.product_type });
      await pricingHistoryLog(db, 'territory_price_list', data.id, ctx.id, existing ? 'update' : 'create', existing, data);
      return Response.json({ success: true, territoryPriceList: data }, { headers });
    }

    if (action === 'territory_price_list_toggle') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { territory_price_list_id, is_active } = body as { territory_price_list_id?: string; is_active?: boolean };
      if (!territory_price_list_id) return Response.json({ success: false, message: 'territory_price_list_id is required.' }, { status: 400, headers });

      const { data: existing } = await db.from('territory_price_lists').select('*').eq('id', territory_price_list_id).maybeSingle();
      const { data, error } = await db.from('territory_price_lists')
        .update({ is_active, updated_at: new Date().toISOString() }).eq('id', territory_price_list_id).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'territory_price_list_toggle', 'territory_price_lists', territory_price_list_id, { is_active });
      await pricingHistoryLog(db, 'territory_price_list', territory_price_list_id, ctx.id, 'toggle', existing, data);
      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PARTNER PRODUCT VISIBILITY  [Phase 8C Part 2]
    // ══════════════════════════════════════════════
    if (action === 'partner_product_visibility_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('partner_product_visibility').select('*').order('role_name').order('product_type');
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, visibility: data || [] }, { headers });
    }

    if (action === 'partner_product_visibility_upsert') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const v = body.visibility as Record<string, unknown>;
      if (!v?.role_name || !v?.product_type) {
        return Response.json({ success: false, message: 'role_name and product_type are required.' }, { status: 400, headers });
      }
      if (!['dealer', 'franchise', 'distributor'].includes(v.role_name as string)) {
        return Response.json({ success: false, message: "role_name must be 'dealer', 'franchise', or 'distributor'." }, { status: 400, headers });
      }
      if (!isValidProductType(v.product_type as string)) {
        return Response.json({ success: false, message: 'Invalid product type.' }, { status: 400, headers });
      }

      // Same PostgREST onConflict-vs-expression-index limitation as
      // territory_price_list_upsert above — resolved explicitly.
      let existing = null;
      if (v.id) {
        const res = await db.from('partner_product_visibility').select('*').eq('id', v.id).maybeSingle();
        existing = res.data;
      } else {
        let findQb = db.from('partner_product_visibility').select('*')
          .eq('role_name', v.role_name as string).eq('product_type', v.product_type as string);
        findQb = v.admin_user_id ? findQb.eq('admin_user_id', v.admin_user_id as string) : findQb.is('admin_user_id', null);
        const res = await findQb.maybeSingle();
        existing = res.data;
      }

      const row = { ...v, id: existing?.id ?? v.id };
      const { data, error } = existing
        ? await db.from('partner_product_visibility').update(row).eq('id', existing.id).select().single()
        : await db.from('partner_product_visibility').insert(row).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'partner_product_visibility_upsert', 'partner_product_visibility', data.id, { role_name: data.role_name, product_type: data.product_type, is_visible: data.is_visible });
      await pricingHistoryLog(db, 'partner_product_visibility', data.id, ctx.id, existing ? 'update' : 'create', existing, data);
      return Response.json({ success: true, visibility: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // PRICING CHANGE HISTORY  [Phase 8C Part 2]
    // ══════════════════════════════════════════════
    if (action === 'pricing_history_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };

      let qb = db.from('pricing_change_history').select('*').order('created_at', { ascending: false }).limit(200);
      if (entity_type) qb = qb.eq('entity_type', entity_type);
      if (entity_id) qb = qb.eq('entity_id', entity_id);

      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, history: data || [] }, { headers });
    }

    // ══════════════════════════════════════════════
    // BULK PRICING TIERS
    // ══════════════════════════════════════════════
    if (action === 'bulk_pricing_tier_list') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data, error } = await db.from('bulk_pricing_tiers').select('*').order('product_type').order('min_quantity');
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, tiers: data || [] }, { headers });
    }

    if (action === 'bulk_pricing_tier_upsert') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const t = body.tier as Record<string, unknown>;
      if (!t?.product_type || t?.min_quantity == null || !t?.discount_type || t?.discount_value == null) {
        return Response.json({ success: false, message: 'product_type, min_quantity, discount_type, and discount_value are required.' }, { status: 400, headers });
      }
      if (!isValidProductType(t.product_type as string)) {
        return Response.json({ success: false, message: 'Invalid product type.' }, { status: 400, headers });
      }

      let tierExisting = null;
      if (t.id) {
        const res = await db.from('bulk_pricing_tiers').select('*').eq('id', t.id).maybeSingle();
        tierExisting = res.data;
      }

      const { data, error } = await db.from('bulk_pricing_tiers').upsert(t).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'bulk_pricing_tier_upsert', 'bulk_pricing_tiers', data.id, { product_type: data.product_type, min_quantity: data.min_quantity });
      await pricingHistoryLog(db, 'bulk_pricing_tier', data.id, ctx.id, tierExisting ? 'update' : 'create', tierExisting, data);
      return Response.json({ success: true, tier: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // COMMERCE ANALYTICS
    // ══════════════════════════════════════════════
    if (action === 'commerce_analytics') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });

      const [couponRes, campaignRes, impactRes, ruleUtilRes, partnerImpactRes] = await Promise.all([
        db.from('coupon_usage_analytics').select('*'),
        db.from('campaign_performance_analytics').select('*'),
        db.from('discount_revenue_impact_analytics').select('*'),
        db.from('pricing_rule_utilization_analytics').select('*'),          // Phase 8C Part 2
        db.from('partner_rule_discount_impact_analytics').select('*'),      // Phase 8C Part 2
      ]);

      const firstError = couponRes.error || campaignRes.error || impactRes.error || ruleUtilRes.error || partnerImpactRes.error;
      if (firstError) {
        return Response.json({ success: false, message: firstError.message }, { status: 500, headers });
      }

      return Response.json({
        success: true,
        couponUsage:        couponRes.data || [],
        campaignPerformance: campaignRes.data || [],
        discountImpact:      impactRes.data || [],
        ruleUtilization:     ruleUtilRes.data || [],       // Phase 8C Part 2
        partnerDiscountImpact: partnerImpactRes.data || [], // Phase 8C Part 2 — rule-based dealer/franchise/distributor discounts only; see view comment for the partner_price_lists-override limitation
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // PRICING PREVIEW (admin dry-run tool — does not create an order or touch order_discounts)
    // ══════════════════════════════════════════════
    if (action === 'pricing_preview') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const {
        productType, quantity = 1, partnerAdminId = null, partnerRoleName = null,
        territoryType = null, territoryValue = null,
      } = body as {
        productType?: string; quantity?: number;
        partnerAdminId?: string | null; partnerRoleName?: 'dealer' | 'franchise' | 'distributor' | null;
        territoryType?: 'state' | 'city' | 'zone' | 'pincode' | null; territoryValue?: string | null;
      };
      if (!productType || !isValidProductType(productType)) {
        return Response.json({ success: false, message: 'Valid productType is required.' }, { status: 400, headers });
      }
      if (partnerRoleName && !['dealer', 'franchise', 'distributor'].includes(partnerRoleName)) {
        return Response.json({ success: false, message: "partnerRoleName must be 'dealer', 'franchise', or 'distributor'." }, { status: 400, headers });
      }

      const territory = territoryType && territoryValue ? { type: territoryType, value: territoryValue } : null;
      const result = await computePricing(db, { productType, quantity, partnerAdminId, partnerRoleName, territory });
      if ('error' in result) return Response.json({ success: false, message: result.error }, { status: 400, headers });

      return Response.json({ success: true, preview: result }, { headers });
    }

    return Response.json({ success: false, message: `Unknown action: ${action}` }, { status: 400, headers });

  } catch (err) {
    console.error('[commerce-engine] Unexpected error:', err);
    return Response.json({ success: false, message: 'Unexpected error.' }, { status: 500, headers });
  }
});
