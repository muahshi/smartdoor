package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.dto.PushSubscriptionUpsertDto
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 12E.15 — MASKED CALL → NATIVE ANDROID FCM NOTIFICATION.
 *
 * Registers this device's native FCM token into `push_subscriptions` — the
 * SAME table + RLS policies `sql/33_push_subscriptions.sql` already
 * created for the web PWA (`services/push.js`). No new table, no new
 * Edge Function. `supabase/functions/send-push` already fans a push out to
 * every row for an `owner_id` regardless of platform, so a device with
 * both the PWA installed and this native app gets exactly two rows and two
 * deliveries — same as an owner with two browser tabs open today.
 *
 * Called from [in.mysmartdoor.app.core.notification.SmartDoorFirebaseMessagingService.onNewToken]
 * and once at app start (see [in.mysmartdoor.app.SmartDoorApplication])
 * once an owner session exists — mirrors `wireTokenRefresh()`'s
 * re-register-on-resume pattern from the web side, since FCM tokens can
 * rotate and there is no local persistence here to compare against.
 *
 * ══════════════════════════════════════════════════════════════════════
 * VERIFICATION NOTE: `.upsert(value, onConflict = ...)` below matches the
 * supabase-kt 3.x Postgrest API as documented, following the same
 * `client.postgrest.from(...).upsert(...)` pattern already live in
 * [SettingsRepository.saveNotificationPreferences]. Per the CTO brief this
 * has NOT been run through an actual Gradle build in this environment
 * (network/build tooling unavailable here) — run a real compile before
 * merging, same caveat [CallRepository] already carries for its own
 * Realtime calls.
 * ══════════════════════════════════════════════════════════════════════
 */
@Singleton
class PushTokenRepository @Inject constructor(
    private val client: SupabaseClient,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    /**
     * Upserts [token] for the currently signed-in owner. No-ops (returns
     * an [AppError.Auth] Result, does not throw) if there's no owner
     * session yet — e.g. token arrives before login completes. Safe to
     * call repeatedly with the same token (unique on `owner_id, fcm_token`
     * per `sql/33_push_subscriptions.sql`).
     */
    suspend fun registerToken(token: String): Result<Unit> {
        if (token.isBlank()) {
            return Result.Error(AppError.Unknown(message = "Empty FCM token."))
        }
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "No signed-in owner — token not registered yet."))
        }
        return safeApiCall {
            client.postgrest.from("push_subscriptions").upsert(
                PushSubscriptionUpsertDto(ownerId = ownerId, fcmToken = token),
                onConflict = "owner_id,fcm_token",
            )
        }
    }
}
