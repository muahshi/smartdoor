/**
 * My Smart Door — Society Analytics Service
 * services/societyAnalytics.js
 *
 * Phase 13 — Society-wide analytics.
 * Tracks: visitor volume, deliveries, guests, service staff, emergency events,
 * security incidents, active units, billing metrics.
 * Additive only — extends existing analytics.js without modifying it.
 */

import { supabase } from './supabase.js';

// ────────── PLATFORM-LEVEL METRICS (for SmartDoor admin) ──────────

export async function getPlatformOverview() {
  const [orgs, properties, units, residents, guards] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('units').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('residents').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('guards').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  return {
    success: true,
    overview: {
      totalOrganizations: orgs.count || 0,
      totalProperties:    properties.count || 0,
      totalUnits:         units.count || 0,
      totalResidents:     residents.count || 0,
      activeGuards:       guards.count || 0,
    },
  };
}

// ────────── SOCIETY DASHBOARD ──────────

export async function getSocietyDashboard(propertyId) {
  const [
    statsResult,
    dailyVisitors,
    deliveryStats,
    activeEmergencies,
    recentCheckins,
  ] = await Promise.all([
    supabase.rpc('get_society_stats', { p_property_id: propertyId }),

    // Last 7 days visitor volume
    supabase
      .from('guard_checkins')
      .select('checked_in_at')
      .eq('property_id', propertyId)
      .gte('checked_in_at', _daysAgo(7))
      .order('checked_in_at'),

    // Last 30 days delivery by partner
    supabase
      .from('delivery_logs')
      .select('partner, status, arrived_at')
      .eq('property_id', propertyId)
      .gte('arrived_at', _daysAgo(30)),

    supabase
      .from('emergency_events')
      .select('*')
      .eq('property_id', propertyId)
      .eq('status', 'active'),

    supabase
      .from('guard_checkins')
      .select('visitor_name, purpose, checked_in_at, approval_status, units(unit_number, towers(name))')
      .eq('property_id', propertyId)
      .order('checked_in_at', { ascending: false })
      .limit(10),
  ]);

  // Build weekly chart data
  const weeklyLabels = [];
  const weeklyValues = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const dateStr = d.toISOString().split('T')[0];
    const count = (dailyVisitors.data || []).filter(v =>
      v.checked_in_at.startsWith(dateStr)
    ).length;
    weeklyLabels.push(label);
    weeklyValues.push(count);
  }

  // Delivery breakdown
  const deliveryData = deliveryStats.data || [];
  const partnerBreakdown = {};
  deliveryData.forEach(d => {
    partnerBreakdown[d.partner] = (partnerBreakdown[d.partner] || 0) + 1;
  });

  return {
    success: true,
    dashboard: {
      stats:            statsResult.data || {},
      weeklyVisitors:   { labels: weeklyLabels, values: weeklyValues },
      partnerBreakdown,
      activeEmergencies: activeEmergencies.data || [],
      recentVisitors:    recentCheckins.data || [],
    },
  };
}

// ────────── VISITOR TRENDS ──────────

export async function getVisitorTrends(propertyId, days = 30) {
  const { data, error } = await supabase
    .from('guard_checkins')
    .select('checked_in_at, checkin_type, purpose, approval_status')
    .eq('property_id', propertyId)
    .gte('checked_in_at', _daysAgo(days))
    .order('checked_in_at');

  if (error) return { success: false, error: error.message };

  const byDay = {};
  const byType = { manual: 0, qr_scan: 0, pass_code: 0, delivery: 0 };
  const byStatus = { approved: 0, denied: 0, pending: 0, auto_approved: 0 };

  (data || []).forEach(v => {
    const day = v.checked_in_at.split('T')[0];
    byDay[day] = (byDay[day] || 0) + 1;
    byType[v.checkin_type] = (byType[v.checkin_type] || 0) + 1;
    byStatus[v.approval_status] = (byStatus[v.approval_status] || 0) + 1;
  });

  return {
    success: true,
    trends: {
      total:       data.length,
      byDay,
      byType,
      byStatus,
      approvalRate: data.length > 0
        ? Math.round(((byStatus.approved + byStatus.auto_approved) / data.length) * 100)
        : 0,
    },
  };
}

// ────────── DELIVERY ANALYTICS ──────────

export async function getDeliveryAnalytics(propertyId, days = 30) {
  const { data, error } = await supabase
    .from('delivery_logs')
    .select('partner, status, arrived_at, delivered_at, unit_id')
    .eq('property_id', propertyId)
    .gte('arrived_at', _daysAgo(days));

  if (error) return { success: false, error: error.message };

  const deliveries = data || [];
  const byPartner  = {};
  let totalDelivered = 0;
  let totalHeld = 0;

  deliveries.forEach(d => {
    byPartner[d.partner] = (byPartner[d.partner] || { total: 0, delivered: 0 });
    byPartner[d.partner].total++;
    if (d.status === 'delivered') { byPartner[d.partner].delivered++; totalDelivered++; }
    if (d.status === 'held_at_gate') totalHeld++;
  });

  return {
    success: true,
    analytics: {
      total:         deliveries.length,
      delivered:     totalDelivered,
      heldAtGate:    totalHeld,
      byPartner,
      avgDailyCount: deliveries.length / days,
    },
  };
}

// ────────── SECURITY INCIDENTS ──────────

export async function getSecurityIncidents(propertyId, days = 30) {
  const { data, error } = await supabase
    .from('emergency_events')
    .select('*')
    .eq('property_id', propertyId)
    .gte('created_at', _daysAgo(days))
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };

  const events = data || [];
  const byType = {};
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };

  events.forEach(e => {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
  });

  return {
    success: true,
    incidents: {
      total:      events.length,
      active:     events.filter(e => e.status === 'active').length,
      resolved:   events.filter(e => e.status === 'resolved').length,
      byType,
      bySeverity,
      recent:     events.slice(0, 5),
    },
  };
}

// ────────── OCCUPANCY REPORT ──────────

export async function getOccupancyReport(propertyId) {
  const { data, error } = await supabase
    .from('property_occupancy')
    .select('*')
    .eq('property_id', propertyId)
    .single();

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    occupancy: {
      ...data,
      occupancyRate: data.total_units > 0
        ? Math.round((data.occupied_units / data.total_units) * 100)
        : 0,
    },
  };
}

// ────────── BILLING ANALYTICS (platform admin) ──────────

export async function getBillingOverview() {
  const { data, error } = await supabase
    .from('society_subscriptions')
    .select('billing_model, price_per_unit, flat_price, active_units, status, plan');

  if (error) return { success: false, error: error.message };

  const subs = data || [];
  const activeSubs = subs.filter(s => s.status === 'active');

  const totalMRR = activeSubs.reduce((sum, s) => {
    if (s.billing_model === 'flat_rate') return sum + (s.flat_price || 0);
    return sum + (s.active_units || 0) * (s.price_per_unit || 0);
  }, 0);

  const byPlan = {};
  activeSubs.forEach(s => {
    byPlan[s.plan] = (byPlan[s.plan] || 0) + 1;
  });

  return {
    success: true,
    billing: {
      totalSubscriptions: activeSubs.length,
      totalMRR,
      estimatedARR: totalMRR * 12,
      byPlan,
    },
  };
}

// ────────── HELPERS ──────────

function _daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

