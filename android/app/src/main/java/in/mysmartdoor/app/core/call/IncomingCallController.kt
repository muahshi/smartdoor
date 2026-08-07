package `in`.mysmartdoor.app.core.call

import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.CallRepository
import `in`.mysmartdoor.app.core.data.model.CallEndReason
import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.core.data.model.CallSession
import `in`.mysmartdoor.app.core.network.SupabaseClientProvider
import `in`.mysmartdoor.app.core.network.dto.IncomingCallPayload
import `in`.mysmartdoor.app.core.network.dto.RejectReason
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import `in`.mysmartdoor.app.service.CallRingForegroundService
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/** How long an unanswered incoming call rings before being marked [CallPhase.MISSED]. Matches the ~30s owner-side ring window. */
private const val RING_TIMEOUT_MS = 30_000L

/**
 * Phase 12E.15 — how long a callId is remembered for de-duplication after
 * being handled (via either the Realtime ring channel or an FCM push —
 * see [handleIncomingOfferFromPush]). Comfortably longer than
 * [RING_TIMEOUT_MS] so a push that arrives late (after the ring already
 * timed out to MISSED) still gets recognized as a duplicate of a call
 * already shown, rather than re-ringing a call the owner already missed
 * moments ago. Cleared on process death (in-memory only) — a genuinely
 * fresh call after a process restart is, correctly, not a duplicate of
 * anything.
 */
private const val DEDUPE_MEMORY_MS = 90_000L

/**
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing & Notifications.
 *
 * App-wide, process-lifetime (`@Singleton`) owner of the incoming-call
 * state machine. Before this phase, [in.mysmartdoor.app.ui.screens.call.CallViewModel]
 * opened its own ring-channel subscription from `init {}` — meaning a new
 * subscription was created every time [in.mysmartdoor.app.navigation.Routes.CALL]
 * was (re)composed, with no guarantee the previous one had actually been
 * torn down first (`onCleared()` timing vs. Compose recomposition is not
 * synchronous). That is the root cause this class fixes: there is now
 * exactly ONE [listenForIncomingCalls][CallRepository.listenForIncomingCalls]
 * subscription for the whole app process, started once from
 * [in.mysmartdoor.app.SmartDoorApplication.onCreate], guarded by
 * [startedGuard] so a defensive/duplicate call to [startListening] is a
 * no-op.
 *
 * [CallViewModel][in.mysmartdoor.app.ui.screens.call.CallViewModel] (and
 * [IncomingCallActivity][in.mysmartdoor.app.ui.incomingcall.IncomingCallActivity])
 * now only *observe* [session] and delegate user actions
 * ([acceptCall]/[rejectCall]/[hangup]) here — they hold no signaling
 * subscriptions of their own, so the ring/call state survives Activity
 * recreation (rotation, process coming back to the foreground, the
 * incoming-call full-screen Activity finishing) for as long as the app
 * process is alive. True cross-process-death restoration is out of scope
 * (nothing here persists to disk) — if the process is killed while idle,
 * a fresh incoming-call offer simply re-arrives on the ring channel the
 * same way it always did.
 *
 * Multi-device sync: the moment an [IncomingCallPayload] arrives this
 * device passively opens the per-attempt `rtc:call:{callId}` channel
 * (via [CallRepository.openCallChannel]) purely to observe
 * [in.mysmartdoor.app.core.network.dto.EVENT_CALL_CLAIMED] — so it can
 * dismiss its own ringing UI the instant a sibling device accepts first.
 * On accept, this device broadcasts that same event via
 * [CallRepository.sendCallClaimed] before proceeding, using [deviceId] (a
 * stable per-install identifier) so a device never dismisses itself.
 *
 * BUGFIX (12E.14): [startListening] used to take only the *first*
 * emission of [SecureSessionManager.userIdFlow] and subscribe
 * immediately. That broke the ring pipeline in two separate,
 * previously-unverified ways:
 *  1. On a fresh login (no owner ever previously persisted on this
 *     install), that first emission is `null` — the coroutine bailed and
 *     reset [startedGuard], but nothing else in the app ever calls
 *     [startListening] again, so the ring listener never started for the
 *     rest of that process's life. The owner would receive zero incoming
 *     calls until they force-killed and relaunched the app.
 *  2. On a warm process restart for an *already* logged-in owner,
 *     [SecureSessionManager.userIdFlow] is backed by on-disk DataStore and
 *     resolves near-instantly — well before
 *     [in.mysmartdoor.app.core.data.AuthRepository.restoreSession] (kicked
 *     off separately from [in.mysmartdoor.app.ui.screens.splash.SplashViewModel]
 *     once Hilt/Compose reach the Splash screen) has re-imported a real
 *     Supabase `Auth` session into [SupabaseClientProvider.client]. Both
 *     RING and CALL channels are opened with `isPrivate = true`, so
 *     Realtime's server-side Authorization check needs a real JWT at
 *     `subscribe()` time; subscribing before that import lands throws,
 *     [CallRepository.listenForIncomingCalls] only logs the failure, and
 *     the channel is left never-actually-joined — every future
 *     `incoming-call` broadcast is silently dropped with no crash, no
 *     visible error, and no retry.
 *
 * Fix: [startListening] now *continuously* combines
 * [SecureSessionManager.userIdFlow] with [SupabaseClientProvider.client]'s
 * `auth.sessionStatus`, and (re)starts
 * [CallRepository.listenForIncomingCalls] only once both an owner id AND
 * an [SessionStatus.Authenticated] session are present — covering the
 * fresh-login case (which previously never started at all) and the
 * warm-restart race (which previously subscribed too early) with the
 * exact same, already-existing [CallRepository] method. If the session is
 * ever lost (logout, refresh failure) the inner collection is cancelled,
 * which cleanly unsubscribes the RING channel via
 * [CallRepository.listenForIncomingCalls]'s own `awaitClose` — no new
 * teardown path, no duplicate listener.
 */
