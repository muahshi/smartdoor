/**
 * Smart Door — Shared Commerce Pricing Engine
 * supabase/functions/_shared/commercePricing.ts
 *
 * Phase 8A. SINGLE SOURCE OF TRUTH for how pricing_rules, partner (dealer/
 * franchise) price lists, and bulk pricing tiers combine to produce a
 * final unit price + rule-based discount, BEFORE any coupon code is
 * applied on top (coupons are handled separately by the reserve_coupon()
 * DB function so their usage-limit bookkeeping stays atomic/race-safe).
 *
 * Every Edge Function that needs this (create-razorpay-order,
 * commerce-engine's preview action) MUST import from here instead of
 * re-implementing the stacking logic, so pricing can never drift between
 * what checkout charges and what the admin preview tool shows.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getProductPricePaise } from './pricing.ts';

export interface PricingContext {
  productType: string;
  quantity: number;                 // defaults to 1 upstream — always pass a real value
  isRenewal?: boolean;
  planKey?: string;
  customerSegment?: string;         // 'vip' | 'paying' | etc, from customer_segments — optional
  partnerAdminId?: string | null;   // set when a dealer/franchise is placing the order on a customer's behalf
  partnerRoleName?: 'dealer' | 'franchise' | null;
}

export interface AppliedRule {
  ruleId: string;
  name: string;
  ruleType: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number;
}

export interface PricingResult {
  basePricePaise: number;           // public unit price × quantity, in paise
  partnerUnitPricePaise: number | null; // if a dealer/franchise override applied, the resulting unit price × quantity, in paise
  appliedRules: AppliedRule[];
  totalDiscountPaise: number;       // sum of appliedRules discounts, in paise
  finalPricePaise: number;          // basePricePaise (or partnerUnitPricePaise if lower) minus totalDiscountPaise, floored at 0
}

/**
 * Resolves the effective unit price for a dealer/franchise placing an
 * order on a customer's behalf. Returns null if no active price-list row
 * exists for this partner+product — callers should fall back to the
 * public price (PRODUCT_PRICES_PAISE) in that case, not fail the order.
 */
async function resolvePartnerPricePaise(
  supabase: SupabaseClient,
  publicUnitPricePaise: number,
  ctx: PricingContext
): Promise<number | null> {
  if (!ctx.partnerAdminId || !ctx.partnerRoleName) return null;

  const { data, error } = await supabase
    .from('partner_price_lists')
    .select('partner_price, discount_percent')
    .eq('admin_user_id', ctx.partnerAdminId)
    .eq('role_name', ctx.partnerRoleName)
    .eq('product_type', ctx.productType)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  if (data.partner_price != null) {
    return Math.round(Number(data.partner_price) * 100);
  }
  if (data.discount_percent != null) {
    return Math.round(publicUnitPricePaise * (1 - Number(data.discount_percent) / 100));
  }
  return null;
}

/** Bulk quantity-break lookup — best matching tier for the given quantity. */
async function resolveBulkTier(
  supabase: SupabaseClient,
  ctx: PricingContext
): Promise<{ discountType: 'percentage' | 'fixed'; discountValue: number } | null> {
  if (ctx.quantity < 2) return null; // bulk tiers only ever apply at 2+ units

  const { data, error } = await supabase
    .from('bulk_pricing_tiers')
    .select('discount_type, discount_value, min_quantity, max_quantity')
    .eq('product_type', ctx.productType)
    .eq('is_active', true)
    .lte('min_quantity', ctx.quantity)
    .order('min_quantity', { ascending: false })
    .limit(20); // fetch candidates, filter max_quantity client-side (nullable upper bound isn't expressible in one .lte/.gte pair)

  if (error || !data || data.length === 0) return null;

  const match = data.find((t: { max_quantity: number | null }) => t.max_quantity == null || ctx.quantity <= t.max_quantity);
  if (!match) return null;

  return { discountType: match.discount_type, discountValue: Number(match.discount_value) };
}

/**
 * Fetches active, in-window pricing_rules whose `conditions` match the
 * given context, for a specific rule_type.
 */
async function matchingRules(
  supabase: SupabaseClient,
  ruleType: string,
  ctx: PricingContext
): Promise<Array<{ id: string; name: string; discount_type: 'percentage' | 'fixed'; discount_value: number; max_discount_amount: number | null; priority: number; stackable: boolean; conditions: Record<string, unknown> }>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('id, name, discount_type, discount_value, max_discount_amount, priority, stackable, conditions, starts_at, expires_at')
    .eq('rule_type', ruleType)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error || !data) return [];

  return data.filter((r: { starts_at: string | null; expires_at: string | null; conditions: Record<string, unknown> }) => {
    if (r.starts_at && r.starts_at > nowIso) return false;
    if (r.expires_at && r.expires_at < nowIso) return false;

    const cond = r.conditions || {};
    if (Array.isArray(cond.product_types) && cond.product_types.length > 0 && !cond.product_types.includes(ctx.productType)) return false;
    if (typeof cond.min_quantity === 'number' && ctx.quantity < cond.min_quantity) return false;
    if (Array.isArray(cond.plan_keys) && cond.plan_keys.length > 0 && ctx.planKey && !cond.plan_keys.includes(ctx.planKey)) return false;
    if (Array.isArray(cond.role_names) && cond.role_names.length > 0 && (!ctx.partnerRoleName || !cond.role_names.includes(ctx.partnerRoleName))) return false;

    return true;
  });
}

