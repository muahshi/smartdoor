package `in`.mysmartdoor.app.ui.screens.splash

import `in`.mysmartdoor.app.core.session.SecureSessionManager
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
 * Splash → existing session? → Dashboard, else → Login. Reads the same
 * encrypted [SecureSessionManager] store that `AuthRepository.loginOwner`
 * already writes an access token to on a successful login; this only
 * *reads* that existing flow, no new auth logic, no backend change.
 *
 * [hasSession] is `null` until the DataStore's first emission arrives,
 * then settles to `true`/`false`. [SplashScreen] waits for that first
 * non-null value before deciding where to navigate, rather than racing it.
 */
@HiltViewModel
class SplashViewModel @Inject constructor(
    sessionManager: SecureSessionManager,
) : ViewModel() {

    private val _hasSession = MutableStateFlow<Boolean?>(null)
    val hasSession: StateFlow<Boolean?> = _hasSession.asStateFlow()

    init {
        viewModelScope.launch {
            sessionManager.accessTokenFlow.collect { token ->
                _hasSession.value = !token.isNullOrBlank()
            }
        }
    }
}
