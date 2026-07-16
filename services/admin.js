/**
 * Smart Door — Admin Core Service
 * services/admin.js
 *
 * RBAC, session management, audit logging for the Admin Super Panel.
 * Uses Supabase service_role key — NEVER expose to client JS in production.
 * This file is designed to be called from Edge Functions or a secure backend.
 *
 * For the HTML admin panel (admin.html), session is stored in localStorage
 * and verified on every API call via the session_token field.
 */

import { supabase } from './supabase.js';
import { fetchWithTimeout } from './httpClient.js';
const ADMIN_SESSION_KEY = 'sd_admin_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export const ADMIN_ROLES = {
  SUPER_ADMIN:    'super_admin',
  OPS_MANAGER:    'ops_manager',
  MANUFACTURING:  'manufacturing',
  SUPPORT:        'support',
  ANALYST:        'analyst',
  DEALER:         'dealer', // Phase 12 — Internal Admin Portal: create customer + plate, no revenue
  FRANCHISE:      'franchise', // Phase 2 RBAC — regional partner: customers + plates, no revenue
  INSTALLER:      'installer', // Phase 2 RBAC — field technician: commission plates on-site, no revenue
};

/** Roles that must never see revenue/financial data, regardless of
 *  any 'analytics' grant they may pick up later (per brief). Kept as
 *  an explicit list rather than an "is field staff" flag so each
 *  exclusion is a deliberate, auditable decision. */
const REVENUE_RESTRICTED_ROLES = [
  ADMIN_ROLES.DEALER,
  ADMIN_ROLES.FRANCHISE,
  ADMIN_ROLES.INSTALLER,
];

export const PERMISSIONS = {
  CUSTOMERS:          'customers',
  ORDERS:             'orders',
  MANUFACTURING:      'manufacturing',
  QR:                 'qr',
  PLATES:             'plates',            // Phase 12
  PIN_RESET:          'pin_reset',         // Phase 12 — granted to support too
  ACTIVATION_RESEND:  'activation_resend', // Phase 12 — granted to support too
  OWNERSHIP_TRANSFER: 'ownership_transfer',// Phase 12 — super_admin only
  SUBSCRIPTIONS:      'subscriptions',
  SUPPORT:            'support',
  ANALYTICS:          'analytics',
  COMMUNICATION:      'communication',
  AUDIT:              'audit',
  SYSTEM:             'system',
};

// ────────── SESSION MANAGEMENT ──────────

export function getAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.exp) return null;
    if (Date.now() > session.exp) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setAdminSession(adminUser, token) {
  const session = {
    id: adminUser.id,
    email: adminUser.email,
    full_name: adminUser.full_name,
    role: adminUser.role_name,
    role_label: adminUser.role_label,
    role_color: adminUser.role_color,
    permissions: adminUser.permissions,
    token,
    exp: Date.now() + SESSION_DURATION_MS,
    loggedInAt: new Date().toISOString(),
  };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function requireAdminAuth(requiredRole = null) {
  const session = getAdminSession();
  if (!session) {
    window.location.href = '/admin-login.html';
    return null;
  }
  if (requiredRole && session.role !== 'super_admin' && session.role !== requiredRole) {
    return null; // Unauthorized
  }
  return session;
}

// ────────── RBAC: PERMISSION CHECK ──────────

export function hasPermission(session, resource, action = 'read') {
  if (!session) return false;
  const perms = session.permissions || {};
  // Super admin wildcard
  if (perms['*']) return true;
  const resourcePerms = perms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action) || resourcePerms.includes('manage');
}

export function canWrite(session, resource) {
  return hasPermission(session, resource, 'write');
}

export function canDelete(session, resource) {
  return hasPermission(session, resource, 'delete');
}

// ────────── ADMIN LOGIN ──────────
// supabase/functions/admin-login/index.ts (Phase 12) does the actual
// bcrypt compare + optional TOTP check + session issuance.

export async function adminLogin(email, password, totpCode = null) {
  // ── CRITICAL FIX (Production Recovery — Phase 5) ──────────────────────
  // NEVER use supabase.functions.invoke() for admin-login.
  // supabase.functions.invoke() injects the ANON KEY as "Authorization: Bearer"
  // on every request it makes. The admin-login Edge Function itself doesn't
  // care (it reads email+password from body), but it poisons the pattern:
  // any dev who copies this call style for admin-data/admin-provision-customer
  // will send the anon key as Bearer, causing verifyAdminSession() to fail
  // with 401 → "Connection Error" / blank dashboard metrics.
  //
  // Use raw fetch() for ALL admin Edge Function calls from the browser.
  // The session token (a 64-char hex secret) is then sent as the Bearer
  // for all subsequent admin-data / admin-provision-customer calls.
  // ──────────────────────────────────────────────────────────────────────
  try {
    const supabaseUrl = window.__SD_CONFIG__?.supabaseUrl;
    if (!supabaseUrl) throw new Error('Supabase URL not configured');

    // PRODUCTION HARDENING (API timeout consistency) — see services/httpClient.js
    const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        totp_code: totpCode,
      }),
    }, 15000);

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.message || 'Invalid credentials.',
        requires2FA: !!data?.requires2FA,
      };
    }

    const session = setAdminSession(data.admin, data.token);
    // Audit log is written server-side by the Edge Function with service_role.
    // The client-side call below is best-effort and will silently no-op under RLS.
    await adminAuditLog('login', 'admin_users', data.admin.id, {}, {}, 'Login successful');

    return { success: true, session };
  } catch (err) {
    console.error('[Admin] Login error:', err);
    return {
      success: false,
      error: err?.isTimeout ? 'Request timed out. Please check your connection and try again.' : 'Connection error. Try again.',
    };
  }
}

