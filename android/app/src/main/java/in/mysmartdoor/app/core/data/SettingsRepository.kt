package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.model.SettingsData
import `in`.mysmartdoor.app.core.network.dto.NotificationPreferencesDto
import `in`.mysmartdoor.app.core.network.dto.OwnerProfileDto
import `in`.mysmartdoor.app.core.network.dto.PinRecoveryRequestOtpRequest
import `in`.mysmartdoor.app.core.network.dto.PinRecoveryResponse
import `in`.mysmartdoor.app.core.network.dto.PinRecoveryVerifyOtpRequest
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SecurityRulesDto
import `in`.mysmartdoor.app.core.network.dto.SubscriptionDto
import `in`.mysmartdoor.app.core.network.dto.UpdateAutoReplyRequest
import `in`.mysmartdoor.app.core.network.dto.UpdateCallForwardingRequest
import `in`.mysmartdoor.app.core.network.dto.UpdateOwnerNameRequest
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Settings & Account (Phase 8) — reads/writes over the exact same
 * production tables [DashboardRepository] already reads (`users`,
 * `plates`, `subscriptions`, `security_rules`), plus `notification_preferences`
 * (`sql/48_notification_center.sql`) which no Android screen has touched
 * before this phase. No new table, column, or Edge Function — see CTO
 * audit (Settings & Account Management) for the full gap analysis.
 *
 * This is the first *write*-capable repository in the app. Every write
 * targets a column already covered by an existing RLS policy:
 *   - `users.full_name`         → `users_update_own` (`sql/02_rls_policies.sql`)
 *   - `security_rules.*`        → same table [AiReceptionistRepository] reads
 *   - `notification_preferences` → `_upsert_own` / `_update_own` (`sql/48`)
 *   - PIN change                → `owner-forgot-pin` Edge Function's own
 *     OTP-gated flow (no session/RLS needed — the OTP itself is the gate)
 *
 * [ownerId] is `users.id`, sourced via [SecureSessionManager] — same
 * convention as every other repository in this package.
 */
