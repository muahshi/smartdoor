/**
 * Smart Door — WebRTC Tap to Talk (Phase 2, Visitor Side)
 * services/webrtcCall.js
 *
 * Implements ONLY the WebRTC attempt: presence check → mic capture →
 * peer connection → offer/answer/ICE via services/webrtcSignaling.js →
 * either "connected" or a reason to fall back. It NEVER calls
 * initiateMaskedCall() itself and never touches call_logs — the caller
 * (visitor.html's existing btn-call handler) decides what to do with the
 * result, exactly per the approved architecture: masked calling is
 * reused as-is, unmodified, as the fallback path only.
 *
 * Guarded the same way services/presence.js is: if WebRTC isn't enabled
 * for this owner (kill switch / global flag / per-owner opt-in — see
 * services/featureFlags.js), attemptTapToTalk() resolves immediately
 * with `{ attempted: false }` and never opens a channel, requests the
 * microphone, or creates a peer connection. Existing visitors experience
 * zero behavioral change until an owner is explicitly opted in.
 *
 * PRODUCTION FIX (was: KNOWN LIMITATION — STUN-only): TURN credentials
 * are now fetched via config/rtcConfig.js#fetchIceServers() (Twilio NTS,
 * supabase/functions/get-turn-credentials), so visitors/owners behind
 * symmetric NATs or CGNAT (the common case on Indian mobile carriers)
 * can still establish a relayed path. If TURN credentials can't be
 * fetched for any reason, this fails open to STUN-only exactly as
 * before — an ICE failure is just another reason code that makes
 * attemptTapToTalk() resolve `{ attempted: true, connected: false }`,
 * and the existing masked-call fallback fires exactly as it would for a
 * timeout.
 */

import { getOwnerPresenceSnapshot } from './presence.js';
import { isWebRTCEnabledForOwner } from './featureFlags.js';
import {
  fetchIceServers,
  WEBRTC_CONNECT_TIMEOUT_MS,
  RTC_RECONNECT_GRACE_MS,
  RTC_MONITORING_EVENTS,
} from '../config/rtcConfig.js';
import {
  ringChannelName,
  callChannelName,
  joinBroadcastChannel,
  onSignal,
  sendSignal,
  leaveChannel,
} from './webrtcSignaling.js';
import { supabase } from './supabase.js';

// Fail-silent outcome log — never blocks or throws into the caller.
// Mirrors services/presence.js#_logPresenceEvent's trust model exactly.
async function _logAttempt(ownerId, plateId, callId, outcome, fallbackTriggered) {
  try {
    await supabase.from('rtc_call_attempts').insert({
      owner_id: ownerId,
      plate_id: plateId,
      call_id: callId,
      outcome,
      fallback_triggered: fallbackTriggered,
    });
  } catch {
    // Non-critical — never block the call flow on logging.
  }
}

/**
 * Attempts a WebRTC Tap to Talk call. Resolves once the outcome is known
 * (connected, or a reason to fall back to masked calling) — never
 * rejects, so the caller's existing try/then flow doesn't need a catch
 * just for this.
 *
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {HTMLAudioElement} params.remoteAudioEl  element to attach the owner's remote audio stream to
 * @param {(status: string) => void} [params.onStatus]  optional UI callback: 'connecting' | 'ringing' | 'connected' | 'ended'
 * @returns {Promise<{
 *   attempted: boolean,
 *   connected: boolean,
 *   reason?: string,
 *   callId?: string,
 *   endCall?: () => void,
 * }>}
 */