export async function adminLogout() {
  const session = getAdminSession();
  if (session) {
    await adminAuditLog('logout', 'admin_users', session.id, {}, {}, 'Logout');
  }
  clearAdminSession();
  window.location.href = '/admin-login.html';
}

// ────────── AUDIT LOGGING ──────────
// NOTE (Phase 12): admin_audit_logs has RLS policy
// "admin_audit_logs_no_public_access" (sql/08_admin_schema.sql) which
// blocks BOTH anon and authenticated roles — i.e. this client-side insert
// can only ever succeed if it's run with the service_role key. Calling it
// from here (anon key, browser) will silently no-op under RLS today.
// It's left in place because removing it would break every existing
// caller's code path (display/loading logic doesn't depend on the insert
// succeeding). New sensitive admin actions (provisioning, PIN reset,
// suspend/reactivate, ownership transfer) now write their own audit rows
// server-side inside the relevant Edge Function
// (supabase/functions/admin-*/index.ts, via service_role) instead of
// relying on this helper. Prefer that pattern for any new write-heavy
// admin action.
export async function adminAuditLog(action, resource, resourceId, before, after, notes = '') {
  try {
    const session = getAdminSession();
    await supabase.from('admin_audit_logs').insert({
      admin_id: session?.id || null,
      admin_email: session?.email || 'system',
      action,
      resource,
      resource_id: resourceId ? String(resourceId) : null,
      before_data: before || {},
      after_data: after || {},
      notes,
      user_agent: navigator.userAgent,
      ip_address: null, // Set server-side
    });
  } catch {
    // Audit logs are non-critical — fail silently
  }
}

// ────────── DASHBOARD METRICS ──────────

export async function getDashboardMetrics() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      usersRes,
      ordersRes,
      subsRes,
      mfgRes,
      ticketsRes,
      platesRes,
      messagesTodayRes,
      voiceNotesTodayRes,
    ] = await Promise.all([
      supabase.from('users').select('id, created_at', { count: 'exact', head: false }),
      supabase.from('orders').select('id, payment_status, total_amount, created_at', { count: 'exact', head: false }),
      supabase.from('subscriptions').select('id, status, plan', { count: 'exact', head: false }),
      supabase.from('manufacturing').select('id, production_status', { count: 'exact', head: false }),
      supabase.from('support_tickets').select('id, status', { count: 'exact', head: false }),
      supabase.from('plates').select('id, status', { count: 'exact', head: false }),
      supabase.from('message_logs').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
      supabase.from('voice_notes').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
    ]);

    const users = usersRes.data || [];
    const orders = ordersRes.data || [];
    const subs = subsRes.data || [];
    const mfg = mfgRes.data || [];
    const tickets = ticketsRes.data || [];
    const plates = platesRes.data || [];

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const paidOrders = orders.filter(o => o.payment_status === 'paid');
    const revenue = paidOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const revenueThisMonth = paidOrders
      .filter(o => new Date(o.created_at) >= thisMonth)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const revenueLastMonth = paidOrders
      .filter(o => new Date(o.created_at) >= lastMonth && new Date(o.created_at) < thisMonth)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const newUsersThisMonth = users.filter(u => new Date(u.created_at) >= thisMonth).length;
    const newUsersLastMonth = users.filter(u =>
      new Date(u.created_at) >= lastMonth && new Date(u.created_at) < thisMonth
    ).length;

    const growthPct = newUsersLastMonth > 0
      ? (((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100).toFixed(1)
      : null;

    return {
      success: true,
      metrics: {
        totalCustomers: users.length,
        newCustomersThisMonth: newUsersThisMonth,
        customerGrowthPct: growthPct,
        activeSubscriptions: subs.filter(s => s.status === 'active').length,
        expiringSoon: subs.filter(s => s.status === 'expiring_soon').length,
        totalRevenue: revenue,
        revenueThisMonth,
        revenueLastMonth,
        pendingOrders: orders.filter(o => o.payment_status === 'pending').length,
        paidOrders: paidOrders.length,
        manufacturingQueue: mfg.filter(m => ['queued','printing','quality_check'].includes(m.production_status)).length,
        openTickets: tickets.filter(t => t.status === 'open').length,
        pendingTickets: tickets.filter(t => t.status === 'pending').length,
        // Phase 12 — Internal Admin Portal dashboard cards
        totalPlates: plates.length,
        activePlates: plates.filter(p => p.status === 'active').length,
        inactivePlates: plates.filter(p => p.status === 'inactive' || p.status === 'suspended').length,
        messagesToday: messagesTodayRes.count || 0,
        voiceNotesToday: voiceNotesTodayRes.count || 0,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── REVENUE CHART DATA ──────────

export async function getRevenueChartData(months = 6) {
  try {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - months);

    const { data, error } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .eq('payment_status', 'paid')
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) return { success: false, error: error.message };

    // Group by month
    const grouped = {};
    (data || []).forEach(order => {
      const d = new Date(order.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      grouped[key] = (grouped[key] || 0) + (order.total_amount || 0);
    });

    const labels = [];
    const values = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      labels.push(label);
      values.push(grouped[key] || 0);
    }

    return { success: true, labels, values };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── ROLE CONVENIENCE HELPERS (Phase 12) ──────────

export function isSuperAdmin(session) {
  return session?.role === ADMIN_ROLES.SUPER_ADMIN;
}

/** Dealer, franchise & installer roles are explicitly barred from
 *  revenue/financial data (per brief), even if they somehow acquire
 *  an 'analytics' grant later. */
export function canAccessRevenue(session) {
  if (!session) return false;
  if (REVENUE_RESTRICTED_ROLES.includes(session.role)) return false;
  return hasPermission(session, PERMISSIONS.ANALYTICS) || isSuperAdmin(session);
}
