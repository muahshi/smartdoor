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
 */

import { supabase } from './supabase.js';

export function ringChannelName(ownerId) {
  return `rtc:ring:${ownerId}`;
}

export function callChannelName(callId) {
  return `rtc:call:${callId}`;
}

/**
 * Joins a broadcast channel and resolves once SUBSCRIBED (or rejects on
 * timeout), so callers never broadcast into a channel that isn't ready
 * yet — a broadcast sent before SUBSCRIBED is silently dropped by
 * Supabase Realtime.
 */
export function joinBroadcastChannel(channelName, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: false } },
    });

    const timer = setTimeout(() => {
      try { supabase.removeChannel(channel); } catch {}
      reject(new Error('Signaling channel join timed out'));
    }, timeoutMs);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        try { supabase.removeChannel(channel); } catch {}
        reject(new Error(`Signaling channel failed: ${status}`));
      }
    });
  });
}

/** Registers a handler for one broadcast event name on an already-joined channel. */
export function onSignal(channel, event, handler) {
  channel.on('broadcast', { event }, ({ payload }) => handler(payload));
}

/** Sends one broadcast event. Safe to call repeatedly (e.g. per ICE candidate). */
export async function sendSignal(channel, event, payload) {
  try {
    await channel.send({ type: 'broadcast', event, payload });
  } catch (err) {
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
  onSignal,
  sendSignal,
  leaveChannel,
};
