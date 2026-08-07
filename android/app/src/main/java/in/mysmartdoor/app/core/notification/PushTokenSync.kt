package `in`.mysmartdoor.app.core.notification

import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.PushTokenRepository
import `in`.mysmartdoor.app.core.network.SupabaseClientProvider
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import com.google.firebase.messaging.FirebaseMessaging
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.tasks.await
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 12E.15 — MASKED CALL → NATIVE ANDROID FCM NOTIFICATION.
 *
 * Registers this device's FCM token into `push_subscriptions`
 * (via [PushTokenRepository]) once an authenticated owner session exists,
 * and re-registers on every subsequent (re-)authentication — covering
 * fresh login, warm-restart, and re-login-as-different-owner. This is the
 * native-app equivalent of the web PWA's `services/push.js`
 * `wireTokenRefresh()`; the same "just call getToken()/register again, the
 * upsert is idempotent" approach applies here (`push_subscriptions` is
 * unique on `owner_id, fcm_token` — see `sql/33_push_subscriptions.sql`).
 *
 * Deliberately mirrors [in.mysmartdoor.app.core.call.IncomingCallController.startListening]'s
 * exact session-readiness gating (same BUGFIX 12E.14 race this guards
 * against also applies to writing to `push_subscriptions` — RLS requires a
 * real JWT), rather than re-deriving it independently.
 *
 * [SmartDoorFirebaseMessagingService.onNewToken] handles the ongoing case
 * (token rotates while already logged in); this class handles the
 * "session becomes ready" case (token already existed before login, or
 * app data was cleared and a fresh token needs to be tied to a
 * newly-logged-in owner).
 */
@Singleton
class PushTokenSync @Inject constructor(
    private val secureSessionManager: SecureSessionManager,
    private val supabaseClientProvider: SupabaseClientProvider,
    private val pushTokenRepository: PushTokenRepository,
) {

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val startedGuard = AtomicBoolean(false)
    private var job: Job? = null

    fun start() {
        if (!startedGuard.compareAndSet(false, true)) return
        job = applicationScope.launch {
            combine(
                secureSessionManager.userIdFlow,
                supabaseClientProvider.client.auth.sessionStatus,
            ) { ownerId, status -> ownerId to status }
                .distinctUntilChanged()
                .collectLatest { (ownerId, status) ->
                    if (ownerId == null || status !is SessionStatus.Authenticated) return@collectLatest
                    registerCurrentToken()
                }
        }
    }

    private suspend fun registerCurrentToken() {
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }
            .onFailure { Logger.w(message = "[PushTokenSync] FirebaseMessaging.getToken() failed — Firebase likely not configured (google-services.json missing). Push registration skipped.", throwable = it) }
            .getOrNull() ?: return

        when (val result = pushTokenRepository.registerToken(token)) {
            is Result.Error -> Logger.w(message = "[PushTokenSync] registerToken failed: ${result.error.message}")
            else -> Logger.d(message = "[PushTokenSync] token registered")
        }
    }
}
