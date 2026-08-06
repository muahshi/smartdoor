package `in`.mysmartdoor.app.ui.screens.call

import `in`.mysmartdoor.app.core.call.IncomingCallController
import `in`.mysmartdoor.app.core.call.RtcMediaEngine
import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.core.data.model.CallSession
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE (state machine origin).
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing & Notifications
 * (migration — see class doc below).
 *
 * Owner-side call state machine. Drives every state the CTO brief listed
 * (Idle/Incoming/Outgoing/Connecting/Connected/Disconnected/Failed/Busy/
 * Rejected/Missed) — the transport/media half is delegated to
 * [RtcMediaEngine], which is a no-op stub today (see that interface's
 * doc comment) pending native WebRTC SDK sign-off. Toggling mute/speaker/
 * hold and the call timer are fully real regardless of the media stub.
 *
 * ══════════════════════════════════════════════════════════════════════
 * MIGRATION NOTE (12E.13): this ViewModel previously opened its own
 * `listenForIncomingCalls` subscription directly from `init {}` — meaning
 * every time [in.mysmartdoor.app.navigation.Routes.CALL] was (re)composed
 * a brand-new [in.mysmartdoor.app.core.data.CallRepository] Realtime
 * subscription was created, with no hard guarantee the previous
 * ViewModel's had been torn down first. It also meant an incoming call
 * only rang while [in.mysmartdoor.app.ui.screens.call.CallScreen] was the
 * screen on top — nothing rang while the app was backgrounded.
 *
 * This ViewModel now holds NO signaling subscription of its own. All of
 * that state (ring listening, busy/timeout handling, accept/reject/
 * hangup, ICE + remote-hangup observation, multi-device
 * `call-claimed` sync) lives in the single app-wide
 * [IncomingCallController] singleton (started once from
 * [in.mysmartdoor.app.SmartDoorApplication.onCreate]). This ViewModel
 * purely mirrors [IncomingCallController.session] into [uiState] and
 * forwards user actions to the controller — the same pattern whether this
 * ViewModel is hosted by the normal in-app
 * [in.mysmartdoor.app.ui.screens.call.CallScreen] route or by
 * [in.mysmartdoor.app.ui.incomingcall.IncomingCallActivity]'s full-screen
 * notification flow. [CallScreen]'s public surface (button callbacks) is
 * unchanged — every method below keeps its original name and signature.
 * ══════════════════════════════════════════════════════════════════════
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

@HiltViewModel
class CallViewModel @Inject constructor(
    private val incomingCallController: IncomingCallController,
    private val rtcMediaEngine: RtcMediaEngine,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CallUiState())
    val uiState: StateFlow<CallUiState> = _uiState.asStateFlow()

    private var callTimerJob: Job? = null

    init {
        observeControlState()
        observeControllerSession()
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

    /** Mirrors [IncomingCallController.session] — the single source of truth for call state. */
    private fun observeControllerSession() {
        viewModelScope.launch {
            incomingCallController.session.collect { session ->
                _uiState.update { it.copy(session = session) }
                if (session.phase == CallPhase.CONNECTED) {
                    ensureCallTimer(session.connectedAtEpochMs)
                } else {
                    callTimerJob?.cancel()
                    callTimerJob = null
                    if (session.phase == CallPhase.IDLE) {
                        _uiState.update { it.copy(elapsedSeconds = 0) }
                    }
                }
            }
        }
    }

    /** Ticks [CallUiState.elapsedSeconds] off the wall clock relative to [connectedAtEpochMs] — correct even if this ViewModel/screen is (re)created mid-call. */
    private fun ensureCallTimer(connectedAtEpochMs: Long?) {
        if (callTimerJob?.isActive == true) return
        val startedAt = connectedAtEpochMs ?: System.currentTimeMillis()
        callTimerJob = viewModelScope.launch {
            while (isActive) {
                val elapsed = ((System.currentTimeMillis() - startedAt) / 1000L).toInt().coerceAtLeast(0)
                _uiState.update { it.copy(elapsedSeconds = elapsed) }
                delay(1_000)
            }
        }
    }

    /** Owner tapped Accept on the incoming-call screen. */
    fun acceptCall() {
        viewModelScope.launch { incomingCallController.acceptCall() }
    }

    /** Owner tapped Reject on the incoming-call screen. */
    fun rejectCall() {
        viewModelScope.launch { incomingCallController.rejectCall() }
    }

    /** Owner tapped End Call while CONNECTING or CONNECTED. */
    fun endCall() {
        viewModelScope.launch { incomingCallController.hangup() }
    }

    /** Resets to IDLE from any terminal screen (Ended/Missed/Rejected/Failed/Busy) so the next incoming call can be received. */
    fun dismissEndedCall() {
        incomingCallController.dismiss()
        _uiState.update { CallUiState() }
    }

    fun toggleMute() = rtcMediaEngine.setMuted(!_uiState.value.isMuted)
    fun toggleSpeaker() = rtcMediaEngine.setSpeakerOn(!_uiState.value.isSpeakerOn)
    fun toggleHold() = rtcMediaEngine.setOnHold(!_uiState.value.isOnHold)
    fun toggleKeypad() = _uiState.update { it.copy(isKeypadOpen = !it.isKeypadOpen) }

    override fun onCleared() {
        super.onCleared()
        callTimerJob?.cancel()
    }
}
