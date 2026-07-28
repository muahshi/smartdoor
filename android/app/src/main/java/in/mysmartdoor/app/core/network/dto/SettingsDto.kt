package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Row DTO for `notification_preferences` (see `sql/48_notification_center.sql`).
 * One row per owner, `owner_id` is the primary key. RLS already scopes
 * select/upsert/update to the signed-in owner (`notification_preferences_select_own`
 * / `_upsert_own` / `_update_own`) — no new backend, this is Settings V1's
 * first read of a table Android has never touched before.
 *
 * Field defaults here mirror the table's own `DEFAULT` values exactly, so a
 * brand-new owner who has never saved a preference (no row yet — this table
 * has no auto-provisioning trigger) still gets the same production defaults
 * the website falls back to, per the SQL comment: "defaults applied
 * client-side (services/notifications.js#DEFAULT_CATEGORY_PREFS) when a
 * category key is absent". Not fake data — same convention already
 * documented in the schema itself.
 *
 * [categoryPrefs] is left as a raw [JsonObject] rather than modeled per-key:
 * its shape (`{ "<category>": { "in_app": bool, "push": bool } }`) is
 * owner-extensible and no category list is fixed in the schema. Settings V1
 * only surfaces [soundEnabled] / [quietHoursEnabled] / [quietHoursStart] /
 * [quietHoursEnd] — per-category push/in-app toggles are a real gap, not
 * wired up this phase (see CTO audit).
 */
@Serializable
data class NotificationPreferencesDto(
    @SerialName("owner_id") val ownerId: String? = null,
    @SerialName("sound_enabled") val soundEnabled: Boolean = true,
    @SerialName("quiet_hours_enabled") val quietHoursEnabled: Boolean = false,
    @SerialName("quiet_hours_start") val quietHoursStart: String = "22:00:00",
    @SerialName("quiet_hours_end") val quietHoursEnd: String = "07:00:00",
    @SerialName("category_prefs") val categoryPrefs: JsonObject? = null,
)

/**
 * Partial-update request bodies for [in.mysmartdoor.app.core.data.SettingsRepository]'s
 * write calls. Each carries exactly the one column being changed — a
 * Postgrest `.update(value)` call serializes [value] as the full JSON body
 * to `SET`, so a request DTO with more than one nullable field would risk
 * nulling out a sibling column on partial saves. One field per request
 * keeps every toggle write scoped to the exact column it changes, the same
 * discipline [in.mysmartdoor.app.core.data.DashboardRepository]'s
 * `Columns.list(...)` reads already follow.
 */
@Serializable
data class UpdateOwnerNameRequest(
    @SerialName("full_name") val fullName: String,
)

@Serializable
data class UpdateCallForwardingRequest(
    @SerialName("call_forwarding") val callForwarding: Boolean,
)

@Serializable
data class UpdateAutoReplyRequest(
    @SerialName("auto_reply_enabled") val autoReplyEnabled: Boolean,
)

/**
 * Request body for `supabase/functions/owner-forgot-pin`, step 1 —
 * mirrors `{ plate_id, channel, step: 'request_otp' }` exactly as the Edge
 * Function destructures it. This is the same OTP-based recovery flow the
 * website's "Forgot PIN" screen uses; Settings' in-app "Change PIN" reuses
 * it rather than the onboarding-only `set-owner-pin` function (which
 * requires `pin_hash = 'UNSET'` and rejects any already-onboarded owner).
 */
@Serializable
data class PinRecoveryRequestOtpRequest(
    @SerialName("plate_id") val plateId: String,
    val channel: String,
    val step: String = "request_otp",
)

/** Request body for `owner-forgot-pin` step 2 — verify OTP and set the new PIN. */
@Serializable
data class PinRecoveryVerifyOtpRequest(
    @SerialName("plate_id") val plateId: String,
    val otp: String,
    @SerialName("new_pin") val newPin: String,
    val step: String = "verify_otp",
)

/**
 * Response shared by both `owner-forgot-pin` steps — every field either
 * step can return, per `supabase/functions/owner-forgot-pin/index.ts`.
 * [maskedContact] / [channel] / [expiresInMinutes] are only present on a
 * successful step-1 response; a step-2 response only ever sets
 * [success]/[message].
 */
@Serializable
data class PinRecoveryResponse(
    val success: Boolean,
    val message: String? = null,
    @SerialName("masked_contact") val maskedContact: String? = null,
    val channel: String? = null,
    @SerialName("expires_in_minutes") val expiresInMinutes: Int? = null,
)
