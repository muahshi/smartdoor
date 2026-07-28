package `in`.mysmartdoor.app.ui.screens.account

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.SettingsRepository
import `in`.mysmartdoor.app.core.data.model.SettingsData
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
 * Presentation state for [AccountScreen]. Reuses [SettingsRepository] —
 * same aggregate read [in.mysmartdoor.app.ui.screens.settings.SettingsScreen]
 * uses — rather than a second repository, since Owner Profile / Plate /
 * Subscription come from the exact same `users`/`plates`/`subscriptions`
 * reads either screen needs.
 */
data class AccountUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val data: SettingsData? = null,
    val errorMessage: String? = null,
    val isEditingName: Boolean = false,
    val isSavingName: Boolean = false,
    val nameError: String? = null,
)

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val repository: SettingsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AccountUiState())
    val uiState: StateFlow<AccountUiState> = _uiState.asStateFlow()

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

    fun startEditingName() {
        _uiState.update { it.copy(isEditingName = true, nameError = null) }
    }

    fun cancelEditingName() {
        _uiState.update { it.copy(isEditingName = false, nameError = null) }
    }

    fun saveName(newName: String) {
        val current = _uiState.value.data ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSavingName = true, nameError = null) }
            when (val result = repository.updateOwnerName(newName)) {
                is Result.Success -> _uiState.update {
                    it.copy(
                        isSavingName = false,
                        isEditingName = false,
                        data = current.copy(owner = current.owner.copy(fullName = newName.trim())),
                    )
                }
                is Result.Error -> _uiState.update {
                    it.copy(isSavingName = false, nameError = result.error.message)
                }
                Result.Loading -> Unit
            }
        }
    }
}
