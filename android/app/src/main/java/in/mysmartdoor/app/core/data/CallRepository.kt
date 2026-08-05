package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.SupabaseClientProvider
import `in`.mysmartdoor.app.core.network.dto.CallAnswerPayload
import `in`.mysmartdoor.app.core.network.dto.EVENT_ANSWER
import `in`.mysmartdoor.app.core.network.dto.EVENT_HANGUP
import `in`.mysmartdoor.app.core.network.dto.EVENT_ICE_CANDIDATE
import `in`.mysmartdoor.app.core.network.dto.EVENT_INCOMING_CALL
import `in`.mysmartdoor.app.core.network.dto.EVENT_REJECT
import `in`.mysmartdoor.app.core.network.dto.HangupPayload
import `in`.mysmartdoor.app.core.network.dto.IceCandidatePayload
import `in`.mysmartdoor.app.core.network.dto.IncomingCallPayload
import `in`.mysmartdoor.app.core.network.dto.RejectPayload
import `in`.mysmartdoor.app.core.network.dto.callChannelName
import `in`.mysmartdoor.app.core.network.dto.ringChannelName
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcast
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * Android-owner-side counterpart of `services/webrtcSignaling.js` +
 * `services/webrtcOwnerCall.js`. Reuses the exact same Supabase Realtime
 * broadcast channels, event names, and payload shapes the web owner
 * dashboard already speaks — see
 * [in.mysmartdoor.app.core.network.dto.CallSignalingDto] for the verbatim
 * contract this repository implements. No new backend, no new table, no
 * new Edge Function.
 *
 * ══════════════════════════════════════════════════════════════════════
 * VERIFICATION NOTE: this is the FIRST live use of `client.realtime` in
 * this Android codebase — [SupabaseClientProvider]'s own doc comment
 * notes the Realtime plugin has only ever been *installed*, never
 * invoked, until this phase. `channel(id) { isPrivate = true }` /
 * `broadcastFlow<T>(event)` / `channel.subscribe(blockUntilSubscribed)` /
 * `channel.broadcast(event, message)` below match the supabase-kt 3.x
 * Realtime Authorization API as documented, but this file has not been
 * run through an actual Gradle build in this environment (network/build
 * tooling unavailable here) — run a real compile before merging, per the
 * CTO brief's own "static compile review" checklist item.
 * ══════════════════════════════════════════════════════════════════════
 *
 * Lifecycle: [listenForIncomingCalls] opens and subscribes the long-lived
 * RING channel and closes it when the caller cancels the flow (e.g. the
 * ViewModel's `viewModelScope` ending). [openCallChannel] opens the
 * short-lived CALL channel for one specific `callId` once an offer is
 * accepted/rejected; callers must [closeCallChannel] when the call ends.
 */
@Singleton
class CallRepository @Inject constructor(
    private val supabaseClientProvider: SupabaseClientProvider,
) : BaseRepository() {

    private var activeCallChannel: RealtimeChannel? = null
    private var activeCallId: String? = null

    /**
     * Long-lived listener on `rtc:ring:{ownerId}` for [EVENT_INCOMING_CALL]
     * broadcasts. Mirrors `services/webrtcOwnerCall.js`'s
     * `listenForIncomingCalls()` — one subscription for the owner's whole
     * dashboard/app session, re-used across multiple visitor attempts
     * (only the current offer's `callId` matters; stale/duplicate joins
     * are harmless, same as the web implementation's doc comment notes).
     *
     * Emits every [IncomingCallPayload] received while collected. The
     * channel is opened with `isPrivate = true` so Realtime enforces the
     * existing `rtc_ring_receive_owner_only` / `rtc_ring_send_visitor_and_owner`
     * RLS policies (`sql/40_webrtc_phase2_hardening.sql`) — unchanged here.
     */
    fun listenForIncomingCalls(ownerId: String): Flow<IncomingCallPayload> = callbackFlow {
        val channelName = ringChannelName(ownerId)
        val ringChannel = supabaseClientProvider.client.channel(channelName) {
            isPrivate = true
        }

        val job = launch {
            ringChannel.broadcastFlow<IncomingCallPayload>(event = EVENT_INCOMING_CALL)
                .collect { payload ->
                    Logger.d(message = "[CallRepository] incoming-call received callId=${payload.callId}")
                    trySend(payload)
                }
        }

        try {
            ringChannel.subscribe(blockUntilSubscribed = true)
        } catch (e: Exception) {
            Logger.e(message = "[CallRepository] ring channel subscribe failed", throwable = e)
        }

        awaitClose {
            job.cancel()
            kotlinx.coroutines.runBlocking {
                runCatching { ringChannel.unsubscribe() }
            }
        }
    }

    /**
     * Opens the short-lived `rtc:call:{callId}` channel for one specific
     * attempt and subscribes to it. Must be followed by [closeCallChannel]
     * once the call ends (accepted-then-hangup, rejected, or missed) —
     * mirrors the web app's per-attempt channel teardown.
     */
    suspend fun openCallChannel(callId: String): Result<Unit> = safeApiCall {
        activeCallChannel?.let { runCatching { it.unsubscribe() } }
        val channel = supabaseClientProvider.client.channel(callChannelName(callId)) {
            isPrivate = true
        }
        channel.subscribe(blockUntilSubscribed = true)
        activeCallChannel = channel
        activeCallId = callId
    }

    /** ICE candidates broadcast by the visitor on the currently-open call channel. */
    fun observeRemoteIceCandidates(): Flow<IceCandidatePayload> = callbackFlow {
        val channel = activeCallChannel
        if (channel == null) {
            close()
            awaitClose { }
            return@callbackFlow
        }
        val job = launch {
            channel.broadcastFlow<IceCandidatePayload>(event = EVENT_ICE_CANDIDATE)
                .collect { payload -> if (payload.from == "visitor") trySend(payload) }
        }
        awaitClose { job.cancel() }
    }

    /** `hangup` broadcasts from the visitor on the currently-open call channel. */
    fun observeRemoteHangup(): Flow<HangupPayload> = callbackFlow {
        val channel = activeCallChannel
        if (channel == null) {
            close()
            awaitClose { }
            return@callbackFlow
        }
        val job = launch {
            channel.broadcastFlow<HangupPayload>(event = EVENT_HANGUP)
                .collect { payload -> if (payload.from == "visitor") trySend(payload) }
        }
        awaitClose { job.cancel() }
    }

    /** Broadcasts the owner's SDP answer once [RtcMediaEngine][in.mysmartdoor.app.core.call.RtcMediaEngine] produces one. */
    suspend fun sendAnswer(sdp: String): Result<Unit> = safeApiCall {
        val channel = activeCallChannel ?: throw IllegalStateException("No open call channel to answer on")
        channel.broadcast(event = EVENT_ANSWER, message = CallAnswerPayload(sdp = sdp))
    }

    /** Relays a locally-gathered ICE candidate to the visitor. `from` is always `"owner"` here. */
    suspend fun sendIceCandidate(candidate: String, sdpMid: String?, sdpMLineIndex: Int?): Result<Unit> = safeApiCall {
        val channel = activeCallChannel ?: throw IllegalStateException("No open call channel to send ICE on")
        channel.broadcast(
            event = EVENT_ICE_CANDIDATE,
            message = IceCandidatePayload(candidate = candidate, sdpMid = sdpMid, sdpMLineIndex = sdpMLineIndex, from = "owner"),
        )
    }

    /**
     * Declines the call. [reason] should be one of
     * [in.mysmartdoor.app.core.network.dto.RejectReason]'s constants —
     * mirrors `services/webrtcOwnerCall.js`'s reject call sites exactly.
     */
    suspend fun sendReject(callId: String, reason: String): Result<Unit> = safeApiCall {
        val channel = activeCallChannel?.takeIf { activeCallId == callId }
            ?: supabaseClientProvider.client.channel(callChannelName(callId)) { isPrivate = true }
                .also { it.subscribe(blockUntilSubscribed = true) }
        channel.broadcast(event = EVENT_REJECT, message = RejectPayload(reason = reason))
    }

    /** Ends an in-progress call. `from` is always `"owner"` here. */
    suspend fun sendHangup(): Result<Unit> = safeApiCall {
        val channel = activeCallChannel ?: throw IllegalStateException("No open call channel to hang up on")
        channel.broadcast(event = EVENT_HANGUP, message = HangupPayload(from = "owner"))
    }

    /** Unsubscribes and releases the current call channel. Safe to call when none is open. */
    suspend fun closeCallChannel() {
        val channel = activeCallChannel ?: return
        runCatching { channel.unsubscribe() }
            .onFailure { Logger.e(message = "[CallRepository] call channel unsubscribe failed", throwable = it) }
        activeCallChannel = null
        activeCallId = null
    }
}
