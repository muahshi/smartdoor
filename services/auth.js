/**
 * Smart Door — Auth Service
 * services/auth.js
 *
 * Login flow: Plate ID + 4-digit PIN
 * PIN is verified server-side via Supabase Edge Function (never raw PIN in client)
 * Session stored in localStorage via Supabase Auth
 */

import { supabase } from './supabase.js';

const AUTH_KEY      = 'sd_owner_session';
const DEVICE_KEY    = 'sd_device_trusted';

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

    // Edge function returns a short-lived magic token → sign in with it
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,       // Edge function provides synthetic email
      password: data.token,    // Short-lived token from server
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    // Store device trust if requested
    if (rememberDevice) {
      localStorage.setItem(DEVICE_KEY, JSON.stringify({
        plateId: normalizedPlateId,
        trusted: true,
        trustedAt: new Date().toISOString(),
      }));
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
      .single();

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
const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

export function startInactivityTimer() {
  clearInactivityTimer();
  _inactivityTimer = setTimeout(() => {
    console.warn('[Auth] Auto-logout due to inactivity');
    logoutOwner().then(() => {
      window.location.href = '/login';
    });
  }, INACTIVITY_MS);

  // Reset on any user activity
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, _resetInactivityTimer, { passive: true });
  });
}

function _resetInactivityTimer() {
  clearInactivityTimer();
  startInactivityTimer();
}

export function clearInactivityTimer() {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
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
export function isTrustedDevice() {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (!stored) return { trusted: false };
    const data = JSON.parse(stored);
    // Trust expires after 30 days
    const trustedAt = new Date(data.trustedAt);
    const daysSince = (Date.now() - trustedAt) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      localStorage.removeItem(DEVICE_KEY);
      return { trusted: false };
    }
    return { trusted: true, plateId: data.plateId };
  } catch {
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
    window.location.href = '/?login=required';
    return false;
  }
  return true;
}