/**
 * Computes the final price for a checkout line, combining (in order):
 *   1. Dealer/franchise partner price override (if applicable) vs public price — lower wins
 *   2. Bulk quantity-break discount (rule_type-independent, own table)
 *   3. Stackable pricing_rules matching this context (launch/festival/referral/
 *      premium/renewal/campaign/dealer_discount/franchise_discount rule_types)
 *
 * Rule stacking: the highest-priority (lowest `priority` number) matching
 * rule always applies. If it is NOT stackable, no other rule is applied
 * alongside it. If it IS stackable, every other stackable matching rule
 * is applied too (non-stackable rules besides the top one are ignored —
 * "stackable only when allowed").
 *
 * Coupon codes are NOT handled here — see reserve_coupon() in
 * 57_commerce_engine_phase8a.sql, applied on top of finalPricePaise by
 * the caller after this function returns.
 */
export async function computePricing(
  supabase: SupabaseClient,
  ctx: PricingContext
): Promise<PricingResult | { error: string }> {
  const publicUnitPricePaise = getProductPricePaise(ctx.productType);
  if (publicUnitPricePaise == null) return { error: 'Invalid product type.' };

  const quantity = Math.max(1, Math.floor(ctx.quantity || 1));
  const publicTotalPaise = publicUnitPricePaise * quantity;

  // ── 1. Partner (dealer/franchise) price override ──
  const partnerUnitPricePaise = await resolvePartnerPricePaise(supabase, publicUnitPricePaise, ctx);
  const partnerTotalPaise = partnerUnitPricePaise != null ? partnerUnitPricePaise * quantity : null;
  const workingBasePaise = partnerTotalPaise != null ? Math.min(partnerTotalPaise, publicTotalPaise) : publicTotalPaise;

  const appliedRules: AppliedRule[] = [];
  let remainingPaise = workingBasePaise;

  // ── 2. Bulk pricing tier (own table, applied first — it's about quantity, not a "rule") ──
  const bulkTier = await resolveBulkTier(supabase, ctx);
  if (bulkTier) {
    const amt = bulkTier.discountType === 'percentage'
      ? Math.round(remainingPaise * bulkTier.discountValue / 100)
      : Math.round(bulkTier.discountValue * 100 * quantity);
    appliedRules.push({
      ruleId: 'bulk-tier', name: `Bulk pricing (${quantity} units)`, ruleType: 'bulk_discount',
      discountType: bulkTier.discountType, discountValue: bulkTier.discountValue, discountAmount: amt,
    });
    remainingPaise = Math.max(0, remainingPaise - amt);
  }

  // ── 3. Configurable pricing_rules — gather candidates across all rule_types, then pick top + stackables ──
  const ruleTypesToCheck = [
    'launch_offer', 'festival_offer', 'referral_discount', 'dealer_discount',
    'franchise_discount', 'premium_customer_discount', 'renewal_discount', 'campaign',
  ];

  const allCandidates: Array<{ id: string; name: string; rule_type: string; discount_type: 'percentage' | 'fixed'; discount_value: number; max_discount_amount: number | null; priority: number; stackable: boolean }> = [];

  for (const ruleType of ruleTypesToCheck) {
    // Skip partner-discount rule types when there's no partner context, and
    // skip renewal rules on a non-renewal checkout — avoids needless queries.
    if ((ruleType === 'dealer_discount' || ruleType === 'franchise_discount') && !ctx.partnerAdminId) continue;
    if (ruleType === 'renewal_discount' && !ctx.isRenewal) continue;

    const matches = await matchingRules(supabase, ruleType, ctx);
    for (const m of matches) {
      allCandidates.push({ id: m.id, name: m.name, rule_type: ruleType, discount_type: m.discount_type, discount_value: m.discount_value, max_discount_amount: m.max_discount_amount, priority: m.priority, stackable: m.stackable });
    }
  }

  allCandidates.sort((a, b) => a.priority - b.priority);

  if (allCandidates.length > 0) {
    const top = allCandidates[0];
    const selected = top.stackable
      ? allCandidates.filter((c) => c.stackable)
      : [top];

    for (const rule of selected) {
      let amt = rule.discount_type === 'percentage'
        ? Math.round(remainingPaise * rule.discount_value / 100)
        : Math.round(rule.discount_value * 100);
      if (rule.max_discount_amount != null) {
        amt = Math.min(amt, Math.round(rule.max_discount_amount * 100));
      }
      amt = Math.min(amt, remainingPaise); // never discount past zero
      appliedRules.push({
        ruleId: rule.id, name: rule.name, ruleType: rule.rule_type,
        discountType: rule.discount_type, discountValue: rule.discount_value, discountAmount: amt,
      });
      remainingPaise = Math.max(0, remainingPaise - amt);
    }
  }

  const totalDiscountPaise = workingBasePaise - remainingPaise;

  return {
    basePricePaise: publicTotalPaise,
    partnerUnitPricePaise: partnerTotalPaise,
    appliedRules,
    totalDiscountPaise,
    finalPricePaise: remainingPaise,
  };
}
