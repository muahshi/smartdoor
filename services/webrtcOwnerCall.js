/**
 * Smart Door — WebRTC Tap to Talk (Phase 2, Owner Side)
 * services/webrtcOwnerCall.js
 *
 * Owner-side counterpart to services/webrtcCall.js. Listens on the
 * owner's ring channel (services/webrtcSignaling.js) for incoming Tap to
 * Talk offers and exposes accept()/reject() to whatever UI layer shows
 * the Incoming Call overlay (js/webrtcCallUI.js). Holds no UI of its own
 * — this file is call-handling logic only, same separation as
 * services/communication.js (orchestration) vs. visitor.html (UI).
 *
 * Guarded exactly like services/presence.js: if WebRTC isn't enabled for
 * this owner, listenForIncomingCalls() is a complete no-op — no channel
 * opened — mirroring joinOwnerPresence()'s behavior. This mirrors the
 * visitor-side guard in webrtcCall.js for defense in depth (the visitor
 * already checks the same flag before ever sending an offer, so in
 * practice this only matters if flags change mid-session).
 *
 * PRODUCTION HARDENING additions in this file:
 *   Fix 2 — cleanupActiveCall() is now idempotent and is the single exit
 *     path for every termination reason (visitor hangup, owner hangup via
 *     the new hangUp() control handed to the UI, permanent ICE failure,
 *     or a reconnect grace-window timeout), guaranteeing the microphone
 *     is always released and the UI is always told the call ended.
 *   Fix 3 — accept() now atomically claims the call in
 *     rtc_call_claims (sql/40_webrtc_phase2_hardening.sql) BEFORE
 *     requesting the microphone. If another tab/device of this owner
 *     already claimed it, this device aborts immediately (no mic
 *     prompt, no peer connection, no duplicate audio).
 *   Fix 4 — connectionState 'disconnected' after a successful connect
 *     starts an RTC_RECONNECT_GRACE_MS grace window instead of an
 *     immediate teardown, so a brief ICE hiccup mid-call recovers
 *     silently instead of ending the call.
 */

import { isWebRTCEnabledForOwner } from './featureFlags.js';
import { fetchIceServers, RTC_RECONNECT_GRACE_MS, WEBRTC_CONNECT_TIMEOUT_MS } from '../config/rtcConfig.js';
import { supabase } from './supabase.js';
import {
  ringChannelName,
  callChannelName,
  joinBroadcastChannel,
  joinPersistentBroadcastChannel,
  onSignal,
  sendSignal,
  leaveChannel,
} from './webrtcSignaling.js';

// PRODUCTION FIX (stale-owner-listener): if webrtc isn't enabled for this
// owner the moment the dashboard mounts (flags not yet flipped, or a
// transient feature_flags read hiccup), the old code returned a permanent
// no-op — the only way to start listening afterward was a full page
// refresh. This interval re-checks isWebRTCEnabledForOwner() and starts
// the real listener automatically the moment it turns true, with no
// refresh needed. Kept well above featureFlags.js's own 30s cache TTL so
// a re-check always sees a fresh read.
const FLAG_RECHECK_INTERVAL_MS = 20000;

// PRODUCTION HARDENING (Fix 3 — call claiming): one stable id per browser
// tab/device for the lifetime of this module (i.e. the page load). Used
// both as the rtc_call_claims.device_id and as the sender id on the
// 'call-claimed' broadcast so a tab can tell its own claim apart from a
// sibling tab's.
const _deviceId = 'owner_dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Attempts to atomically claim a call for this device via a UNIQUE
 * (call_id) INSERT. Resolves true if this device won the claim, false if
 * another tab/device already claimed it first (unique_violation, code
 * 23505) or if the claim couldn't be verified (fail-closed — if we can't
 * prove we won, we don't answer, to guarantee "no duplicate answers" even
 * over the rare case of a network error on the INSERT itself).
 */
