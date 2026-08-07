package `in`.mysmartdoor.app.core.notification

import `in`.mysmartdoor.app.core.call.IncomingCallController
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.data.PushTokenRepository
import `in`.mysmartdoor.app.core.network.dto.IncomingCallPayload
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 12E.15 — MASKED CALL → NATIVE ANDROID FCM NOTIFICATION.
 *
 * The missing push bridge identified in the CTO audit: before this phase
 * the Android app had ZERO Firebase integration, so a masked-call request
 * could only reach the owner while [IncomingCallController]'s Supabase
 * Realtime `rtc:ring:{ownerId}` subscription was alive — i.e. only while
 * the app process was running with a live socket. This service is what
 * lets a call reach the owner when the app is killed/backgrounded/Doze'd.
 *
 * SCOPE — intentionally narrow, per the CTO brief:
 *   - Only `data.type == "call"` is acted on. Every other existing push
 *     type (bell_ring/qr_scan/voice/text/sos/ai_escalation/status_reminder)
 *     is a web-PWA-only concept today — there is no Android UI for any of
 *     them, so handling them here would mean building a second, unrelated
 *     notification system. Out of scope; logged and ignored.
 *   - Does NOT create a new call-state machine or a new notification UI.
 *     [handleIncomingOfferFromPush] on [IncomingCallController] feeds
 *     straight into the SAME state machine + [CallNotificationManager] +
 *     [in.mysmartdoor.app.service.CallRingForegroundService] the existing
 *     Realtime path already drives.
 *   - Does NOT carry or fabricate SDP/media data — [IncomingCallPayload.sdp]
 *     is passed as `""`, matching what the Realtime path's own
 *     `RtcMediaEngine.createAnswer(remoteOfferSdp = "")` already does
 *     today (see that call site's own comment — real SDP threading is a
 *     pending, approved no-op stub; this phase does not change that).
 *
 * DUPLICATE PROTECTION: delegated entirely to
 * [IncomingCallController.handleIncomingOfferFromPush] — see that
 * function's doc comment for the callId-based dedupe strategy. This class
 * does not attempt its own dedupe.
 *
 * TOKEN LIFECYCLE: [onNewToken] fires on first install/token-rotation and
 * is upserted via [PushTokenRepository] (same `push_subscriptions` table +
 * RLS the web PWA already uses). If no owner session exists yet (token
 * arrives before login), the upsert no-ops — see
 * [in.mysmartdoor.app.SmartDoorApplication] for the additional
 * post-login registration call this relies on to eventually cover that
 * case, mirroring the web app's `wireTokenRefresh()`.
 */
@AndroidEntryPoint
class SmartDoorFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var incomingCallController: IncomingCallController

    @Inject lateinit var pushTokenRepository: PushTokenRepository

    // FirebaseMessagingService has no built-in coroutine scope; this
    // mirrors IncomingCallController's own applicationScope convention
    // (SupervisorJob so one failed registration/dispatch never cancels
    // future callbacks on this same service instance).
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Logger.d(message = "[FCM] onNewToken — registering device token")
        serviceScope.launch {
            when (val result = pushTokenRepository.registerToken(token)) {
                is `in`.mysmartdoor.app.core.common.Result.Error ->
                    Logger.w(message = "[FCM] token registration failed (will retry on next token refresh): ${result.error.message}")
                else -> Unit
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val type = data["type"]
        if (type != "call") {
            // Out of scope for this phase — see class doc. Every other
            // event type has no Android consumer to hand it to.
            Logger.d(message = "[FCM] ignoring non-call push type='$type'")
            return
        }

        val callId = data["callId"]
        if (callId.isNullOrBlank()) {
            Logger.w(message = "[FCM] 'call' push missing callId — dropping malformed payload")
            return
        }
        val plateId = data["plateId"]?.takeIf { it.isNotBlank() }

        Logger.d(message = "[FCM] incoming call push callId=$callId")
        incomingCallController.handleIncomingOfferFromPush(
            IncomingCallPayload(callId = callId, plateId = plateId, sdp = ""),
        )
    }
}
