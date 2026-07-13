/**
 * Smart Door — Usage Limits & Feature Gating Service
 * services/usageLimits.js
 *
 * SaaS Launch — Feature Gating + Usage Limits.
 *
 * Server-side enforcement lives in Postgres (SECURITY DEFINER RPCs —
 * sql/46_saas_billing_schema.sql), the same pattern this codebase already
 * uses for call rate-limiting (check_rate_limit). This service is just the
 * thin client wrapper:
 *
 *   - getUsageSummary(ownerId)              → read-only, for dashboards
 *   - checkAndIncrementUsage(ownerId, key)   → authoritative gate + counter
 *   - canUseFeature(ownerId, featureFlag)    → boolean flag check (plan tier)
 *
 * ADDITIVE ONLY — new file. Does not modify any existing call/photo/export
 * flow; those integration points (initiate-call, Activity Center exports)
 * are intentionally left untouched per this phase's scope. Call
 * `checkAndIncrementUsage()` from any new feature you build that should be
 * usage-gated.
 */

import { supabase } from './supabase.js';
import { getSubscription } from './subscriptions.js';
import { getPlan } from './plans.js';

/**
 * Read-only usage summary for the Subscription Dashboard: current plan,
 * usage vs. limits for calls / photos / exports / storage / family members,
 * and boolean feature flags (analytics, AI features).
 */
export async function getUsageSummary(ownerId) {
  try {
    const { data, error } = await supabase.rpc('get_usage_summary', { p_owner_id: ownerId });
    if (error) return { success: false, error: error.message };
    return { success: true, usage: data };
  } catch (err) {
    console.error('[UsageLimits] getUsageSummary error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Authoritative check-and-increment for a usage-limited action. Returns
 * { allowed, unlimited, used, limit }. Call this BEFORE performing the
 * gated action; if allowed === false, show an upgrade prompt instead.
 *
 * @param {string} ownerId
 * @param {'calls'|'photo_uploads'|'exports'} featureKey
 */
export async function checkAndIncrementUsage(ownerId, featureKey) {
  try {
    const { data, error } = await supabase.rpc('check_and_increment_usage', {
      p_owner_id: ownerId,
      p_feature_key: featureKey,
    });
    if (error) return { allowed: true, error: error.message }; // fail-open on infra errors — don't block core functionality
    return data || { allowed: true };
  } catch (err) {
    console.error('[UsageLimits] checkAndIncrementUsage error:', err);
    return { allowed: true, error: err.message };
  }
}

/**
 * Boolean feature-flag check for the owner's current plan
 * (e.g. 'analyticsEnabled', 'aiFeaturesEnabled', 'prioritySupport').
 * Falls back to the Free plan's flags if no active subscription is found.
 */
export async function canUseFeature(ownerId, flagKey) {
  const subResult = await getSubscription(ownerId);
  const planKey = subResult.success ? subResult.subscription.plan : 'free';
  const plan = await getPlan(planKey) || await getPlan('free');
  if (!plan) return true; // never hard-block if the catalog itself is unavailable

  const map = {
    analyticsEnabled: plan.analytics_enabled,
    aiFeaturesEnabled: plan.ai_features_enabled,
    prioritySupport: plan.priority_support,
  };
  return Boolean(map[flagKey]);
}

/** Formats a usage row like { used, limit } into a short display string. */
export function formatUsageLine(usage) {
  if (!usage) return '—';
  if (usage.limit === -1) return `${usage.used ?? 0} used · Unlimited`;
  return `${usage.used ?? 0} / ${usage.limit} used`;
}
