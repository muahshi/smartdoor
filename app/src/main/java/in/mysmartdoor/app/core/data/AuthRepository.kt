package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.dto.VerifyPinRequest
import `in`.mysmartdoor.app.core.network.dto.VerifyPinResponse
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owner login — Plate ID + 4-digit PIN, reusing the exact production flow
 * `services/auth.js#loginOwner` / `supabase/functions/verify-pin` already
 * implement on the website. No new auth design: same Edge Function, same
 * two-step magic-link exchange, same Supabase project.
 *
 * Not implemented here (out of scope for A1.5, matches web parity gaps
 * intentionally left for a later phase):
 *  - "Remember this device" / trusted-device persistence (web:
 *    services/auth.js#isTrustedDevice / DEVICE_KEY). [rememberDevice] is
 *    accepted from the UI but currently unused.
 *  - Forgot-PIN flow (web: js/forgotPin.js, owner-forgot-pin Edge Function).
 *  - Audit-log writes on login (web: services/auth.js#_logAudit) — these
 *    write to `audit_logs` directly from the client; left out here rather
 *    than guessing at an RLS-safe client-side insert path.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val client: SupabaseClient,
    private val json: Json,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    /**
     * @param plateId raw input from the field, e.g. "sd-abx9k7" — normalized
     *   (trim + uppercase) here, matching both `services/auth.js` and the
     *   Edge Function's own normalization.
     * @param pin raw 4-digit PIN input, unmodified other than trimming.
     */
    suspend fun loginOwner(plateId: String, pin: String): Result<Unit> = safeApiCall {
        val normalizedPlateId = plateId.trim().uppercase()
        val normalizedPin = pin.trim()

        // ── Step 1: verify-pin (bcrypt check + lockout/rate-limit, server-side) ──
        val rawResponse = client.functions.invoke(
            function = "verify-pin",
            body = VerifyPinRequest(plateId = normalizedPlateId, pin = normalizedPin),
        )
        val payload: VerifyPinResponse = json.decodeFromString(rawResponse.bodyAsText())

        if (!payload.success || payload.token.isNullOrBlank()) {
            throw IllegalStateException(
                payload.message ?: "Invalid Plate ID or PIN. Please try again."
            )
        }

        // ── Step 2: exchange the hashed magic-link token for a real session ──
        // NOTE (verify before shipping): this mirrors the web's
        // `supabase.auth.verifyOtp({ token_hash: data.token, type: 'magiclink' })`,
        // but supabase-kt 3.1.4's documented `verifyEmailOtp` signature only
        // shows a `token` parameter (not a separately-named `tokenHash`). This
        // is the one call in this file that needs a real compile + device test
        // against the actual verify-pin response — if it rejects the hashed
        // token, the fix is almost certainly a differently-named parameter on
        // this same function, not a different auth design.
        client.auth.verifyEmailOtp(
            type = OtpType.Email.MAGIC_LINK,
            email = payload.email.orEmpty(),
            token = payload.token,
        )

        val session = client.auth.currentSessionOrNull()
            ?: throw IllegalStateException("Login succeeded but no session was returned. Please try again.")

        // ── Step 3: persist via the existing A1.2 secure session layer ──
        sessionManager.saveAccessToken(session.accessToken)
        sessionManager.saveRefreshToken(session.refreshToken)
        sessionManager.saveUserId(payload.ownerId.orEmpty())
    }
}
