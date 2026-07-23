package `in`.mysmartdoor.app.core.config

import `in`.mysmartdoor.app.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Typed view over the per-flavor BuildConfig fields (dev/staging/prod).
 *
 * BuildConfig.SUPABASE_URL / SUPABASE_ANON_KEY are populated at build time
 * from environment variables (see app/build.gradle.kts) — never hardcoded,
 * mirroring how the web app resolves VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 *
 * Nothing reads this class yet outside [in.mysmartdoor.app.core.network].
 * No screen or ViewModel touches it in A1.2.
 */
@Singleton
class EnvironmentConfig @Inject constructor() {

    val environmentName: String = BuildConfig.ENVIRONMENT_NAME
    val supabaseUrl: String = BuildConfig.SUPABASE_URL
    val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY
    val isDebugBuild: Boolean = BuildConfig.DEBUG

    val isDev: Boolean get() = environmentName == "dev"
    val isStaging: Boolean get() = environmentName == "staging"
    val isProd: Boolean get() = environmentName == "prod"

    /**
     * True once the build has real values wired in (CI secrets / local.properties).
     * Lets [in.mysmartdoor.app.core.network.SupabaseClientProvider] fail loudly and
     * early instead of the SDK failing with an opaque error later.
     */
    val isConfigured: Boolean get() = supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank()
}
