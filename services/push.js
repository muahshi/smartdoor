/**
 * Smart Door — Owner Push Subscription Service (Phase 4c, FCM)
 * services/push.js
 *
 * Registers the owner's device for real background push (Firebase Cloud
 * Messaging) so bell/QR/voice/text/SOS notifications arrive even when the
 * dashboard tab or PWA process is fully closed — the one gap
 * services/notificationDispatcher.js documents itself as unable to close
 * (foreground-only delivery via the Notifications API + Realtime).
 *
 * OWNER-side only. The visitor page never subscribes — it only *triggers*
 * a send for the owner's already-registered devices (see visitor.html's
 * _triggerPush() + supabase/functions/send-push).
 *
 * Requires firebase-app-compat.js + firebase-messaging-compat.js to be
 * loaded as plain <script> tags before this module runs (see app.html) —
 * kept as compat/global `firebase` rather than a bundled import because
 * this repo has no bundler (see scripts/build-env.js's own comment on that).
 *
 * getToken() below is handed sw.js's EXISTING registration — no second
 * service worker is registered. sw.js's current 'push' handler already
 * reads the exact flat payload shape supabase/functions/send-push sends,
 * so no Firebase code needs to run inside the service worker at all.
 *
 * TOKEN REFRESH: FCM registration tokens can expire or rotate (browser
 * storage cleared, > 270 days idle, underlying push subscription renewed,
 * app re-installed, etc.). The modern (v9+) Firebase guidance is that
 * there is no push-based "your token changed" callback to rely on
 * client-side — the supported pattern is simply to call getToken() again
 * periodically; the SDK transparently returns the same valid token or
 * mints a fresh one if the old registration is no longer valid, and this
 * file's upsert (onConflict: owner_id,fcm_token) makes re-calling it any
 * number of times safe/idempotent. wireTokenRefresh() below drives that:
 * once on every tab foreground/visibility-regain, plus a 6-hour interval
 * for long-lived open tabs. Dead tokens that DO slip through (uninstalled
 * app, revoked permission on another device) are pruned server-side by
 * supabase/functions/send-push whenever FCM reports UNREGISTERED.
 */

import { supabase } from './supabase.js';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — safe upper bound for a long-lived open tab
let _refreshTimer = null;
let _refreshListenersAttached = false;
let _refreshCleanup = null;

let _fbApp = null;
function _getMessaging(fbConfig) {
  if (typeof firebase === 'undefined' || !firebase.messaging) return null;
  if (!_fbApp) {
    _fbApp = firebase.apps?.length ? firebase.apps[0] : firebase.initializeApp(fbConfig);
  }
  return firebase.messaging();
}

/**
 * Call once the owner is authenticated and Notification permission has
 * already been granted (services/notificationDispatcher.js#ensureNotificationPermission
 * handles asking — call this AFTER that resolves to 'granted').
 */
export async function subscribeOwnerToPush(ownerId) {
  try {
    const fbConfig = window.__SD_CONFIG__?.firebase;
    if (!fbConfig?.apiKey || !fbConfig?.vapidKey) {
      return { success: false, error: 'Firebase push is not configured for this deployment.' };
    }
    if (!('serviceWorker' in navigator)) {
      return { success: false, error: 'Service workers not supported on this browser.' };
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return { success: false, error: 'Notification permission not granted.' };
    }

    const messaging = _getMessaging(fbConfig);
    if (!messaging) return { success: false, error: 'Firebase Messaging SDK not loaded.' };

    const reg = await navigator.serviceWorker.ready; // reuses /sw.js — see file header
    const token = await messaging.getToken({ vapidKey: fbConfig.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return { success: false, error: 'No FCM token returned (permission may have been revoked).' };

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        owner_id: ownerId,
        fcm_token: token,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,fcm_token' }
    );
    if (error) throw error;

    return { success: true, token };
  } catch (err) {
    console.error('[Push] subscribeOwnerToPush error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Keeps the FCM token fresh for as long as the dashboard stays open: an
 * immediate refresh call, then one on every tab-foreground/visibility-
 * regain (covers the common "reopen the installed PWA" pattern on mobile),
 * plus a 6h interval as a backstop for tabs left open continuously.
 * Call once per session (e.g. from _initNotifications), pair with the
 * returned cleanup fn on logout/teardown if desired — safe to leave
 * running for the lifetime of the tab otherwise.
 * @param {string} ownerId
 * @returns {() => void} cleanup
 */
export function wireTokenRefresh(ownerId) {
  if (!ownerId) return () => {};

  const refresh = () => { subscribeOwnerToPush(ownerId).catch(() => {}); };

  if (!_refreshTimer) _refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);

  if (!_refreshListenersAttached) {
    _refreshListenersAttached = true;
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    _refreshCleanup = () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      clearInterval(_refreshTimer);
      _refreshTimer = null;
      _refreshListenersAttached = false;
    };
  }

  return () => _refreshCleanup?.();
}

/** Optional — call from a "Turn off push notifications" setting if one is ever added. */
export async function unsubscribeOwnerFromPush(ownerId) {
  try {
    const fbConfig = window.__SD_CONFIG__?.firebase;
    const messaging = _getMessaging(fbConfig);
    if (!messaging) return { success: false, error: 'Firebase Messaging SDK not loaded.' };

    const reg = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({ vapidKey: fbConfig?.vapidKey, serviceWorkerRegistration: reg }).catch(() => null);
    if (token) {
      await supabase.from('push_subscriptions').delete().eq('owner_id', ownerId).eq('fcm_token', token);
      await messaging.deleteToken();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default { subscribeOwnerToPush, unsubscribeOwnerFromPush, wireTokenRefresh };
