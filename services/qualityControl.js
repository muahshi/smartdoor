/**
 * My Smart Door — Quality Control & QR Validation
 * services/qualityControl.js
 *
 * Phase 11 — Real World Operations
 *
 * Manufacturing QC checklist (manufacturing_qc table) + pre-shipment QR
 * validation gate. Additive — does NOT modify services/manufacturing.js;
 * it imports and reuses its exported functions where useful.
 */

import { supabase } from './supabase.js';
import { adminAuditLog } from './admin.js';
import { getQrUrl } from './qr.js';

export const QC_CHECKLIST_FIELDS = ['qr_verified', 'text_verified', 'material_verified', 'packaging_verified'];

// ────────── SUBMIT / UPDATE QC CHECK ──────────
/**
 * @param {string} manufacturingId
 * @param {object} checks - { qrVerified, textVerified, materialVerified, packagingVerified, approvedBy, notes }
 */
export async function submitQCCheck(manufacturingId, checks = {}) {
  try {
    const { data: existing } = await supabase
      .from('manufacturing_qc')
      .select('id')
      .eq('manufacturing_id', manufacturingId)
      .maybeSingle();

    const payload = {
      manufacturing_id: manufacturingId,
      qr_verified:        !!checks.qrVerified,
      text_verified:       !!checks.textVerified,
      material_verified:   !!checks.materialVerified,
      packaging_verified:  !!checks.packagingVerified,
      approved_by:         checks.approvedBy || null,
      notes:               checks.notes || null,
      updated_at:          new Date().toISOString(),
    };

    const allPassed = QC_CHECKLIST_FIELDS.every((f) => payload[f] === true);
    if (allPassed) payload.approved_at = new Date().toISOString();

    let result;
    if (existing) {
      result = await supabase.from('manufacturing_qc').update(payload).eq('id', existing.id).select().single();
    } else {
      result = await supabase.from('manufacturing_qc').insert(payload).select().single();
    }

    if (result.error) return { success: false, error: result.error.message };

    // If every check has passed, advance the existing manufacturing
    // pipeline to its 'quality_check' stage (reuses manufacturing.js,
    // doesn't reimplement it).
    if (allPassed) {
      const { updateProductionStatus } = await import('./manufacturing.js');
      await updateProductionStatus(manufacturingId, 'quality_check', checks.notes || 'QC checklist passed.');
    }

    await adminAuditLog('qc_check_submitted', 'manufacturing_qc', manufacturingId, {}, payload, checks.notes || '');

    return { success: true, qc: result.data, allPassed };
  } catch (err) {
    console.error('[QC] submitQCCheck error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── GET QC STATUS ──────────
export async function getQCStatus(manufacturingId) {
  try {
    const { data, error } = await supabase
      .from('manufacturing_qc')
      .select('*')
      .eq('manufacturing_id', manufacturingId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, qc: null, allPassed: false };

    const allPassed = QC_CHECKLIST_FIELDS.every((f) => data[f] === true);
    return { success: true, qc: data, allPassed };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── PRE-SHIPMENT QR VALIDATION ──────────
/**
 * Before a plate ships, verify:
 *   1. QR exists for this plate (manufacturing.qr_png_path / qr_svg_path)
 *   2. QR slug matches the plate ID exactly
 *   3. The encoded URL resolves to the correct /p/:plateId route
 *   4. Owner mapping: plates.owner_id matches the order's owner_id
 *
 * @param {string} plateId
 * @returns {{ success, allClear, checks: { qrExists, slugMatches, urlValid, ownerMappingValid }, error? }}
 */
export async function verifyQRBeforeShipment(plateId) {
  try {
    const normalized = plateId.toUpperCase();

    const [{ data: mfg }, { data: plate }, { data: order }] = await Promise.all([
      supabase.from('manufacturing').select('*').eq('plate_id', normalized).maybeSingle(),
      supabase.from('plates').select('*').eq('plate_id', normalized).maybeSingle(),
      supabase.from('orders').select('id, owner_id, plate_id').eq('plate_id', normalized).maybeSingle(),
    ]);

    const checks = {
      qrExists:           !!(mfg?.qr_png_path && mfg?.qr_svg_path),
      slugMatches:        !!mfg && mfg.qr_slug?.toUpperCase() === normalized,
      urlValid:           !!mfg && getQrUrl(normalized) === getQrUrl(mfg.qr_slug || ''),
      ownerMappingValid:  !!plate && !!order && plate.owner_id === order.owner_id,
      plateExists:        !!plate,
      orderExists:        !!order,
    };

    const allClear = Object.values(checks).every(Boolean);

    return { success: true, allClear, checks, plateId: normalized };
  } catch (err) {
    console.error('[QC] verifyQRBeforeShipment error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── BULK PENDING QC QUEUE (admin) ──────────
export async function getPendingQCQueue() {
  try {
    const { data, error } = await supabase
      .from('manufacturing')
      .select(`
        id, plate_id, plate_name, production_status,
        orders!inner(order_number, customer_name),
        manufacturing_qc(qr_verified, text_verified, material_verified, packaging_verified, approved_at)
      `)
      .eq('production_status', 'printing')
      .order('created_at', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, queue: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
