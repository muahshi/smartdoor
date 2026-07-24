/**
 * My Smart Door — Admin Analytics Service
 * services/analytics.js
 *
 * Revenue, orders, subscription, product performance analytics.
 */

import { supabase } from './supabase.js';

// ────────── FINANCIAL METRICS ──────────

export async function getFinancialMetrics() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString();

    const { data: payments } = await supabase
      .from('orders')
      .select('total_amount, payment_status, product_type, created_at')
      .eq('payment_status', 'paid');

    const all = payments || [];

    const sum = arr => arr.reduce((s, o) => s + (o.total_amount || 0), 0);
    const filterFrom = (from) => all.filter(o => new Date(o.created_at) >= new Date(from));

    const revenueToday = sum(filterFrom(todayStart));
    const revenueMonth = sum(filterFrom(monthStart));
    const revenueYear  = sum(filterFrom(yearStart));

    // MRR = revenue this month (rough)
    const mrr = revenueMonth;
    // ARR = MRR * 12
    const arr = mrr * 12;

    // Refunds
    const { data: refunds } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('payment_status', 'refunded');
    const totalRefunds = (refunds || []).reduce((s, r) => s + (r.total_amount || 0), 0);

    // Product breakdown
    const productRevenue = { acrylic: 0, stainless: 0, teakwood: 0 };
    all.forEach(o => {
      if (productRevenue[o.product_type] !== undefined) {
        productRevenue[o.product_type] += (o.total_amount || 0);
      }
    });

    return {
      success: true,
      financial: {
        revenueToday,
        revenueMonth,
        revenueYear,
        mrr,
        arr,
        totalRefunds,
        productRevenue,
        totalPaidOrders: all.length,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── SUBSCRIPTION ANALYTICS ──────────

export async function getSubscriptionAnalytics() {
  try {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data } = await supabase
      .from('subscriptions')
      .select('status, plan, expiry_date, created_at');

    const subs = data || [];
    const active   = subs.filter(s => s.status === 'active');
    const expired  = subs.filter(s => s.status === 'expired');
    const cancelled= subs.filter(s => s.status === 'cancelled');
    const expiringSoon = active.filter(s => new Date(s.expiry_date) <= in30Days);

    const planBreakdown = { hardware_only: 0, smartdoor_care: 0 };
    active.forEach(s => {
      if (planBreakdown[s.plan] !== undefined) planBreakdown[s.plan]++;
    });

    return {
      success: true,
      subscriptions: {
        total: subs.length,
        active: active.length,
        expired: expired.length,
        cancelled: cancelled.length,
        expiringSoon: expiringSoon.length,
        planBreakdown,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── ORDER ANALYTICS ──────────

export async function getOrderAnalytics(months = 6) {
  try {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - months);

    const { data } = await supabase
      .from('orders')
      .select('id, payment_status, manufacturing_status, product_type, total_amount, created_at')
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: true });

    const orders = data || [];

    // Monthly order counts
    const monthlyData = {};
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { orders: 0, revenue: 0 };
    }

    orders.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        monthlyData[key].orders++;
        if (o.payment_status === 'paid') monthlyData[key].revenue += (o.total_amount || 0);
      }
    });

    const labels = Object.keys(monthlyData).map(k => {
      const [y, m] = k.split('-');
      return new Date(y, m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const orderCounts = Object.values(monthlyData).map(d => d.orders);
    const revenueSeries = Object.values(monthlyData).map(d => d.revenue);

    // Product breakdown
    const productCounts = { acrylic: 0, stainless: 0, teakwood: 0 };
    orders.forEach(o => {
      if (productCounts[o.product_type] !== undefined) productCounts[o.product_type]++;
    });

    // Status breakdown
    const statusCounts = {};
    orders.forEach(o => {
      statusCounts[o.payment_status] = (statusCounts[o.payment_status] || 0) + 1;
    });

    return {
      success: true,
      orders: {
        total: orders.length,
        monthly: { labels, orderCounts, revenueSeries },
        productCounts,
        statusCounts,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── SYSTEM HEALTH (placeholder — real values need Edge Function) ──────────

export async function getSystemHealth() {
  try {
    // Test Supabase connectivity
    const start = Date.now();
    const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    const latency = Date.now() - start;

    const { count: qrCount } = await supabase.from('manufacturing').select('id', { count: 'exact', head: true });
    const { count: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true });
    const { count: logCount } = await supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true });

    return {
      success: true,
      health: {
        supabase: error ? 'degraded' : 'healthy',
        latencyMs: latency,
        totalUsers: userCount || 0,
        totalQRCodes: qrCount || 0,
        totalAuditLogs: logCount || 0,
        timestamp: new Date().toISOString(),
      }
    };
  } catch (err) {
    return { success: false, error: err.message, health: { supabase: 'down' } };
  }
}

// ────────── AUDIT LOGS (list) ──────────

export async function getAuditLogs({ action = null, resource = null, adminId = null, limit = 100, offset = 0 } = {}) {
  try {
    let qb = supabase
      .from('admin_audit_logs')
      .select('*, admin_users!admin_id(full_name, email)', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (action)   qb = qb.eq('action', action);
    if (resource) qb = qb.eq('resource', resource);
    if (adminId)  qb = qb.eq('admin_id', adminId);

    const { data, error, count } = await qb;
    if (error) return { success: false, error: error.message };

    return { success: true, logs: data || [], total: count || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
