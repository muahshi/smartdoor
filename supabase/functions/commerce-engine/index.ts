/**
 * Smart Door — Edge Function: commerce-engine
 * supabase/functions/commerce-engine/index.ts
 *
 * Phase 8A Commerce Engine — admin-authenticated management API for
 * coupons, pricing rules, campaigns, dealer/franchise price lists, bulk
 * pricing tiers, and commerce analytics.
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
 * sql/57_commerce_engine_phase8a.sql.
 *
 * Actions:
 *   coupon_list / coupon_upsert / coupon_toggle
 *   pricing_rule_list / pricing_rule_upsert / pricing_rule_toggle
 *   campaign_list / campaign_upsert / campaign_toggle
 *   partner_price_list_list / partner_price_list_upsert
 *   bulk_pricing_tier_list / bulk_pricing_tier_upsert
 *   commerce_analytics
 *   pricing_preview   — dry-run computePricing() for a hypothetical order, admin tool only
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

      const row = { ...c, code: (c.code as string).toUpperCase(), created_by_admin_id: c.id ? undefined : ctx.id };
      const { data, error } = await db.from('coupons').upsert(row, { onConflict: 'code' }).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, c.id ? 'coupon_update' : 'coupon_create', 'coupons', data.id, { code: data.code });
      return Response.json({ success: true, coupon: data }, { headers });
    }

    if (action === 'coupon_toggle') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { coupon_id, is_active } = body as { coupon_id?: string; is_active?: boolean };
      if (!coupon_id) return Response.json({ success: false, message: 'coupon_id is required.' }, { status: 400, headers });

      const { error } = await db.from('coupons').update({ is_active, updated_at: new Date().toISOString() }).eq('id', coupon_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'coupon_toggle', 'coupons', coupon_id, { is_active });
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

      const row = { ...r, created_by_admin_id: r.id ? undefined : ctx.id };
      const { data, error } = await db.from('pricing_rules').upsert(row).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, r.id ? 'pricing_rule_update' : 'pricing_rule_create', 'pricing_rules', data.id, { name: data.name, rule_type: data.rule_type });
      return Response.json({ success: true, rule: data }, { headers });
    }

    if (action === 'pricing_rule_toggle') {
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { rule_id, is_active } = body as { rule_id?: string; is_active?: boolean };
      if (!rule_id) return Response.json({ success: false, message: 'rule_id is required.' }, { status: 400, headers });

      const { error } = await db.from('pricing_rules').update({ is_active, updated_at: new Date().toISOString() }).eq('id', rule_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'pricing_rule_toggle', 'pricing_rules', rule_id, { is_active });
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

      let qb = db.from('partner_price_lists').select('*').order('created_at', { ascending: false });
      // Dealers/franchise partners only ever see their OWN price list rows —
      // same scoping pattern as 37_dealer_order_visibility.sql's order_list.
      if (ctx.role_name === 'dealer' || ctx.role_name === 'franchise') {
        qb = qb.eq('admin_user_id', ctx.id);
      }
      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, priceLists: data || [] }, { headers });
    }

    if (action === 'partner_price_list_upsert') {
      // Setting partner pricing/margins is an ops/super-admin decision, not
      // something a dealer/franchise can grant themselves — full 'commerce'
      // write is required here regardless of role_name.
      if (!canWrite) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const p = body.priceList as Record<string, unknown>;
      if (!p?.admin_user_id || !p?.role_name || !p?.product_type) {
        return Response.json({ success: false, message: 'admin_user_id, role_name, and product_type are required.' }, { status: 400, headers });
      }
      if (!isValidProductType(p.product_type as string)) {
        return Response.json({ success: false, message: 'Invalid product type.' }, { status: 400, headers });
      }
      if (p.partner_price == null && p.discount_percent == null) {
        return Response.json({ success: false, message: 'Provide either partner_price or discount_percent.' }, { status: 400, headers });
      }

      const { data, error } = await db.from('partner_price_lists').upsert(p, { onConflict: 'admin_user_id,product_type' }).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'partner_price_list_upsert', 'partner_price_lists', data.id, { admin_user_id: data.admin_user_id, product_type: data.product_type });
      return Response.json({ success: true, priceList: data }, { headers });
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

      const { data, error } = await db.from('bulk_pricing_tiers').upsert(t).select().single();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await auditLog(db, ctx.id, 'bulk_pricing_tier_upsert', 'bulk_pricing_tiers', data.id, { product_type: data.product_type, min_quantity: data.min_quantity });
      return Response.json({ success: true, tier: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // COMMERCE ANALYTICS
    // ══════════════════════════════════════════════
    if (action === 'commerce_analytics') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });

      const [couponRes, campaignRes, impactRes] = await Promise.all([
        db.from('coupon_usage_analytics').select('*'),
        db.from('campaign_performance_analytics').select('*'),
        db.from('discount_revenue_impact_analytics').select('*'),
      ]);

      if (couponRes.error || campaignRes.error || impactRes.error) {
        return Response.json({ success: false, message: (couponRes.error || campaignRes.error || impactRes.error)?.message }, { status: 500, headers });
      }

      return Response.json({
        success: true,
        couponUsage:        couponRes.data || [],
        campaignPerformance: campaignRes.data || [],
        discountImpact:      impactRes.data || [],
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // PRICING PREVIEW (admin dry-run tool — does not create an order or touch order_discounts)
    // ══════════════════════════════════════════════
    if (action === 'pricing_preview') {
      if (!canRead) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { productType, quantity = 1, partnerAdminId = null, partnerRoleName = null } = body as {
        productType?: string; quantity?: number; partnerAdminId?: string | null; partnerRoleName?: 'dealer' | 'franchise' | null;
      };
      if (!productType || !isValidProductType(productType)) {
        return Response.json({ success: false, message: 'Valid productType is required.' }, { status: 400, headers });
      }

      const result = await computePricing(db, { productType, quantity, partnerAdminId, partnerRoleName });
      if ('error' in result) return Response.json({ success: false, message: result.error }, { status: 400, headers });

      return Response.json({ success: true, preview: result }, { headers });
    }

    return Response.json({ success: false, message: `Unknown action: ${action}` }, { status: 400, headers });

  } catch (err) {
    console.error('[commerce-engine] Unexpected error:', err);
    return Response.json({ success: false, message: 'Unexpected error.' }, { status: 500, headers });
  }
});
