/**
 * My Smart Door — WebRTC Signaling Relay (Phase 2)
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

// ═══════════════════════════════════════════════════════════════════════
// PRODUCTION HARDENING (logging) — the diagnostic instrumentation below
// (_describeAuthContext, _dumpRealtimeFailure, and the per-join
// [RTC-TRACE][AUTH-CHECK] lines) was added for a specific root-cause
// investigation and left permanently wired in. In production that meant
// EVERY visitor Tap-to-Talk attempt and EVERY owner dashboard session
// logged the caller's auth role, userId, and access-token presence to the
// browser console on every single channel join — and any failure dumped
// the full raw channel/socket object (including token length) via
// JSON.stringify. That's unnecessary console noise for every real user
// and needlessly exposes internal auth/session details to anyone with
// devtools open on a shared/public device.
//
// Fix (additive, no behavior change): gate the verbose/raw diagnostics
// behind the SAME production/staging/development signal
// scripts/build-env.js already bakes into window.__SD_CONFIG__.env for
// this exact purpose. Staging/dev keep full RTC-TRACE diagnostics
// unchanged for debugging; production keeps only the concise
// status/reason error lines that were already present alongside them.
// ═══════════════════════════════════════════════════════════════════════
function _debugLoggingEnabled() {
  return (window.__SD_CONFIG__?.env || 'development') !== 'production';
}

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

// ═══════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC — RTC-TRACE auth-context probe (REMOVE AFTER
// ROOT-CAUSE CONFIRMATION). Not a fix. Captures, at the exact moment a
// client attempts to join `rtc:ring:{ownerId}` or `rtc:call:{callId}`,
// whether that client is `anon` or `authenticated`, and if authenticated,
// which user — so a working-phone vs failing-phone console log can be
// compared side by side. Read-only: never mutates auth state, never
// blocks or delays the join, never changes RLS or channel config.
// ═══════════════════════════════════════════════════════════════════════
async function _describeAuthContext() {
  // PRODUCTION HARDENING: this function's only consumer is the
  // [RTC-TRACE][AUTH-CHECK] debug log lines below — skip the extra
  // supabase.auth.getSession() round-trip entirely in production instead
  // of doing the work just to log a role/userId nobody will read.
  if (!_debugLoggingEnabled()) return { role: 'n/a', userId: null, hasAccessToken: null };
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { role: 'unknown', reason: `getSession error: ${error.message}` };
    const session = data?.session;
    if (!session) return { role: 'anon', userId: null, hasAccessToken: false };
    return {
      role: 'authenticated',
      userId: session.user?.id || null,
      hasAccessToken: !!session.access_token,
      expiresAt: session.expires_at || null,
    };
  } catch (err) {
    return { role: 'unknown', reason: err?.message || String(err) };
  }
}

/**
 * PRODUCTION FIX — root cause of the "Maximum call stack size exceeded"
 * recursive channel-cleanup bug (RTC-TRACE evidence: repeated
 * `channel join failed | Reason=CLOSED` immediately followed by a stack
 * overflow through push.js → channel.js → SupabaseClient.ts →
 * removeChannel() → unsubscribe()).
 *
 * Every teardown path in this file (join-timeout, CHANNEL_ERROR/TIMED_OUT/
 * CLOSED handling, reconnect, explicit leave) was calling
 * `supabase.removeChannel(channel)` SYNCHRONOUSLY from inside that very
 * channel's own `channel.subscribe((status) => {...})` dispatch callback.
 * `removeChannel()` internally calls `channel.unsubscribe()`, which walks
 * the channel's Phoenix `push` queue and can itself invoke that same
 * status callback again (e.g. re-entering with CLOSED) while the original
 * call is still on the stack — each re-entry calling removeChannel() again
 * — producing unbounded recursion instead of a single clean teardown.
 *
 * Fix: NEVER call supabase.removeChannel()/channel.unsubscribe() directly.
 * Route every removal through this one idempotent, deferred helper:
 *   - Idempotent: a WeakSet keyed on the channel object guarantees
 *     removeChannel() is invoked at most once per channel, no matter how
 *     many teardown paths race to remove the same channel (join-timeout
 *     racing a CLOSED event, hangup racing a permanent ICE failure, etc.).
 *   - Deferred: the actual removeChannel() call is scheduled on a fresh
 *     macrotask (setTimeout 0), so it always runs AFTER the current
 *     channel-dispatch callback has fully returned and the call stack has
 *     unwound — the same channel's dispatch loop can never still be on
 *     the stack when removeChannel() runs, which is what breaks the
 *     recursion. This adds no observable delay (still same tick vs. next
 *     tick) and changes no business logic, SDP/ICE handling, or logging.
 */
