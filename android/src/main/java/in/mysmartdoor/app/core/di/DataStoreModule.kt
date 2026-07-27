package `in`.mysmartdoor.app.core.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import `in`.mysmartdoor.app.core.session.sessionDataStore
import javax.inject.Singleton

/**
 * Provides the app's single DataStore<Preferences> instance for session data.
 * Consumed by [in.mysmartdoor.app.core.session.SecureSessionManager] only.
 */
@Module
@InstallIn(SingletonComponent::class)
object DataStoreModule {

    @Provides
    @Singleton
    fun provideSessionDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        context.sessionDataStore
}
