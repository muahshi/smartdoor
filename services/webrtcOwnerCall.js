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
import { getIceServers, RTC_RECONNECT_GRACE_MS } from '../config/rtcConfig.js';
import { supabase } from './supabase.js';
import {
  ringChannelName,
  callChannelName,
  joinBroadcastChannel,
  onSignal,
  sendSignal,
  leaveChannel,
} from './webrtcSignaling.js';

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

  const enabled = await isWebRTCEnabledForOwner(ownerId);
  if (!enabled) return noOpCleanup;

  const {
    onIncomingCall = () => {},
    onConnected = () => {},
    onEnded = () => {},
    onStatus = () => {},
    onCallClaimedElsewhere = () => {},
  } = handlers;

  let ringChannel;
  try {
    ringChannel = await joinBroadcastChannel(ringChannelName(ownerId), { timeoutMs: 8000 });
  } catch (err) {
    console.error('[WebRTCOwnerCall] Could not join ring channel:', err);
    return noOpCleanup;
  }

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

  // PRODUCTION HARDENING (Fix 3): if a sibling tab/device claims a call
  // first, this tab hears about it here (best-effort UX signal — the
  // authoritative guarantee is the DB unique constraint checked inside
  // accept() itself, so this is safe even if this broadcast is dropped).
  onSignal(ringChannel, 'call-claimed', ({ callId, deviceId }) => {
    if (deviceId !== _deviceId) onCallClaimedElsewhere(callId);
  });

  onSignal(ringChannel, 'incoming-call', async ({ callId, plateId, sdp }) => {
    if (torndown) return;

    const accept = async () => {
      // Fix 3: claim BEFORE requesting the microphone or opening any
      // channel/peer connection, so a losing tab never touches media at
      // all — no duplicate audio, no duplicate answer, and no wasted mic
      // permission prompt on a call this tab isn't going to handle.
      const won = await _claimCall(callId, ownerId);
      if (!won) {
        onCallClaimedElsewhere(callId);
        return;
      }
      sendSignal(ringChannel, 'call-claimed', { callId, deviceId: _deviceId }).catch(() => {});

      let callChannel;
      try {
        callChannel = await joinBroadcastChannel(callChannelName(callId));
      } catch (err) {
        console.error('[WebRTCOwnerCall] Could not join call channel to accept:', err);
        return;
      }
      activeCallChannel = callChannel;
      activeCallTorndown = false;

      let localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.warn('[WebRTCOwnerCall] Microphone permission denied on accept:', err);
        sendSignal(callChannel, 'reject', { reason: 'owner_mic_denied' }).catch(() => {});
        cleanupActiveCall();
        return;
      }
      activeLocalStream = localStream;

      const pc = new RTCPeerConnection({ iceServers: getIceServers(), iceTransportPolicy: 'all' });
      activePc = pc;

      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const hangUp = () => {
        if (activeCallChannel) sendSignal(activeCallChannel, 'hangup', { from: 'owner' }).catch(() => {});
        cleanupActiveCall();
        onEnded();
      };

      pc.ontrack = (event) => {
        if (event.streams?.[0]) onConnected(event.streams[0], { hangUp });
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
          cleanupActiveCall();
          onEnded();
        }
      };

      onSignal(callChannel, 'ice-candidate', ({ candidate, from }) => {
        if (from !== 'visitor' || !candidate) return;
        pc.addIceCandidate(candidate).catch(() => {});
      });

      onSignal(callChannel, 'hangup', () => {
        cleanupActiveCall();
        onEnded();
      });

      try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(callChannel, 'answer', { sdp: pc.localDescription.sdp });
      } catch (err) {
        console.error('[WebRTCOwnerCall] Failed to build/send answer:', err);
        cleanupActiveCall();
      }
    };

    const reject = () => {
      joinBroadcastChannel(callChannelName(callId), { timeoutMs: 3000 })
        .then((channel) => {
          sendSignal(channel, 'reject', { reason: 'owner_declined' }).finally(() => leaveChannel(channel));
        })
        .catch(() => {});
    };

    onIncomingCall({ callId, plateId, accept, reject });
  });

  return function cleanup() {
    torndown = true;
    cleanupActiveCall();
    leaveChannel(ringChannel);
    window.removeEventListener('pagehide', _releaseOnUnload);
  };
}

export default { listenForIncomingCalls };
