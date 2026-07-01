/**
 * Smart Door — Notification Dispatcher (Production)
 * services/notificationDispatcher.js
 *
 * ROOT PROBLEM THIS FILE FIXES:
 * Before this file existed, OS-level `showNotification()` calls were
 * scattered across js/dashboard.js, only wired up for `bell_ring`, and
 * every call reused the SAME fixed tag ('smartdoor-doorbell'). QR scans,
 * voice messages, text messages and SOS never got a real notification at
 * all — only an in-page toast, which is invisible unless the dashboard tab
 * is open and visible. This module is now the ONLY place that calls
 * `showNotification()` for realtime visitor events, and it is the single
 * source of truth other code should route through.
 *
 * GUARANTEES
 *  - Every event (qr_scan, bell_ring, voice, text, sos) gets its own
 *    notification. The DB row's own UUID (`id`) is reused as the event id,
 *    so the tag is always unique — nothing is ever merged or suppressed.
 *  - Every dispatch is logged (created → delivered/failed → clicked) so
 *    the pipeline is debuggable from devtools: `getDispatchLog()`.
 *  - A visibility-regain catch-up pass re-fetches anything that landed
 *    while the tab was backgrounded/throttled and notifies for it too,
 *    so a minimized-then-reopened PWA doesn't silently drop events.
 *
 * WHAT THIS FILE CANNOT FIX
 *  - True background delivery (tab fully closed / phone screen off for a
 *    long stretch) requires server-pushed Web Push (VAPID) or FCM. This
 *    app has no push subscription infrastructure at all today — see the
 *    audit report. Until that is built, delivery here is best-effort and
 *    only works while the tab/PWA process is alive (foreground or recently
 *    backgrounded), same as before this fix.
 */

import { supabase } from './supabase.js';

// ────────── DISPATCH LOG (in-memory, capped ring buffer) ──────────
const MAX_LOG_ENTRIES = 300;
const _log = [];
// Fast lookup: DB row id -> whether we've already dispatched a notification
// for it. This is the ONLY dedup that ever happens, and it's keyed on the
// database row's own uuid — i.e. it only stops the exact same DB insert
// from producing two notifications (e.g. once from the live realtime
// stream, once again from a visibility catch-up query). It never stops two
// DIFFERENT physical events (two separate doorbell presses) from each
// getting their own notification, because those are two different rows
// with two different ids.
const _dispatchedIds = new Set();

function _pushLog(entry) {
  _log.push(entry);
  if (_log.length > MAX_LOG_ENTRIES) _log.shift();
  // eslint-disable-next-line no-console
  console.debug('[NotifDispatcher]', entry.status, entry.type, entry.id, entry);
}

function _updateLog(id, patch) {
  const entry = [..._log].reverse().find((e) => e.id === id);
  if (entry) Object.assign(entry, patch, { updatedAt: Date.now() });
}

export function getDispatchLog() {
  return [..._log];
}

export function clearDispatchLog() {
  _log.length = 0;
}

// ────────── EVENT TYPE CONFIG ──────────
// One place that defines how each event type looks/feels/sounds as an OS
// notification. Everything here is intentionally distinct per type so a
// half-asleep owner can tell a doorbell from a QR scan without opening the
// notification.
const EVENT_CONFIG = {
  bell_ring: {
    title: '🔔 Someone is at your door',
    body: () => 'A visitor rang the digital bell.',
    vibrate: [300, 100, 300],
    requireInteraction: true,
  },
  qr_scan: {
    title: '📲 Someone scanned your QR',
    body: () => 'A visitor opened your Smart Door page.',
    vibrate: [150],
    requireInteraction: false,
  },
  voice: {
    title: '🎤 New voice message',
    body: (row) => (row?.duration_secs ? `${row.duration_secs}s message waiting` : 'A visitor left a voice message.'),
    vibrate: [200, 80, 200],
    requireInteraction: true,
  },
  text: {
    title: '💬 New message from a visitor',
    body: (row) => (row?.content ? String(row.content).slice(0, 120) : 'A visitor sent you a text message.'),
    vibrate: [150, 60, 150],
    requireInteraction: false,
  },
  sos: {
    title: '🚨 EMERGENCY — SOS Triggered',
    body: () => 'A visitor pressed the SOS button at your door. Respond immediately.',
    vibrate: [400, 100, 400, 100, 400],
    requireInteraction: true,
  },
};

