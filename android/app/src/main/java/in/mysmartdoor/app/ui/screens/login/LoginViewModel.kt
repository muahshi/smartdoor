package `in`.mysmartdoor.app.ui.screens.login

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.AuthRepository
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Presentation state for [LoginScreen]. [loginSucceeded] is a one-shot
 * signal — the screen consumes it via [LoginViewModel.consumeLoginSuccess]
 * once it has navigated, so a config change doesn't re-trigger navigation.
 */
data class LoginUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val loginSucceeded: Boolean = false,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun login(plateId: String, pin: String) {
        if (_uiState.value.isLoading) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            when (val result = authRepository.loginOwner(plateId, pin)) {
                is Result.Success -> _uiState.update {
                    it.copy(isLoading = false, loginSucceeded = true)
                }
                is Result.Error -> _uiState.update {
                    it.copy(isLoading = false, errorMessage = result.error.message)
                }
                Result.Loading -> Unit // safeApiCall never emits this; exhaustive branch only
            }
        }
    }

    /** Called once the screen has acted on [LoginUiState.loginSucceeded]. */
    fun consumeLoginSuccess() {
        _uiState.update { it.copy(loginSucceeded = false) }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
