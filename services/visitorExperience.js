/**
 * Smart Door — Visitor Experience Orchestrator
 * services/visitorExperience.js
 *
 * Phase 11 — Real World Operations
 *
 * Single entry point for visitor.html (the public /p/:plateId route).
 * Combines: plate lookup, lifecycle/grace-period evaluation, QR-scan
 * logging, and the SOS family-member fan-out RPC — without ever touching
 * services/plates.js, services/communication.js, or RLS-protected tables
 * directly from a new policy. Pure orchestration on top of existing,
 * unmodified building blocks.
 */

import { supabase } from './supabase.js';
import { getPlateBySlug } from './plates.js';
import { evaluateAccess } from './gracePeriod.js';
import { getActivationPendingInfo } from './activation.js';

/**
 * Full resolution flow for a visitor scanning /p/:plateId.
 * @param {string} slug
 * @returns {{
 *   success: boolean,
 *   state: 'not_found'|'pending_activation'|'ready',
 *   plate?, owner?, securityRules?, subscription?,
 *   access?, pendingInfo?, error?
 * }}
 */
export async function resolveVisitorRoute(slug) {
  const plateResult = await getPlateBySlug(slug);

  if (!plateResult.success) {
    // Plate not found OR found-but-inactive. Distinguish the two so we
    // can show a proper "activation pending" screen instead of a dead end.
    const pendingInfo = await getActivationPendingInfo(slug);
    return {
      success: true,
      state: 'pending_activation',
      pendingInfo: pendingInfo.success ? pendingInfo : null,
      slug: slug.toUpperCase(),
    };
  }

  // Log the scan (existing visitor_logs table + event_type already
  // supports 'qr_scan' — see sql/01_schema.sql).
  _logQrScan(plateResult.owner.id, plateResult.plate.plateId).catch(() => {});

  // getPlateBySlug() filters its subscription lookup on status='active',
  // which the renewal pipeline doesn't reliably flip on expiry. Read the
  // real expiry_date via the dedicated RPC instead (see
  // sql/12_real_world_operations.sql) so grace-period detection works
  // regardless of that flag's state.
  const subscription = await _getSubscriptionForPlate(slug);

  const access = evaluateAccess({
    plate: plateResult.plate,
    subscription,
  });

  return {
    success: true,
    state: 'ready',
    plate: plateResult.plate,
    owner: plateResult.owner,
    securityRules: plateResult.securityRules,
    subscription,
    access,
  };
}

async function _getSubscriptionForPlate(slug) {
  try {
    const { data, error } = await supabase
      .rpc('get_subscription_status_for_plate', { p_plate_id: slug })
      .maybeSingle();
    if (error || !data) return null;
    return { plan: data.plan, status: data.status, expiry_date: data.expiry_date };
  } catch {
    return null;
  }
}

async function _logQrScan(ownerId, plateId) {
  return supabase.from('visitor_logs').insert({
    owner_id: ownerId,
    plate_id: plateId,
    event_type: 'qr_scan',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
}

/**
 * Fetches the minimal family-member fields needed for SOS fan-out via the
 * SECURITY DEFINER RPC (see sql/12_real_world_operations.sql). Never reads
 * family_members directly — that table's RLS stays owner-only.
 */
export async function getFamilyMembersForSos(plateId) {
  try {
    const { data, error } = await supabase.rpc('get_family_members_for_plate', { p_plate_id: plateId });
    if (error) return { success: false, error: error.message, members: [] };
    return { success: true, members: data || [] };
  } catch (err) {
    return { success: false, error: err.message, members: [] };
  }
}
