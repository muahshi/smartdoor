package `in`.mysmartdoor.app.core.call

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * ══════════════════════════════════════════════════════════════════════
 * SCOPE NOTE (CTO decision, Phase 12E.11 audit): the Android project has
 * no native WebRTC SDK dependency today (confirmed absent from
 * `gradle/libs.versions.toml` / `app/build.gradle.kts`). Adding one
 * (e.g. `org.webrtc:google-webrtc`) is explicitly OUT OF SCOPE for this
 * phase pending separate sign-off, since it's a new architectural
 * component, not a reuse of anything that exists.
 *
 * This interface is the seam: [CallViewModel] and every call screen
 * program against [RtcMediaEngine] only, never against a concrete
 * peer-connection type. That means the *signaling* half of this phase
 * (ring/call channel listening, offer/answer/ICE relay via
 * [in.mysmartdoor.app.core.data.CallRepository], state machine, UI) is
 * fully real and reuses the exact backend contract
 * `services/webrtcOwnerCall.js` uses. Only the media transport itself —
 * actually opening a peer connection, capturing/playing audio — is
 * stubbed via [NoOpRtcMediaEngine] below.
 *
 * A future phase swaps [NoOpRtcMediaEngine] for a real implementation
 * (backed by `org.webrtc.PeerConnection` once approved) WITHOUT changing
 * this interface, [CallRepository], [CallViewModel], or any screen —
 * pure dependency-injection swap in [in.mysmartdoor.app.core.di.RepositoryModule]
 * (or a new CallModule), additive only.
 * ══════════════════════════════════════════════════════════════════════
 */
interface RtcMediaEngine {

    /** True once real local media (mic) + a real peer connection are live. Always false today. */
    val isMediaActiveFlow: StateFlow<Boolean>

    /** Local mute state. Stubbed engine tracks this as plain UI state with no real audio effect yet. */
    val isMutedFlow: StateFlow<Boolean>

    /** Speakerphone routing state. Stubbed engine tracks this as plain UI state with no real audio effect yet. */
    val isSpeakerOnFlow: StateFlow<Boolean>

    /** Hold state. Stubbed engine tracks this as plain UI state with no real audio effect yet. */
    val isOnHoldFlow: StateFlow<Boolean>

    /**
     * Create a local SDP answer for a remote [remoteOfferSdp]. In a real
     * implementation this opens the `RTCPeerConnection`, sets the remote
     * description, captures the mic, and returns the local description's
     * SDP to be broadcast via [in.mysmartdoor.app.core.network.dto.EVENT_ANSWER].
     *
     * The stub returns a synthetic placeholder string — call sites must
     * treat this as inert until a real engine is wired in; it must never
     * be presented to the user as a working call.
     */
    suspend fun createAnswer(remoteOfferSdp: String): Result<String>

    /** Apply a remote ICE candidate received via [in.mysmartdoor.app.core.network.dto.EVENT_ICE_CANDIDATE]. */
    suspend fun addRemoteIceCandidate(candidate: String, sdpMid: String?, sdpMLineIndex: Int?)

    /** Local ICE candidates as they're gathered, to be relayed to the far side. Stub never emits. */
    fun localIceCandidatesFlow(): Flow<Triple<String, String?, Int?>>

    fun setMuted(muted: Boolean)
    fun setSpeakerOn(speakerOn: Boolean)
    fun setOnHold(onHold: Boolean)

    /** Tear down the peer connection and release the mic. Always safe to call, including when idle. */
    fun release()
}

/**
 * No-op stand-in used until a real WebRTC SDK is approved and wired in
 * (see class doc on [RtcMediaEngine]). Drives the UI/control state
 * (mute/speaker/hold toggles, which the premium call screens need
 * regardless of media transport) without ever touching real audio
 * hardware or a peer connection — so today's build is a complete,
 * navigable, compile-safe call UI with the real signaling state machine
 * underneath, and an intentionally inert media layer on top.
 */
@Singleton
class NoOpRtcMediaEngine @Inject constructor() : RtcMediaEngine {

    private val _isMediaActiveFlow = MutableStateFlow(false)
    override val isMediaActiveFlow: StateFlow<Boolean> = _isMediaActiveFlow

    private val _isMutedFlow = MutableStateFlow(false)
    override val isMutedFlow: StateFlow<Boolean> = _isMutedFlow

    private val _isSpeakerOnFlow = MutableStateFlow(false)
    override val isSpeakerOnFlow: StateFlow<Boolean> = _isSpeakerOnFlow

    private val _isOnHoldFlow = MutableStateFlow(false)
    override val isOnHoldFlow: StateFlow<Boolean> = _isOnHoldFlow

    override suspend fun createAnswer(remoteOfferSdp: String): Result<String> {
        // Intentionally inert — see class doc. Never marks media as active.
        return Result.success("stub-sdp-answer-not-a-real-peer-connection")
    }

    override suspend fun addRemoteIceCandidate(candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
        // Intentionally inert — no real peer connection to apply this to.
    }

    override fun localIceCandidatesFlow(): Flow<Triple<String, String?, Int?>> =
        kotlinx.coroutines.flow.emptyFlow()

    override fun setMuted(muted: Boolean) {
        _isMutedFlow.value = muted
    }

    override fun setSpeakerOn(speakerOn: Boolean) {
        _isSpeakerOnFlow.value = speakerOn
    }

    override fun setOnHold(onHold: Boolean) {
        _isOnHoldFlow.value = onHold
    }

    override fun release() {
        _isMediaActiveFlow.value = false
    }
}