// ────────── SHOW ONE NOTIFICATION (never reused, never suppressed) ──────────
/**
 * @param {'bell_ring'|'qr_scan'|'voice'|'text'|'sos'} type
 * @param {object} row      the DB row that triggered this (must have .id)
 * @param {string} ownerId
 */
async function _dispatchOne(type, row, ownerId) {
  const id = row?.id;
  if (!id) return; // can't guarantee uniqueness without a stable id — refuse rather than risk a collision
  if (_dispatchedIds.has(id)) return; // exact same DB row already notified (e.g. catch-up overlap) — not a duplicate event
  _dispatchedIds.add(id);
  // Bound the memory of this set — keep last ~2000 ids
  if (_dispatchedIds.size > 2000) {
    const first = _dispatchedIds.values().next().value;
    _dispatchedIds.delete(first);
  }

  const cfg = EVENT_CONFIG[type];
  const createdAt = row?.created_at ? new Date(row.created_at).getTime() : Date.now();
  const tag = `smartdoor-${type}-${id}`; // GLOBALLY UNIQUE — includes the row's own uuid, so it can never collide with any other event, ever.

  const logEntry = { id, type, tag, createdAt, status: 'created' };
  _pushLog(logEntry);

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    _updateLog(id, { status: 'failed', reason: 'permission_not_granted' });
    return;
  }

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg) {
      _updateLog(id, { status: 'failed', reason: 'no_service_worker' });
      return;
    }
    await reg.showNotification(cfg.title, {
      body: cfg.body(row),
      icon: '/images/favicon-192x192.png',
      badge: '/images/favicon-192x192.png',
      vibrate: cfg.vibrate,
      tag,                          // unique per event — see comment above
      renotify: true,               // belt-and-braces: even if a future change ever reintroduces a shared tag, force re-alert
      requireInteraction: cfg.requireInteraction,
      silent: false,
      timestamp: createdAt,
      data: { id, type, ownerId, url: '/app.html', timestamp: createdAt },
    });
    _updateLog(id, { status: 'delivered' });
  } catch (err) {
    _updateLog(id, { status: 'failed', reason: err?.message || 'showNotification_threw' });
  }
}

// ────────── PERMISSION ──────────
export async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'default') {
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  }
  return Notification.permission;
}

// ────────── CLICK TRACKING ──────────
// sw.js posts { type: 'notification_click', notifData } to the focused/opened
// window on click. notifData carries the same `id`/`type` we passed as
// `data` above, so we can mark the exact log entry as clicked.
function _wireClickTracking() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'notification_click' && msg?.notifData?.id) {
      _updateLog(msg.notifData.id, { status: 'clicked' });
    }
    // Real Web Push isn't wired up yet (see report), but sw.js already
    // broadcasts these if a push ever does arrive — recording them here
    // means the day push is added, this file needs zero changes to log it.
    if (msg?.type === 'push_delivered' && msg?.notifData?.id && !_dispatchedIds.has(msg.notifData.id)) {
      _dispatchedIds.add(msg.notifData.id);
      _pushLog({ id: msg.notifData.id, type: msg.notifData.type, tag: `push-${msg.notifData.id}`, createdAt: msg.notifData.timestamp, status: 'delivered', source: 'push' });
    }
    if (msg?.type === 'push_failed' && msg?.notifData?.id) {
      _updateLog(msg.notifData.id, { status: 'failed', reason: msg.error });
    }
  });
}

