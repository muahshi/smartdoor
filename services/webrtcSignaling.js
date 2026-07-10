/**
 * Smart Door — WebRTC Signaling Relay (Phase 2)
 * services/webrtcSignaling.js
 *
 * Relays SDP offer/answer and ICE candidates between visitor and owner
 * using Supabase Realtime BROADCAST channels — a different primitive from
 * both the `postgres_changes` channels used elsewhere (services/
 * communication.js, services/logs.js) and the PRESENCE channel used by
 * services/presence.js. Broadcast messages are ephemeral (never written
 * to Postgres), which is exactly what's needed here: signaling payloads
 * (SDP, ICE candidates) must never be persisted or exposed via a table —
 * see sql/39_webrtc_phase2_call_attempts.sql's header, which documents
 * that no signaling table exists or is needed.
 *
 * Two channel scopes:
 *   - RING channel  `rtc:ring:{ownerId}`  — one per owner, long-lived for
 *     the owner's dashboard session. Visitor broadcasts 'incoming-call'
 *     here (contains the SDP offer) when placing a Tap to Talk attempt.
 *     Many visitors over time share this one channel name; only the
 *     current offer's `callId` matters, so stale/duplicate joins are
 *     harmless — the owner UI keys off callId, not channel identity.
 *   - CALL channel  `rtc:call:{callId}`   — one per attempt, short-lived,
 *     used for the answer + ICE candidate exchange + reject/hangup once
 *     a specific call is underway. callId is a fresh crypto.randomUUID()
 *     per attempt, so there is no collision risk between attempts.
 *
 * This module holds NO calling logic (no RTCPeerConnection, no
 * getUserMedia, no fallback decision) — that lives in services/
 * webrtcCall.js (visitor) and services/webrtcOwnerCall.js (owner). This
 * file is purely the transport layer, kept separate so both sides share
 * one implementation of "how a message gets from A to B."
 *
 * PRODUCTION HARDENING (Fix 1 — Secure Realtime Broadcast authorization):
 * Both channel factories below now open with `{ private: true }`, which
 * makes Supabase Realtime evaluate the RLS policies added in
 * sql/40_webrtc_phase2_hardening.sql (`rtc_ring_receive_owner_only`,
 * `rtc_ring_send_visitor_and_owner`, `rtc_call_channel_participants`)
 * before allowing a client to join. Without `private: true` a channel is
 * PUBLIC and bypasses RLS entirely — that was the gap. This flag change
 * affects ONLY these two channel names; every other channel in the
 * codebase (services/communication.js, services/logs.js, services/
 * presence.js, etc.) is untouched and stays exactly as public as it is
 * today, since Realtime only RLS-checks a channel when the client itself
 * asks for `private: true` on that specific channel.
 *
 * For an authenticated owner session, Realtime Authorization checks
 * policies against the caller's current JWT (auth.uid()). supabase-js v2
 * keeps `supabase.realtime`'s auth token in sync automatically on
 * sign-in/token-refresh — `_ensureRealtimeAuth()` below is a defensive
 * belt-and-suspenders call (cheap, idempotent) to guarantee the very
 * first channel join of a session already carries the current token
 * rather than racing that internal sync on a cold page load.
 */

import { supabase } from './supabase.js';

export function ringChannelName(ownerId) {
  return `rtc:ring:${ownerId}`;
}

export function callChannelName(callId) {
  return `rtc:call:${callId}`;
}

async function _ensureRealtimeAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) supabase.realtime.setAuth(token);
  } catch {
    // No session (visitor/anon) or a transient auth read failure — fine,
    // the anon-role RLS policies still apply for anon channel joins.
  }
}

/**
 * Joins a broadcast channel and resolves once SUBSCRIBED (or rejects on
 * timeout), so callers never broadcast into a channel that isn't ready
 * yet — a broadcast sent before SUBSCRIBED is silently dropped by
 * Supabase Realtime. Private by default (see file header) — pass
 * `{ private: false }` explicitly if a future caller ever needs a public
 * signaling channel (no current caller does).
 *
 * SCOPE: SHORT-LIVED / ONE-SHOT joins only — a single call attempt's
 * `rtc:call:{callId}` channel, or the visitor's one-shot send-then-leave
 * join of `rtc:ring:{ownerId}`. Does NOT monitor the channel after the
 * first SUBSCRIBED. Do not use this for a listener that must stay alive
 * for an entire dashboard session — see joinPersistentBroadcastChannel
 * below, and its header comment for why that distinction is load-bearing.
 */
