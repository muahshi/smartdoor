/**
 * Smart Door — Visitor Experience Orchestrator
 * services/visitorExperience.js
 *
 * REDESIGN (Activation Fix):
 *
 * Old (broken) flow:
 *   getPlateBySlug() → fails if status != 'active' → immediately pending_activation
 *   getActivationPendingInfo() → queries orders table (wrong dependency)
 *   Result: ALWAYS shows "Activation Pending" even on active plates
 *
 * New (correct) flow:
 *   isPlateActive()    → Single source of truth (owner_id + status + activation_date)
 *   ↓ not active       → state: 'pending_activation' (no order/subscription lookup)
 *   ↓ active           → getPlateBySlug() → fetch owner + security rules
 *                      → evaluate grace period (subscription only, not activation)
 *                      → state: 'ready'
 *
 * The visitor page NEVER depends on: orders, subscriptions, manufacturing, notifications.
 * Activation is evaluated ONCE via isPlateActive(). Past that gate, it's never re-checked.
 *
 * Duplicate activation checks REMOVED from this file:
 *   - getActivationPendingInfo() call (was querying orders table)
 *   - Inline status check on getPlateBySlug() failure
 *   - getSubscriptionForPlate (still present for grace-period UI only, not activation gate)
 */

import { supabase } from './supabase.js';
import { isPlateActive, getPlateBySlug } from './plates.js';
import { evaluateAccess } from './gracePeriod.js';

/**
 * Full resolution flow for a visitor scanning /p/:plateId or /p/:qrSlug.
 *
 * @param {string} slugOrPlateId  — value from URL, e.g. "SD-ABX9K7"
 * @returns {{
 *   success: boolean,
 *   state: 'not_found' | 'pending_activation' | 'ready',
 *   plate?, owner?, securityRules?, subscription?, access?, slug?, error?
 * }}
 */
export async function resolveVisitorRoute(slugOrPlateId) {
  const normalized = (slugOrPlateId || '').trim().toUpperCase();

  if (!normalized) {
    return { success: true, state: 'not_found', slug: '' };
  }

  // ── STEP 1: Single activation gate ──────────────────────────────────────
  // isPlateActive() is the ONE place where activation state is evaluated.
  // It checks: owner_id exists + status='active' + activation_date not null.
  // If any condition fails, we show pending. We do NOT check orders/subscriptions here.
  const activationCheck = await isPlateActive(normalized);

  if (!activationCheck.active) {
    // Plate is genuinely not active. Show pending screen.
    // reason is for debugging only — not shown to visitor.
    return {
      success: true,
      state: 'pending_activation',
      slug: normalized,
      // No pendingInfo from orders table — activation screen is simple and honest.
    };
  }

  // ── STEP 2: Load visitor experience data ────────────────────────────────
  // Past the activation gate. Now fetch display data (owner name, security rules).
  const plateResult = await getPlateBySlug(normalized);

  if (!plateResult.success) {
    // This should be rare — activation check just confirmed the plate exists.
    // Could be a brief race or RPC failure. Treat as not_found, not pending.
    console.error('[VisitorExperience] getPlateBySlug failed after activation confirmed:', plateResult.error);
    return { success: false, state: 'not_found', slug: normalized, error: plateResult.error };
  }

  // Log the scan asynchronously — never block visitor render on this.
  _logQrScan(plateResult.owner.id, plateResult.plate.plateId).catch(() => {});

  // ── STEP 3: Evaluate subscription grace period (NOT activation) ──────────
  // Subscription lookup is ONLY used to compute grace-period UI banners and
  // feature gating (voice notes, etc.). It has NOTHING to do with activation.
  // hardware_only plates (null subscription) get full access — see gracePeriod.js.
  const subscription = await _getSubscriptionForPlate(normalized);

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

// ── Private: subscription for grace-period evaluation only ──────────────────
async function _getSubscriptionForPlate(slugOrPlateId) {
  try {
    const { data, error } = await supabase
      .rpc('get_subscription_status_for_plate', { p_plate_id: slugOrPlateId })
      .maybeSingle();
    if (error || !data) return null;
    return { plan: data.plan, status: data.status, expiry_date: data.expiry_date };
  } catch {
    return null;
  }
}

// ── Private: fire-and-forget QR scan log ────────────────────────────────────
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
 * SECURITY DEFINER RPC. Never reads family_members directly.
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
