/**
 * Smart Door — Push Registration (Unified Notification Service, client leg)
 * services/pushRegistration.js
 *
 * Registers THIS device with the server so it can receive push while the
 * PWA is closed/backgrounded. This is new functionality — nothing in the
 * codebase did this before, so it does not replace or duplicate anything.
 *
 * PROVIDER CHOICE (matches the send-push Edge Function's priority order):
 *   1. FCM      — only if window.__SD_CONFIG__.firebaseConfig is present
 *                 (i.e. a Firebase project has actually been wired up).
 *   2. Web Push — VAPID, used whenever window.__SD_CONFIG__.vapidPublicKey
 *                 is present. This works with ZERO Firebase project, so it
 *                 is the path that's live today.
 *   If neither is configured, registerDevice() is a safe no-op — existing
 *   local-notification behavior (services/notificationDispatcher.js) is
 *   completely unaffected either way.
 *
 * Call registerDevice(ownerId) once after login/dashboard init, and
 * unregisterDevice(ownerId) on logout. See js/dashboard.js + services/auth.js.
 */

import { supabase } from './supabase.js';

const LOCAL_KEY = 'sd_device_registration'; // { endpoint? , fcmToken?, provider }

function _getConfig() {
  return window.__SD_CONFIG__ || {};
}

function _detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'desktop';
  return 'web';
}

function _deviceName() {
  const platform = _detectPlatform();
  const ua = navigator.userAgent || '';
  const browser = /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : /edg/i.test(ua) ? 'Edge' : 'Browser';
  return `${browser} on ${platform === 'web' ? 'Desktop' : platform.charAt(0).toUpperCase() + platform.slice(1)}`;
}

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// ────────── WEB PUSH (VAPID) ──────────
async function _registerWebPush(ownerId) {
  const { vapidPublicKey } = _getConfig();
  if (!vapidPublicKey) return { success: false, reason: 'vapid_not_configured' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { success: false, reason: 'unsupported' };

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from('owner_devices').upsert(
    {
      owner_id: ownerId,
      platform: _detectPlatform(),
      device_name: _deviceName(),
      push_provider: 'webpush',
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth_key: json.keys?.auth,
      user_agent: navigator.userAgent,
      is_active: true,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id,endpoint' }
  );
  if (error) return { success: false, reason: error.message };

  localStorage.setItem(LOCAL_KEY, JSON.stringify({ provider: 'webpush', endpoint: json.endpoint }));
  return { success: true, provider: 'webpush' };
}

// ────────── FCM (only runs once a Firebase project is actually configured) ──────────
async function _registerFcm(ownerId) {
  const { firebaseConfig, vapidPublicKey } = _getConfig();
  if (!firebaseConfig || !firebaseConfig.apiKey) return { success: false, reason: 'firebase_not_configured' };
  if (!('serviceWorker' in navigator)) return { success: false, reason: 'unsupported' };

  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');

    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);
    const reg = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey || vapidPublicKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) return { success: false, reason: 'no_token_returned' };

    const { error } = await supabase.from('owner_devices').upsert(
      {
        owner_id: ownerId,
        platform: _detectPlatform(),
        device_name: _deviceName(),
        push_provider: 'fcm',
        fcm_token: token,
        user_agent: navigator.userAgent,
        is_active: true,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,fcm_token' }
    );
    if (error) return { success: false, reason: error.message };

    localStorage.setItem(LOCAL_KEY, JSON.stringify({ provider: 'fcm', fcmToken: token }));
    return { success: true, provider: 'fcm' };
  } catch (err) {
    console.warn('[PushRegistration] FCM registration skipped:', err?.message || err);
    return { success: false, reason: 'fcm_error' };
  }
}

// ────────── PUBLIC API ──────────

/**
 * Requests notification permission (if needed) and registers this device
 * for background push, preferring FCM (if configured) then Web Push VAPID.
 * Safe to call every dashboard load — it's idempotent (upsert).
 */
export async function registerDevice(ownerId) {
  if (typeof Notification === 'undefined') return { success: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { success: false, reason: 'permission_denied' };
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission().catch(() => 'denied');
    if (perm !== 'granted') return { success: false, reason: 'permission_not_granted' };
  }

  const fcmResult = await _registerFcm(ownerId);
  if (fcmResult.success) return fcmResult;

  return _registerWebPush(ownerId);
}

/** Deactivates this device server-side (does not revoke the browser subscription — a fresh login re-registers it). */
export async function unregisterDevice(ownerId) {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (!saved) return { success: true, skipped: true };

    if (saved.provider === 'webpush' && saved.endpoint) {
      await supabase.from('owner_devices').update({ is_active: false }).eq('owner_id', ownerId).eq('endpoint', saved.endpoint);
    } else if (saved.provider === 'fcm' && saved.fcmToken) {
      await supabase.from('owner_devices').update({ is_active: false }).eq('owner_id', ownerId).eq('fcm_token', saved.fcmToken);
    }
    localStorage.removeItem(LOCAL_KEY);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Listens for the Service Worker telling us its push subscription changed
 * (browser-initiated, e.g. VAPID key rotation or subscription expiry) and
 * re-registers automatically. Call once per session.
 */
export function wireSubscriptionRefresh(ownerId) {
  if (!('serviceWorker' in navigator)) return () => {};
  const handler = (event) => {
    if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
      registerDevice(ownerId).catch(() => {});
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

export async function listDevices(ownerId) {
  const { data, error } = await supabase
    .from('owner_devices')
    .select('id, platform, device_name, push_provider, is_active, last_active_at, created_at')
    .eq('owner_id', ownerId)
    .order('last_active_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, devices: data };
}

export async function removeDevice(deviceId, ownerId) {
  const { error } = await supabase.from('owner_devices').delete().eq('id', deviceId).eq('owner_id', ownerId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export default { registerDevice, unregisterDevice, wireSubscriptionRefresh, listDevices, removeDevice };
