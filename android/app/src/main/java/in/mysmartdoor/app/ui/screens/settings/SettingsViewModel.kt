package `in`.mysmartdoor.app.ui.screens.settings

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.AuthRepository
import `in`.mysmartdoor.app.core.data.SettingsRepository
import `in`.mysmartdoor.app.core.data.model.SettingsData
import `in`.mysmartdoor.app.core.network.dto.NotificationPreferencesDto
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Which step of the in-app Change PIN (OTP recovery) flow the dialog is showing, if any. */
enum class PinChangeStep { CLOSED, CHOOSE_CHANNEL, ENTER_OTP }

/**
 * Presentation state for [SettingsScreen]. [data] is kept during
 * [isRefreshing] so a manual refresh doesn't blank already-loaded content —
 * same convention as [in.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistUiState].
 *
 * Each toggle has its own `*Saving` flag rather than one screen-wide
 * "saving" flag, so flipping one switch doesn't visually disable every
 * other switch on the screen while its own write is in flight.
 */
data class SettingsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val data: SettingsData? = null,
    val errorMessage: String? = null,
    val callForwardingSaving: Boolean = false,
    val autoReplySaving: Boolean = false,
    val notificationPrefsSaving: Boolean = false,
    val actionError: String? = null,
    val pinChangeStep: PinChangeStep = PinChangeStep.CLOSED,
    val pinChangeLoading: Boolean = false,
    val pinChangeError: String? = null,
    val pinChangeMaskedContact: String? = null,
    val pinChangeChannel: String? = null,
    val pinChangeSuccess: Boolean = false,
    val showLogoutConfirm: Boolean = false,
    val isLoggingOut: Boolean = false,
    val loggedOut: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: SettingsRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            fetch()
        }
    }

    fun refresh() {
        if (_uiState.value.isRefreshing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            fetch()
        }
    }

    private suspend fun fetch() {
        when (val result = repository.getSettingsData()) {
            is Result.Success -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, data = result.data, errorMessage = null)
            }
            is Result.Error -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, errorMessage = result.error.message)
            }
            Result.Loading -> Unit
        }
    }

    /** Dismisses the transient write-failure message shown after a toggle/save fails. */
    fun dismissActionError() {
        _uiState.update { it.copy(actionError = null) }
    }

    // ────────── AI Receptionist / Masked Calling toggles ──────────

    fun setCallForwarding(enabled: Boolean) {
        val current = _uiState.value.data ?: return
        val currentRules = current.securityRules ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(callForwardingSaving = true) }
            val updated = current.copy(securityRules = currentRules.copy(callForwarding = enabled))
            when (val result = repository.updateCallForwarding(enabled)) {
                is Result.Success -> _uiState.update { it.copy(callForwardingSaving = false, data = updated) }
                is Result.Error -> _uiState.update {
                    it.copy(callForwardingSaving = false, actionError = result.error.message)
                }
                Result.Loading -> Unit
            }
        }
    }

    fun setAutoReplyEnabled(enabled: Boolean) {
        val current = _uiState.value.data ?: return
        val currentRules = current.securityRules ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(autoReplySaving = true) }
            val updated = current.copy(securityRules = currentRules.copy(autoReplyEnabled = enabled))
            when (val result = repository.updateAutoReplyEnabled(enabled)) {
                is Result.Success -> _uiState.update { it.copy(autoReplySaving = false, data = updated) }
                is Result.Error -> _uiState.update {
                    it.copy(autoReplySaving = false, actionError = result.error.message)
                }
                Result.Loading -> Unit
            }
        }
    }

    // ────────── Notification Preferences ──────────

    fun setSoundEnabled(enabled: Boolean) = saveNotificationPreferences {
        it.copy(soundEnabled = enabled)
    }

    fun setQuietHoursEnabled(enabled: Boolean) = saveNotificationPreferences {
        it.copy(quietHoursEnabled = enabled)
    }

    private fun saveNotificationPreferences(
        transform: (NotificationPreferencesDto) -> NotificationPreferencesDto,
    ) {
        val current = _uiState.value.data ?: return
        val updated = transform(current.notificationPreferences)
        viewModelScope.launch {
            _uiState.update { it.copy(notificationPrefsSaving = true) }
            when (val result = repository.saveNotificationPreferences(updated)) {
                is Result.Success -> _uiState.update {
                    it.copy(notificationPrefsSaving = false, data = current.copy(notificationPreferences = updated))
                }
                is Result.Error -> _uiState.update {
                    it.copy(notificationPrefsSaving = false, actionError = result.error.message)
                }
                Result.Loading -> Unit
            }
        }
    }

    // ────────── Change PIN (OTP recovery flow) ──────────

    fun openChangePin() {
        _uiState.update {
            it.copy(
                pinChangeStep = PinChangeStep.CHOOSE_CHANNEL,
                pinChangeError = null,
                pinChangeSuccess = false,
            )
        }
    }

    fun dismissChangePin() {
        _uiState.update {
            it.copy(
                pinChangeStep = PinChangeStep.CLOSED,
                pinChangeLoading = false,
                pinChangeError = null,
                pinChangeMaskedContact = null,
                pinChangeChannel = null,
            )
        }
    }

    /** @param channel 'phone' or 'email'. */
    fun requestPinChangeOtp(channel: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(pinChangeLoading = true, pinChangeError = null) }
            when (val result = repository.requestPinChangeOtp(channel)) {
                is Result.Success -> _uiState.update {
                    it.copy(
                        pinChangeLoading = false,
                        pinChangeStep = PinChangeStep.ENTER_OTP,
                        pinChangeMaskedContact = result.data.maskedContact,
                        pinChangeChannel = channel,
                    )
                }
                is Result.Error -> _uiState.update {
                    it.copy(pinChangeLoading = false, pinChangeError = result.error.message)
                }
                Result.Loading -> Unit
            }
        }
    }

    fun submitPinChangeOtp(otp: String, newPin: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(pinChangeLoading = true, pinChangeError = null) }
            when (val result = repository.verifyPinChangeOtp(otp, newPin)) {
                is Result.Success -> _uiState.update {
                    it.copy(
                        pinChangeLoading = false,
                        pinChangeStep = PinChangeStep.CLOSED,
                        pinChangeSuccess = true,
                        pinChangeMaskedContact = null,
                        pinChangeChannel = null,
                    )
                }
                is Result.Error -> _uiState.update {
                    it.copy(pinChangeLoading = false, pinChangeError = result.error.message)
                }
                Result.Loading -> Unit
            }
        }
    }

    fun dismissPinChangeSuccess() {
        _uiState.update { it.copy(pinChangeSuccess = false) }
    }

    // ────────── Logout ──────────

    fun requestLogout() {
        _uiState.update { it.copy(showLogoutConfirm = true) }
    }

    fun dismissLogoutConfirm() {
        _uiState.update { it.copy(showLogoutConfirm = false) }
    }

    fun confirmLogout() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoggingOut = true, showLogoutConfirm = false) }
            authRepository.logout()
            _uiState.update { it.copy(isLoggingOut = false, loggedOut = true) }
        }
    }
}
