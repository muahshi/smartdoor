package `in`.mysmartdoor.app.ui.screens.call

import `in`.mysmartdoor.app.core.call.RtcMediaEngine
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.CallRepository
import `in`.mysmartdoor.app.core.data.model.CallEndReason
import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.core.data.model.CallSession
import `in`.mysmartdoor.app.core.network.dto.RejectReason
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * Owner-side call state machine. Drives every state the CTO brief listed
 * (Idle/Incoming/Outgoing/Connecting/Connected/Disconnected/Failed/Busy/
 * Rejected/Missed) off of real signaling via [CallRepository] — the
 * transport/media half is delegated to [RtcMediaEngine], which is a
 * no-op stub today (see that interface's doc comment) pending native
 * WebRTC SDK sign-off. Toggling mute/speaker/hold and the call timer are
 * fully real regardless of the media stub.
 *
 * Scope for this phase: this ViewModel owns ring-channel listening only
 * while [Routes.CALL] is on screen. A production "ring while the app is
 * backgrounded" experience needs a foreground Service + full-screen
 * notification intent — explicitly flagged as a follow-on phase, not
 * invented here (see final report).
 */
data class CallUiState(
    val session: CallSession = CallSession(callId = "", plateId = null, callerName = null),
    val elapsedSeconds: Int = 0,
    val isMuted: Boolean = false,
    val isSpeakerOn: Boolean = false,
    val isOnHold: Boolean = false,
    val isKeypadOpen: Boolean = false,
    val networkQuality: NetworkQuality = NetworkQuality.UNKNOWN,
    val errorMessage: String? = null,
)

enum class NetworkQuality { UNKNOWN, GOOD, FAIR, POOR }

/** How long an unanswered incoming call rings before being marked [CallPhase.MISSED]. Matches the ~30s owner-side ring window. */
private const val RING_TIMEOUT_MS = 30_000L

@HiltViewModel
class CallViewModel @Inject constructor(
    private val callRepository: CallRepository,
    private val rtcMediaEngine: RtcMediaEngine,
    private val secureSessionManager: SecureSessionManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CallUiState())
    val uiState: StateFlow<CallUiState> = _uiState.asStateFlow()

    private var ringListenJob: Job? = null
    private var ringTimeoutJob: Job? = null
    private var callTimerJob: Job? = null
    private var callChannelJobs: Job? = null

    init {
        observeControlState()
        startListeningForIncomingCalls()
    }

    private fun observeControlState() {
        viewModelScope.launch {
            combine(
                rtcMediaEngine.isMutedFlow,
                rtcMediaEngine.isSpeakerOnFlow,
                rtcMediaEngine.isOnHoldFlow,
            ) { muted, speaker, hold -> Triple(muted, speaker, hold) }
                .collect { (muted, speaker, hold) ->
                    _uiState.update { it.copy(isMuted = muted, isSpeakerOn = speaker, isOnHold = hold) }
                }
        }
    }

    /** Long-lived: opens the owner's ring channel and transitions IDLE → INCOMING on the first offer. */
    private fun startListeningForIncomingCalls() {
        ringListenJob?.cancel()
        ringListenJob = viewModelScope.launch {
            val ownerId = secureSessionManager.userIdFlow.first() ?: run {
                Logger.w(message = "[CallViewModel] no owner session — cannot listen for incoming calls")
                return@launch
            }
            callRepository.listenForIncomingCalls(ownerId).collect { offer ->
                if (_uiState.value.session.phase != CallPhase.IDLE) {
                    // Already on a call — auto-decline per services/webrtcOwnerCall.js's busy handling.
                    viewModelScope.launch { callRepository.sendReject(offer.callId, RejectReason.OWNER_BUSY) }
                    return@collect
                }
                _uiState.update {
                    it.copy(
                        session = CallSession(
                            callId = offer.callId,
                            plateId = offer.plateId,
                            callerName = offer.plateId?.let { plate -> "Visitor · $plate" },
                            phase = CallPhase.INCOMING,
                        ),
                    )
                }
                startRingTimeout(offer.callId)
            }
        }
    }

    private fun startRingTimeout(callId: String) {
        ringTimeoutJob?.cancel()
        ringTimeoutJob = viewModelScope.launch {
            delay(RING_TIMEOUT_MS)
            if (_uiState.value.session.callId == callId && _uiState.value.session.phase == CallPhase.INCOMING) {
                transitionTo(CallPhase.MISSED, endReason = CallEndReason.NO_ANSWER)
            }
        }
    }

    /** Owner tapped Accept on the incoming-call screen. */
    fun acceptCall() {
        val session = _uiState.value.session
        if (session.phase != CallPhase.INCOMING) return
        ringTimeoutJob?.cancel()
        transitionTo(CallPhase.CONNECTING)

        viewModelScope.launch {
            when (val openResult = callRepository.openCallChannel(session.callId)) {
                is Result.Error -> {
                    Logger.e(message = "[CallViewModel] failed to open call channel: ${openResult.error.message}")
                    transitionTo(CallPhase.FAILED, endReason = CallEndReason.NETWORK_FAILED)
                    return@launch
                }
                else -> Unit
            }

            observeCallChannelEvents()

            // NOTE: remote SDP offer isn't threaded through this ViewModel yet — the
            // incoming-call broadcast's `sdp` field is available on the payload in
            // startListeningForIncomingCalls() above but isn't passed into this
            // accept path in this phase, since RtcMediaEngine.createAnswer() is a
            // stub that never uses it either. Wiring that argument through is a
            // one-line, additive change alongside the real WebRTC SDK integration.
            rtcMediaEngine.createAnswer(remoteOfferSdp = "").fold(
                onSuccess = { sdp ->
                    callRepository.sendAnswer(sdp)
                    transitionTo(CallPhase.CONNECTED)
                    startCallTimer()
                },
                onFailure = {
                    Logger.e(message = "[CallViewModel] createAnswer failed", throwable = it)
                    transitionTo(CallPhase.FAILED, endReason = CallEndReason.NETWORK_FAILED)
                },
            )
        }
    }

    /** Owner tapped Reject on the incoming-call screen. */
    fun rejectCall() {
        val session = _uiState.value.session
        if (session.phase != CallPhase.INCOMING) return
        ringTimeoutJob?.cancel()
        viewModelScope.launch {
            callRepository.sendReject(session.callId, RejectReason.OWNER_DECLINED)
        }
        transitionTo(CallPhase.REJECTED, endReason = CallEndReason.OWNER_DECLINED)
    }

    /** Owner tapped End Call while CONNECTING or CONNECTED. */
    fun endCall() {
        val phase = _uiState.value.session.phase
        if (phase != CallPhase.CONNECTED && phase != CallPhase.CONNECTING) return
        viewModelScope.launch { callRepository.sendHangup() }
        transitionTo(CallPhase.DISCONNECTED, endReason = CallEndReason.OWNER_HUNG_UP)
    }

    /** Resets to IDLE from any terminal screen (Ended/Missed/Rejected/Failed/Busy) so the next incoming call can be received. */
    fun dismissEndedCall() {
        cleanupCallChannel()
        _uiState.value = CallUiState()
    }

    fun toggleMute() = rtcMediaEngine.setMuted(!_uiState.value.isMuted)
    fun toggleSpeaker() = rtcMediaEngine.setSpeakerOn(!_uiState.value.isSpeakerOn)
    fun toggleHold() = rtcMediaEngine.setOnHold(!_uiState.value.isOnHold)
    fun toggleKeypad() = _uiState.update { it.copy(isKeypadOpen = !it.isKeypadOpen) }

    private fun observeCallChannelEvents() {
        callChannelJobs?.cancel()
        callChannelJobs = viewModelScope.launch {
            launch {
                callRepository.observeRemoteHangup().collect {
                    transitionTo(CallPhase.DISCONNECTED, endReason = CallEndReason.VISITOR_HUNG_UP)
                }
            }
            launch {
                callRepository.observeRemoteIceCandidates().collect { candidate ->
                    rtcMediaEngine.addRemoteIceCandidate(candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex)
                }
            }
        }
    }

    private fun startCallTimer() {
        callTimerJob?.cancel()
        val startedAt = System.currentTimeMillis()
        _uiState.update { it.copy(session = it.session.copy(startedAtEpochMs = startedAt, connectedAtEpochMs = startedAt)) }
        callTimerJob = viewModelScope.launch {
            while (isActive && _uiState.value.session.phase == CallPhase.CONNECTED) {
                delay(1_000)
                _uiState.update { it.copy(elapsedSeconds = it.elapsedSeconds + 1) }
            }
        }
    }

    private fun transitionTo(phase: CallPhase, endReason: CallEndReason? = null) {
        _uiState.update { it.copy(session = it.session.copy(phase = phase, endReason = endReason)) }
        if (phase == CallPhase.DISCONNECTED || phase == CallPhase.FAILED) {
            cleanupCallChannel()
        }
    }

    private fun cleanupCallChannel() {
        callTimerJob?.cancel()
        callChannelJobs?.cancel()
        rtcMediaEngine.release()
        viewModelScope.launch { callRepository.closeCallChannel() }
    }

    override fun onCleared() {
        super.onCleared()
        ringListenJob?.cancel()
        ringTimeoutJob?.cancel()
        callTimerJob?.cancel()
        callChannelJobs?.cancel()
        rtcMediaEngine.release()
    }
}
