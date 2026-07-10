/**
 * Smart Door — Owner Presence Service (Phase 1)
 * services/presence.js
 *
 * Detects whether an owner is "online" (dashboard open + connected) using
 * Supabase Realtime Presence — a different primitive from the
 * `postgres_changes` channels used everywhere else in this codebase
 * (services/communication.js, services/logs.js, etc.). Presence tracks
 * ephemeral client state per-connection and does NOT write a DB row per
 * heartbeat, which is why it's the right tool here instead of reusing
 * push_subscriptions.last_seen_at (a 6h-refresh device-registration
 * timestamp — accurate to "used the app recently", not "online right
 * now"; see services/push.js#wireTokenRefresh and config/environment.js
 * for why that signal is unrelated to this one).
 *
 * SCOPE — Phase 1 only:
 *   - Detect owner online/offline, across multiple devices/tabs.
 *   - Handle channel reconnects gracefully.
 *   - Stale presence removal: Supabase Realtime Presence already removes
 *     a client's entry automatically when its socket disconnects (server-
 *     enforced heartbeat/timeout) — there is no separate client-side
 *     "stale" timer to write here. rtc_presence_events itself (the LOG of
 *     transitions) is separately purged by purge_old_rtc_presence_events()
 *     (sql/38_webrtc_phase0_phase1.sql), which is about log housekeeping,
 *     not live presence state.
 *   - Log connect/disconnect/reconnect transitions to rtc_presence_events
 *     for monitoring (best-effort, fail-silent — same trust model as
 *     services/communication.js#_audit()).
 *
 * NOT in scope here: no RTCPeerConnection, no SDP/ICE, no signaling, no
 * visitor-facing code path calls this file at all yet. Everything in this
 * file is a no-op for any owner until isWebRTCEnabledForOwner(ownerId)
 * returns true (kill switch off, global flag on, AND that owner opted
 * in) — see services/featureFlags.js. Default state for every owner
 * today is fully inert: no channel is joined, no row is ever written.
 */

import { supabase } from './supabase.js';
import { isWebRTCEnabledForOwner } from './featureFlags.js';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

// PRODUCTION FIX (stale-owner-listener, task 1): if webrtc isn't enabled
// for this owner at the exact moment joinOwnerPresence() is called (flags
// not yet flipped, or a transient feature_flags read hiccup), the old
// code returned a permanent no-op cleanup — the only way to start
// tracking presence afterward was a full page refresh. This interval
// re-checks isWebRTCEnabledForOwner() and starts real presence tracking
// automatically the moment it turns true. Kept above featureFlags.js's
// own 30s cache TTL so each re-check sees a fresh read.
const FLAG_RECHECK_INTERVAL_MS = 20000;

function _getDeviceId() {
  const KEY = 'sd_rtc_device_id';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (rare, e.g. locked-down browser context) —
    // fall back to a per-call random id; multi-device counting degrades
    // gracefully but presence detection itself still works.
    return 'dev_' + Math.random().toString(36).slice(2);
  }
}

// Fail-silent monitoring write — never blocks or throws into the caller.
async function _logPresenceEvent(ownerId, eventType, deviceCount, deviceId) {
  try {
    await supabase.from('rtc_presence_events').insert({
      owner_id: ownerId,
      event_type: eventType,
      device_count: deviceCount,
      device_id: deviceId,
    });
  } catch {
    // Monitoring is non-critical — never block presence tracking on it.
  }
}

/**
 * Joins the owner's presence channel and starts tracking this device as
 * online. Returns a cleanup function that leaves the channel cleanly.
 *
 * GUARDED: if isWebRTCEnabledForOwner(ownerId) is false (the default for
 * every owner today), this resolves immediately to a no-op cleanup
 * function WITHOUT ever opening a channel or writing a row — zero
 * behavior and zero resource change for owners not explicitly flagged in.
 *
 * @param {string} ownerId
 * @returns {Promise<() => void>} cleanup function (always safe to call)
 */
