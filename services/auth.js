/**
 * Smart Door — Auth Service
 * services/auth.js
 *
 * Login flow: Plate ID + 4-digit PIN
 * PIN is verified server-side via Supabase Edge Function (never raw PIN in client)
 * Session stored in localStorage via Supabase Auth
 */

import { supabase } from './supabase.js';
import { unsubscribeOwnerFromPush } from './push.js';

const AUTH_KEY      = 'sd_owner_session';
const DEVICE_KEY    = 'sd_device_trusted';
const TRUST_ENC_KEY = 'sd_trust_payload_v1';
const TRUST_ENC_ALGO = 'AES-GCM';

async function _getTrustCryptoKey() {
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(TRUST_ENC_KEY)
  );
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: TRUST_ENC_ALGO },
    false,
    ['encrypt', 'decrypt']
  );
}

async function _encryptTrustedDevicePayload(payload) {
  const key = await _getTrustCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: TRUST_ENC_ALGO, iv },
    key,
    encoded
  );

  return JSON.stringify({
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
  });
}

async function _decryptTrustedDevicePayload(payload) {
  const parsed = JSON.parse(payload);
  if (!parsed?.iv || !parsed?.data) return null;

  const iv = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(parsed.data), c => c.charCodeAt(0));
  const key = await _getTrustCryptoKey();
  const plainBuffer = await crypto.subtle.decrypt(
    { name: TRUST_ENC_ALGO, iv },
    key,
    cipherBytes
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

// ────────── LOGIN ──────────
/**
 * Login with Plate ID + PIN
 * @param {string} plateId  e.g. "SD-ABX9K7"
 * @param {string} pin      e.g. "4827"
 * @param {boolean} rememberDevice
 * @returns {{ success, user, error }}
 */
export async function loginOwner(plateId, pin, rememberDevice = false) {
  try {
    // Normalize plate ID
    const normalizedPlateId = plateId.trim().toUpperCase();

    // Call Supabase Edge Function to verify PIN (PIN never sent to DB directly)
    const { data, error } = await supabase.functions.invoke('verify-pin', {
      body: { plate_id: normalizedPlateId, pin },
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: data?.message || 'Invalid Plate ID or PIN. Please try again.',
      };
    }

    // Edge function returns a hashed magic-link token → verify via OTP flow.
    // NOTE: verify-pin returns `linkData.properties.hashed_token`, which must be
    // exchanged using the `token_hash` param (not `token`, which is for 6-digit
    // OTP codes sent via email/SMS). This matches the pattern already used in
    // onboarding.html's verifyOtp({ token_hash, type }) call.
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      token_hash: data.token,   // hashed_token from generateLink
      type:       'magiclink',
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    // Store device trust if requested
    if (rememberDevice) {
      const trustedPayload = {
        plateId: normalizedPlateId,
        trusted: true,
        trustedAt: new Date().toISOString(),
      };
      const encryptedPayload = await _encryptTrustedDevicePayload(trustedPayload);
      localStorage.setItem(DEVICE_KEY, encryptedPayload);
    }

    // Log the login event
    await _logAudit(data.owner_id, 'login', {
      plate_id: normalizedPlateId,
      device_trusted: rememberDevice,
    });

    return {
      success: true,
      user: {
        id: data.owner_id,
        name: data.full_name,
        plateId: normalizedPlateId,
        plan: data.plan,
      },
    };

  } catch (err) {
    console.error('[Auth] Login error:', err);
    return { success: false, error: 'Connection error. Please check your internet.' };
  }
}

// ────────── LOGOUT ──────────
export async function logoutOwner() {
  try {
    const session = await getCurrentOwner();
    if (session) {
      await _logAudit(session.id, 'logout', {});
      // Deactivate this device's push registration server-side. Doesn't
      // revoke the browser subscription (a fresh login re-registers it
      // instantly) — just stops this device receiving push while logged out.
      //
      // FIX (FCM production integration audit): this used to call
      // unregisterDevice() from ./pushRegistration.js, which deletes from
      // the `owner_devices` table — a parallel, unused registration scheme
      // (its own dispatch trigger, sql/33_push_notifications.sql, sends a
      // payload shape supabase/functions/send-push doesn't even accept).
      // The table this app actually registers into is `push_subscriptions`
      // (see services/push.js#subscribeOwnerToPush, wired from
      // js/dashboard.js on login), so logout was silently cleaning up the
      // WRONG table and this device kept receiving push after logout.
      await unsubscribeOwnerFromPush(session.id).catch(() => {});
    }
    await supabase.auth.signOut();
    localStorage.removeItem(AUTH_KEY);
    // Note: We don't remove DEVICE_KEY on logout — "remember device" persists
    return { success: true };
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── GET CURRENT OWNER ──────────
/**
 * Returns current logged-in owner's profile from our users table
 * @returns {object|null}
 */
export async function getCurrentOwner() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, phone, email, plate_id, created_at')
      .eq('auth_user_id', user.id)
      .maybeSingle(); // FIX: was .single() — 406s if no matching users row
                      // exists yet (e.g. transient post-signup race), where
                      // the caller already treats "no row" as null/no-op.

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

// ────────── IS AUTHENTICATED ──────────
export async function isAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// ────────── AUTO LOGOUT (inactivity) ──────────
let _inactivityTimer = null;
let _activityListenersAttached = false;
const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

export function startInactivityTimer() {
  clearInactivityTimer();
  _armInactivityTimeout();

  // PRODUCTION FIX (perf): this used to be inside _resetInactivityTimer,
  // which ran on EVERY click/keydown/touchstart/scroll — meaning every
  // single scroll frame (which can fire dozens of times per second on
  // mobile) was doing 4x removeEventListener + 4x addEventListener on
  // `document`. That's pure listener churn for no behavioral gain: the
  // listeners themselves never need to change, only the timeout does.
  // Attach them exactly once per session instead.
  if (!_activityListenersAttached) {
    _activityListenersAttached = true;
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
      document.addEventListener(evt, _resetInactivityTimer, { passive: true });
    });
  }
}

function _resetInactivityTimer() {
  // PRODUCTION FIX (perf): only re-arm the timeout, don't touch listeners
  // — see startInactivityTimer's comment. Listeners stay attached for the
  // life of the session; clearInactivityTimer() (real logout/teardown) is
  // still the one place that removes them.
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  _armInactivityTimeout();
}

function _armInactivityTimeout() {
  _inactivityTimer = setTimeout(() => {
    console.warn('[Auth] Auto-logout due to inactivity');
    logoutOwner().then(() => {
      window.location.href = '/login';
    });
  }, INACTIVITY_MS);
}

export function clearInactivityTimer() {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
  _activityListenersAttached = false;
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.removeEventListener(evt, _resetInactivityTimer);
  });
}

