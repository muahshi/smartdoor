/**
 * My Smart Door — Rate Limiting Service
 * services/rateLimiter.js
 *
 * Protects against: spam calls, repeated QR scans, voice note flooding, SOS abuse.
 *
 * Two layers:
 *  1. CLIENT-SIDE (this file, localStorage): instant UX feedback, zero network cost,
 *     trivially bypassable by a determined attacker (clearing storage / new device) —
 *     so it is a UX nicety, not the real defense.
 *  2. SERVER-SIDE (Postgres `check_rate_limit()` RPC, see sql/04_communication_schema.sql):
 *     the actual enforcement. Every sensitive action (call, SOS) should call
 *     `checkServerRateLimit()` before proceeding, since it can't be bypassed from the client.
 */

import { supabase } from './supabase.js';

// ────────── CONFIG ──────────
// Per action type: max attempts allowed within the window.
const LIMITS = {
  qr_scan:       { windowSecs: 60,  max: 10 },
  call_attempt:  { windowSecs: 300, max: 3 },   // 3 calls per 5 min per plate
  voice_message: { windowSecs: 300, max: 5 },
  text_message:  { windowSecs: 60,  max: 10 },
  sos:           { windowSecs: 600, max: 2 },   // SOS is rare by nature — 2 per 10 min is generous
};

const STORAGE_PREFIX = 'sd_rl_';

// ────────── VISITOR FINGERPRINT ──────────
/**
 * Lightweight, non-PII device identifier. Persisted in localStorage so repeated
 * visits from the same device/browser are correlated for rate limiting, without
 * collecting anything that identifies a real person.
 */
export function getVisitorFingerprint() {
  const KEY = 'sd_visitor_fp';
  let fp = localStorage.getItem(KEY);
  if (!fp) {
    fp = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, fp);
  }
  return fp;
}

// ────────── CLIENT-SIDE CHECK (fast UX gate) ──────────
/**
 * @param {string} actionType  one of LIMITS keys
 * @returns {{ allowed: boolean, retryAfterSecs: number }}
 */
export function checkClientRateLimit(actionType) {
  const cfg = LIMITS[actionType] || { windowSecs: 60, max: 5 };
  const key = STORAGE_PREFIX + actionType;
  const now = Date.now();

  let attempts = [];
  try {
    attempts = JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    attempts = [];
  }

  // Drop attempts outside the window
  attempts = attempts.filter(ts => now - ts < cfg.windowSecs * 1000);

  if (attempts.length >= cfg.max) {
    const oldestInWindow = attempts[0];
    const retryAfterSecs = Math.ceil((cfg.windowSecs * 1000 - (now - oldestInWindow)) / 1000);
    return { allowed: false, retryAfterSecs };
  }

  attempts.push(now);
  localStorage.setItem(key, JSON.stringify(attempts));
  return { allowed: true, retryAfterSecs: 0 };
}

// ────────── SERVER-SIDE CHECK (real enforcement) ──────────
/**
 * Calls the Postgres check_rate_limit() RPC — cannot be bypassed by clearing
 * client storage. Always use this before provisioning a real call or broadcasting SOS.
 * @param {string} plateId
 * @param {string} actionType
 * @returns {Promise<boolean>} true = allowed
 */
export async function checkServerRateLimit(plateId, actionType) {
  const cfg = LIMITS[actionType] || { windowSecs: 60, max: 5 };
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_plate_id: plateId,
      p_action_type: actionType,
      p_window_secs: cfg.windowSecs,
      p_max_count: cfg.max,
    });
    if (error) {
      console.error('[RateLimiter] Server check failed, defaulting to allow:', error);
      return true; // fail-open so a DB hiccup doesn't lock visitors out entirely
    }
    return !!data;
  } catch (err) {
    console.error('[RateLimiter] Server check error:', err);
    return true;
  }
}

// ────────── RECORD AN ATTEMPT (server-side log, for the window above to see) ──────────
export async function recordAttempt(plateId, visitorIdentifier, actionType) {
  try {
    await supabase.rpc('log_rate_limit_event', {
      p_plate_id: plateId,
      p_visitor_identifier: visitorIdentifier,
      p_action_type: actionType,
    });
  } catch (err) {
    console.error('[RateLimiter] Failed to record attempt:', err);
  }
}

// ────────── COMBINED GATE ──────────
/**
 * Convenience wrapper: client check (instant) + server check (authoritative) + record.
 * Use this from communication.js / voiceNotes.js before any provider-billable or
 * notification-spamming action.
 */
export async function gate(plateId, actionType) {
  const clientResult = checkClientRateLimit(actionType);
  if (!clientResult.allowed) {
    return { allowed: false, reason: 'client_throttle', retryAfterSecs: clientResult.retryAfterSecs };
  }

  const serverAllowed = await checkServerRateLimit(plateId, actionType);
  if (!serverAllowed) {
    return { allowed: false, reason: 'server_limit', retryAfterSecs: LIMITS[actionType]?.windowSecs || 60 };
  }

  await recordAttempt(plateId, getVisitorFingerprint(), actionType);
  return { allowed: true, retryAfterSecs: 0 };
}

export { LIMITS };
