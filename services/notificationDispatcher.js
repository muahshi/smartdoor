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
 * TRUE BACKGROUND DELIVERY (tab fully closed / phone screen off) is handled
 * by a separate, complementary path — services/push.js registers the
 * device for Firebase Cloud Messaging, and supabase/functions/send-push
 * delivers the actual OS push when the DB row is written, independent of
 * whether this file's code is even running. sw.js's 'push' handler shows
 * that notification using the SAME tag/action scheme this file uses (see
 * COLLAPSIBLE_TYPES / _buildTag / _buildActions above), so a device that's
 * both subscribed to push AND has this tab open never shows a duplicate —
 * _wireClickTracking()'s 'push_delivered' listener below folds
 * push-originated deliveries into the same dispatch log for debugging.
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
  ai_escalation: {
    title: '🙋 Visitor needs your attention',
    body: () => "Priya (AI) couldn't fully help this visitor — your personal reply may be needed.",
    vibrate: [200, 80, 200],
    requireInteraction: true,
  },
  status_reminder: {
    title: '⏰ Subscription Reminder',
    body: (row) => row?.body || 'Your Smart Door subscription needs your attention.',
    vibrate: [150],
    requireInteraction: false,
  },
};

// PHASE 3 (premium notification content) — mirrors
// supabase/functions/send-push/index.ts's _formatIST exactly, so a
// foreground (this file) and background (sw.js, via send-push) notification
// for the same event type read identically. Note: this doorbell flow's
// visitor_logs/message_logs rows are intentionally anonymous (no
// visitor_name/category column anywhere in this pipeline — that only
// exists in the separate society/property_management visitor-pass module),
// so only the real, already-available plateId + event time are appended —
// nothing is fabricated.
function _formatIST(ts) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(ts));
  } catch (_) {
    return new Date(ts).toLocaleString();
  }
}

// Same "collapsible" rule as supabase/functions/send-push/index.ts — a
// second bell press / QR re-scan for the same plate REPLACES the previous
// OS notification instead of stacking a new one. Every other type keeps a
// per-row unique tag. Kept in sync manually (small, well-commented list;
// see that file's COLLAPSIBLE_TYPES for the canonical background-path copy).
const COLLAPSIBLE_TYPES = new Set(['bell_ring', 'qr_scan']);

function _buildTag(type, id, plateId) {
  if (COLLAPSIBLE_TYPES.has(type) && plateId) return `smartdoor-${type}-${plateId}`;
  return `smartdoor-${type}-${id}`;
}

