package `in`.mysmartdoor.app.core.network

import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.config.EnvironmentConfig
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Builds and holds the single [SupabaseClient] instance for the app.
 *
 * Mirrors services/supabase.js on the web side: one client, Auth/Postgrest/
 * Realtime plugins attached up front so every future phase (auth, visitor
 * feed, presence channels) just uses [client] rather than re-configuring it.
 *
 * Phase A1.2 scope: the client is *constructed* here but never invoked —
 * no `.auth.signIn`, no `.from(...)`, no `.channel(...)` calls exist yet.
 * Construction itself does not make a network call.
 */
@Singleton
class SupabaseClientProvider @Inject constructor(
    private val environmentConfig: EnvironmentConfig,
) {

    val client: SupabaseClient by lazy {
        if (!environmentConfig.isConfigured) {
            Logger.w(
                message = "Supabase URL/anon key not configured for " +
                    "'${environmentConfig.environmentName}' — set the " +
                    "SMARTDOOR_${environmentConfig.environmentName.uppercase()}_SUPABASE_URL / " +
                    "_SUPABASE_ANON_KEY environment variables."
            )
        }
        createSupabaseClient(
            supabaseUrl = environmentConfig.supabaseUrl,
            supabaseKey = environmentConfig.supabaseAnonKey,
        ) {
            install(Auth) {
                alwaysAutoRefresh = true
                autoLoadFromStorage = false // A1.2: session restore wired up with SecureSessionManager in a later phase
            }
            install(Postgrest)
            install(Realtime)
            // Phase A1.5 — lets AuthRepository call client.functions.invoke("verify-pin", ...),
            // reusing the same production Edge Function services/auth.js calls on the website.
            install(Functions)
        }
    }
}