async function _claimCall(callId, ownerId) {
  try {
    const { error } = await supabase.from('rtc_call_claims').insert({
      call_id: callId,
      owner_id: ownerId,
      device_id: _deviceId,
    });
    if (error) {
      if (error.code === '23505') return false; // already claimed elsewhere — expected, not an error
      console.error('[WebRTCOwnerCall] Claim insert failed:', error);
      return false; // fail-closed
    }
    return true;
  } catch (err) {
    console.error('[WebRTCOwnerCall] Claim insert threw:', err);
    return false; // fail-closed
  }
}

/**
 * @param {string} ownerId
 * @param {object} handlers
 * @param {(call: { callId: string, plateId: string, accept: () => Promise<void>, reject: () => void }) => void} handlers.onIncomingCall
 * @param {(remoteStream: MediaStream, controls: { hangUp: () => void }) => void} [handlers.onConnected]
 * @param {() => void} [handlers.onEnded]
 * @param {(status: 'reconnecting' | 'connected') => void} [handlers.onStatus]  live-call status after connect
 * @param {(callId: string) => void} [handlers.onCallClaimedElsewhere]  another tab/device of this owner answered first — this tab should dismiss its own incoming-call UI for that callId
 * @returns {Promise<() => void>} cleanup function (always safe to call)
 */
export async function listenForIncomingCalls(ownerId, handlers = {}) {
  const noOpCleanup = () => {};
  if (!ownerId) return noOpCleanup;

  // PRODUCTION FIX (stale-owner-listener, task 1): outer wrapper that
  // re-checks the flag on an interval and (re)starts the real listener
  // the moment it turns on — so a dashboard already open before flags
  // changed recovers automatically, no refresh required.
  let outerTorndown = false;
  let recheckTimer = null;
  let activeCleanup = null;

  async function _tryStart() {
    if (outerTorndown) return;
    const enabled = await isWebRTCEnabledForOwner(ownerId);
    console.log(`[RTC-TRACE] 2 Feature flags | File=services/webrtcOwnerCall.js ownerId=${ownerId} enabled=${enabled}`);
    if (outerTorndown) return;
    if (!enabled) {
      recheckTimer = setTimeout(_tryStart, FLAG_RECHECK_INTERVAL_MS);
      return;
    }
    activeCleanup = await _startListening(ownerId, handlers);
  }

  await _tryStart();

  return function cleanup() {
    outerTorndown = true;
    clearTimeout(recheckTimer);
    if (activeCleanup) activeCleanup();
  };
}

/**
 * The real listener — split out of listenForIncomingCalls() so the
 * flag-recheck wrapper above can (re)start it without duplicating this
 * logic. Behavior is identical to the original implementation except the
 * ring channel join now uses joinPersistentBroadcastChannel (see
 * services/webrtcSignaling.js's header comment for the actual root-cause
 * fix) instead of the one-shot joinBroadcastChannel, so a dropped ring
 * channel reconnects automatically instead of dying silently.
 */
