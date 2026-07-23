package `in`.mysmartdoor.app.core.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import `in`.mysmartdoor.app.core.network.SupabaseClientProvider
import io.github.jan.supabase.SupabaseClient
import kotlinx.serialization.json.Json
import javax.inject.Singleton

/**
 * Provides networking singletons: the [SupabaseClient] (via
 * [SupabaseClientProvider]) and a shared [Json] instance for any manual
 * (de)serialization outside what the Supabase SDK handles.
 *
 * [in.mysmartdoor.app.core.config.EnvironmentConfig] and
 * [SupabaseClientProvider] are not provided here — both have @Inject
 * constructors, so Hilt constructs them directly; a @Provides for either
 * would create a duplicate binding.
 *
 * Nothing in this module is injected into a screen/ViewModel yet — it's
 * available for the auth and data phases that follow A1.2.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideSupabaseClient(provider: SupabaseClientProvider): SupabaseClient = provider.client

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }
}
