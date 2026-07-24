/**
 * My Smart Door — Admin Analytics Service
 * services/adminAnalytics.js
 *
 * Phase 13 — Analytics Dashboard Metrics
 * All reads go through service_role Edge Function to bypass RLS.
 *
 * Metrics:
 *   - New Activations Today
 *   - New Activations This Month
 *   - Messages Today
 *   - Voice Notes Today
 *   - Active Plates
 *   - Suspended Plates
 *   - Renewal Due Soon (next 30 days)
 */

import { supabase } from './supabase.js';
import { getAdminSession } from './admin.js';

const FUNCTION_NAME = 'admin-analytics';

async function callAdminFunction(name, body = {}) {
  const session = getAdminSession();
  if (!session?.token) {
    return { success: false, error: 'Admin session expired.' };
  }
  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.message || 'Request failed' };
    return data;
  } catch (err) {
    console.error(`[adminAnalytics] ${name} error:`, err);
    return { success: false, error: 'Connection error.' };
  }
}

/**
 * getDashboardMetrics()
 * Fetches all 7 dashboard metrics in one call.
 * Returns: {
 *   activations_today, activations_month,
 *   messages_today, voice_notes_today,
 *   active_plates, suspended_plates,
 *   renewal_due_soon
 * }
 */
export async function getDashboardMetrics() {
  return callAdminFunction(FUNCTION_NAME, { type: 'dashboard_metrics' });
}

/**
 * getActivationTrend(days = 30)
 * Returns daily activation counts for sparkline chart.
 */
export async function getActivationTrend(days = 30) {
  return callAdminFunction(FUNCTION_NAME, { type: 'activation_trend', days });
}

/**
 * getPlateStatusBreakdown()
 * Returns count by status: active, suspended, expired, inactive.
 */
export async function getPlateStatusBreakdown() {
  return callAdminFunction(FUNCTION_NAME, { type: 'status_breakdown' });
}

/**
 * getRevenueMetrics()
 * Returns MRR, ARR, total payments this month.
 * super_admin + ops_manager only.
 */
export async function getRevenueMetrics() {
  return callAdminFunction(FUNCTION_NAME, { type: 'revenue_metrics' });
}

/**
 * getFulfillmentPipeline()
 * Returns count of plates at each fulfillment stage.
 */
export async function getFulfillmentPipeline() {
  return callAdminFunction(FUNCTION_NAME, { type: 'fulfillment_pipeline' });
}

/**
 * getAIConsultantFunnel(days = 30)
 * Phase 3.1B — AI Product Consultant analytics: session funnel
 * (opened → messaged → recommended → configured), avg conversation
 * length, avg AI latency, error rate, abandonment rate, top questions.
 */
export async function getAIConsultantFunnel(days = 30) {
  return callAdminFunction(FUNCTION_NAME, { type: 'ai_consultant_funnel', days });
}

/**
 * getAIConsultantInsights(days = 30)
 * Phase 3.2 — Owner/Admin AI Insights Dashboard: product recommendation
 * performance, visitor intent categories, and a daily trend, extending
 * getAIConsultantFunnel() above without modifying it.
 */
export async function getAIConsultantInsights(days = 30) {
  return callAdminFunction(FUNCTION_NAME, { type: 'ai_consultant_insights', days });
}