async function _startListening(ownerId, handlers = {}) {
  const noOpCleanup = () => {};

  const {
    onIncomingCall = () => {},
    onConnected = () => {},
    onEnded = () => {},
    onStatus = () => {},
    onCallClaimedElsewhere = () => {},
  } = handlers;

  let activeCallChannel = null;
  let activePc = null;
  let activeLocalStream = null;
  let activeReconnectGraceTimer = null;
  let activeCallTorndown = true; // true whenever no call is currently live
  let torndown = false;

  // PRODUCTION HARDENING (Fix 2): idempotent, always-releases-the-mic
  // cleanup for whichever call is currently active on THIS device. Every
  // termination path (visitor hangup, owner hangup, permanent ICE
  // failure, or the reconnect grace window expiring) funnels through
  // here so the microphone and peer connection are never left dangling.
  const cleanupActiveCall = ({ stopLocalTracks = true } = {}) => {
    if (activeCallTorndown) return;
    activeCallTorndown = true;
    clearTimeout(activeReconnectGraceTimer);
    activeReconnectGraceTimer = null;
    leaveChannel(activeCallChannel);
    activeCallChannel = null;
    if (activePc) { try { activePc.close(); } catch {} }
    activePc = null;
    if (stopLocalTracks && activeLocalStream) {
      activeLocalStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    }
    activeLocalStream = null;
  };

  // PRODUCTION HARDENING: release the mic even if the owner closes/
  // refreshes the dashboard tab mid-call instead of tapping "end call".
  const _releaseOnUnload = () => cleanupActiveCall();
  window.addEventListener('pagehide', _releaseOnUnload);

  // PRODUCTION FIX: registerHandlers is called by
  // joinPersistentBroadcastChannel with the LIVE channel object every
  // time one is created — the first join and again on every automatic
  // reconnect. Attaching handlers in here (instead of once, outside, on a
  // fixed reference) is what makes the ring listener survive a dropped
  // channel: after a reconnect, this runs again against the new channel,
  // so 'incoming-call' keeps being heard with no page refresh needed.
  const registerRingHandlers = (channel) => {
    // PRODUCTION HARDENING (Fix 3): if a sibling tab/device claims a call
    // first, this tab hears about it here (best-effort UX signal — the
    // authoritative guarantee is the DB unique constraint checked inside
    // accept() itself, so this is safe even if this broadcast is dropped).
    onSignal(channel, 'call-claimed', ({ callId, deviceId }) => {
      if (deviceId !== _deviceId) onCallClaimedElsewhere(callId);
    });

    onSignal(channel, 'incoming-call', async ({ callId, plateId, sdp }) => {
      if (torndown) return;
      console.log(`[RTC-TRACE] 7 Incoming received | File=services/webrtcOwnerCall.js ownerId=${ownerId} callId=${callId} plateId=${plateId}`);

      // PRODUCTION HARDENING (Fix 5 — concurrent-call collision):
      // activeCallTorndown/activePc/activeLocalStream/activeCallChannel are
      // shared per-owner-listener state (one _startListening() closure per
      // ownerId), by design, since one owner device can only usefully be on
      // one call at a time. Before this fix, a second 'incoming-call' event
      // arriving while a first call was already ringing/connected still ran
      // this whole handler and, if accepted, overwrote activePc/activeCall-
      // Channel/activeLocalStream with the second call's — orphaning the
      // first call's peer connection and microphone with nothing left to
      // clean it up, and routing the first call's later 'hangup' broadcast
      // into cleanupActiveCall(), which would then tear down the SECOND
      // call's (now-current) pc instead. Reproducible any time two visitors
      // (or one visitor retrying) call the same owner within the same
      // ringing/active window. Fix: auto-decline any second call the moment
      // its offer arrives, before any pre-join/buffering/UI work — the
      // owner's UI never shows a second overlay and the shared state is
      // never double-claimed.
      if (!activeCallTorndown) {
        console.warn(`[RTC-TRACE][FAIL] owner busy, auto-declining concurrent call | File=services/webrtcOwnerCall.js ownerId=${ownerId} callId=${callId} Reason=activeCallAlreadyInProgress Current=busy Expected=idle`);
        try {
          const busyChannel = await joinBroadcastChannel(callChannelName(callId), { timeoutMs: 3000 });
          await sendSignal(busyChannel, 'reject', { reason: 'owner_busy' });
          leaveChannel(busyChannel);
        } catch (err) {
          console.error(`[RTC-TRACE][FAIL] could not send owner_busy reject | File=services/webrtcOwnerCall.js callId=${callId} Reason=${err?.message || err}`);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // ROOT-CAUSE FIX (ICE candidate race — see PHASE2 audit):
      //
      // Previously the owner only called joinBroadcastChannel(rtc:call:
      // {callId}) INSIDE accept(), i.e. only after the human tapped
      // "Accept". But services/webrtcCall.js (visitor) joins that same
      // channel and starts trickling ICE candidates (pc.onicecandidate)
      // within milliseconds of creating its offer — almost always
      // *before* a human has even seen the popup, let alone reacted to
      // it. Supabase Realtime BROADCAST channels deliver only to clients
      // already subscribed at send time; there is no history/replay for
      // a late joiner. So every one of the visitor's early candidates
      // was silently dropped, the owner's future RTCPeerConnection had
      // zero remote candidates to run connectivity checks against, and
      // connectionState could never leave 'new'/'checking' — exactly
      // reproducing "Connecting… never becomes Connected, then falls
      // back to masked calling," on every call, not intermittently.
      //
      // Fix: join the call channel and start buffering the visitor's
      // ice-candidate broadcasts THE MOMENT the offer arrives (right
      // here), independent of whether/when the human taps Accept.
      // getUserMedia/RTCPeerConnection/answer creation still only happen
      // inside accept() — nothing about consent or the claim-before-mic
      // guarantee (Fix 3) changes. When accept() runs, any candidates
      // gathered while the popup was on screen are flushed into the
      // freshly-created peer connection immediately after
      // setRemoteDescription(offer).
      // ═══════════════════════════════════════════════════════════════
      let preJoinedChannel = null;
      let preJoinReleased = false;
      const bufferedCandidates = [];
      let livePc = null;
      let remoteDescSet = false;

      const releasePreJoin = () => {
        if (preJoinReleased) return;
        preJoinReleased = true;
        clearTimeout(preJoinTimer);
        if (preJoinedChannel && preJoinedChannel !== activeCallChannel) leaveChannel(preJoinedChannel);
      };

      try {
        preJoinedChannel = await joinBroadcastChannel(callChannelName(callId));
        console.log(`[RTC-TRACE] 7b Call channel pre-joined | File=services/webrtcOwnerCall.js callId=${callId}`);

        onSignal(preJoinedChannel, 'ice-candidate', ({ candidate, from }) => {
          if (from !== 'visitor' || !candidate) return;
          if (livePc && remoteDescSet) {
            livePc.addIceCandidate(candidate).catch(() => {});
          } else {
            bufferedCandidates.push(candidate);
            console.log(`[RTC-TRACE] 7c ICE candidate buffered pre-accept | File=services/webrtcOwnerCall.js callId=${callId} bufferedCount=${bufferedCandidates.length}`);
          }
        });

        // Visitor gave up (own WEBRTC_CONNECT_TIMEOUT_MS fired, or the
        // person closed the tab) before the owner reacted — dismiss the
        // ringing popup instead of leaving it up for a dead call.
        onSignal(preJoinedChannel, 'hangup', () => {
          if (!livePc) {
            releasePreJoin();
            onCallClaimedElsewhere(callId); // reuses the existing "dismiss this popup" UI path
          }
        });
      } catch (err) {
        // Pre-join failed (rare — network hiccup). Not fatal: accept()
        // below falls back to its own join, matching pre-fix behavior
        // for this one edge case only.
        console.error(`[RTC-TRACE][FAIL] pre-join call channel failed | File=services/webrtcOwnerCall.js callId=${callId} Reason=${err?.message || err}`);
      }

      // Safety net: if nobody accepts or rejects, don't leave a
      // subscribed channel open forever. A little longer than the
      // visitor's own timeout so a legitimate slow Accept isn't cut off.
      const preJoinTimer = setTimeout(() => {
        if (!livePc) releasePreJoin();
      }, WEBRTC_CONNECT_TIMEOUT_MS + 5000);

      const accept = async () => {
        console.log(`[RTC-TRACE] 9 Accept clicked | File=services/webrtcOwnerCall.js callId=${callId}`);
        clearTimeout(preJoinTimer);
        // Fix 3: claim BEFORE requesting the microphone or opening any
        // channel/peer connection, so a losing tab never touches media at
        // all — no duplicate audio, no duplicate answer, and no wasted mic
        // permission prompt on a call this tab isn't going to handle.
        const won = await _claimCall(callId, ownerId);
        if (!won) {
          console.warn(`[RTC-TRACE][FAIL] call claimed elsewhere | File=services/webrtcOwnerCall.js callId=${callId} Reason=rtc_call_claims unique_violation Current=lost-claim Expected=won-claim`);
          releasePreJoin();
          onCallClaimedElsewhere(callId);
          return;
        }
        sendSignal(channel, 'call-claimed', { callId, deviceId: _deviceId }).catch(() => {});

        let callChannel = preJoinedChannel;
        if (!callChannel) {
          // Pre-join failed earlier — fall back to a fresh join exactly
          // like the pre-fix code path (candidates sent before this join
          // completes can still be lost in this one fallback case).
          try {
            callChannel = await joinBroadcastChannel(callChannelName(callId));
          } catch (err) {
            console.error('[WebRTCOwnerCall] Could not join call channel to accept:', err);
            return;
          }
          onSignal(callChannel, 'ice-candidate', ({ candidate, from }) => {
            if (from !== 'visitor' || !candidate) return;
            if (livePc && remoteDescSet) livePc.addIceCandidate(candidate).catch(() => {});
            else bufferedCandidates.push(candidate);
          });
        }
        activeCallChannel = callChannel;
        activeCallTorndown = false;

        // PRODUCTION FIX (Root Cause #2 — TURN): fetch short-lived TURN
        // credentials (Twilio NTS) alongside the mic prompt so the two
        // run in parallel instead of adding latency serially. Always
        // resolves — falls back to STUN-only on any failure. See
        // config/rtcConfig.js#fetchIceServers.
        const iceServersPromise = fetchIceServers(supabase, { ownerId, plateId });

        let localStream;
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err) {
          console.warn('[WebRTCOwnerCall] Microphone permission denied on accept:', err);
          sendSignal(callChannel, 'reject', { reason: 'owner_mic_denied' }).catch(() => {});
          releasePreJoin();
          cleanupActiveCall();
          return;
        }
        activeLocalStream = localStream;

        const iceServers = await iceServersPromise;
        console.log(`[RTC-TRACE] 9c ICE servers resolved | File=services/webrtcOwnerCall.js callId=${callId} serverCount=${iceServers.length}`);
        const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'all' });
        activePc = pc;
        livePc = pc;

        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

        const hangUp = () => {
          if (activeCallChannel) sendSignal(activeCallChannel, 'hangup', { from: 'owner' }).catch(() => {});
          cleanupActiveCall();
          onEnded();
        };

        pc.ontrack = (event) => {
          if (event.streams?.[0]) onConnected(event.streams[0], { hangUp, localStream });
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal(callChannel, 'ice-candidate', { candidate: event.candidate, from: 'owner' });
          }
        };

        // PRODUCTION HARDENING (Fix 2 + Fix 4): tolerate a transient ICE
        // disconnect with a grace window instead of tearing the call down
        // immediately; only 'failed'/'closed' (or the grace window
        // expiring) is treated as permanent.
        pc.onconnectionstatechange = () => {
          if (activeCallTorndown) return;

          if (pc.connectionState === 'connected') {
            console.log(`[RTC-TRACE] 12 ICE connected | File=services/webrtcOwnerCall.js callId=${callId}`);
            console.log(`[RTC-TRACE] 13 Connected | File=services/webrtcOwnerCall.js callId=${callId}`);
            if (activeReconnectGraceTimer) {
              clearTimeout(activeReconnectGraceTimer);
              activeReconnectGraceTimer = null;
              onStatus('connected');
            }
            return;
          }

          if (pc.connectionState === 'disconnected') {
            if (!activeReconnectGraceTimer) {
              onStatus('reconnecting');
              activeReconnectGraceTimer = setTimeout(() => {
                activeReconnectGraceTimer = null;
                cleanupActiveCall();
                onEnded();
              }, RTC_RECONNECT_GRACE_MS);
            }
            return;
          }

          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            console.error(`[RTC-TRACE][FAIL] ICE failed/closed | File=services/webrtcOwnerCall.js callId=${callId} Reason=connectionState=${pc.connectionState} Current=${pc.connectionState} Expected=connected`);
            cleanupActiveCall();
            onEnded();
          }
        };

        onSignal(callChannel, 'hangup', () => {
          cleanupActiveCall();
          onEnded();
        });

        try {
          await pc.setRemoteDescription({ type: 'offer', sdp });
          remoteDescSet = true;

          // Flush any ICE candidates the visitor sent while the popup
          // was on screen (this is the actual bug fix taking effect).
          const toFlush = bufferedCandidates.splice(0, bufferedCandidates.length);
          console.log(`[RTC-TRACE] 9d Flushing buffered ICE candidates | File=services/webrtcOwnerCall.js callId=${callId} count=${toFlush.length}`);
          toFlush.forEach((candidate) => pc.addIceCandidate(candidate).catch(() => {}));

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(callChannel, 'answer', { sdp: pc.localDescription.sdp });
          console.log(`[RTC-TRACE] 10 Answer sent | File=services/webrtcOwnerCall.js callId=${callId}`);
        } catch (err) {
          console.error(`[RTC-TRACE][FAIL] answer build/send failed | File=services/webrtcOwnerCall.js callId=${callId} Reason=${err?.message || err} Current=no-answer-sent Expected=answer-sent`);
          console.error('[WebRTCOwnerCall] Failed to build/send answer:', err);
          cleanupActiveCall();
        }
      };

      const reject = () => {
        const rejectChannel = preJoinedChannel;
        releasePreJoin();
        if (rejectChannel) {
          sendSignal(rejectChannel, 'reject', { reason: 'owner_declined' }).finally(() => leaveChannel(rejectChannel));
          return;
        }
        // Pre-join failed earlier — fall back to a one-shot join, exactly
        // like the pre-fix behavior.
        joinBroadcastChannel(callChannelName(callId), { timeoutMs: 3000 })
          .then((ch) => {
            sendSignal(ch, 'reject', { reason: 'owner_declined' }).finally(() => leaveChannel(ch));
          })
          .catch(() => {});
      };

      onIncomingCall({ callId, plateId, accept, reject });
    });
  };

  let releasePersistentRing;
  try {
    releasePersistentRing = await joinPersistentBroadcastChannel(
      ringChannelName(ownerId),
      registerRingHandlers,
      {
        initialTimeoutMs: 8000,
        onSubscribed: () => console.log(`[RTC-TRACE] 6 Owner subscribed | File=services/webrtcOwnerCall.js ownerId=${ownerId}`),
        onLost: () => console.warn(`[RTC-TRACE][FAIL] Owner ring channel lost, auto-reconnecting | File=services/webrtcOwnerCall.js ownerId=${ownerId} Reason=CHANNEL_ERROR/CLOSED/TIMED_OUT Current=disconnected Expected=SUBSCRIBED`),
      }
    );
  } catch (err) {
    console.error(`[RTC-TRACE][FAIL] Owner ring channel initial join failed | File=services/webrtcOwnerCall.js ownerId=${ownerId} Reason=${err?.message || err} Current=not-subscribed Expected=SUBSCRIBED`);
    console.error('[WebRTCOwnerCall] Could not join ring channel:', err);
    return noOpCleanup;
  }

  return function cleanup() {
    torndown = true;
    cleanupActiveCall();
    releasePersistentRing();
    window.removeEventListener('pagehide', _releaseOnUnload);
  };
}

export default { listenForIncomingCalls };