export async function joinOwnerPresence(ownerId) {
  const noOpCleanup = () => {};
  if (!ownerId) {
    console.error('[RTC-TRACE][FAIL] joinOwnerPresence called with no ownerId | File=services/presence.js Reason=ownerId is falsy at call time (likely called before state.owner was populated) Current=never-started Expected=tracking-started');
    return noOpCleanup;
  }

  let outerTorndown = false;
  let recheckTimer = null;
  let activeCleanup = null;

  async function _tryStart() {
    if (outerTorndown) return;
    const enabled = await isWebRTCEnabledForOwner(ownerId);
    console.log(`[RTC-TRACE] Owner presence flag check | File=services/presence.js ownerId=${ownerId} enabled=${enabled}`);
    if (outerTorndown) return;
    if (!enabled) {
      console.warn(`[RTC-TRACE][FAIL] presence not started, flag disabled | File=services/presence.js ownerId=${ownerId} Reason=isWebRTCEnabledForOwner()=false Current=not-tracking Expected=tracking — will recheck in ${FLAG_RECHECK_INTERVAL_MS}ms`);
      recheckTimer = setTimeout(_tryStart, FLAG_RECHECK_INTERVAL_MS);
      return;
    }
    activeCleanup = _startPresence(ownerId);
  }

  await _tryStart();

  return function cleanup() {
    outerTorndown = true;
    clearTimeout(recheckTimer);
    if (activeCleanup) activeCleanup();
  };
}

/**
 * The real presence join — split out of joinOwnerPresence() so the
 * flag-recheck wrapper above can (re)start it without duplicating this
 * logic. Behavior is byte-for-byte identical to the original
 * implementation.
 */
function _startPresence(ownerId) {
  const deviceId = _getDeviceId();
  const channelName = `presence:owner:${ownerId}`;
  let channel = null;
  let hasConnectedBefore = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let torndown = false;
  // PRODUCTION HARDENING (Fix 6 — background/foreground & network-switch
  // recovery, mirrors services/webrtcSignaling.js#joinPersistentBroadcastChannel):
  // tracks whether presence is CURRENTLY tracked/subscribed so a tab
  // returning to the foreground (or the browser reporting back-online)
  // can force an immediate reconnect instead of waiting for Realtime's own
  // heartbeat timeout to notice a backgrounded socket died. This is what
  // visitors' getOwnerPresenceSnapshot() reads to decide "is this owner
  // reachable at all" — a stale presence entry here silently sends every
  // Tap to Talk attempt straight to masked-call fallback.
  let isSubscribed = false;
  let _subscribeRef = null;

  function _deviceCount() {
    if (!channel) return 0;
    try {
      return Object.keys(channel.presenceState() || {}).length;
    } catch {
      return 0;
    }
  }

  // PRODUCTION FIX: channel.track() can fail (transient network hiccup,
  // a race right after SUBSCRIBED, etc.) while the channel itself stays
  // perfectly SUBSCRIBED. The old code swallowed that failure with an
  // empty catch and no retry — CHANNEL_ERROR/CLOSED/TIMED_OUT never
  // fires in this case (the channel genuinely is subscribed), so nothing
  // ever tried tracking again. The device silently never appears in
  // presenceState(), the owner shows deviceCount=0 forever, and every
  // visitor sees "owner offline" even with the dashboard open — this is
  // the second half of the reported bug (Phone A's console showed
  // `online=false deviceCount=0`). This retries a few times with a short
  // delay and logs every attempt so a real underlying failure (e.g. a
  // genuine RLS/config problem) is now visible instead of silent.
  async function _trackWithRetry(attempt = 1) {
    if (torndown) return;
    try {
      await channel.track({ online_at: new Date().toISOString() });
      console.log(`[RTC-TRACE] presence track() succeeded | File=services/presence.js ownerId=${ownerId} deviceId=${deviceId} attempt=${attempt} deviceCount=${_deviceCount()}`);
    } catch (err) {
      console.warn(`[RTC-TRACE][FAIL] presence track() failed | File=services/presence.js ownerId=${ownerId} deviceId=${deviceId} Reason=${err?.message || err} Current=subscribed-but-untracked Expected=tracked attempt=${attempt}`);
      if (attempt < 3 && !torndown) {
        setTimeout(() => _trackWithRetry(attempt + 1), 1000 * attempt);
      } else {
        console.error(`[RTC-TRACE][FAIL] presence track() gave up after ${attempt} attempts | File=services/presence.js ownerId=${ownerId} deviceId=${deviceId} Current=subscribed-but-untracked Expected=tracked`);
      }
    }
  }

  function _subscribe() {
    channel = supabase.channel(channelName, {
      config: { presence: { key: deviceId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      // No-op hook point for a future owner-side "who's online" UI
      // (Phase 3+). Intentionally does nothing else in Phase 1.
    });

    channel.on('presence', { event: 'join' }, () => {
      // Presence 'join' also fires for OTHER devices of the same owner
      // joining — device count reflects that; this device's own
      // connect/reconnect is logged from the subscribe callback below,
      // not here, to avoid double-logging on every teammate device join.
    });

    channel.on('presence', { event: 'leave' }, () => {
      // A device (this one or another of the owner's) disconnected.
      // Supabase Presence has already removed it from presenceState()
      // by the time this fires — no separate "stale" check needed.
      _logPresenceEvent(ownerId, 'disconnect', _deviceCount(), deviceId).catch(() => {});
    });

    channel.subscribe(async (status) => {
      if (torndown) return;

      if (status === 'SUBSCRIBED') {
        console.log(`[RTC-TRACE] presence channel SUBSCRIBED | File=services/presence.js ownerId=${ownerId} deviceId=${deviceId} channel=${channelName}`);
        await _trackWithRetry();
        reconnectAttempt = 0;
        isSubscribed = true;
        _logPresenceEvent(
          ownerId,
          hasConnectedBefore ? 'reconnect' : 'connect',
          _deviceCount(),
          deviceId
        ).catch(() => {});
        hasConnectedBefore = true;
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Graceful reconnect: exponential backoff, capped, so a network
        // blip retries quickly but a persistent outage doesn't hammer
        // the realtime service.
        isSubscribed = false;
        if (torndown) return;
        const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
        reconnectAttempt += 1;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (torndown) return;
          try { supabase.removeChannel(channel); } catch {}
          _subscribe();
        }, delay);
      }
    });
  }

  _subscribeRef = _subscribe;
  _subscribe();

  // PRODUCTION HARDENING (Fix 6): see webrtcSignaling.js's identical
  // comment — reconnect immediately on tab-foreground/back-online instead
  // of waiting for the socket-level heartbeat timeout to notice a
  // backgrounded connection died.
  const _forceReconnectNow = () => {
    if (torndown || isSubscribed) return;
    console.log(`[RTC-TRACE] presence fast-reconnect on foreground/online | File=services/presence.js ownerId=${ownerId} deviceId=${deviceId}`);
    clearTimeout(reconnectTimer);
    reconnectAttempt = 0;
    if (channel) { try { supabase.removeChannel(channel); } catch {} }
    _subscribeRef();
  };
  const _onVisible = () => { if (document.visibilityState === 'visible') _forceReconnectNow(); };
  const _onOnline = () => _forceReconnectNow();
  document.addEventListener('visibilitychange', _onVisible);
  window.addEventListener('online', _onOnline);
  window.addEventListener('focus', _onVisible);

  return function cleanup() {
    torndown = true;
    clearTimeout(reconnectTimer);
    document.removeEventListener('visibilitychange', _onVisible);
    window.removeEventListener('online', _onOnline);
    window.removeEventListener('focus', _onVisible);
    if (channel) {
      try { supabase.removeChannel(channel); } catch {}
    }
  };
}

