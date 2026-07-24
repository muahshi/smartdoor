/**
 * My Smart Door — Replacement & Ownership Transfer
 * services/replacementTransfer.js
 *
 * Phase 11 — Real World Operations
 *
 * REPLACEMENT WORKFLOW   — Lost Plate | Damaged Plate | Replacement QR | Reissue Plate
 * TRANSFER OWNERSHIP     — House Sold | Tenant Changed | New Owner. QR stays the
 *                          same; only plates.owner_id changes.
 *
 * Additive — imports from qr.js / manufacturing.js / activation.js rather
 * than modifying them.
 */

import { supabase } from './supabase.js';
import { adminAuditLog } from './admin.js';
import { recordActivationEvent } from './activation.js';
import { uploadQrToStorage } from './qr.js';

// ════════════════════════════════════════════════════════════
// REPLACEMENT WORKFLOW (Lost / Damaged)
// ════════════════════════════════════════════════════════════

/**
 * Owner reports a lost or damaged plate.
 * @param {string} plateId
 * @param {string} ownerId
 * @param {'lost'|'damaged'} reason
 * @param {string} [notes]
 */
export async function requestReplacement(plateId, ownerId, reason, notes = '') {
  if (!['lost', 'damaged'].includes(reason)) {
    return { success: false, error: 'reason must be "lost" or "damaged"' };
  }

  try {
    const { data, error } = await supabase
      .from('replacement_requests')
      .insert({
        plate_id: plateId.toUpperCase(),
        owner_id: ownerId,
        reason,
        notes,
        status: 'requested',
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Lost plates are a security risk — deactivate the QR immediately so a
    // found/stolen plate can't be used to spoof the resident's visitor page.
    if (reason === 'lost') {
      await supabase.from('plates').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('plate_id', plateId.toUpperCase());
      await supabase.from('replacement_requests').update({ old_qr_deactivated: true }).eq('id', data.id);
      await recordActivationEvent(plateId, ownerId, 'deactivated', { actor: 'owner', detail: 'Plate reported lost — QR deactivated pending replacement.' });
    }

    return { success: true, request: data };
  } catch (err) {
    console.error('[Replacement] requestReplacement error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Admin approves a replacement request and links the replacement order.
 */
export async function approveReplacement(requestId, replacementOrderId, adminActor = 'admin') {
  try {
    const { data: before } = await supabase.from('replacement_requests').select('*').eq('id', requestId).single();

    const { data, error } = await supabase
      .from('replacement_requests')
      .update({ status: 'approved', replacement_order_id: replacementOrderId, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('replacement_approved', 'replacement_requests', requestId, before, data, '');
    return { success: true, request: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Reissues the QR for an approved replacement. For a damaged plate the
 * existing plate_id is reused (regenerates QR image assets only). For a
 * lost plate, admin should pass a freshly generated plate_id (via
 * services/plates.js#generatePlateId) so the old, compromised slug can
 * never be scanned again.
 *
 * @param {string} requestId
 * @param {string} plateId         - plate_id to (re)generate QR assets for
 * @param {string} [orderId]       - manufacturing.order_id to update qr paths on
 */
export async function reissuePlate(requestId, plateId, orderId = null) {
  try {
    const uploadResult = await uploadQrToStorage(plateId);
    if (!uploadResult.success) return uploadResult;

    if (orderId) {
      await supabase
        .from('manufacturing')
        .update({ qr_png_path: uploadResult.pngPath, qr_svg_path: uploadResult.svgPath, updated_at: new Date().toISOString() })
        .eq('order_id', orderId);
    }

    await supabase
      .from('plates')
      .update({ status: 'active', qr_slug: plateId.toUpperCase(), updated_at: new Date().toISOString() })
      .eq('plate_id', plateId.toUpperCase());

    const { data: request, error } = await supabase
      .from('replacement_requests')
      .update({ status: 'completed', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    const { data: plate } = await supabase.from('plates').select('owner_id').eq('plate_id', plateId.toUpperCase()).single();
    await recordActivationEvent(plateId, plate?.owner_id, 'activated', {
      orderId,
      actor: 'admin',
      detail: `Replacement plate reissued (request ${requestId})`,
    });

    return { success: true, request, qrUrls: { pngUrl: uploadResult.pngUrl, svgUrl: uploadResult.svgUrl } };
  } catch (err) {
    console.error('[Replacement] reissuePlate error:', err);
    return { success: false, error: err.message };
  }
}

export async function rejectReplacement(requestId, reason, adminActor = 'admin') {
  try {
    const { data, error } = await supabase
      .from('replacement_requests')
      .update({ status: 'rejected', notes: reason, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    await adminAuditLog('replacement_rejected', 'replacement_requests', requestId, {}, {}, reason);
    return { success: true, request: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getReplacementRequests(ownerId = null) {
  try {
    let qb = supabase.from('replacement_requests').select('*').order('created_at', { ascending: false });
    if (ownerId) qb = qb.eq('owner_id', ownerId);
    const { data, error } = await qb;
    if (error) return { success: false, error: error.message };
    return { success: true, requests: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
// TRANSFER OWNERSHIP (House Sold / Tenant Changed / New Owner)
// ════════════════════════════════════════════════════════════

/**
 * Initiates a transfer. The plate_id / QR never change — only the owner
 * record the plate points to.
 * @param {string} plateId
 * @param {string} previousOwnerId
 * @param {'house_sold'|'tenant_changed'|'new_owner'} reason
 * @param {string} [notes]
 */
export async function initiateTransfer(plateId, previousOwnerId, reason, notes = '') {
  if (!['house_sold', 'tenant_changed', 'new_owner'].includes(reason)) {
    return { success: false, error: 'Invalid transfer reason.' };
  }

  try {
    const { data, error } = await supabase
      .from('ownership_transfers')
      .insert({
        plate_id: plateId.toUpperCase(),
        previous_owner_id: previousOwnerId,
        reason,
        notes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, transfer: data };
  } catch (err) {
    console.error('[Transfer] initiateTransfer error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Completes the transfer once the new owner's account exists (created
 * through the normal signup/admin flow — out of scope here).
 * QR remains identical; plates.owner_id is repointed to the new owner.
 *
 * For safety, the new owner's family members / security rules are NOT
 * carried over — they start with a clean slate on first login, same as
 * any new My Smart Door activation.
 */
export async function completeTransfer(transferId, newOwnerId, adminActor = 'admin') {
  try {
    const { data: transfer, error: fetchErr } = await supabase
      .from('ownership_transfers')
      .select('*')
      .eq('id', transferId)
      .single();

    if (fetchErr || !transfer) return { success: false, error: 'Transfer request not found.' };
    if (transfer.status === 'completed') return { success: false, error: 'Transfer already completed.' };

    const { error: plateErr } = await supabase
      .from('plates')
      .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
      .eq('plate_id', transfer.plate_id);

    if (plateErr) return { success: false, error: plateErr.message };

    const { data: updated, error: updateErr } = await supabase
      .from('ownership_transfers')
      .update({ new_owner_id: newOwnerId, status: 'completed', transferred_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', transferId)
      .select()
      .single();

    if (updateErr) return { success: false, error: updateErr.message };

    await recordActivationEvent(transfer.plate_id, newOwnerId, 'transferred', {
      actor: adminActor,
      detail: `Ownership transferred (${transfer.reason}). QR unchanged.`,
      metadata: { previousOwnerId: transfer.previous_owner_id, reason: transfer.reason },
    });

    await adminAuditLog('ownership_transfer_completed', 'ownership_transfers', transferId, transfer, updated, '');

    return { success: true, transfer: updated };
  } catch (err) {
    console.error('[Transfer] completeTransfer error:', err);
    return { success: false, error: err.message };
  }
}

export async function cancelTransfer(transferId, reason = '') {
  try {
    const { data, error } = await supabase
      .from('ownership_transfers')
      .update({ status: 'cancelled', notes: reason, updated_at: new Date().toISOString() })
      .eq('id', transferId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, transfer: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getTransferHistory(plateId) {
  try {
    const { data, error } = await supabase
      .from('ownership_transfers')
      .select('*')
      .eq('plate_id', plateId.toUpperCase())
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, transfers: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
