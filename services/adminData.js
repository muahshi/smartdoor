/**
 * Smart Door — Admin Data Service
 * services/adminData.js
 *
 * ROOT CAUSE FIX: The admin panel (admin.html) was reading users, plates,
 * orders, subscriptions, support_tickets, and admin_audit_logs directly
 * with the anon key via services/customers.js, services/admin.js, and
 * services/analytics.js. All those tables have RLS policies that block
 * anon/authenticated reads — only service_role bypasses RLS.
 *
 * This service is a thin wrapper around the new `admin-data` Edge Function,
 * which uses service_role + verifies the admin session token on every
 * request. It replaces the broken direct-Supabase-reads in the admin panel.
 *
 * Drop-in replacement API (same function signatures as the old services):
 *   getDashboardMetrics()     → replaces services/admin.js getDashboardMetrics
 *   searchCustomers(opts)     → replaces services/customers.js searchCustomers
 *   getCustomerProfile(id)    → replaces services/customers.js getCustomerProfile
 *   getFinancialMetrics()     → replaces services/analytics.js getFinancialMetrics
 *   getOrderList(opts)        → replaces services/analytics.js getOrderAnalytics
 *   getSubscriptionList(opts) → replaces services/analytics.js getSubscriptionAnalytics
 *   getAuditLogs(opts)        → replaces services/analytics.js getAuditLogs
 *   getSystemHealth()         → replaces services/analytics.js getSystemHealth
 */

import { fetchWithTimeout } from './httpClient.js';

function _edgeBase() { return `${window.__SD_CONFIG__?.supabaseUrl || ""}/functions/v1`; }

async function _call(type, extra = {}) {
  const raw = localStorage.getItem('sd_admin_session');
  if (!raw) return { success: false, error: 'Admin session expired. Please sign in again.' };

  let session;
  try { session = JSON.parse(raw); }
  catch { return { success: false, error: 'Corrupt admin session. Please sign in again.' }; }

  const token = session?.token;
  if (!token) return { success: false, error: 'Admin session expired. Please sign in again.' };

  try {
    // PRODUCTION HARDENING (API timeout consistency) — see services/httpClient.js
    const res = await fetchWithTimeout(`${_edgeBase()}/admin-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ type, ...extra }),
    }, 15000);

    if (!res.ok && res.status === 401) {
      // Session expired server-side — clear local session and redirect
      localStorage.removeItem('sd_admin_session');
      window.location.href = '/admin-login.html';
      return { success: false, error: 'Session expired.' };
    }

    const data = await res.json();
    if (!data?.success) {
      return { success: false, error: data?.message || 'Request failed.' };
    }
    return data;
  } catch (err) {
    console.error('[adminData]', type, 'error:', err);
    return {
      success: false,
      error: err?.isTimeout ? 'Request timed out. Please check your connection and try again.' : 'Connection error. Please try again.',
    };
  }
}

// ────────── DASHBOARD METRICS ──────────
export async function getDashboardMetrics() {
  const res = await _call('dashboard_metrics');
  if (!res.success) return res;
  return { success: true, metrics: res.metrics };
}

// ────────── CUSTOMER LIST ──────────
export async function searchCustomers({ query = '', field = 'all', limit = 30, offset = 0 } = {}) {
  const res = await _call('customer_list', { query, field, limit, offset });
  if (!res.success) return res;
  return { success: true, customers: res.customers, total: res.total };
}

// ────────── CUSTOMER PROFILE ──────────
export async function getCustomerProfile(customerId) {
  const res = await _call('customer_profile', { customer_id: customerId });
  if (!res.success) return res;
  return { success: true, profile: res.profile };
}

// ────────── FINANCIAL METRICS ──────────
export async function getFinancialMetrics() {
  const res = await _call('financial_metrics');
  if (!res.success) return res;
  return { success: true, financial: res.financial };
}

// ────────── ORDER LIST ──────────
export async function getOrderList({ statusFilter = null, limit = 50, offset = 0 } = {}) {
  const res = await _call('order_list', { status_filter: statusFilter, limit, offset });
  if (!res.success) return res;
  return { success: true, orders: res.orders, total: res.total };
}

// ────────── SUBSCRIPTION LIST ──────────
export async function getSubscriptionList({ statusFilter = null, limit = 50, offset = 0 } = {}) {
  const res = await _call('subscription_list', { status_filter: statusFilter, limit, offset });
  if (!res.success) return res;
  return { success: true, subscriptions: res.subscriptions, total: res.total };
}

// ────────── AUDIT LOGS ──────────
export async function getAuditLogs({ action = null, resource = null, limit = 100, offset = 0 } = {}) {
  const res = await _call('audit_logs', { action, resource, limit, offset });
  if (!res.success) return res;
  return { success: true, logs: res.logs, total: res.total };
}

// ────────── SYSTEM HEALTH ──────────
export async function getSystemHealth() {
  const res = await _call('system_health');
  if (!res.success) return res;
  return { success: true, health: res.health };
}

// ────────── REVENUE CHART DATA ──────────
export async function getRevenueChartData(months = 6) {
  const res = await _call('revenue_chart', { months });
  if (!res.success) return res;
  return { success: true, labels: res.labels, values: res.values };
}

// ────────── ORDER ANALYTICS (for charts) ──────────

