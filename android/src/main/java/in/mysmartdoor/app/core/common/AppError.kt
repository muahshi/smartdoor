package `in`.mysmartdoor.app.core.common

/**
 * App-wide error taxonomy. Deliberately generic and transport-agnostic in
 * A1.2 — Supabase/Auth-specific error mapping (e.g. expired PIN, rate
 * limits) is added when the actual auth calls are implemented in a later
 * phase, without needing to touch this file's shape.
 */
sealed class AppError(open val message: String, open val cause: Throwable? = null) {

    data class Network(
        override val message: String = "No internet connection",
        override val cause: Throwable? = null,
    ) : AppError(message, cause)

    data class Timeout(
        override val message: String = "Request timed out",
        override val cause: Throwable? = null,
    ) : AppError(message, cause)

    data class Server(
        val httpCode: Int? = null,
        override val message: String = "Something went wrong on our end",
        override val cause: Throwable? = null,
    ) : AppError(message, cause)

    data class Auth(
        override val message: String = "Authentication required",
        override val cause: Throwable? = null,
    ) : AppError(message, cause)

    data class Unknown(
        override val message: String = "Unexpected error",
        override val cause: Throwable? = null,
    ) : AppError(message, cause)
}
