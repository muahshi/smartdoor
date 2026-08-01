package `in`.mysmartdoor.app.ui.screens.splash

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.AuthRepository
import `in`.mysmartdoor.app.core.data.DashboardRepository
import `in`.mysmartdoor.app.core.session.SmartPlateCache
import `in`.mysmartdoor.app.core.session.SmartPlateSnapshot
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backs [SplashScreen]'s session check — Phase 8 architecture decision:
 * Splash → existing session? → Dashboard, else → Login.
 *
 * UI Stabilization pass: this used to decide `hasSession` purely from
 * whether an encrypted access token *string* existed in
 * `SecureSessionManager` — it never verified that token or re-attached it
 * to the actual Supabase `Auth` session Postgrest calls rely on, which is
 * what caused the intermittent "Owner profile not found" bug on Dashboard
 * after a process restart (see [AuthRepository.restoreSession] for the
 * full root-cause writeup).
 *
 * [hasSession] is now `null` only while [AuthRepository.restoreSession] is
 * in flight, then settles to `true` (a verified session was restored and
 * imported into the Supabase client) or `false` (no session, or the stored
 * one failed verification — [AuthRepository.restoreSession] has already
 * cleared it). [SplashScreen] waits for that first non-null value before
 * deciding where to navigate, so Dashboard can never be reached with an
 * unverified session. No backend/RLS/SQL change — this phase does not
 * touch [AuthRepository.restoreSession] or the Dashboard/Login navigation
 * decision at all.
 *
 * Phase 12E.2 — PREMIUM APP IDENTITY, Task 4 (dynamic Smart Plate): once
 * [hasSession] resolves `true`, this also fetches [DashboardRepository]'s
 * existing owner/plate/subscription/AI data (the exact same repository
 * [in.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel] already
 * uses — no new query, no new table) and exposes it as [plateSnapshot] for
 * the Premium Splash's Smart Plate card. On success the snapshot is cached
 * via [SmartPlateCache] for next time; on failure (most commonly no
 * connectivity) the last cached snapshot is read back instead, so the
 * splash still shows the owner's real plate offline rather than falling
 * back to the generic branding. If [hasSession] is `false`, no fetch is
 * attempted and [plateSnapshot] stays null — the generic Premium Splash is
 * shown, per Task 4's "If user is not logged in: Display the generic
 * Premium Splash."
 */
@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val dashboardRepository: DashboardRepository,
    private val smartPlateCache: SmartPlateCache,
) : ViewModel() {

    private val _hasSession = MutableStateFlow<Boolean?>(null)
    val hasSession: StateFlow<Boolean?> = _hasSession.asStateFlow()

    private val _plateSnapshot = MutableStateFlow<SmartPlateSnapshot?>(null)
    val plateSnapshot: StateFlow<SmartPlateSnapshot?> = _plateSnapshot.asStateFlow()

    init {
        viewModelScope.launch {
            val sessionRestored = authRepository.restoreSession()
            _hasSession.value = sessionRestored

            if (sessionRestored) {
                loadPlateSnapshot()
            }
        }
    }

    private suspend fun loadPlateSnapshot() {
        when (val result = dashboardRepository.getDashboardData()) {
            is Result.Success -> {
                val data = result.data
                val snapshot = SmartPlateSnapshot(
                    ownerName = data.owner.fullName,
                    plateId = data.plate?.plateId ?: data.owner.plateId,
                    productType = data.plate?.productType,
                    qrSlug = data.plate?.qrSlug,
                    subscriptionPlan = data.subscription?.plan,
                    subscriptionStatus = data.subscription?.status,
                    aiEnabled = data.securityRules?.autoReplyEnabled ?: false,
                )
                _plateSnapshot.value = snapshot
                smartPlateCache.save(snapshot)
            }
            is Result.Error -> {
                // Most commonly offline — Task 4's cached-data fallback.
                _plateSnapshot.value = smartPlateCache.read()
            }
            Result.Loading -> Unit // safeApiCall never emits this; exhaustive branch only
        }
    }
}