@Singleton
class SettingsRepository @Inject constructor(
    private val client: SupabaseClient,
    private val json: Json,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    // ────────── READ ──────────

    suspend fun getSettingsData(): Result<SettingsData> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall { fetchSettingsData(ownerId) }
    }

    private suspend fun fetchSettingsData(ownerId: String): SettingsData = coroutineScope {
        val owner = client.postgrest.from("users")
            .select(columns = Columns.list("id", "full_name", "phone", "email", "plate_id", "created_at")) {
                filter { eq("id", ownerId) }
            }
            .decodeSingleOrNull<OwnerProfileDto>()
            ?: throw IllegalStateException("Owner profile not found. Please log in again.")

        val plateDeferred = async { safeSection(null) { fetchPlate(ownerId) } }
        val subscriptionDeferred = async { safeSection(null) { fetchSubscription(ownerId) } }
        val securityRulesDeferred = async { safeSection(null) { fetchSecurityRules(ownerId) } }
        val notificationPreferencesDeferred =
            async { safeSection(NotificationPreferencesDto(ownerId = ownerId)) { fetchNotificationPreferences(ownerId) } }

        SettingsData(
            owner = owner,
            plate = plateDeferred.await(),
            subscription = subscriptionDeferred.await(),
            securityRules = securityRulesDeferred.await(),
            notificationPreferences = notificationPreferencesDeferred.await(),
        )
    }

    /** Runs [block]; any failure logs and falls back to [default] so one bad section can't blank the screen. */
    private suspend fun <T> safeSection(default: T, block: suspend () -> T): T =
        try {
            block()
        } catch (e: Exception) {
            Logger.e(message = "Settings section fetch failed", throwable = e)
            default
        }

    private suspend fun fetchPlate(ownerId: String): PlateDto? =
        client.postgrest.from("plates")
            .select(
                columns = Columns.list("plate_id", "qr_slug", "product_type", "status", "expiry_date", "updated_at"),
            ) {
                filter { eq("owner_id", ownerId) }
            }
            .decodeSingleOrNull()

    private suspend fun fetchSubscription(ownerId: String): SubscriptionDto? =
        client.postgrest.from("subscriptions")
            .select(columns = Columns.list("plan", "status", "expiry_date")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("status", "active")
                }
                order("created_at", Order.DESCENDING)
                limit(1)
            }
            .decodeSingleOrNull()

    private suspend fun fetchSecurityRules(ownerId: String): SecurityRulesDto? =
        client.postgrest.from("security_rules")
            .select(
                columns = Columns.list(
                    "current_status", "custom_message", "call_forwarding", "auto_reply_enabled", "night_mode_on",
                ),
            ) {
                filter { eq("owner_id", ownerId) }
            }
            .decodeSingleOrNull()

    private suspend fun fetchNotificationPreferences(ownerId: String): NotificationPreferencesDto =
        client.postgrest.from("notification_preferences")
            .select(
                columns = Columns.list(
                    "owner_id", "sound_enabled", "quiet_hours_enabled",
                    "quiet_hours_start", "quiet_hours_end", "category_prefs",
                ),
            ) {
                filter { eq("owner_id", ownerId) }
            }
            .decodeSingleOrNull<NotificationPreferencesDto>()
            // No row yet is a normal, first-time-owner state, not a failure —
            // the constructor defaults already mirror the table's own SQL
            // DEFAULTs (see [NotificationPreferencesDto] doc comment).
            ?: NotificationPreferencesDto(ownerId = ownerId)

    // ────────── WRITE ──────────

    /** Updates only `users.full_name` — RLS: `users_update_own` (`auth_user_id = auth.uid()`). */
    suspend fun updateOwnerName(newName: String): Result<Unit> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        val trimmed = newName.trim()
        if (trimmed.isBlank()) {
            return Result.Error(AppError.Unknown(message = "Name can't be empty."))
        }
        return safeApiCall {
            client.postgrest.from("users")
                .update(UpdateOwnerNameRequest(fullName = trimmed)) {
                    filter { eq("id", ownerId) }
                }
        }
    }

    /** Toggles Masked Calling — `security_rules.call_forwarding`, the same column [in.mysmartdoor.app.core.data.DashboardRepository] reads. */
    suspend fun updateCallForwarding(enabled: Boolean): Result<Unit> =
        updateSecurityRulesColumn { UpdateCallForwardingRequest(callForwarding = enabled) }

    /** Toggles the AI Receptionist auto-reply — `security_rules.auto_reply_enabled`. */
    suspend fun updateAutoReplyEnabled(enabled: Boolean): Result<Unit> =
        updateSecurityRulesColumn { UpdateAutoReplyRequest(autoReplyEnabled = enabled) }

    private suspend inline fun <reified T : Any> updateSecurityRulesColumn(crossinline value: () -> T): Result<Unit> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall {
            client.postgrest.from("security_rules")
                .update(value()) {
                    filter { eq("owner_id", ownerId) }
                }
        }
    }

    /**
     * Upserts the owner's full notification preferences row. Called with the
     * complete, currently-loaded [NotificationPreferencesDto] (categoryPrefs
     * included, unchanged) so a save from the sound/quiet-hours toggles never
     * wipes category-level preferences it doesn't show UI for yet.
     */
    suspend fun saveNotificationPreferences(preferences: NotificationPreferencesDto): Result<Unit> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall {
            client.postgrest.from("notification_preferences")
                .upsert(preferences.copy(ownerId = ownerId))
        }
    }

    // ────────── SECURITY — CHANGE PIN (OTP recovery flow) ──────────

    /**
     * Step 1 of in-app Change PIN — requests a 6-digit OTP via
     * `owner-forgot-pin`, sent to [channel] ('phone' | 'email'). Uses the
     * signed-in owner's own `plate_id`, so the caller never has to ask for
     * it again.
     */
    suspend fun requestPinChangeOtp(channel: String): Result<PinRecoveryResponse> {
        val plateId = sessionManager.userIdFlow.first()?.let { fetchPlateIdForOwner(it) }
        if (plateId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall {
            val raw = client.functions.invoke(
                function = "owner-forgot-pin",
                body = PinRecoveryRequestOtpRequest(plateId = plateId, channel = channel),
            )
            val response: PinRecoveryResponse = json.decodeFromString(raw.bodyAsText())
            if (!response.success) {
                throw IllegalStateException(response.message ?: "Failed to send OTP. Please try again.")
            }
            response
        }
    }

    /** Step 2 — verifies [otp] and sets [newPin] via the same `owner-forgot-pin` function. */
    suspend fun verifyPinChangeOtp(otp: String, newPin: String): Result<Unit> {
        val plateId = sessionManager.userIdFlow.first()?.let { fetchPlateIdForOwner(it) }
        if (plateId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall {
            val raw = client.functions.invoke(
                function = "owner-forgot-pin",
                body = PinRecoveryVerifyOtpRequest(plateId = plateId, otp = otp.trim(), newPin = newPin.trim()),
            )
            val response: PinRecoveryResponse = json.decodeFromString(raw.bodyAsText())
            if (!response.success) {
                throw IllegalStateException(response.message ?: "Invalid OTP. Please try again.")
            }
        }
    }

    private suspend fun fetchPlateIdForOwner(ownerId: String): String? =
        client.postgrest.from("users")
            .select(columns = Columns.list("plate_id")) {
                filter { eq("id", ownerId) }
            }
            .decodeSingleOrNull<PlateIdRow>()
            ?.plateId

    @kotlinx.serialization.Serializable
    private data class PlateIdRow(
        @kotlinx.serialization.SerialName("plate_id") val plateId: String,
    )
}