const _removedChannels = new WeakSet();

function _safeRemoveChannel(channel) {
  if (!channel || _removedChannels.has(channel)) return;
  _removedChannels.add(channel);
  setTimeout(() => {
    try { supabase.removeChannel(channel); } catch {}
  }, 0);
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC — raw Realtime failure dump (REMOVE AFTER ROOT-
// CAUSE CONFIRMATION). Called only when channel.subscribe()'s callback
// reports a status other than SUBSCRIBED. Read-only: never mutates
// channel/socket state, never touches timers, never changes join
// behavior, retry logic, or what gets resolved/rejected — it runs
// alongside the existing console.error calls in each failure branch,
// purely to capture the complete, unsummarized payload Supabase Realtime
// returns on failure. Does not log the raw access token value itself
// (only whether one is present and its length), everything else is
// printed as-is.
// ═══════════════════════════════════════════════════════════════════════
function _dumpRealtimeFailure(channel, channelName, status, err) {
  // PRODUCTION HARDENING: the raw object/socket dump below is verbose
  // diagnostic-only output (channel internals, socket state, token
  // length). The existing console.error(...Reason=${status}...) calls at
  // each call site already surface the actionable signal in production;
  // this function now only runs in non-production so it can't spam or
  // leak internals to a real user's console.
  if (!_debugLoggingEnabled()) return;
  const timestamp = new Date().toISOString();
  try {
    console.error(`[RTC-TRACE][RAW-DUMP] ══════ non-SUBSCRIBED status ══════ timestamp=${timestamp} topic=${channelName}`);

    console.error('[RTC-TRACE][RAW-DUMP] status (raw):', status);

    console.error('[RTC-TRACE][RAW-DUMP] err (raw object, console-inspected):', err);
    console.error('[RTC-TRACE][RAW-DUMP] err (JSON.stringify):', JSON.stringify(err));
    try {
      console.error(
        '[RTC-TRACE][RAW-DUMP] err (JSON.stringify with own property names, catches non-enumerable fields like .message/.stack):',
        JSON.stringify(err, Object.getOwnPropertyNames(err || {}))
      );
    } catch (nestedStringifyErr) {
      console.error('[RTC-TRACE][RAW-DUMP] err JSON.stringify(ownPropertyNames) FAILED:', nestedStringifyErr);
    }
    try {
      console.error('[RTC-TRACE][RAW-DUMP] err own property names:', Object.getOwnPropertyNames(err || {}));
      console.error('[RTC-TRACE][RAW-DUMP] err own property descriptors:', Object.getOwnPropertyDescriptors(err || {}));
    } catch (nestedDescErr) {
      console.error('[RTC-TRACE][RAW-DUMP] err property introspection FAILED:', nestedDescErr);
    }
    console.error('[RTC-TRACE][RAW-DUMP] err?.message:', err?.message);
    console.error('[RTC-TRACE][RAW-DUMP] err?.code:', err?.code);
    console.error('[RTC-TRACE][RAW-DUMP] err?.reason:', err?.reason);
    console.error('[RTC-TRACE][RAW-DUMP] err?.status:', err?.status);
    console.error('[RTC-TRACE][RAW-DUMP] err?.type:', err?.type);
    console.error('[RTC-TRACE][RAW-DUMP] err?.stack:', err?.stack);

    console.error('[RTC-TRACE][RAW-DUMP] channel.topic:', channel?.topic);
    console.error('[RTC-TRACE][RAW-DUMP] channel.state:', channel?.state);
    console.error('[RTC-TRACE][RAW-DUMP] channel.joinedOnce:', channel?.joinedOnce);
    console.error('[RTC-TRACE][RAW-DUMP] channel._state (internal, if present):', channel?._state);
    console.error('[RTC-TRACE][RAW-DUMP] channel (raw object, console-inspected):', channel);

    const socket = channel?.socket;
    console.error('[RTC-TRACE][RAW-DUMP] socket present:', !!socket);
    if (socket) {
      console.error(
        '[RTC-TRACE][RAW-DUMP] socket.connectionState():',
        typeof socket.connectionState === 'function' ? socket.connectionState() : 'n/a (method not present)'
      );
      console.error(
        '[RTC-TRACE][RAW-DUMP] socket.isConnected():',
        typeof socket.isConnected === 'function' ? socket.isConnected() : 'n/a (method not present)'
      );
      console.error('[RTC-TRACE][RAW-DUMP] socket.readyState (underlying transport, if present):', socket?.conn?.readyState ?? socket?.transport?.readyState ?? 'n/a');
      console.error('[RTC-TRACE][RAW-DUMP] socket.accessToken present:', !!socket.accessToken);
      console.error('[RTC-TRACE][RAW-DUMP] socket.accessToken length:', socket.accessToken ? String(socket.accessToken).length : 0);
      console.error('[RTC-TRACE][RAW-DUMP] socket.endPoint / endpointURL:', socket?.endPoint || socket?.endpointURL?.() || 'n/a');
      console.error('[RTC-TRACE][RAW-DUMP] socket (raw object, console-inspected):', socket);
    }

    console.error(`[RTC-TRACE][RAW-DUMP] ══════ end dump for topic=${channelName} ══════`);
  } catch (dumpErr) {
    console.error('[RTC-TRACE][RAW-DUMP] the diagnostic dump itself threw:', dumpErr);
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

  // TEMPORARY DIAGNOSTIC — see _describeAuthContext() header comment.
  const _authCtx = await _describeAuthContext();
  if (_debugLoggingEnabled()) console.log(`[RTC-TRACE][AUTH-CHECK] pre-join auth context | File=services/webrtcSignaling.js Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} hasAccessToken=${_authCtx.hasAccessToken ?? 'n/a'} reason=${_authCtx.reason || 'n/a'}`);

  return new Promise((resolve, reject) => {
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: false }, private: isPrivate },
    });

    const timer = setTimeout(() => {
      _safeRemoveChannel(channel);
      console.error(`[RTC-TRACE][FAIL][AUTH-CHECK] channel join TIMED OUT (client-side timer, no status ever received) | File=services/webrtcSignaling.js Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} timeoutMs=${timeoutMs}`);
      reject(new Error('Signaling channel join timed out'));
    }, timeoutMs);

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        console.log(`[RTC-TRACE] channel SUBSCRIBED | File=services/webrtcSignaling.js Channel=${channelName}`);
        if (_debugLoggingEnabled()) console.log(`[RTC-TRACE][AUTH-CHECK] join SUCCEEDED | Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} status=${status}`);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        _dumpRealtimeFailure(channel, channelName, status, err);
        _safeRemoveChannel(channel);
        console.error(`[RTC-TRACE][FAIL] channel join failed | File=services/webrtcSignaling.js Channel=${channelName} Reason=${status}${err?.message ? ` (${err.message})` : ''} Current=not-subscribed Expected=SUBSCRIBED`);
        console.error(`[RTC-TRACE][FAIL][AUTH-CHECK] join REJECTED | Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} status=${status} errMessage=${err?.message || 'n/a'} errFull=${JSON.stringify(err || {})}`);
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

  // TEMPORARY DIAGNOSTIC — see _describeAuthContext() header comment.
  const _authCtx = await _describeAuthContext();
  if (_debugLoggingEnabled()) console.log(`[RTC-TRACE][AUTH-CHECK] pre-join auth context (owner/persistent) | File=services/webrtcSignaling.js Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} hasAccessToken=${_authCtx.hasAccessToken ?? 'n/a'} reason=${_authCtx.reason || 'n/a'}`);

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
          _safeRemoveChannel(channel);
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
          if (_debugLoggingEnabled()) console.log(`[RTC-TRACE][AUTH-CHECK] persistent join SUCCEEDED | Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} status=${status}`);
          onSubscribed(channel);
          if (!firstSettled) {
            firstSettled = true;
            resolveFirst();
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(initialTimer);
          _dumpRealtimeFailure(channel, channelName, status, err);

          if (!firstSettled) {
            // Genuine initial-join failure — no channel was ever live.
            firstSettled = true;
            _safeRemoveChannel(channel);
            console.error(`[RTC-TRACE][FAIL] persistent channel initial join failed | File=services/webrtcSignaling.js Channel=${channelName} Reason=${status}${err?.message ? ` (${err.message})` : ''} Current=not-subscribed Expected=SUBSCRIBED`);
            console.error(`[RTC-TRACE][FAIL][AUTH-CHECK] persistent join REJECTED | Channel=${channelName} role=${_authCtx.role} userId=${_authCtx.userId || 'n/a'} status=${status} errMessage=${err?.message || 'n/a'} errFull=${JSON.stringify(err || {})}`);
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
            _safeRemoveChannel(channel);
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
    if (channel) _safeRemoveChannel(channel);
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
    if (channel) _safeRemoveChannel(channel);
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
  _safeRemoveChannel(channel);
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


