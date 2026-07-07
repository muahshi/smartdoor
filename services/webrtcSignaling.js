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
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        try { supabase.removeChannel(channel); } catch {}
        reject(new Error(`Signaling channel failed: ${status}${err?.message ? ` (${err.message})` : ''}`));
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

