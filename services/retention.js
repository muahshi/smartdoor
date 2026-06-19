/**
 * Smart Door — Retention Engine
 * services/retention.js
 *
 * Phase 11 — Real World Operations
 *
 * Tracks owner activity (retention_events) and computes real DAU / WAU /
 * MAU, renewal rate, and retention rate — no placeholder numbers.
 *
 * Additive only — does not touch services/customerSuccess.js (which owns
 * onboarding + health score) or services/renewalEngine.js.
 */

import { supabase } from './supabase.js';

// ────────── RECORD ACTIVITY ──────────
/**
 * Call once per owner session (e.g. on app.html load / dashboard mount).
 * Fire-and-forget — never blocks the UI.
 * @param {string} ownerId
 * @param {'login'|'dashboard_view'|'app_open'|'activity'} eventType
 */
export async function recordActivity(ownerId, eventType = 'activity') {
  if (!ownerId) return { success: false, error: 'ownerId required' };
  try {
    const { error } = await supabase.from('retention_events').insert({ owner_id: ownerId, event_type: eventType });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── RETENTION METRICS (real, computed — no placeholders) ──────────
/**
 * Reads sql/12_real_world_operations.sql:retention_metrics_view.
 * Falls back to manual computation if the view isn't deployed yet.
 */
export async function getRetentionMetrics() {
  try {
    const { data, error } = await supabase.from('retention_metrics_view').select('*').single();

    if (!error && data) {
      return {
        success: true,
        metrics: {
          dailyActiveOwners:   data.daily_active_owners || 0,
          weeklyActiveOwners:  data.weekly_active_owners || 0,
          monthlyActiveOwners: data.monthly_active_owners || 0,
          totalOwners:         data.total_owners || 0,
          retentionRatePct:    Number(data.retention_rate_pct) || 0,
          totalRenewals:       data.total_renewals || 0,
          totalExpirations:    data.total_expirations || 0,
          renewalRatePct:      Number(data.renewal_rate_pct) || 0,
        },
      };
    }

    return await _computeRetentionMetricsManually();
  } catch (err) {
    console.error('[Retention] getRetentionMetrics error:', err);
    return await _computeRetentionMetricsManually();
  }
}

async function _computeRetentionMetricsManually() {
  try {
    const now = new Date();
    const day1 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [dauRes, wauRes, mauRes, totalOwnersRes, renewedRes, expiredRes] = await Promise.all([
      supabase.from('retention_events').select('owner_id').gte('created_at', day1),
      supabase.from('retention_events').select('owner_id').gte('created_at', day7),
      supabase.from('retention_events').select('owner_id').gte('created_at', day30),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('activation_events').select('id', { count: 'exact', head: true }).eq('event_type', 'renewed'),
      supabase.from('activation_events').select('id', { count: 'exact', head: true }).eq('event_type', 'expired'),
    ]);

    const dau = new Set((dauRes.data || []).map((r) => r.owner_id)).size;
    const wau = new Set((wauRes.data || []).map((r) => r.owner_id)).size;
    const mau = new Set((mauRes.data || []).map((r) => r.owner_id)).size;
    const totalOwners = totalOwnersRes.count || 0;
    const totalRenewals = renewedRes.count || 0;
    const totalExpirations = expiredRes.count || 0;

    return {
      success: true,
      metrics: {
        dailyActiveOwners: dau,
        weeklyActiveOwners: wau,
        monthlyActiveOwners: mau,
        totalOwners,
        retentionRatePct: totalOwners > 0 ? Math.round((mau / totalOwners) * 10000) / 100 : 0,
        totalRenewals,
        totalExpirations,
        renewalRatePct:
          (totalRenewals + totalExpirations) > 0
            ? Math.round((totalRenewals / (totalRenewals + totalExpirations)) * 10000) / 100
            : 0,
      },
      computedManually: true,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── PER-OWNER ACTIVITY HISTORY ──────────
export async function getOwnerActivityHistory(ownerId, days = 30) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('retention_events')
      .select('event_type, created_at')
      .eq('owner_id', ownerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, events: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
