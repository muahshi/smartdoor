package `in`.mysmartdoor.app.core.session

import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Encrypted session token storage. Values are AES/GCM-encrypted via
 * [KeystoreCryptoManager] before being written to [sessionDataStore], so the
 * DataStore file on disk never contains a readable token even if extracted
 * from the device.
 *
 * Phase A1.2 scope: storage primitive only. Nothing calls
 * [saveAccessToken]/[saveRefreshToken] yet — that starts when the actual
 * Supabase auth (verify-pin) flow is implemented.
 */
@Singleton
class SecureSessionManager @Inject constructor(
    private val dataStore: androidx.datastore.core.DataStore<Preferences>,
    private val crypto: KeystoreCryptoManager,
) {

    private object Keys {
        val ACCESS_TOKEN = stringPreferencesKey("encrypted_access_token")
        val REFRESH_TOKEN = stringPreferencesKey("encrypted_refresh_token")
        val USER_ID = stringPreferencesKey("encrypted_user_id")
    }

    val accessTokenFlow: Flow<String?> = dataStore.data.map { prefs ->
        prefs[Keys.ACCESS_TOKEN]?.let { crypto.decrypt(it) }
    }

    val refreshTokenFlow: Flow<String?> = dataStore.data.map { prefs ->
        prefs[Keys.REFRESH_TOKEN]?.let { crypto.decrypt(it) }
    }

    val userIdFlow: Flow<String?> = dataStore.data.map { prefs ->
        prefs[Keys.USER_ID]?.let { crypto.decrypt(it) }
    }

    suspend fun saveAccessToken(token: String) {
        dataStore.edit { it[Keys.ACCESS_TOKEN] = crypto.encrypt(token) }
    }

    suspend fun saveRefreshToken(token: String) {
        dataStore.edit { it[Keys.REFRESH_TOKEN] = crypto.encrypt(token) }
    }

    suspend fun saveUserId(userId: String) {
        dataStore.edit { it[Keys.USER_ID] = crypto.encrypt(userId) }
    }

    /** Clears all session data — for logout / forced session invalidation. */
    suspend fun clearSession() {
        dataStore.edit { it.clear() }
    }
}
