/**
 * My Smart Door — Society Admin Service
 * services/societyAdmin.js
 *
 * Phase 13 — Society Admin Panel Backend
 *
 * Role: society_admins table.
 * Capabilities: Manage towers, units, residents, analytics, guards, reports.
 * Additive only — no existing service modified.
 */

import { supabase } from './supabase.js';

// ────────── ADMIN AUTH ──────────

export async function getSocietyAdminProfile(authUserId) {
  const { data, error } = await supabase
    .from('society_admins')
    .select('*, properties(id, name, address, city, total_units, total_towers)')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .order('created_at')
    .limit(10);

  if (error) return { success: false, error: error.message };
  return { success: true, adminProfiles: data };
}

export async function inviteSocietyAdmin(propertyId, inviterAuthId, data) {
  // Verify inviter has super_admin or admin role
  const { data: inviter } = await supabase
    .from('society_admins')
    .select('role')
    .eq('property_id', propertyId)
    .eq('auth_user_id', inviterAuthId)
    .single();

  if (!inviter || !['super_admin', 'admin'].includes(inviter.role)) {
    return { success: false, error: 'Insufficient permissions to invite admins.' };
  }

  const { data: admin, error } = await supabase
    .from('society_admins')
    .insert({
      property_id:  propertyId,
      auth_user_id: data.authUserId,
      full_name:    data.fullName,
      phone:        data.phone,
      email:        data.email,
      role:         data.role || 'viewer',
      invited_by:   inviterAuthId,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, admin };
}

// ────────── TOWER MANAGEMENT ──────────

export async function createTowerByAdmin(propertyId, adminAuthId, towerData) {
  if (!await _hasPermission(propertyId, adminAuthId, 'manage_units')) {
    return { success: false, error: 'Permission denied.' };
  }

  const { data: tower, error } = await supabase
    .from('towers')
    .insert({
      property_id:  propertyId,
      name:         towerData.name,
      total_floors: towerData.totalFloors,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Bulk create floors
  if (towerData.totalFloors > 0) {
    const floors = Array.from({ length: towerData.totalFloors }, (_, i) => ({
      tower_id:     tower.id,
      floor_number: i + 1,
    }));
    await supabase.from('floors').insert(floors);
  }

  // Update property tower count
  await supabase.rpc('increment_property_towers', { p_property_id: propertyId });

  return { success: true, tower };
}

export async function getTowersForAdmin(propertyId) {
  const { data, error } = await supabase
    .from('towers')
    .select('*, units(count)')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, towers: data };
}

// ────────── UNIT MANAGEMENT ──────────

export async function bulkCreateUnits(propertyId, adminAuthId, towerId, floorId, unitNumbers) {
  if (!await _hasPermission(propertyId, adminAuthId, 'manage_units')) {
    return { success: false, error: 'Permission denied.' };
  }

  const rows = unitNumbers.map(num => ({
    floor_id:    floorId,
    tower_id:    towerId,
    property_id: propertyId,
    unit_number: String(num),
  }));

  const { data, error } = await supabase.from('units').insert(rows).select();
  if (error) return { success: false, error: error.message };
  return { success: true, units: data, count: data.length };
}

export async function searchUnits(propertyId, query) {
  const { data, error } = await supabase
    .from('units')
    .select('*, towers(name), floors(floor_number), residents(full_name, phone, is_primary)')
    .eq('property_id', propertyId)
    .ilike('unit_number', `%${query}%`)
    .limit(20);

  if (error) return { success: false, error: error.message };
  return { success: true, units: data };
}

// ────────── RESIDENT MANAGEMENT ──────────

export async function getResidentsByProperty(propertyId, page = 0, limit = 50) {
  const { data, error, count } = await supabase
    .from('residents')
    .select('*, units(unit_number, towers(name))', { count: 'exact' })
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('full_name')
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return { success: false, error: error.message };
  return { success: true, residents: data, total: count };
}

export async function deactivateResident(residentId, propertyId, adminAuthId) {
  if (!await _hasPermission(propertyId, adminAuthId, 'manage_residents')) {
    return { success: false, error: 'Permission denied.' };
  }

  const { data, error } = await supabase
    .from('residents')
    .update({ is_active: false })
    .eq('id', residentId)
    .eq('property_id', propertyId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // If no more active residents in unit, mark vacant
  const { count } = await supabase
    .from('residents')
    .select('id', { count: 'exact' })
    .eq('unit_id', data.unit_id)
    .eq('is_active', true);

  if (count === 0) {
    await supabase.from('units').update({ is_occupied: false }).eq('id', data.unit_id);
  }

  return { success: true, resident: data };
}

// ────────── GUARD MANAGEMENT ──────────

export async function addGuard(propertyId, adminAuthId, guardData) {
  if (!await _hasPermission(propertyId, adminAuthId, 'manage_guards')) {
    return { success: false, error: 'Permission denied.' };
  }

  const { data: guard, error } = await supabase
    .from('guards')
    .insert({
      property_id:   propertyId,
      full_name:     guardData.fullName,
      phone:         guardData.phone,
      employee_id:   guardData.employeeId || null,
      agency_name:   guardData.agencyName || null,
      shift:         guardData.shift || 'day',
      shift_start:   guardData.shiftStart || null,
      shift_end:     guardData.shiftEnd || null,
      assigned_gate: guardData.assignedGate || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, guard };
}

export async function getGuardsByProperty(propertyId) {
  const { data, error } = await supabase
    .from('guards')
    .select('*')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('shift');

  if (error) return { success: false, error: error.message };
  return { success: true, guards: data };
}

// ────────── VISITOR ANALYTICS ──────────

export async function getVisitorAnalytics(propertyId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [checkins, deliveries, emergencies] = await Promise.all([
    supabase
      .from('guard_checkins')
      .select('checked_in_at, checkin_type, approval_status')
      .eq('property_id', propertyId)
      .gte('checked_in_at', since),

    supabase
      .from('delivery_logs')
      .select('arrived_at, partner, status')
      .eq('property_id', propertyId)
      .gte('arrived_at', since),

    supabase
      .from('emergency_events')
      .select('created_at, event_type, severity, status')
      .eq('property_id', propertyId)
      .gte('created_at', since),
  ]);

  const checkinData = checkins.data || [];
  const deliveryData = deliveries.data || [];
  const emergencyData = emergencies.data || [];

  // Daily visitor volume (last N days)
  const dailyMap = {};
  checkinData.forEach(c => {
    const day = c.checked_in_at.split('T')[0];
    dailyMap[day] = (dailyMap[day] || 0) + 1;
  });

  // Delivery partner breakdown
  const partnerMap = {};
  deliveryData.forEach(d => {
    partnerMap[d.partner] = (partnerMap[d.partner] || 0) + 1;
  });

  return {
    success: true,
    analytics: {
      totalVisitors:   checkinData.length,
      totalDeliveries: deliveryData.length,
      totalEmergencies:emergencyData.length,
      approvedVisitors: checkinData.filter(c => c.approval_status === 'approved').length,
      deniedVisitors:   checkinData.filter(c => c.approval_status === 'denied').length,
      dailyVisitorVolume: dailyMap,
      deliveryPartnerBreakdown: partnerMap,
      emergencyByType: emergencyData.reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

// ────────── REPORTS ──────────

export async function generateDailyReport(propertyId, date = null) {
  const reportDate = date ? new Date(date) : new Date();
  const dateStr = reportDate.toISOString().split('T')[0];

  const [statsResult, checkins, deliveries] = await Promise.all([
    supabase.rpc('get_society_stats', { p_property_id: propertyId }),
    supabase.from('guard_checkins')
      .select('*, units(unit_number, towers(name))')
      .eq('property_id', propertyId)
      .gte('checked_in_at', dateStr)
      .lt('checked_in_at', `${dateStr}T23:59:59`),
    supabase.from('delivery_logs')
      .select('*, units(unit_number)')
      .eq('property_id', propertyId)
      .gte('arrived_at', dateStr),
  ]);

  return {
    success: true,
    report: {
      date: dateStr,
      stats: statsResult.data,
      checkins: checkins.data || [],
      deliveries: deliveries.data || [],
      generatedAt: new Date().toISOString(),
    },
  };
}

// ────────── EMERGENCY MANAGEMENT ──────────

export async function broadcastEmergency(propertyId, adminAuthId, data) {
  const { data: event, error } = await supabase
    .from('emergency_events')
    .insert({
      property_id:      propertyId,
      triggered_by:     adminAuthId,
      triggered_by_role:'admin',
      event_type:       data.eventType,
      severity:         data.severity || 'high',
      description:      data.description,
      location_detail:  data.locationDetail || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, event };
}

export async function getActiveEmergencies(propertyId) {
  const { data, error } = await supabase
    .from('emergency_events')
    .select('*')
    .eq('property_id', propertyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, events: data };
}

// ────────── COMMON AREA QR ──────────

export async function createCommonAreaQr(propertyId, adminAuthId, areaData) {
  const slug = `${propertyId.slice(0, 8)}-${areaData.areaType}-${Date.now()}`.toUpperCase();

  const { data: area, error } = await supabase
    .from('common_area_qr')
    .insert({
      property_id: propertyId,
      area_name:   areaData.areaName,
      area_type:   areaData.areaType,
      qr_slug:     slug,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, area };
}

export async function getCommonAreas(propertyId) {
  const { data, error } = await supabase
    .from('common_area_qr')
    .select('*')
    .eq('property_id', propertyId)
    .eq('is_active', true);

  if (error) return { success: false, error: error.message };
  return { success: true, areas: data };
}

// ────────── BILLING ──────────

export async function getSocietyBilling(propertyId) {
  const { data, error } = await supabase
    .from('society_subscriptions')
    .select('*, organizations(name, billing_plan)')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return { success: false, error: error.message };

  // Calculate current bill
  const activeUnits = data.active_units || 0;
  const monthlyBill = data.billing_model === 'flat_rate'
    ? data.flat_price
    : activeUnits * (data.price_per_unit || 0);

  return {
    success: true,
    billing: { ...data, monthlyBill, activeUnits },
  };
}

// ────────── PRIVATE HELPERS ──────────

async function _hasPermission(propertyId, authUserId, permissionKey) {
  const { data } = await supabase
    .from('society_admins')
    .select('permissions, role')
    .eq('property_id', propertyId)
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .single();

  if (!data) return false;
  if (data.role === 'super_admin') return true;
  return data.permissions?.[permissionKey] === true;
}