// Notification action buttons — mirrors sw.js's push-path action sets so a
// notification looks/behaves identically whether it was shown by the
// foreground realtime path (here) or the background push path (sw.js).
// Chromium browsers render these; Safari/iOS ignores `actions` entirely and
// falls back to tap-to-open — a graceful, spec-defined degradation.
function _buildActions(type) {
  if (type === 'sos') {
    return [
      { action: 'open', title: '🚨 Open App' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ];
  }
  if (['voice', 'text', 'ai_escalation'].includes(type)) {
    return [
      { action: 'open', title: '📲 Open' },
      { action: 'reply', title: '↩️ Reply' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ];
  }
  if (type === 'bell_ring') {
    return [
      { action: 'open', title: '📲 Open Dashboard' },
      { action: 'call', title: '📞 Call Visitor' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ];
  }
  return [
    { action: 'open', title: '📲 Open' },
    { action: 'dismiss', title: '✕ Dismiss' },
  ];
}

// ────────── SHOW ONE NOTIFICATION (never reused, never suppressed) ──────────
/**
 * @param {'bell_ring'|'qr_scan'|'voice'|'text'|'sos'} type
 * @param {object} row      the DB row that triggered this (must have .id)
 * @param {string} ownerId
 */
// ────────── SHOW ONE NOTIFICATION (never reused, never suppressed) ──────────
/**
 * Call this from whatever realtime callback already owns the subscription
 * for the row's table — do NOT open a second channel just to call this.
 * @param {'bell_ring'|'qr_scan'|'voice'|'text'|'sos'} type
 * @param {object} row      the DB row that triggered this (must have .id)
 * @param {string} ownerId
 */
export async function notifyEvent(type, row, ownerId) {
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
  const plateId = row?.plate_id || row?.plateId || null;
  const tag = _buildTag(type, id, plateId); // collapsible for bell_ring/qr_scan — see COLLAPSIBLE_TYPES above

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
    // status_reminder has its own fully custom, days-left-driven copy —
    // don't append plate/time to it (it has no plateId anyway).
    const enrichedBody = (type !== 'status_reminder' && plateId)
      ? `${cfg.body(row)} · Plate ${plateId} · ${_formatIST(createdAt)}`
      : cfg.body(row);

    await reg.showNotification(cfg.title, {
      body: enrichedBody,
      icon: '/images/favicon-192x192.png',
      badge: '/images/favicon-192x192.png',
      // Visitor photo, if a row ever carries one (no capture feature exists
      // in this flow today — harmless no-op until one does).
      image: row?.photo_url || row?.image_url || undefined,
      vibrate: cfg.vibrate,
      tag,
      renotify: true,               // re-alert (sound/vibrate) even when the tag is reused (collapsible types)
      requireInteraction: cfg.requireInteraction,
      silent: false,
      timestamp: createdAt,
      actions: _buildActions(type), // Open / Reply / Dismiss (or Open / Call / Dismiss for bell_ring) — Chromium only, Safari degrades gracefully
      // conversationId (Phase 4b, migration 32): visitor_logs / message_logs
      // rows now carry conversation_id. Passing it through here is what lets
      // js/dashboard.js's notification_click listener open the EXACT
      // conversation the visitor started, instead of just the app shell.
      data: { id, type, ownerId, plateId, conversationId: row?.conversation_id || null, url: '/app.html', timestamp: createdAt },
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
// PRODUCTION HARDENING (duplicate listeners): initNotificationDispatcher()
// has exactly one caller today (js/dashboard.js, guarded by its own
// _initialized flag), but that guard lives in a different module and
// nothing here enforced the invariant locally. Make _wireClickTracking's
// serviceWorker 'message' listener attach at most once regardless of how
// many times initNotificationDispatcher() ever gets called, so a future
// caller (or a dashboard re-init path) can't stack a second listener that
// would double-record every click/push event.
let _clickTrackingWired = false;
function _wireClickTracking() {
  if (_clickTrackingWired) return;
  if (!('serviceWorker' in navigator)) return;
  _clickTrackingWired = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'notification_click' && msg?.notifData?.id) {
      _updateLog(msg.notifData.id, { status: 'clicked' });
    }
    // sw.js broadcasts these whenever a background push is delivered/fails
    // (see services/push.js + supabase/functions/send-push) — recording
    // them here means push-originated deliveries show up in the same
    // getDispatchLog() as foreground ones, for one unified debug view.
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
        .select('id, owner_id, plate_id, event_type, conversation_id, created_at')
        .eq('owner_id', ownerId)
        .in('event_type', ['bell_ring', 'qr_scan', 'sos_triggered'])
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('message_logs')
        .select('id, owner_id, plate_id, message_type, content, duration_secs, conversation_id, created_at')
        .eq('owner_id', ownerId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    if (logsRes.status === 'fulfilled' && !logsRes.value.error) {
      for (const row of logsRes.value.data || []) {
        const type = row.event_type === 'sos_triggered' ? 'sos' : row.event_type;
        await notifyEvent(type, row, ownerId);
      }
    }
    if (msgRes.status === 'fulfilled' && !msgRes.value.error) {
      for (const row of msgRes.value.data || []) {
        const type = row.message_type === 'emergency' ? 'sos' : row.message_type; // voice | text | sos
        if (!EVENT_CONFIG[type]) continue;
        await notifyEvent(type, row, ownerId);
      }
    }
  } catch (err) {
    console.warn('[NotifDispatcher] catch-up failed:', err);
  }
}

// ────────── INIT — permission + click tracking + catch-up ONLY ──────────
// IMPORTANT: this function intentionally does NOT open its own realtime
// channels for visitor_logs/message_logs anymore. Earlier versions of this
// file opened a second, dedicated channel per table — but dashboard.js
// already had channels open on those exact tables (`logs:${ownerId}`,
// `message_logs:${ownerId}`, etc.) for the UI feed. That meant a single
// dashboard session was opening 7 concurrent realtime channels instead of
// ~5, and the later-created channels (these two) were the ones that
// intermittently failed to complete their join handshake — which is
// consistent with what was reported: bell (on the FIRST channel created)
// worked, everything wired through the SECOND channel (messages) did not.
// Fix: this file no longer opens channels at all. Callers must call
// notifyEvent() directly from their existing subscription callback.
/**
 * @param {string} ownerId
 * @returns {() => void} cleanup — removes the visibility/focus listeners
 */
export function initNotificationDispatcher(ownerId) {
  ensureNotificationPermission();
  _wireClickTracking();
  _lastCatchUpAt = Date.now();

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      _runCatchUp(ownerId);
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onVisibilityChange);
  };
}

export default {
  initNotificationDispatcher,
  notifyEvent,
  ensureNotificationPermission,
  getDispatchLog,
  clearDispatchLog,
};
