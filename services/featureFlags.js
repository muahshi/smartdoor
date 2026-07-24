/**
 * My Smart Door — Feature Flags Service (Phase 1)
 * services/featureFlags.js
 *
 * Reads the global WebRTC flags (feature_flags table, sql/38_webrtc_
 * phase0_phase1.sql) and combines them with a given owner's per-owner
 * opt-in (security_rules.webrtc_calling_enabled) to answer one question:
 * "should WebRTC be attempted for this owner right now?"
 *
 * This is the SINGLE function later phases should call before doing
 * anything WebRTC-related. Today, nothing calls isWebRTCEnabledForOwner()
 * to gate any visitor- or owner-facing behavior — Phase 2 (Tap to Talk)
 * is what will actually branch on it. Phase 1 only builds and exposes it,
 * and uses it internally to decide whether services/presence.js should
 * do any work at all (see that file's guard).
 *
 * Fail-safe by design: any read error, missing row, or missing table
 * resolves to `false` (WebRTC off), never `true`.
 */

import { supabase } from './supabase.js';

let _globalFlagsCache = null;
let _globalFlagsCacheAt = 0;
const CACHE_TTL_MS = 30000; // short TTL — a kill switch flip should take effect quickly

/**
 * Reads both global flags (webrtc_global_enabled, webrtc_kill_switch).
 * Cached briefly to avoid a query on every check; cache is intentionally
 * short-lived so a kill switch takes effect within ~30s of being flipped,
 * without needing a realtime subscription for what should be a rare,
 * operator-driven change.
 */
export async function getGlobalWebRTCFlags() {
  const now = Date.now();
  if (_globalFlagsCache && (now - _globalFlagsCacheAt) < CACHE_TTL_MS) {
    return _globalFlagsCache;
  }

  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, enabled')
      .in('key', ['webrtc_global_enabled', 'webrtc_kill_switch']);

    if (error || !data) {
      // Fail-safe: table missing / query error → treat as fully disabled.
      return { globalEnabled: false, killSwitch: false };
    }

    const map = {};
    data.forEach((row) => { map[row.key] = row.enabled; });

    const result = {
      globalEnabled: map.webrtc_global_enabled === true,
      killSwitch: map.webrtc_kill_switch === true,
    };
    _globalFlagsCache = result;
    _globalFlagsCacheAt = now;
    return result;
  } catch (err) {
    console.error('[FeatureFlags] getGlobalWebRTCFlags error:', err);
    return { globalEnabled: false, killSwitch: false };
  }
}

/**
 * Reads one owner's per-owner WebRTC opt-in from security_rules.
 * Returns false (safe default) if the row doesn't exist yet, mirroring
 * services/security.js#getSecurityRules()'s `.maybeSingle()` pattern —
 * a new owner without a security_rules row is normal, not an error.
 */
export async function getOwnerWebRTCOptIn(ownerId) {
  if (!ownerId) return false;
  try {
    const { data, error } = await supabase
      .from('security_rules')
      .select('webrtc_calling_enabled')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error || !data) return false;
    return data.webrtc_calling_enabled === true;
  } catch (err) {
    console.error('[FeatureFlags] getOwnerWebRTCOptIn error:', err);
    return false;
  }
}

/**
 * The single combined check: kill switch OFF, global flag ON, AND this
 * owner individually opted in. Any missing piece → false.
 *
 * NOT YET CALLED to gate any visitor-facing "Tap to Talk" behavior —
 * that wiring is explicitly Phase 2 scope. Phase 1 uses this only to
 * decide whether services/presence.js should join a presence channel at
 * all (see presence.js), so that presence tracking itself stays fully
 * inert for every owner until this returns true.
 */
export async function isWebRTCEnabledForOwner(ownerId) {
  if (!ownerId) return false;

  const [{ globalEnabled, killSwitch }, ownerOptedIn] = await Promise.all([
    getGlobalWebRTCFlags(),
    getOwnerWebRTCOptIn(ownerId),
  ]);

  if (killSwitch) return false;
  if (!globalEnabled) return false;
  return ownerOptedIn;
}

export default {
  getGlobalWebRTCFlags,
  getOwnerWebRTCOptIn,
  isWebRTCEnabledForOwner,
};
