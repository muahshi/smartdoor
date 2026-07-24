/**
 * My Smart Door — Guard Panel Service
 * services/guardPanel.js
 *
 * Phase 13 — Security Guard Interface Backend
 *
 * All guard operations: check-in, check-out, delivery, visitor verification,
 * pass validation, emergency escalation.
 * Additive — no existing services modified.
 */

import { supabase } from './supabase.js';

// ────────── GUARD AUTH ──────────

/**
 * Guard login via phone + OTP (Supabase phone auth).
 * Property assignment is looked up after login.
 */
export async function getGuardProfile(authUserId) {
  const { data, error } = await supabase
    .from('guards')
    .select('*, properties(id, name, address, city)')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .single();

  if (error) return { success: false, error: 'Guard profile not found.' };
  return { success: true, guard: data };
}

// ────────── VISITOR CHECK-IN ──────────

export async function checkInVisitor(guardId, propertyId, data) {
  const { data: checkin, error } = await supabase
    .from('guard_checkins')
    .insert({
      property_id:     propertyId,
      guard_id:        guardId,
      unit_id:         data.unitId || null,
      visitor_pass_id: data.passId || null,
      visitor_name:    data.visitorName,
      visitor_phone:   data.visitorPhone || null,
      visitor_vehicle: data.visitorVehicle || null,
      purpose:         data.purpose || null,
      checkin_type:    data.checkinType || 'manual',
      approval_status: data.autoApproved ? 'auto_approved' : 'pending',
      photo_url:       data.photoUrl || null,
      notes:           data.notes || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, checkin };
}

// ────────── VISITOR CHECK-OUT ──────────

export async function checkOutVisitor(checkinId) {
  const { data, error } = await supabase
    .from('guard_checkins')
    .update({ checked_out_at: new Date().toISOString() })
    .eq('id', checkinId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, checkin: data };
}

// ────────── VISITOR PASS VALIDATION ──────────

export async function validateAndCheckIn(guardId, propertyId, passCode, visitorName, vehicleNumber = null) {
  // Validate pass via DB function
  const { data: validation, error: valError } = await supabase
    .rpc('validate_visitor_pass', { p_pass_code: passCode });

  if (valError) return { success: false, error: valError.message };
  if (!validation.valid) {
    return { success: false, error: _passErrorMessage(validation.reason), reason: validation.reason };
  }

  // Auto check-in with pass
  const checkin = await checkInVisitor(guardId, propertyId, {
    unitId:       validation.unit_id,
    passId:       validation.pass_id,
    visitorName:  visitorName || validation.visitor_name,
    checkinType:  'qr_scan',
    purpose:      validation.purpose,
    autoApproved: true,
  });

  return { ...checkin, passInfo: validation };
}

function _passErrorMessage(reason) {
  const messages = {
    pass_not_found: 'Invalid pass code. Please verify with the resident.',
    pass_expired:   'This pass has expired.',
    pass_revoked:   'This pass has been cancelled by the resident.',
    pass_used:      'This pass has already been used.',
    pass_max_uses:  'This pass has reached its maximum usage limit.',
  };
  return messages[reason] || 'Pass validation failed.';
}

// ────────── APPROVAL FLOW ──────────

/**
 * Guard calls resident → resident approves/denies via app.
 * This updates the checkin record.
 */
export async function updateApprovalStatus(checkinId, status, residentId, denialReason = null) {
  const { data, error } = await supabase
    .from('guard_checkins')
    .update({
      approval_status:          status,
      approved_by_resident_id:  residentId,
      approved_at:              status === 'approved' ? new Date().toISOString() : null,
      denial_reason:            denialReason,
    })
    .eq('id', checkinId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, checkin: data };
}

// ────────── DELIVERY MANAGEMENT ──────────

export async function logDelivery(guardId, propertyId, data) {
  const { data: delivery, error } = await supabase
    .from('delivery_logs')
    .insert({
      property_id:             propertyId,
      unit_id:                 data.unitId || null,
      guard_id:                guardId,
      visitor_pass_id:         data.passId || null,
      partner:                 data.partner || 'other',
      delivery_person_name:    data.personName || null,
      delivery_person_phone:   data.personPhone || null,
      awb_number:              data.awbNumber || null,
      status:                  'arrived',
      photo_url:               data.photoUrl || null,
      notes:                   data.notes || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Also create a checkin record for complete audit trail
  await checkInVisitor(guardId, propertyId, {
    unitId:       data.unitId,
    visitorName:  data.personName || `${_partnerLabel(data.partner)} Delivery`,
    purpose:      `Delivery - ${_partnerLabel(data.partner)}`,
    checkinType:  'delivery',
    autoApproved: true,
  });

  return { success: true, delivery };
}

export async function markDeliveryDelivered(deliveryId) {
  const { data, error } = await supabase
    .from('delivery_logs')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, delivery: data };
}

function _partnerLabel(partner) {
  const labels = {
    amazon: 'Amazon', flipkart: 'Flipkart', swiggy: 'Swiggy',
    zomato: 'Zomato', blinkit: 'Blinkit', delhivery: 'Delhivery',
    bluedart: 'BlueDart', dtdc: 'DTDC', courier: 'Courier',
  };
  return labels[partner] || 'Delivery';
}

// ────────── TODAY'S LOG ──────────

export async function getTodayCheckins(propertyId, limit = 50) {
  const { data, error } = await supabase
    .from('guard_checkins')
    .select('*, units(unit_number, towers(name))')
    .eq('property_id', propertyId)
    .gte('checked_in_at', new Date().toISOString().split('T')[0])
    .order('checked_in_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, checkins: data };
}

export async function getPendingApprovals(propertyId) {
  const { data, error } = await supabase
    .from('guard_checkins')
    .select('*, units(unit_number, towers(name))')
    .eq('property_id', propertyId)
    .eq('approval_status', 'pending')
    .is('checked_out_at', null)
    .order('checked_in_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, checkins: data };
}

export async function getTodayDeliveries(propertyId) {
  const { data, error } = await supabase
    .from('delivery_logs')
    .select('*, units(unit_number, towers(name))')
    .eq('property_id', propertyId)
    .gte('arrived_at', new Date().toISOString().split('T')[0])
    .order('arrived_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, deliveries: data };
}

// ────────── EMERGENCY ESCALATION ──────────

export async function triggerEmergency(guardId, propertyId, data) {
  const { data: event, error } = await supabase
    .from('emergency_events')
    .insert({
      property_id:      propertyId,
      triggered_by:     guardId,
      triggered_by_role:'guard',
      event_type:       data.eventType,
      severity:         data.severity || 'high',
      description:      data.description || null,
      location_detail:  data.locationDetail || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, event };
}

export async function resolveEmergency(eventId) {
  const { data, error } = await supabase
    .from('emergency_events')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', eventId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, event: data };
}

// ────────── REALTIME SUBSCRIPTIONS ──────────

/**
 * Guard subscribes to incoming checkin approvals for their property.
 * Returns unsubscribe function.
 */
export function subscribeToCheckinUpdates(propertyId, callback) {
  const channel = supabase
    .channel(`guard_checkins:${propertyId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'guard_checkins',
        filter: `property_id=eq.${propertyId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToEmergencies(propertyId, callback) {
  const channel = supabase
    .channel(`emergencies:${propertyId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'emergency_events',
        filter: `property_id=eq.${propertyId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