/**
 * One-shot read of an owner's current presence state, without holding a
 * long-lived subscription open. Called by services/webrtcCall.js's
 * attemptTapToTalk() before opening a peer connection, to decide whether
 * this owner is currently reachable over WebRTC.
 *
 * Also guarded by isWebRTCEnabledForOwner — returns { online: false,
 * deviceCount: 0 } immediately if WebRTC isn't enabled for this owner,
 * consistent with joinOwnerPresence()'s no-op behavior.
 *
 * @param {string} ownerId
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ online: boolean, deviceCount: number }>}
 */
export async function getOwnerPresenceSnapshot(ownerId, { timeoutMs = 2000 } = {}) {
  if (!ownerId) return { online: false, deviceCount: 0 };

  const enabled = await isWebRTCEnabledForOwner(ownerId);
  if (!enabled) return { online: false, deviceCount: 0 };

  return new Promise((resolve) => {
    const channelName = `presence:owner:${ownerId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: `snapshot_${Date.now()}` } },
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { supabase.removeChannel(channel); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => finish({ online: false, deviceCount: 0 }), timeoutMs);

    channel.on('presence', { event: 'sync' }, () => {
      let count = 0;
      try { count = Object.keys(channel.presenceState() || {}).length; } catch {}
      finish({ online: count > 0, deviceCount: count });
    });

    channel.subscribe();
  });
}

export default { joinOwnerPresence, getOwnerPresenceSnapshot };
