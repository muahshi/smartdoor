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
 * KNOWN LIMITATION (documented, not a blocker — see PHASE2 audit report):
 * config/rtcConfig.js#getIceServers() is STUN-only today; the TURN
 * credential-issuing Edge Function is explicitly Phase 4, not built yet.
 * Visitors/owners behind symmetric NATs or restrictive corporate
 * firewalls may fail ICE connectivity even when both parties are online.
 * This is safe by design: an ICE failure is just another reason code
 * that makes attemptTapToTalk() resolve `{ attempted: true, connected:
 * false }`, and the existing masked-call fallback fires exactly as it
 * would for a timeout.
 */

import { getOwnerPresenceSnapshot } from './presence.js';
import { isWebRTCEnabledForOwner } from './featureFlags.js';
import { getIceServers, WEBRTC_CONNECT_TIMEOUT_MS, RTC_MONITORING_EVENTS } from '../config/rtcConfig.js';
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

  const enabled = await isWebRTCEnabledForOwner(ownerId);
  if (!enabled) return { attempted: false, connected: false, reason: 'flag_off' };

  const presence = await getOwnerPresenceSnapshot(ownerId);
  if (!presence.online) {
    await _logAttempt(ownerId, plateId, null, RTC_MONITORING_EVENTS.RTC_OWNER_OFFLINE_SKIP, true);
    return { attempted: false, connected: false, reason: 'owner_offline' };
  }

  let localStream = null;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.warn('[WebRTCCall] Microphone permission denied or unavailable:', err);
    await _logAttempt(ownerId, plateId, null, RTC_MONITORING_EVENTS.RTC_PERMISSION_DENIED, true);
    return { attempted: false, connected: false, reason: 'mic_denied' };
  }

  const callId = crypto.randomUUID();
  const pc = new RTCPeerConnection({
    iceServers: getIceServers(),
    iceTransportPolicy: 'all',
  });

  let callChannel = null;
  let settled = false;
  let timeoutTimer = null;
  let connected = false;

  const cleanup = ({ stopLocalTracks = true } = {}) => {
    clearTimeout(timeoutTimer);
    leaveChannel(callChannel);
    callChannel = null;
    try { pc.close(); } catch {}
    if (stopLocalTracks) {
      localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    }
  };

  const endCall = () => {
    if (callChannel) sendSignal(callChannel, 'hangup', { from: 'visitor' }).catch(() => {});
    cleanup();
    onStatus('ended');
  };

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

    pc.onconnectionstatechange = () => {
      if (settled) return;
      if (pc.connectionState === 'connected') {
        connected = true;
        onStatus('connected');
        finish({ connected: true, outcome: RTC_MONITORING_EVENTS.RTC_CONNECTED });
      } else if (pc.connectionState === 'failed') {
        finish({ connected: false, reason: 'ice_failed', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
      } else if ((pc.connectionState === 'disconnected' || pc.connectionState === 'closed') && connected) {
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
      } catch (err) {
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
      await sendSignal(ringChannel, 'incoming-call', {
        callId,
        plateId,
        sdp: pc.localDescription.sdp,
      });
      leaveChannel(ringChannel); // one-shot notify — the per-call channel carries the rest
      onStatus('ringing');
    } catch (err) {
      console.error('[WebRTCCall] Could not reach owner ring channel:', err);
      finish({ connected: false, reason: 'signaling_unavailable', outcome: RTC_MONITORING_EVENTS.RTC_ICE_FAILED });
      return;
    }

    timeoutTimer = setTimeout(() => {
      finish({ connected: false, reason: 'timeout', outcome: RTC_MONITORING_EVENTS.RTC_TIMEOUT_FALLBACK });
    }, WEBRTC_CONNECT_TIMEOUT_MS);
  });
}

export default { attemptTapToTalk };
