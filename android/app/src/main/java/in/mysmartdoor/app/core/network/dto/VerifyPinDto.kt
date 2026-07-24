package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Request body for `supabase/functions/verify-pin` — mirrors the exact
 * shape `services/auth.js#loginOwner` sends on the website
 * (`{ plate_id, pin }`). Field names match the Edge Function's `body`
 * destructuring verbatim; do not rename without also checking
 * supabase/functions/verify-pin/index.ts.
 */
@Serializable
data class VerifyPinRequest(
    @SerialName("plate_id") val plateId: String,
    val pin: String,
)

/**
 * Response body from `verify-pin`. Mirrors every field the Edge Function
 * returns on both the success path and the various failure paths (invalid
 * PIN, lockout, rate limit) — see supabase/functions/verify-pin/index.ts.
 *
 * [token] is the magic-link `hashed_token` from `generateLink()`, exchanged
 * via `auth.verifyEmailOtp(type = OtpType.Email.MAGIC_LINK, ...)` — the
 * same two-step handoff `services/auth.js` performs with
 * `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`.
 */
@Serializable
data class VerifyPinResponse(
    val success: Boolean,
    @SerialName("owner_id") val ownerId: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val email: String? = null,
    val token: String? = null,
    val plan: String? = null,
    @SerialName("sub_expiry") val subExpiry: String? = null,
    val message: String? = null,
    val locked: Boolean? = null,
)
