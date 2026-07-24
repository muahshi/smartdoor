/**
 * My Smart Door — Plan Catalog Service
 * services/plans.js
 *
 * SaaS Launch — Subscription Plans.
 * Single source of truth for Free / Premium / Enterprise pricing + feature
 * limits, read from the `plan_catalog` table (sql/46_saas_billing_schema.sql)
 * via the existing admin-data Edge Function's `plan_catalog_list` action
 * (public read — no admin session required for this one action).
 *
 * ADDITIVE ONLY — new file, does not touch services/subscriptions.js's
 * existing PLANS map (hardware_only / smartdoor_care), which stays exactly
 * as-is for backward compatibility.
 */

import { supabase } from './supabase.js';

let _catalogCache = null;
let _catalogCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Sensible client-side fallback if the network call fails — keeps the
 *  pricing UI from rendering empty on a flaky connection. Mirrors the
 *  seed values in sql/46_saas_billing_schema.sql. */
const FALLBACK_PLANS = [
  {
    plan_key: 'free', name: 'Free', tagline: 'Get started with the essentials',
    price_monthly: 0, price_yearly: 0,
    calls_per_month: 30, visitor_history_days: 7, photo_uploads_per_month: 20, storage_mb: 100,
    exports_per_month: 1, family_members_limit: 2,
    analytics_enabled: false, ai_features_enabled: false, priority_support: false, support_tier: 'standard',
    sort_order: 1, is_active: true,
  },
  {
    plan_key: 'premium', name: 'Premium', tagline: 'AI receptionist + full visibility',
    price_monthly: 29, price_yearly: 299,
    calls_per_month: 500, visitor_history_days: 90, photo_uploads_per_month: 500, storage_mb: 2048,
    exports_per_month: 20, family_members_limit: 5,
    analytics_enabled: true, ai_features_enabled: true, priority_support: true, support_tier: 'priority',
    sort_order: 2, is_active: true,
  },
  {
    plan_key: 'enterprise', name: 'Enterprise', tagline: 'Unlimited scale, dedicated support',
    price_monthly: 999, price_yearly: 9999,
    calls_per_month: -1, visitor_history_days: 365, photo_uploads_per_month: -1, storage_mb: 20480,
    exports_per_month: -1, family_members_limit: 20,
    analytics_enabled: true, ai_features_enabled: true, priority_support: true, support_tier: 'dedicated',
    sort_order: 3, is_active: true,
  },
];

/**
 * Fetches the purchasable plan catalog (Free/Premium/Enterprise — legacy
 * hardware_only/smartdoor_care aliases are marked is_active=false and
 * excluded here since they're not offered on new signups/upgrades).
 */
export async function getPlanCatalog({ force = false } = {}) {
  const now = Date.now();
  if (!force && _catalogCache && (now - _catalogCacheAt) < CACHE_TTL_MS) {
    return { success: true, plans: _catalogCache };
  }

  try {
    const { data, error } = await supabase
      .from('plan_catalog')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data || !data.length) {
      return { success: true, plans: FALLBACK_PLANS, fallback: true };
    }

    _catalogCache = data;
    _catalogCacheAt = now;
    return { success: true, plans: data };
  } catch (err) {
    console.warn('[Plans] getPlanCatalog fallback:', err);
    return { success: true, plans: FALLBACK_PLANS, fallback: true };
  }
}

/** Convenience: fetch a single plan's definition (from cache if warm). */
export async function getPlan(planKey) {
  const { plans } = await getPlanCatalog();
  const found = plans.find((p) => p.plan_key === planKey);
  if (found) return found;

  // FIX: getPlanCatalog() only returns is_active=true rows (free/premium/
  // enterprise), so legacy/complimentary keys like 'hardware_only' or
  // 'smartdoor_care' never matched here and silently fell back to Free's
  // limits everywhere canUseFeature()/usage checks call getPlan() — exactly
  // the "artificial limit during complimentary Premium" bug. Legacy keys are
  // intentionally few and static, so a direct single-row lookup (bypassing
  // the is_active filter) is enough — no caching needed for this rare path.
  try {
    const { data } = await supabase
      .from('plan_catalog')
      .select('*')
      .eq('plan_key', planKey)
      .maybeSingle();
    return data || null;
  } catch (err) {
    console.warn('[Plans] getPlan legacy lookup failed:', err);
    return null;
  }
}

/** Human-friendly feature bullet list for a plan, for pricing/upgrade UI. */
export function planFeatureList(plan) {
  if (!plan) return [];
  const fmt = (n) => (n === -1 ? 'Unlimited' : n);
  return [
    `${fmt(plan.calls_per_month)} calls / month`,
    `${fmt(plan.visitor_history_days)}-day visitor history`,
    `${fmt(plan.photo_uploads_per_month)} photo uploads / month`,
    `${fmt(plan.storage_mb)} MB storage`,
    `${fmt(plan.exports_per_month)} exports / month`,
    `${fmt(plan.family_members_limit)} family members`,
    plan.analytics_enabled ? 'Advanced analytics' : null,
    plan.ai_features_enabled ? 'AI receptionist & insights' : null,
    plan.priority_support ? `${plan.support_tier === 'dedicated' ? 'Dedicated' : 'Priority'} support` : 'Standard support',
  ].filter(Boolean);
}

export { FALLBACK_PLANS };
