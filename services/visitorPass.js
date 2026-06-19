/**
 * Smart Door — Visitor Pass Service
 * services/visitorPass.js
 *
 * Phase 13 — Visitor Pass System
 *
 * Resident-issued passes: Guest, Delivery, Worker, Cab, One-Time, Recurring.
 * QR code generation for each pass.
 * Additive only.
 */

import { supabase } from './supabase.js';

// ────────── CREATE PASSES ──────────

/**
 * Create any type of visitor pass.
 * @param {string} residentId  — issued_by (residents.id)
 * @param {string} unitId
 * @param {string} propertyId
 * @param {Object} data
 */
export async function createVisitorPass(residentId, unitId, propertyId, data) {
  // Compute validity window
  const validFrom  = data.validFrom  ? new Date(data.validFrom)  : new Date();
  const validUntil = data.validUntil ? new Date(data.validUntil) : _defaultExpiry(data.passType);

  const { data: pass, error } = await supabase
    .from('visitor_passes')
    .insert({
      unit_id:          unitId,
      property_id:      propertyId,
      issued_by:        residentId,
      pass_type:        data.passType || 'guest',
      visitor_name:     data.visitorName,
      visitor_phone:    data.visitorPhone  || null,
      visitor_vehicle:  data.visitorVehicle || null,
      purpose:          data.purpose        || null,
      valid_from:       validFrom.toISOString(),
      valid_until:      validUntil ? validUntil.toISOString() : null,
      max_uses:         data.maxUses ?? 1,
      delivery_partner: data.deliveryPartner || null,
      notes:            data.notes           || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Generate QR URL for the pass
  const qrUrl = await _generatePassQrUrl(pass.pass_code);
  if (qrUrl) {
    await supabase
      .from('visitor_passes')
      .update({ qr_url: qrUrl })
      .eq('id', pass.id);
    pass.qr_url = qrUrl;
  }

  return { success: true, pass };
}

/** One-Time Guest Invitation */
export async function createGuestInvite(residentId, unitId, propertyId, visitorName, visitorPhone) {
  return createVisitorPass(residentId, unitId, propertyId, {
    passType:    'guest',
    visitorName,
    visitorPhone,
    purpose:     'Guest Visit',
    maxUses:     1,
    validUntil:  _hoursFromNow(24),
  });
}

/** Scheduled Visit — for specific date/time window */
export async function createScheduledVisit(residentId, unitId, propertyId, data) {
  return createVisitorPass(residentId, unitId, propertyId, {
    passType:    'guest',
    visitorName: data.visitorName,
    visitorPhone:data.visitorPhone,
    purpose:     data.purpose || 'Scheduled Visit',
    maxUses:     data.maxUses || 1,
    validFrom:   data.scheduledAt,
    validUntil:  data.scheduledEnd || _hoursFromNow(2, new Date(data.scheduledAt)),
  });
}

/** Delivery Pass — for Amazon, Flipkart, Swiggy, Zomato, etc. */
export async function createDeliveryPass(residentId, unitId, propertyId, partner, awbOrOrderId = null) {
  const partnerLabels = {
    amazon: 'Amazon', flipkart: 'Flipkart', swiggy: 'Swiggy',
    zomato: 'Zomato', blinkit: 'Blinkit', delhivery: 'Delhivery',
    bluedart: 'BlueDart', dtdc: 'DTDC',
  };
  return createVisitorPass(residentId, unitId, propertyId, {
    passType:        'delivery',
    visitorName:     `${partnerLabels[partner] || 'Delivery'} Executive`,
    purpose:         awbOrOrderId ? `Order #${awbOrOrderId}` : 'Delivery',
    deliveryPartner: partner,
    maxUses:         1,
    validUntil:      _hoursFromNow(8),   // Delivery window: today
  });
}

/** Temporary Worker Pass — maid, electrician, plumber */
export async function createWorkerPass(residentId, unitId, propertyId, workerName, validDays = 1) {
  return createVisitorPass(residentId, unitId, propertyId, {
    passType:    'worker',
    visitorName: workerName,
    purpose:     'Service / Maintenance',
    maxUses:     validDays,             // One entry per day
    validUntil:  _daysFromNow(validDays),
  });
}

/** Recurring Pass — for regular visitors like maids, drivers */
export async function createRecurringPass(residentId, unitId, propertyId, data) {
  return createVisitorPass(residentId, unitId, propertyId, {
    passType:    'recurring',
    visitorName: data.visitorName,
    visitorPhone:data.visitorPhone,
    purpose:     data.purpose || 'Regular Visit',
    maxUses:     null,                  // Unlimited uses within validity
    validUntil:  data.validUntil || _daysFromNow(30),
  });
}

// ────────── MANAGE PASSES ──────────

export async function getActivePasses(residentId) {
  const { data, error } = await supabase
    .from('visitor_passes')
    .select('*')
    .eq('issued_by', residentId)
    .eq('status', 'active')
    .gte('valid_until', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, passes: data };
}

export async function getAllPassesForUnit(unitId) {
  const { data, error } = await supabase
    .from('visitor_passes')
    .select('*, residents(full_name)')
    .eq('unit_id', unitId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };
  return { success: true, passes: data };
}

export async function revokePass(passId, residentId) {
  const { data, error } = await supabase
    .from('visitor_passes')
    .update({ status: 'revoked' })
    .eq('id', passId)
    .eq('issued_by', residentId)  // Can only revoke own passes
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, pass: data };
}

// ────────── PASS LOOKUP (for guard panel) ──────────

export async function lookupPassByCode(passCode) {
  const { data, error } = await supabase
    .rpc('validate_visitor_pass', { p_pass_code: passCode.toUpperCase() });

  if (error) return { success: false, error: error.message };
  return { success: data.valid, pass: data, error: data.reason };
}

// ────────── QR GENERATION ──────────

async function _generatePassQrUrl(passCode) {
  try {
    const response = await fetch('/api/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:    'visitor_pass',
        content: `${window.location.origin}/gate/verify/${passCode}`,
        label:   passCode,
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.qrUrl || null;
  } catch {
    return null;
  }
}

// ────────── HELPERS ──────────

function _defaultExpiry(passType) {
  switch (passType) {
    case 'delivery': return _hoursFromNow(8);
    case 'worker':   return _daysFromNow(1);
    case 'recurring':return _daysFromNow(30);
    case 'guest':    return _hoursFromNow(24);
    default:         return _hoursFromNow(24);
  }
}

function _hoursFromNow(hours, from = new Date()) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

function _daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

