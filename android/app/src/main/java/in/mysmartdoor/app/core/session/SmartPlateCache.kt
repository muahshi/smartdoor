package `in`.mysmartdoor.app.core.session

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 12E.2 — PREMIUM APP IDENTITY, Task 4 (offline case): a small,
 * unencrypted snapshot of the last successfully-fetched
 * [in.mysmartdoor.app.core.data.model.DashboardData] fields the Premium
 * Splash's dynamic Smart Plate needs — owner name, plate id/product type,
 * subscription plan/status, and AI status. Reuses the same
 * [sessionDataStore] instance [SecureSessionManager] already writes to
 * (via the same [DataStore] Hilt already provides in
 * [in.mysmartdoor.app.core.di.DataStoreModule]), under distinct keys, so
 * this is not a new DataStore file — just a few more keys in the existing
 * one. Nothing here is sensitive (no tokens/PII beyond what the physical
 * nameplate itself already displays), so unlike [SecureSessionManager] no
 * [KeystoreCryptoManager] encryption is applied.
 *
 * [SplashViewModel] writes a snapshot every time a live dashboard fetch
 * succeeds and reads it back only when a live fetch isn't possible
 * (offline / request failed) so the splash still shows the owner's real
 * plate instead of falling back to the generic branding — matching Task
 * 4's "If offline: Use cached data" requirement. A cached snapshot is only
 * ever read when [in.mysmartdoor.app.ui.screens.splash.SplashViewModel]
 * has already confirmed `hasSession == true` via the existing
 * [in.mysmartdoor.app.core.data.AuthRepository.restoreSession] check, so a
 * signed-out device never displays a previous owner's cached plate — no
 * change to [in.mysmartdoor.app.core.data.AuthRepository]/logout was
 * needed for that guarantee. [clear] is provided for completeness (e.g. a
 * future "switch account" flow) but nothing calls it yet.
 */
@Singleton
class SmartPlateCache @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    private object Keys {
        val OWNER_NAME = stringPreferencesKey("cache_owner_name")
        val PLATE_ID = stringPreferencesKey("cache_plate_id")
        val PRODUCT_TYPE = stringPreferencesKey("cache_product_type")
        val QR_SLUG = stringPreferencesKey("cache_qr_slug")
        val SUBSCRIPTION_PLAN = stringPreferencesKey("cache_subscription_plan")
        val SUBSCRIPTION_STATUS = stringPreferencesKey("cache_subscription_status")
        val AI_ENABLED = stringPreferencesKey("cache_ai_enabled")
    }

    suspend fun save(snapshot: SmartPlateSnapshot) {
        dataStore.edit { prefs ->
            prefs[Keys.OWNER_NAME] = snapshot.ownerName
            prefs[Keys.PLATE_ID] = snapshot.plateId
            prefs[Keys.PRODUCT_TYPE] = snapshot.productType.orEmpty()
            prefs[Keys.QR_SLUG] = snapshot.qrSlug.orEmpty()
            prefs[Keys.SUBSCRIPTION_PLAN] = snapshot.subscriptionPlan.orEmpty()
            prefs[Keys.SUBSCRIPTION_STATUS] = snapshot.subscriptionStatus.orEmpty()
            prefs[Keys.AI_ENABLED] = snapshot.aiEnabled.toString()
        }
    }

    /** Returns the last saved snapshot, or null if nothing has ever been cached. */
    suspend fun read(): SmartPlateSnapshot? {
        val prefs = dataStore.data.first()
        val ownerName = prefs[Keys.OWNER_NAME] ?: return null
        val plateId = prefs[Keys.PLATE_ID] ?: return null
        return SmartPlateSnapshot(
            ownerName = ownerName,
            plateId = plateId,
            productType = prefs[Keys.PRODUCT_TYPE]?.takeIf { it.isNotBlank() },
            qrSlug = prefs[Keys.QR_SLUG]?.takeIf { it.isNotBlank() },
            subscriptionPlan = prefs[Keys.SUBSCRIPTION_PLAN]?.takeIf { it.isNotBlank() },
            subscriptionStatus = prefs[Keys.SUBSCRIPTION_STATUS]?.takeIf { it.isNotBlank() },
            aiEnabled = prefs[Keys.AI_ENABLED]?.toBooleanStrictOrNull() ?: false,
        )
    }

    /** Signed-out device should never show a previous owner's plate. */
    suspend fun clear() {
        dataStore.edit { prefs ->
            prefs.remove(Keys.OWNER_NAME)
            prefs.remove(Keys.PLATE_ID)
            prefs.remove(Keys.PRODUCT_TYPE)
            prefs.remove(Keys.QR_SLUG)
            prefs.remove(Keys.SUBSCRIPTION_PLAN)
            prefs.remove(Keys.SUBSCRIPTION_STATUS)
            prefs.remove(Keys.AI_ENABLED)
        }
    }
}

/**
 * Screen-ready snapshot for the Premium Splash's Smart Plate card — the
 * same shape whether it came from a live [in.mysmartdoor.app.core.data.DashboardRepository]
 * fetch or from [SmartPlateCache.read]'s offline fallback.
 */
data class SmartPlateSnapshot(
    val ownerName: String,
    val plateId: String,
    val productType: String?,
    val qrSlug: String?,
    val subscriptionPlan: String?,
    val subscriptionStatus: String?,
    val aiEnabled: Boolean,
)
