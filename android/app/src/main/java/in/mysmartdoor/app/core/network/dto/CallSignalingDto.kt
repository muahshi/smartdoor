package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.Serializable

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * Wire-format DTOs for the two Supabase Realtime BROADCAST channels the
 * web app already uses for WebRTC signaling — see
 * `services/webrtcSignaling.js`, `services/webrtcCall.js` (visitor) and
 * `services/webrtcOwnerCall.js` (owner). This file does not introduce any
 * new signaling contract: channel names, event names, and payload shapes
 * below are copied verbatim from that existing, production code path so
 * the Android owner client speaks the exact same protocol the web owner
 * dashboard already does. No signaling table exists or is needed — these
 * are ephemeral broadcasts only, never persisted (see
 * `sql/39_webrtc_phase2_call_attempts.sql`'s header on the web side).
 *
 * Channel scopes (verbatim from `services/webrtcSignaling.js`):
 *  - RING channel `rtc:ring:{ownerId}` — long-lived per owner. Visitor
 *    broadcasts [EVENT_INCOMING_CALL] here.
 *  - CALL channel `rtc:call:{callId}` — short-lived per attempt. Used for
 *    [EVENT_ANSWER] / [EVENT_ICE_CANDIDATE] / [EVENT_REJECT] /
 *    [EVENT_HANGUP] / [EVENT_CALL_CLAIMED] once a specific call is
 *    underway.
 *
 * Both channels must be opened with Realtime's `private = true` config
 * (RLS-checked), matching the web app's Fix 1 hardening — see
 * `sql/40_webrtc_phase2_hardening.sql` policies `rtc_ring_receive_owner_only`,
 * `rtc_ring_send_visitor_and_owner`, `rtc_call_channel_participants`. This
 * file does not touch those policies; [in.mysmartdoor.app.core.data.CallRepository]
 * is responsible for setting that flag when it opens a channel.
 */

/** `rtc:ring:{ownerId}` */
fun ringChannelName(ownerId: String): String = "rtc:ring:$ownerId"

/** `rtc:call:{callId}` */
fun callChannelName(callId: String): String = "rtc:call:$callId"

/** Broadcast on the RING channel by the visitor when placing a Tap to Talk attempt. */
const val EVENT_INCOMING_CALL = "incoming-call"

/** Broadcast on the CALL channel by the owner once its SDP answer is ready. */
const val EVENT_ANSWER = "answer"

/** Broadcast on the CALL channel by either side as ICE candidates are gathered. */
const val EVENT_ICE_CANDIDATE = "ice-candidate"

/** Broadcast on the CALL/RING channel by the owner to decline (with a `reason`). */
const val EVENT_REJECT = "reject"

/** Broadcast on the CALL channel by either side to end an in-progress call. */
const val EVENT_HANGUP = "hangup"

/** Broadcast by an owner tab/device that claimed the call first, so siblings dismiss their own incoming-call UI. */
const val EVENT_CALL_CLAIMED = "call-claimed"

/** Payload for [EVENT_INCOMING_CALL]. Field names match `services/webrtcCall.js` verbatim. */
@Serializable
data class IncomingCallPayload(
    val callId: String,
    val plateId: String? = null,
    val sdp: String,
)

/** Payload for [EVENT_ANSWER]. */
@Serializable
data class CallAnswerPayload(
    val sdp: String,
)

/** Payload for [EVENT_ICE_CANDIDATE]. `from` is `"owner"` or `"visitor"`. */
@Serializable
data class IceCandidatePayload(
    val candidate: String,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null,
    val from: String,
)

/**
 * Payload for [EVENT_REJECT]. `reason` values reused verbatim from
 * `services/webrtcOwnerCall.js`: `owner_busy`, `owner_declined`,
 * `owner_mic_timeout`, `owner_mic_denied`.
 */
@Serializable
data class RejectPayload(
    val reason: String,
)

/** Payload for [EVENT_HANGUP]. `from` is `"owner"` or `"visitor"`. */
@Serializable
data class HangupPayload(
    val from: String,
)

/** Payload for [EVENT_CALL_CLAIMED] — lets sibling owner devices dismiss their incoming-call UI. */
@Serializable
data class CallClaimedPayload(
    val callId: String,
    val deviceId: String,
)

object RejectReason {
    const val OWNER_BUSY = "owner_busy"
    const val OWNER_DECLINED = "owner_declined"
    const val OWNER_MIC_TIMEOUT = "owner_mic_timeout"
    const val OWNER_MIC_DENIED = "owner_mic_denied"
}
