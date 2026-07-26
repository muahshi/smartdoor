package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.config.EnvironmentConfig
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
    private val environmentConfig: EnvironmentConfig,
) : BaseRepository() {

    /**
     * @param plateId raw input from the field, e.g. "sd-abx9k7" — normalized
     *   (trim + uppercase) here, matching both `services/auth.js` and the
     *   Edge Function's own normalization.
     * @param pin raw 4-digit PIN input, unmodified other than trimming.
     */
    suspend fun loginOwner(plateId: String, pin: String): Result<Unit> {
        // Root-cause guard: an empty/unset SUPABASE_URL or SUPABASE_ANON_KEY
        // used to reach the Ktor client and fail as a raw connection error,
        // which BaseRepository.safeApiCall generically maps to
        // AppError.Network ("No internet connection") — misleading on a
        // device with working internet. Catch it here instead, before any
        // network call is attempted, with a message that names the real
        // problem.
        if (!environmentConfig.isConfigured) {
            return Result.Error(
                AppError.Server(
                    message = "App is not configured for the '${environmentConfig.environmentName}' " +
                        "environment (missing Supabase URL/key). Contact support.",
                )
            )
        }

        return safeApiCall {
            loginOwnerInternal(plateId, pin)
        }
    }

    private suspend fun loginOwnerInternal(plateId: String, pin: String) {
        val normalizedPlateId = plateId.trim().uppercase()
        val normalizedPin = pin.trim()

        // ── Step 1: verify-pin (bcrypt check + lockout/rate-limit, server-side) ──
        val rawResponse = client.functions.invoke(
            function = "verify-pin",
            body = VerifyPinRequest(plateId = normalizedPlateId, pin = normalizedPin),
        )
        val payload: VerifyPinResponse = json.decodeFromString(rawResponse.bodyAsText())

        val tokenHash = payload.token
        if (!payload.success || tokenHash.isNullOrBlank()) {
            throw IllegalStateException(
                payload.message ?: "Invalid Plate ID or PIN. Please try again."
            )
        }

        // ── Step 2: exchange the hashed magic-link token for a real session ──
        // CONFIRMED against supabase-kt 3.1.4 source (Auth.kt / AuthImpl.kt):
        // verifyEmailOtp has two distinct overloads —
        //   verifyEmailOtp(type, email, token, captchaToken)   → body { type, token, email }
        //   verifyEmailOtp(type, tokenHash, captchaToken)      → body { type, token_hash }
        // `payload.token` from verify-pin is a hashed magic-link token
        // (`hashed_token` from the Edge Function's `generateLink()` call), the
        // same value the web sends as `token_hash` via
        // `supabase.auth.verifyOtp({ token_hash: data.token, type: 'magiclink' })`.
        // The previous code used the first (`token=`) overload, which puts the
        // hash in the `token` field — Supabase Auth then tries to validate it
        // as a live short-lived OTP code, fails, and returns `otp_expired` even
        // though the token itself is fine. Using the `tokenHash=` overload sends
        // it as `token_hash`, matching both the web flow and what verify-pin
        // actually issues. Same Edge Function, same two-step exchange, same
        // Supabase project — no auth design change.
        client.auth.verifyEmailOtp(
            type = OtpType.Email.MAGIC_LINK,
            tokenHash = tokenHash,
        )

        val session = client.auth.currentSessionOrNull()
            ?: throw IllegalStateException("Login succeeded but no session was returned. Please try again.")

        // ── Step 3: persist via the existing A1.2 secure session layer ──
        sessionManager.saveAccessToken(session.accessToken)
        sessionManager.saveRefreshToken(session.refreshToken)
        sessionManager.saveUserId(payload.ownerId.orEmpty())
    }
}
