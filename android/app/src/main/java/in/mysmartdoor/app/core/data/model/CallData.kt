package `in`.mysmartdoor.app.core.data.model

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * Domain-level call state machine. Mirrors the state names the CTO brief
 * enumerated (Idle/Incoming/Outgoing/Connecting/Connected/Disconnected/
 * Failed/Busy/Rejected/Missed) and, functionally, the same states the web
 * app's `services/webrtcOwnerCall.js` already drives its UI off of — this
 * is a like-for-like port of an existing state shape, not a new design.
 *
 * The Android app is the OWNER client (the visitor side is, and remains,
 * the public web page — see `visitor.html`/`services/webrtcCall.js`).
 * "Outgoing"/"Ringing" (owner calling out) are included for completeness
 * per the brief and for a future callback feature, but today only the
 * Owner-receives-a-call path (Incoming → Connecting → Connected →
 * Disconnected/Missed/Rejected) has a real signaling counterpart on the
 * backend. See [in.mysmartdoor.app.core.data.CallRepository] doc comment.
 */
enum class CallPhase {
    /** No active or pending call. Nothing is rendered. */
    IDLE,

    /** A visitor's `incoming-call` offer has arrived on the owner's ring channel. */
    INCOMING,

    /** Owner-initiated call, waiting for the far side to start ringing (not backed today — see repository doc). */
    OUTGOING,

    /** Far side's device is alerting; local UI shows a ringing state. */
    RINGING,

    /** Offer/answer + ICE exchange in progress after accept, before media flows. */
    CONNECTING,

    /** Media flowing both ways — the active call screen with timer/controls. */
    CONNECTED,

    /** Call ended normally after having connected. */
    DISCONNECTED,

    /** Call could not be established (signaling, ICE, or media failure). */
    FAILED,

    /** Owner already on another call — visitor offer auto-rejected with `owner_busy`. */
    BUSY,

    /** Owner explicitly declined before connecting. */
    REJECTED,

    /** Incoming call rang out with no owner response. */
    MISSED,
}

/** Why a call ended — drives the label/icon on the Call Ended screen. */
enum class CallEndReason {
    OWNER_HUNG_UP,
    VISITOR_HUNG_UP,
    OWNER_DECLINED,
    OWNER_BUSY,
    NO_ANSWER,
    NETWORK_FAILED,
    UNKNOWN,
}

/**
 * Immutable snapshot of the call currently being displayed. One instance
 * per attempt (`callId` is the same `crypto.randomUUID()` value the
 * visitor's `services/webrtcCall.js` generates and sends in the
 * `incoming-call` broadcast).
 *
 * [callerName] is best-effort: the `incoming-call` payload itself only
 * carries `plateId` (see `services/webrtcCall.js`), so a display name is
 * resolved separately from the existing visitor/plate lookup this app
 * already has (`VisitorRepository`/`DashboardRepository`) where possible,
 * falling back to a plate-based label. Never invented.
 */
data class CallSession(
    val callId: String,
    val plateId: String?,
    val callerName: String?,
    val phase: CallPhase = CallPhase.IDLE,
    val startedAtEpochMs: Long? = null,
    val connectedAtEpochMs: Long? = null,
    val endReason: CallEndReason? = null,
)
