package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Phase 12E.15 — MASKED CALL → NATIVE ANDROID FCM NOTIFICATION.
 *
 * Wire shape for [in.mysmartdoor.app.core.data.PushTokenRepository]'s
 * upsert into `push_subscriptions` — the SAME table the web PWA already
 * writes to (`services/push.js`'s `subscribeOwnerToPush`), so
 * `supabase/functions/send-push` fans out to both a device's web token and
 * its native token with no server-side change. `platform` is new in this
 * phase (`sql/71_push_subscriptions_platform.sql`) — every pre-existing
 * web row defaults to `'web'` via the column's DEFAULT; this DTO is only
 * ever used for the native `'android'` value.
 */
@Serializable
data class PushSubscriptionUpsertDto(
    @SerialName("owner_id") val ownerId: String,
    @SerialName("fcm_token") val fcmToken: String,
    @SerialName("platform") val platform: String = "android",
    @SerialName("user_agent") val userAgent: String = "android-native",
)