@Singleton
class IncomingCallController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val callRepository: CallRepository,
    private val rtcMediaEngine: RtcMediaEngine,
    private val secureSessionManager: SecureSessionManager,
    private val supabaseClientProvider: SupabaseClientProvider,
) {

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _session = MutableStateFlow(CallSession(callId = "", plateId = null, callerName = null))
    val session: StateFlow<CallSession> = _session.asStateFlow()

    private val startedGuard = AtomicBoolean(false)

    private var ringListenJob: Job? = null
    private var ringTimeoutJob: Job? = null
    private var callClaimedJob: Job? = null
    private var callChannelJob: Job? = null

    /**
     * Phase 12E.15 — callId → the time it was first handled (epoch ms).
     * The single dedupe mechanism shared by BOTH the Realtime ring-channel
     * path ([handleIncomingOffer]) and the FCM push path
     * ([handleIncomingOfferFromPush]), so the same call arriving twice —
     * from two different transports, or the same transport redelivering —
     * never produces two ring notifications. See [isDuplicateCallId] and
     * [rememberCallId]. Guarded by [dedupeMutex] since FCM callbacks and
     * Realtime collection run on different coroutines/dispatchers.
     */
    private val recentlyHandledCallIds = LinkedHashMap<String, Long>()
    private val dedupeMutex = Mutex()

    /** Stable per-install identifier so this device can recognize (and ignore) its own [in.mysmartdoor.app.core.network.dto.EVENT_CALL_CLAIMED] broadcasts. */
    private val deviceId: String by lazy {
        runCatching { Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: "unknown-device"
    }

    /**
     * Starts the single, app-wide ring-channel listener. Idempotent — a
     * second call while already started/starting is a no-op (see class
     * doc). Safe to call before the owner is logged in, and safe across
     * process-restart auth-restore races: the RING channel subscription is
     * (re)established only once both an owner id and an authenticated
     * Supabase session are simultaneously present, and is torn down
     * automatically if either drops (see BUGFIX 12E.14 above).
     */
    fun startListening() {
        if (!startedGuard.compareAndSet(false, true)) {
            Logger.d(message = "[IncomingCallController] startListening() called again — already listening, ignoring")
            return
        }
        ringListenJob = applicationScope.launch {
            combine(
                secureSessionManager.userIdFlow,
                supabaseClientProvider.client.auth.sessionStatus,
            ) { ownerId, status -> ownerId to status }
                .distinctUntilChanged()
                .collectLatest { (ownerId, status) ->
                    if (ownerId == null || status !is SessionStatus.Authenticated) {
                        Logger.d(
                            message = "[IncomingCallController] not ready to listen for incoming calls " +
                                "(ownerId=${ownerId != null}, authenticated=${status is SessionStatus.Authenticated}) — " +
                                "ring listener inactive until both are true",
                        )
                        return@collectLatest
                    }
                    Logger.d(message = "[IncomingCallController] owner session ready — subscribing to ring channel")
                    callRepository.listenForIncomingCalls(ownerId).collect { offer ->
                        handleIncomingOffer(offer)
                    }
                }
        }
    }

    private fun handleIncomingOffer(offer: IncomingCallPayload) {
        applicationScope.launch {
            if (isDuplicateCallId(offer.callId)) {
                Logger.d(message = "[IncomingCallController] duplicate/already-handled callId=${offer.callId} (realtime) — ignoring")
                return@launch
            }
            rememberCallId(offer.callId)
            dispatchIncomingOffer(offer)
        }
    }

    /**
     * Phase 12E.15 — entry point for [in.mysmartdoor.app.core.notification.SmartDoorFirebaseMessagingService].
     * Public (unlike [handleIncomingOffer]) since it's called from a
     * different class. Goes through the exact same dedupe gate and the
     * exact same [dispatchIncomingOffer] the Realtime path uses — this is
     * deliberately NOT a parallel call-state machine, just a second
     * *trigger* for the one that already exists.
     *
     * DEDUPE STRATEGY (documents both callers, since they share the same
     * mechanism):
     *   - Central path: both [handleIncomingOffer] (Realtime) and this
     *     function funnel through [isDuplicateCallId] / [rememberCallId]
     *     before ever touching [_session] or starting the ringer — one
     *     shared gate, not two independent ones that could disagree.
     *   - Memory window: [DEDUPE_MEMORY_MS] (90s) from first-seen, tracked
     *     in-memory only (see that constant's doc for why).
     *   - Process restart: dedupe memory is lost, same as
     *     [in.mysmartdoor.app.core.data.CallRepository]'s Realtime
     *     subscriptions themselves — a call that was already answered/
     *     missed/rejected before the restart won't be re-offered by
     *     either transport anyway (both only fire once, at call-initiation
     *     time), so nothing is "remembered wrong" across a restart; a
     *     dedupe window that also survived restart would need disk
     *     persistence for a 90-second problem, which isn't worth the
     *     complexity — deliberately not done here (see CTO brief: "do not
     *     use arbitrary timers as the ONLY dedupe mechanism" — the timer
     *     here is a bound on the callId-identity gate, not a substitute
     *     for it).
     *   - App foreground when FCM arrives: no special case needed — if the
     *     Realtime path already rang for this callId, the FCM push is
     *     just the second of two arrivals for the same callId and is
     *     dropped by the same identity check.
     *   - App backgrounded when FCM arrives: this is the exact case this
     *     phase exists for — FCM wakes/delivers to this service even
     *     without a foreground Activity; [dispatchIncomingOffer] starts
     *     [CallRingForegroundService] exactly as the Realtime path does.
     *   - Realtime arrives first, FCM arrives second (most common case —
     *     Realtime is a live socket, FCM has its own delivery latency):
     *     second arrival is deduped, no second ring/notification.
     *   - FCM arrives first, Realtime arrives second (app was killed, FCM
     *     woke the process, Realtime subscription re-establishes moments
     *     later): same identity check, same outcome.
     */
    fun handleIncomingOfferFromPush(offer: IncomingCallPayload) {
        applicationScope.launch {
            if (isDuplicateCallId(offer.callId)) {
                Logger.d(message = "[IncomingCallController] duplicate/already-handled callId=${offer.callId} (push) — ignoring")
                return@launch
            }
            rememberCallId(offer.callId)
            dispatchIncomingOffer(offer)
        }
    }

    /** True if [callId] is either the currently active session or was handled within [DEDUPE_MEMORY_MS]. */
    private suspend fun isDuplicateCallId(callId: String): Boolean {
        if (callId.isBlank()) return true // never dispatch a blank/malformed id
        if (_session.value.callId == callId && _session.value.phase != CallPhase.IDLE) return true
        return dedupeMutex.withLock {
            pruneExpiredCallIds()
            recentlyHandledCallIds.containsKey(callId)
        }
    }

    private suspend fun rememberCallId(callId: String) {
        dedupeMutex.withLock {
            recentlyHandledCallIds[callId] = System.currentTimeMillis()
            pruneExpiredCallIds()
        }
    }

    /** Caller must hold [dedupeMutex]. Keeps the in-memory map from growing unbounded over a long process lifetime. */
    private fun pruneExpiredCallIds() {
        val cutoff = System.currentTimeMillis() - DEDUPE_MEMORY_MS
        recentlyHandledCallIds.entries.removeAll { it.value < cutoff }
    }

    /** Shared by both [handleIncomingOffer] and [handleIncomingOfferFromPush] — the one place that actually starts ringing. Callers must already have passed the dedupe gate. */
    private fun dispatchIncomingOffer(offer: IncomingCallPayload) {
        if (_session.value.phase != CallPhase.IDLE) {
            // Already on/ringing a genuinely DIFFERENT call — auto-decline
            // per services/webrtcOwnerCall.js's busy handling. (A same-
            // callId case never reaches here — isDuplicateCallId already
            // filtered it out above.)
            applicationScope.launch { callRepository.sendReject(offer.callId, RejectReason.OWNER_BUSY) }
            return
        }

        _session.value = CallSession(
            callId = offer.callId,
            plateId = offer.plateId,
            callerName = offer.plateId?.let { plate -> "Visitor · $plate" },
            phase = CallPhase.INCOMING,
        )

        applicationScope.launch {
            when (val result = callRepository.openCallChannel(offer.callId)) {
                is Result.Error -> Logger.e(message = "[IncomingCallController] failed to open call channel for claim-watch: ${result.error.message}")
                else -> observeCallClaimed(offer.callId)
            }
        }

        startForegroundRinging()
        startRingTimeout(offer.callId)
    }

    private fun observeCallClaimed(callId: String) {
        callClaimedJob?.cancel()
        callClaimedJob = applicationScope.launch {
            callRepository.observeCallClaimed().collect { payload ->
                val current = _session.value
                if (payload.callId == callId && payload.deviceId != deviceId &&
                    current.callId == callId && current.phase == CallPhase.INCOMING
                ) {
                    Logger.d(message = "[IncomingCallController] call $callId claimed by another device — dismissing local incoming UI")
                    ringTimeoutJob?.cancel()
                    closeCallChannelInternal()
                    _session.value = CallSession(callId = "", plateId = null, callerName = null, phase = CallPhase.IDLE)
                }
            }
        }
    }

    private fun startRingTimeout(callId: String) {
        ringTimeoutJob?.cancel()
        ringTimeoutJob = applicationScope.launch {
            delay(RING_TIMEOUT_MS)
            if (_session.value.callId == callId && _session.value.phase == CallPhase.INCOMING) {
                _session.update { it.copy(phase = CallPhase.MISSED, endReason = CallEndReason.NO_ANSWER) }
                closeCallChannelInternal()
            }
        }
    }

    /** Owner tapped/broadcast Accept — from [in.mysmartdoor.app.ui.incomingcall.IncomingCallActivity] or [in.mysmartdoor.app.core.call.CallActionReceiver]. */
    suspend fun acceptCall() {
        val current = _session.value
        if (current.phase != CallPhase.INCOMING) return
        ringTimeoutJob?.cancel()
        callClaimedJob?.cancel()
        _session.update { it.copy(phase = CallPhase.CONNECTING) }

        // Tell sibling owner devices this one claimed the call first.
        callRepository.sendCallClaimed(current.callId, deviceId)

        when (val openResult = callRepository.openCallChannel(current.callId)) {
            is Result.Error -> {
                Logger.e(message = "[IncomingCallController] failed to open call channel: ${openResult.error.message}")
                _session.update { it.copy(phase = CallPhase.FAILED, endReason = CallEndReason.NETWORK_FAILED) }
                closeCallChannelInternal()
                return
            }
            else -> Unit
        }

        observeCallChannelEvents()

        // NOTE: remote SDP offer isn't threaded through yet — see RtcMediaEngine's
        // class doc; the media layer is an approved no-op stub pending native
        // WebRTC SDK sign-off, unchanged by this phase.
        rtcMediaEngine.createAnswer(remoteOfferSdp = "").fold(
            onSuccess = { sdp ->
                callRepository.sendAnswer(sdp)
                val now = System.currentTimeMillis()
                _session.update { it.copy(phase = CallPhase.CONNECTED, startedAtEpochMs = it.startedAtEpochMs ?: now, connectedAtEpochMs = now) }
            },
            onFailure = {
                Logger.e(message = "[IncomingCallController] createAnswer failed", throwable = it)
                _session.update { s -> s.copy(phase = CallPhase.FAILED, endReason = CallEndReason.NETWORK_FAILED) }
                closeCallChannelInternal()
            },
        )
    }

    /** Owner tapped/broadcast Reject. */
    suspend fun rejectCall() {
        val current = _session.value
        if (current.phase != CallPhase.INCOMING) return
        ringTimeoutJob?.cancel()
        callClaimedJob?.cancel()
        callRepository.sendReject(current.callId, RejectReason.OWNER_DECLINED)
        _session.update { it.copy(phase = CallPhase.REJECTED, endReason = CallEndReason.OWNER_DECLINED) }
        closeCallChannelInternal()
    }

    /** Owner tapped End Call while CONNECTING or CONNECTED. */
    suspend fun hangup() {
        val phase = _session.value.phase
        if (phase != CallPhase.CONNECTED && phase != CallPhase.CONNECTING) return
        callRepository.sendHangup()
        _session.update { it.copy(phase = CallPhase.DISCONNECTED, endReason = CallEndReason.OWNER_HUNG_UP) }
        closeCallChannelInternal()
    }

    /** Resets to IDLE from any terminal screen (Ended/Missed/Rejected/Failed/Busy) so the next incoming call can be received. */
    fun dismiss() {
        closeCallChannelInternal()
        _session.value = CallSession(callId = "", plateId = null, callerName = null)
    }

    private fun observeCallChannelEvents() {
        callChannelJob?.cancel()
        callChannelJob = applicationScope.launch {
            launch {
                callRepository.observeRemoteHangup().collect {
                    _session.update { it.copy(phase = CallPhase.DISCONNECTED, endReason = CallEndReason.VISITOR_HUNG_UP) }
                    closeCallChannelInternal()
                }
            }
            launch {
                callRepository.observeRemoteIceCandidates().collect { candidate ->
                    rtcMediaEngine.addRemoteIceCandidate(candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex)
                }
            }
        }
    }

    private fun closeCallChannelInternal() {
        callChannelJob?.cancel()
        callChannelJob = null
        callClaimedJob?.cancel()
        callClaimedJob = null
        rtcMediaEngine.release()
        applicationScope.launch { callRepository.closeCallChannel() }
    }

    /** Starts [CallRingForegroundService], which builds/updates the full-screen incoming-call notification and plays the ringtone/vibration. */
    private fun startForegroundRinging() {
        runCatching {
            ContextCompat.startForegroundService(context, Intent(context, CallRingForegroundService::class.java))
        }.onFailure { Logger.e(message = "[IncomingCallController] failed to start CallRingForegroundService", throwable = it) }
    }
}
