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
 */

import { isWebRTCEnabledForOwner } from './featureFlags.js';
import { getIceServers } from '../config/rtcConfig.js';
import {
  ringChannelName,
  callChannelName,
  joinBroadcastChannel,
  onSignal,
  sendSignal,
  leaveChannel,
} from './webrtcSignaling.js';

/**
 * @param {string} ownerId
 * @param {object} handlers
 * @param {(call: { callId: string, plateId: string, accept: () => Promise<void>, reject: () => void }) => void} handlers.onIncomingCall
 * @param {(remoteStream: MediaStream) => void} [handlers.onConnected]
 * @param {() => void} [handlers.onEnded]
 * @returns {Promise<() => void>} cleanup function (always safe to call)
 */
export async function listenForIncomingCalls(ownerId, handlers = {}) {
  const noOpCleanup = () => {};
  if (!ownerId) return noOpCleanup;

  const enabled = await isWebRTCEnabledForOwner(ownerId);
  if (!enabled) return noOpCleanup;

  const { onIncomingCall = () => {}, onConnected = () => {}, onEnded = () => {} } = handlers;

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
  let torndown = false;

  const cleanupActiveCall = ({ stopLocalTracks = true } = {}) => {
    leaveChannel(activeCallChannel);
    activeCallChannel = null;
    if (activePc) { try { activePc.close(); } catch {} }
    activePc = null;
    if (stopLocalTracks && activeLocalStream) {
      activeLocalStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    }
    activeLocalStream = null;
  };

  onSignal(ringChannel, 'incoming-call', async ({ callId, plateId, sdp }) => {
    if (torndown) return;

    const accept = async () => {
      let callChannel;
      try {
        callChannel = await joinBroadcastChannel(callChannelName(callId));
      } catch (err) {
        console.error('[WebRTCOwnerCall] Could not join call channel to accept:', err);
        return;
      }
      activeCallChannel = callChannel;

      let localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.warn('[WebRTCOwnerCall] Microphone permission denied on accept:', err);
        sendSignal(callChannel, 'reject', { reason: 'owner_mic_denied' }).catch(() => {});
        leaveChannel(callChannel);
        activeCallChannel = null;
        return;
      }
      activeLocalStream = localStream;

      const pc = new RTCPeerConnection({ iceServers: getIceServers(), iceTransportPolicy: 'all' });
      activePc = pc;

      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (event) => {
        if (event.streams?.[0]) onConnected(event.streams[0]);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(callChannel, 'ice-candidate', { candidate: event.candidate, from: 'owner' });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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
  };
}

export default { listenForIncomingCalls };