// ────────── CATCH-UP (visibility regain / background throttling recovery) ──────────
// Realtime websockets get throttled or dropped by mobile browsers when a PWA
// is backgrounded. When the tab becomes visible again, pull anything that
// landed in the gap and notify for it — the _dispatchedIds guard above makes
// this safe to call even if some of those rows were already delivered live.
let _lastCatchUpAt = Date.now();

async function _runCatchUp(ownerId) {
  const since = new Date(_lastCatchUpAt - 5000).toISOString(); // 5s overlap safety margin
  _lastCatchUpAt = Date.now();

  try {
    const [logsRes, msgRes] = await Promise.allSettled([
      supabase
        .from('visitor_logs')
        .select('id, owner_id, plate_id, event_type, created_at')
        .eq('owner_id', ownerId)
        .in('event_type', ['bell_ring', 'qr_scan', 'sos_triggered'])
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('message_logs')
        .select('id, owner_id, plate_id, message_type, content, duration_secs, created_at')
        .eq('owner_id', ownerId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    if (logsRes.status === 'fulfilled' && !logsRes.value.error) {
      for (const row of logsRes.value.data || []) {
        const type = row.event_type === 'sos_triggered' ? 'sos' : row.event_type;
        await _dispatchOne(type, row, ownerId);
      }
    }
    if (msgRes.status === 'fulfilled' && !msgRes.value.error) {
      for (const row of msgRes.value.data || []) {
        const type = row.message_type === 'emergency' ? 'sos' : row.message_type; // voice | text | sos
        if (!EVENT_CONFIG[type]) continue;
        await _dispatchOne(type, row, ownerId);
      }
    }
  } catch (err) {
    console.warn('[NotifDispatcher] catch-up failed:', err);
  }
}

// ────────── INIT — ONE subscription set, ONE dispatch path ──────────
/**
 * @param {string} ownerId
 * @param {object} [handlers]
 * @param {(type: 'bell_ring'|'qr_scan'|'voice'|'text'|'sos', row: object) => void} [handlers.onEvent]
 *        Called once per dispatched event, after the notification attempt,
 *        so callers can layer in-tab sound/vibration/UI updates (kept
 *        separate from this file on purpose — this file owns OS
 *        notifications only, not audio/UI, so it doesn't fight with
 *        existing dashboard sound code).
 * @returns {() => void} unsubscribe
 */
export function initNotificationDispatcher(ownerId, handlers = {}) {
  ensureNotificationPermission();
  _wireClickTracking();
  _lastCatchUpAt = Date.now();

  const visitorLogsChannel = supabase
    .channel(`notif-dispatch-logs:${ownerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'visitor_logs', filter: `owner_id=eq.${ownerId}` },
      async (payload) => {
        const row = payload.new;
        if (!['bell_ring', 'qr_scan', 'sos_triggered'].includes(row.event_type)) return;
        const type = row.event_type === 'sos_triggered' ? 'sos' : row.event_type;
        await _dispatchOne(type, row, ownerId);
        handlers.onEvent?.(type, row);
      }
    )
    .subscribe();

  const messageLogsChannel = supabase
    .channel(`notif-dispatch-messages:${ownerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_logs', filter: `owner_id=eq.${ownerId}` },
      async (payload) => {
        const row = payload.new;
        const type = row.message_type === 'emergency' ? 'sos' : row.message_type; // voice | text | sos
        if (!EVENT_CONFIG[type]) return;
        await _dispatchOne(type, row, ownerId);
        handlers.onEvent?.(type, row);
      }
    )
    .subscribe();

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      _runCatchUp(ownerId);
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onVisibilityChange);

  return () => {
    supabase.removeChannel(visitorLogsChannel);
    supabase.removeChannel(messageLogsChannel);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onVisibilityChange);
  };
}

export default {
  initNotificationDispatcher,
  ensureNotificationPermission,
  getDispatchLog,
  clearDispatchLog,
};