// ────────── AUTH STATE CHANGE LISTENER ──────────
/**
 * Subscribe to auth state (for dashboard route protection)
 * @param {Function} callback  (session | null) => void
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session);
  });
}

// ────────── DEVICE TRUST CHECK ──────────
export async function isTrustedDevice() {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (!stored) return { trusted: false };
    const data = await _decryptTrustedDevicePayload(stored);
    if (!data) {
      localStorage.removeItem(DEVICE_KEY);
      return { trusted: false };
    }
    // Trust expires after 30 days
    const trustedAt = new Date(data.trustedAt);
    const daysSince = (Date.now() - trustedAt) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      localStorage.removeItem(DEVICE_KEY);
      return { trusted: false };
    }
    return { trusted: true, plateId: data.plateId };
  } catch {
    localStorage.removeItem(DEVICE_KEY);
    return { trusted: false };
  }
}

// ────────── INTERNAL: AUDIT LOG ──────────
async function _logAudit(ownerId, action, details) {
  try {
    await supabase.from('audit_logs').insert({
      owner_id: ownerId,
      action,
      details,
      user_agent: navigator.userAgent,
    });
  } catch {
    // Audit logging is non-critical — fail silently
  }
}

// ────────── ROUTE GUARD ──────────
/**
 * Call at top of dashboard page to redirect if not logged in
 */
export async function requireAuth() {
  const authed = await isAuthenticated();
  if (!authed) {
    window.location.href = '/login';
    return false;
  }
  return true;
}