export async function joinBroadcastChannel(channelName, { timeoutMs = 5000, private: isPrivate = true } = {}) {
  if (isPrivate) await _ensureRealtimeAuth();

  return new Promise((resolve, reject) => {
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: false }, private: isPrivate },
    });

    const timer = setTimeout(() => {
      try { supabase.removeChannel(channel); } catch {}
      reject(new Error('Signaling channel join timed out'));
    }, timeoutMs);

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        console.log(`[RTC-TRACE] channel SUBSCRIBED | File=services/webrtcSignaling.js Channel=${channelName}`);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        try { supabase.removeChannel(channel); } catch {}
        console.error(`[RTC-TRACE][FAIL] channel join failed | File=services/webrtcSignaling.js Channel=${channelName} Reason=${status}${err?.message ? ` (${err.message})` : ''} Current=not-subscribed Expected=SUBSCRIBED`);
        reject(new Error(`Signaling channel failed: ${status}${err?.message ? ` (${err.message})` : ''}`));
      }
    });
  });
}

/**
 * PRODUCTION FIX — root cause of the "WebRTC never completes" bug.
 *
 * joinBroadcastChannel()'s `channel.subscribe((status) => {...})` callback
 * keeps firing for the ENTIRE lifetime of that channel, not just at the
 * initial join. The one long-lived caller of it — services/webrtcOwnerCall.js,
 * listening on the owner's ring channel for the whole dashboard session —
 * awaited joinBroadcastChannel() once and kept the resolved channel
 * forever. The very same subscribe callback that resolved the promise
 * ALSO fires on any later CHANNEL_ERROR / TIMED_OUT / CLOSED — e.g. a
 * normal Realtime websocket reconnect after a network blip, a
 * backgrounded tab's socket being recycled by the browser/OS, or a
 * long-idle dashboard tab. On that later event the callback ran
 * `supabase.removeChannel(channel)` and then called `reject(...)` on a
 * promise that was already resolved (a silent no-op) — so the channel was
 * permanently destroyed with nothing but a console.error, and nothing
 * ever rejoined it.
 *
 * From that moment the owner's dashboard looks completely normal —
 * presence still shows online, because services/presence.js has its own
 * independent reconnect-with-backoff loop — but the ring channel that
 * 'incoming-call' broadcasts land on is gone. A visitor's Tap-to-Talk
 * offer is sent into a channel with no listener, the 15s
 * WEBRTC_CONNECT_TIMEOUT_MS in services/webrtcCall.js elapses, and the
 * existing masked-call (Twilio) fallback fires — exactly the reported
 * symptom, and it explains why it can happen even with the dashboard
 * already open and all flags already on.
 *
 * This gives a long-lived channel the same resilience
 * services/presence.js#joinOwnerPresence already has: any post-initial
 * CHANNEL_ERROR/TIMED_OUT/CLOSED reconnects with capped exponential
 * backoff instead of destroying the channel, so a dropped ring channel
 * recovers automatically — no page refresh required.
 *
 * @param {string} channelName
 * @param {(channel: object) => void} registerHandlers  Called with the
 *   live channel object every time one is created — the FIRST join and
 *   again on every reconnect (a reconnect is a brand-new channel object,
 *   exactly like presence.js's `_subscribe()` recreating `channel.on(...)`
 *   handlers each time). Callers must attach their `onSignal(channel, ...)`
 *   handlers inside this callback, not just once outside it.
 * @param {object} [opts]
 * @param {boolean} [opts.private]
 * @param {number} [opts.initialTimeoutMs]  timeout for the FIRST join only
 * @param {(channel: object) => void} [opts.onSubscribed]  fires on every
 *   successful (re)subscribe, including reconnects.
 * @param {() => void} [opts.onLost]  fires the moment the channel drops
 *   and a reconnect attempt has been scheduled.
 * @returns {Promise<() => void>} cleanup function that stops any pending
 *   reconnect and removes the current channel. Rejects only if the FIRST
 *   join attempt itself fails (matching joinBroadcastChannel's contract).
 */