export async function attemptTapToTalk({ ownerId, plateId, remoteAudioEl, onStatus = () => {} }) {
  if (!ownerId || !plateId) return { attempted: false, connected: false, reason: 'missing_params' };
  console.log(`[RTC-TRACE] 1 Visitor starts call | File=services/webrtcCall.js ownerId=${ownerId} plateId=${plateId}`);

  const enabled = await isWebRTCEnabledForOwner(ownerId);
  console.log(`[RTC-TRACE] 2 Feature flags | File=services/webrtcCall.js ownerId=${ownerId} enabled=${enabled}`);
  if (!enabled) return { attempted: false, connected: false, reason: 'flag_off' };

  const presence = await getOwnerPresenceSnapshot(ownerId);
  console.log(`[RTC-TRACE] 3 Presence | File=services/webrtcCall.js ownerId=${ownerId} online=${presence.online} deviceCount=${presence.deviceCount}`);
  if (!presence.online) {
    console.warn(`[RTC-TRACE][FAIL] owner offline | File=services/webrtcCall.js ownerId=${ownerId} Reason=no presence tracked on presence:owner:${ownerId} Current=offline Expected=online`);
    await _logAttempt(ownerId, plateId, null, RTC_MONITORING_EVENTS.RTC_OWNER_OFFLINE_SKIP, true);
    return { attempted: false, connected: false, reason: 'owner_offline' };
  }

  let localStream = null;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.warn(`[RTC-TRACE][FAIL] mic denied | File=services/webrtcCall.js ownerId=${ownerId} Reason=${err?.message || err} Current=no-mic-access Expected=mic-granted`);
    console.warn('[WebRTCCall] Microphone permission denied or unavailable:', err);
    await _logAttempt(ownerId, plateId, null, RTC_MONITORING_EVENTS.RTC_PERMISSION_DENIED, true);
    return { attempted: false, connected: false, reason: 'mic_denied' };
  }

  const callId = crypto.randomUUID();
  // PRODUCTION FIX (Root Cause #2 — TURN): fetch short-lived TURN
  // credentials (Twilio NTS) in addition to STUN. Never blocks longer
  // than ~2.5s and always falls back to STUN-only on any failure — see
  // config/rtcConfig.js#fetchIceServers for the fail-open contract.
  const iceServers = await fetchIceServers(supabase, { ownerId, plateId });
  console.log(`[RTC-TRACE] 3b ICE servers resolved | File=services/webrtcCall.js callId=${callId} serverCount=${iceServers.length}`);
  const pc = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: 'all',
  });

  let callChannel = null;
  let settled = false;
  let timeoutTimer = null;
  let reconnectGraceTimer = null;
  let connected = false;
  let torndown = false; // PRODUCTION HARDENING: guarantees cleanup runs exactly once on any exit path

  // PRODUCTION HARDENING (Fix 2): idempotent, always-releases-the-mic
  // cleanup. Every termination path (timeout, reject, ICE failure, user
  // hangup, or a post-connect permanent disconnect) funnels through this
  // single function so the microphone is never left open and the peer
  // connection/channel are never left dangling — regardless of which path
  // triggered the end of the call.
  const cleanup = ({ stopLocalTracks = true } = {}) => {
    if (torndown) return;
    torndown = true;
    clearTimeout(timeoutTimer);
    clearTimeout(reconnectGraceTimer);
    leaveChannel(callChannel);
    callChannel = null;
    try { pc.close(); } catch {}
    if (stopLocalTracks) {
      localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    }
    window.removeEventListener('pagehide', _releaseOnUnload);
  };

  const endCall = () => {
    if (callChannel) sendSignal(callChannel, 'hangup', { from: 'visitor' }).catch(() => {});
    cleanup();
    onStatus('ended');
  };

  // PRODUCTION HARDENING: release the mic even if the visitor closes/
  // refreshes the tab mid-call instead of tapping "end call".
  const _releaseOnUnload = () => cleanup();
  window.addEventListener('pagehide', _releaseOnUnload, { once: true });

  return new Promise(async (resolve) => {
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (!result.connected) {
        cleanup();
      }
      await _logAttempt(ownerId, plateId, callId, result.outcome, !result.connected);
      resolve({
        attempted: true,
        connected: result.connected,
        reason: result.reason,
        callId,
        endCall: result.connected ? endCall : undefined,
      });
    };

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      if (remoteAudioEl && event.streams?.[0]) {
        remoteAudioEl.srcObject = event.streams[0];
        remoteAudioEl.play().catch(() => {});
      }
    };

    // PRODUCTION HARDENING (Fix 2 + Fix 4): once `finish()` has already
    // resolved the outer promise as connected, this handler is the ONLY
    // thing watching the live call. It must (a) tolerate a transient ICE
    // disconnect without tearing the call down immediately, and (b)
    // guarantee full cleanup — including releasing the microphone — the
    // moment the disconnect turns out to be permanent, so the visitor UI
    // never gets stuck in a "connected" state that's actually dead.
    pc.onconnectionstatechange = () => {
      if (!settled) {
        // Pre-connect phase — unchanged behavior.
        if (pc.connectionState === 'connected') {
          connected = true;
          console.log(`[RTC-TRACE] 12 ICE connected | File=services/webrtcCall.js callId=${callId}`);
          console.log(`[RTC-TRACE] 13 Connected | File=services/webrtcCall.js callId=${callId}`);
          onStatus('connected');
          finish({ connected: true, outcome: RTC_MONITORING_EVENTS.RTC_CONNECTED });
        } else if (pc.connectionState === 'failed') {
          console.error(`[RTC-TRACE][FAIL] ICE failed | File=services/webrtcCall.js callId=${callId} Reason=connectionState=failed Current=failed Expected=connected`);
          finish({ connected: false, reason: 'ice_failed', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
        }
        return;
      }

      // Post-connect phase (settled === true, connected === true).
      if (!connected || torndown) return;

      if (pc.connectionState === 'connected') {
        // Recovered — cancel any pending grace-window teardown.
        if (reconnectGraceTimer) {
          clearTimeout(reconnectGraceTimer);
          reconnectGraceTimer = null;
          onStatus('connected'); // RTC_RECONNECTED — back to a live call
        }
        return;
      }

      if (pc.connectionState === 'disconnected') {
        // Transient — start (or leave running) a grace window instead of
        // tearing down immediately. Most 'disconnected' states self-heal
        // within a few seconds as ICE renegotiates.
        if (!reconnectGraceTimer) {
          onStatus('reconnecting');
          reconnectGraceTimer = setTimeout(() => {
            reconnectGraceTimer = null;
            cleanup();
            onStatus('ended');
          }, RTC_RECONNECT_GRACE_MS);
        }
        return;
      }

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Permanent — clean up immediately, don't wait out the grace window.
        cleanup();
        onStatus('ended');
      }
    };

    try {
      callChannel = await joinBroadcastChannel(callChannelName(callId));
    } catch (err) {
      console.error('[WebRTCCall] Could not join signaling channel:', err);
      finish({ connected: false, reason: 'signaling_unavailable', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
      return;
    }

    onSignal(callChannel, 'answer', async ({ sdp }) => {
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp });
        console.log(`[RTC-TRACE] 11 Answer received | File=services/webrtcCall.js callId=${callId}`);
      } catch (err) {
        console.error(`[RTC-TRACE][FAIL] setRemoteDescription(answer) failed | File=services/webrtcCall.js callId=${callId} Reason=${err?.message || err} Current=no-remote-desc Expected=answer-applied`);
        console.error('[WebRTCCall] setRemoteDescription(answer) failed:', err);
        finish({ connected: false, reason: 'ice_failed', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
      }
    });

    onSignal(callChannel, 'ice-candidate', ({ candidate, from }) => {
      if (from !== 'owner' || !candidate) return;
      pc.addIceCandidate(candidate).catch(() => {
        // Non-fatal — a stray/late candidate failing to add doesn't
        // necessarily doom the connection; onconnectionstatechange is
        // the source of truth for overall success/failure.
      });
    });

    onSignal(callChannel, 'reject', () => {
      finish({ connected: false, reason: 'owner_rejected', outcome: RTC_MONITORING_EVENTS.RTC_OWNER_REJECTED });
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && callChannel) {
        sendSignal(callChannel, 'ice-candidate', { candidate: event.candidate, from: 'visitor' });
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    } catch (err) {
      console.error('[WebRTCCall] createOffer/setLocalDescription failed:', err);
      finish({ connected: false, reason: 'offer_failed', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
      return;
    }

    onStatus('connecting');

    let ringChannel;
    try {
      ringChannel = await joinBroadcastChannel(ringChannelName(ownerId), { timeoutMs: 3000 });
      console.log(`[RTC-TRACE] 4 Ring channel joined | File=services/webrtcCall.js ownerId=${ownerId} callId=${callId}`);
      await sendSignal(ringChannel, 'incoming-call', {
        callId,
        plateId,
        sdp: pc.localDescription.sdp,
      });
      console.log(`[RTC-TRACE] 5 Broadcast sent | File=services/webrtcCall.js ownerId=${ownerId} callId=${callId} event=incoming-call`);
      leaveChannel(ringChannel); // one-shot notify — the per-call channel carries the rest
      onStatus('ringing');
    } catch (err) {
      console.error(`[RTC-TRACE][FAIL] ring channel unreachable | File=services/webrtcCall.js ownerId=${ownerId} callId=${callId} Reason=${err?.message || err} Current=not-sent Expected=incoming-call-delivered`);
      console.error('[WebRTCCall] Could not reach owner ring channel:', err);
      finish({ connected: false, reason: 'signaling_unavailable', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
      return;
    }

    timeoutTimer = setTimeout(() => {
      console.warn(`[RTC-TRACE] 14 Timeout | File=services/webrtcCall.js callId=${callId} Reason=no-answer-within-${WEBRTC_CONNECT_TIMEOUT_MS}ms Current=not-connected Expected=connected`);
      finish({ connected: false, reason: 'timeout', outcome: RTC_MONITORING_EVENTS.RTC_TIMEOUT_FALLBACK });
    }, WEBRTC_CONNECT_TIMEOUT_MS);
  });
}

export default { attemptTapToTalk };
