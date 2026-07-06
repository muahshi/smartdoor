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
  if (!ownerId) return noOpCleanup;

  const enabled = await isWebRTCEnabledForOwner(ownerId);
  if (!enabled) return noOpCleanup;

  const deviceId = _getDeviceId();
  const channelName = `presence:owner:${ownerId}`;
  let channel = null;
  let hasConnectedBefore = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let torndown = false;

  function _deviceCount() {
    if (!channel) return 0;
    try {
      return Object.keys(channel.presenceState() || {}).length;
    } catch {
      return 0;
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

    // FIX (review finding — disconnect attribution): this used to log
    // `deviceId` (this local device's own key) as the device that
    // disconnected, which is always wrong — if THIS device were the one
    // disconnecting, its own channel would already be dead and this
    // callback would never fire locally. `key` from the leave payload is
    // the presence key that actually left; that's the correct value to
    // log.
    //
    // FIX (review finding — duplicate rows): every surviving device on
    // the channel receives this same 'leave' event, so logging
    // unconditionally here wrote one duplicate row per survivor for a
    // single real disconnect. To keep exactly one row per disconnect
    // without a server-side dedup mechanism, survivors deterministically
    // elect the lexicographically-lowest remaining presence key as the
    // sole logger. All survivors compute this off the same
    // (already-updated) presenceState(), so they agree on the same
    // elected device without any coordination between them.
    channel.on('presence', { event: 'leave' }, ({ key }) => {
      // Supabase Presence has already removed the leaving key from
      // presenceState() by the time this fires — no separate "stale"
      // check needed.
      const remainingKeys = Object.keys(channel.presenceState() || {}).sort();
      const isElectedLogger = remainingKeys.length === 0 || remainingKeys[0] === deviceId;
      if (!isElectedLogger) return;
      _logPresenceEvent(ownerId, 'disconnect', remainingKeys.length, key).catch(() => {});
    });

    channel.subscribe(async (status) => {
      if (torndown) return;

      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({ online_at: new Date().toISOString() });
        } catch {
          // Track failure is non-fatal — channel stays subscribed and
          // will retry on the next reconnect cycle if needed.
        }
        reconnectAttempt = 0;
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

  _subscribe();

  return function cleanup() {
    torndown = true;
    clearTimeout(reconnectTimer);
    if (channel) {
      try { supabase.removeChannel(channel); } catch {}
    }
  };
}

/**
 * One-shot read of an owner's current presence state, without holding a
 * long-lived subscription open. NOT called by any code path yet — this
 * is the function a future Phase 2 "should I attempt WebRTC?" check
 * would use before opening a peer connection.
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
