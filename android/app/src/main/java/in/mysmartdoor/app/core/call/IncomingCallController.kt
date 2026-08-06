package `in`.mysmartdoor.app.core.call

import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.CallRepository
import `in`.mysmartdoor.app.core.data.model.CallEndReason
import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.core.data.model.CallSession
import `in`.mysmartdoor.app.core.network.dto.IncomingCallPayload
import `in`.mysmartdoor.app.core.network.dto.RejectReason
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import `in`.mysmartdoor.app.service.CallRingForegroundService
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/** How long an unanswered incoming call rings before being marked [CallPhase.MISSED]. Matches the ~30s owner-side ring window. */
private const val RING_TIMEOUT_MS = 30_000L

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
 */
@Singleton
class IncomingCallController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val callRepository: CallRepository,
    private val rtcMediaEngine: RtcMediaEngine,
    private val secureSessionManager: SecureSessionManager,
) {

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _session = MutableStateFlow(CallSession(callId = "", plateId = null, callerName = null))
    val session: StateFlow<CallSession> = _session.asStateFlow()

    private val startedGuard = AtomicBoolean(false)

    private var ringListenJob: Job? = null
    private var ringTimeoutJob: Job? = null
    private var callClaimedJob: Job? = null
    private var callChannelJob: Job? = null

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
     * doc). Safe to call before the owner is logged in: it suspends on the
     * first non-null [SecureSessionManager.userIdFlow] value before
     * subscribing.
     */
    fun startListening() {
        if (!startedGuard.compareAndSet(false, true)) {
            Logger.d(message = "[IncomingCallController] startListening() called again — already listening, ignoring")
            return
        }
        ringListenJob = applicationScope.launch {
            val ownerId = secureSessionManager.userIdFlow.first() ?: run {
                Logger.w(message = "[IncomingCallController] no owner session — cannot listen for incoming calls")
                startedGuard.set(false)
                return@launch
            }
            callRepository.listenForIncomingCalls(ownerId).collect { offer ->
                handleIncomingOffer(offer)
            }
        }
    }

    private fun handleIncomingOffer(offer: IncomingCallPayload) {
        if (_session.value.phase != CallPhase.IDLE) {
            // Already on/ringing another call — auto-decline per services/webrtcOwnerCall.js's busy handling.
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