export async function joinPersistentBroadcastChannel(channelName, registerHandlers, {
  private: isPrivate = true,
  initialTimeoutMs = 8000,
  onSubscribed = () => {},
  onLost = () => {},
} = {}) {
  if (isPrivate) await _ensureRealtimeAuth();

  const RECONNECT_BASE_DELAY_MS = 1000;
  const RECONNECT_MAX_DELAY_MS = 15000;

  let channel = null;
  let torndown = false;
  let firstSettled = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let initialTimer = null;
  // PRODUCTION HARDENING (Fix 6 — background/foreground & network-switch
  // recovery): tracks whether the channel is CURRENTLY subscribed, so
  // that returning to the foreground or coming back online can check
  // "am I actually connected right now" instead of just hoping the
  // socket-level heartbeat notices in time.
  let isSubscribed = false;
  let _subscribeRef = null;

  await new Promise((resolveFirst, rejectFirst) => {
    function _subscribe() {
      channel = supabase.channel(channelName, {
        config: { broadcast: { self: false, ack: false }, private: isPrivate },
      });

      registerHandlers(channel);

      if (!firstSettled) {
        clearTimeout(initialTimer);
        initialTimer = setTimeout(() => {
          if (firstSettled || torndown) return;
          firstSettled = true;
          try { supabase.removeChannel(channel); } catch {}
          console.error(`[RTC-TRACE][FAIL] persistent channel initial join timed out | File=services/webrtcSignaling.js Channel=${channelName} Reason=timeout(${initialTimeoutMs}ms) Current=not-subscribed Expected=SUBSCRIBED`);
          rejectFirst(new Error('Persistent channel initial join timed out'));
        }, initialTimeoutMs);
      }

      channel.subscribe((status, err) => {
        if (torndown) return;

        if (status === 'SUBSCRIBED') {
          clearTimeout(initialTimer);
          reconnectAttempt = 0;
          isSubscribed = true;
          console.log(`[RTC-TRACE] persistent channel SUBSCRIBED | File=services/webrtcSignaling.js Channel=${channelName}`);
          onSubscribed(channel);
          if (!firstSettled) {
            firstSettled = true;
            resolveFirst();
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(initialTimer);

          if (!firstSettled) {
            // Genuine initial-join failure — no channel was ever live.
            firstSettled = true;
            try { supabase.removeChannel(channel); } catch {}
            console.error(`[RTC-TRACE][FAIL] persistent channel initial join failed | File=services/webrtcSignaling.js Channel=${channelName} Reason=${status}${err?.message ? ` (${err.message})` : ''} Current=not-subscribed Expected=SUBSCRIBED`);
            rejectFirst(new Error(`Persistent channel failed: ${status}${err?.message ? ` (${err.message})` : ''}`));
            return;
          }

          // Was live before, just dropped — reconnect, don't destroy.
          isSubscribed = false;
          console.warn(`[RTC-TRACE][FAIL] persistent channel dropped, reconnecting | File=services/webrtcSignaling.js Channel=${channelName} Reason=${status}${err?.message ? ` (${err.message})` : ''} Current=disconnected Expected=SUBSCRIBED attempt=${reconnectAttempt + 1}`);
          onLost();
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
  });

  // PRODUCTION HARDENING (Fix 6 — background/foreground & network-switch
  // recovery): the existing CHANNEL_ERROR/CLOSED path above already
  // reconnects with backoff, but that depends on the browser/OS actually
  // delivering a close event, which on a backgrounded mobile tab (screen
  // locked, app switched away) can lag well behind the moment the socket
  // is truly dead — Realtime's own heartbeat timeout has to elapse first,
  // sometimes tens of seconds after the person returns to the app. During
  // that window an incoming call would ring into a channel that LOOKS
  // subscribed client-side but isn't really receiving broadcasts yet.
  // Fix: the moment the tab becomes visible again, or the browser reports
  // it's back online, actively check isSubscribed — if it's false (or the
  // check itself is uncertain because we haven't heard SUBSCRIBED/CLOSED
  // recently), skip any remaining backoff wait and reconnect immediately
  // instead of waiting out whatever delay was already scheduled. This is
  // additive to the existing backoff loop, not a replacement for it.
  const _forceReconnectNow = () => {
    if (torndown || isSubscribed) return;
    console.log(`[RTC-TRACE] persistent channel fast-reconnect on foreground/online | File=services/webrtcSignaling.js Channel=${channelName}`);
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
    clearTimeout(initialTimer);
    document.removeEventListener('visibilitychange', _onVisible);
    window.removeEventListener('online', _onOnline);
    window.removeEventListener('focus', _onVisible);
    if (channel) { try { supabase.removeChannel(channel); } catch {} }
  };
}

/** Registers a handler for one broadcast event name on an already-joined channel. */
export function onSignal(channel, event, handler) {
  channel.on('broadcast', { event }, ({ payload }) => handler(payload));
}

/** Sends one broadcast event. Safe to call repeatedly (e.g. per ICE candidate). */
export async function sendSignal(channel, event, payload) {
  try {
    await channel.send({ type: 'broadcast', event, payload });
    console.log(`[RTC-TRACE] broadcast sent | File=services/webrtcSignaling.js Event=${event}`);
  } catch (err) {
    console.error(`[RTC-TRACE][FAIL] sendSignal failed | File=services/webrtcSignaling.js Event=${event} Reason=${err?.message || err} Current=not-sent Expected=delivered`);
    console.error(`[WebRTCSignaling] sendSignal(${event}) failed:`, err);
  }
}

export function leaveChannel(channel) {
  if (!channel) return;
  try { supabase.removeChannel(channel); } catch {}
}

export default {
  ringChannelName,
  callChannelName,
  joinBroadcastChannel,
  joinPersistentBroadcastChannel,
  onSignal,
  sendSignal,
  leaveChannel,
};

