package `in`.mysmartdoor.app.ui.screens.splash

import `in`.mysmartdoor.app.core.data.AuthRepository
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
 * unverified session. No backend/RLS/SQL change.
 */
@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _hasSession = MutableStateFlow<Boolean?>(null)
    val hasSession: StateFlow<Boolean?> = _hasSession.asStateFlow()

    init {
        viewModelScope.launch {
            _hasSession.value = authRepository.restoreSession()
        }
    }
}
