package `in`.mysmartdoor.app.ui.screens.aireceptionist

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.AiReceptionistRepository
import `in`.mysmartdoor.app.core.data.model.AiReceptionistData
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
 * Presentation state for [AiReceptionistScreen].
 *
 * [data] is kept during [isRefreshing] so a manual refresh doesn't blank
 * already-loaded content — only the very first load (no data yet) shows
 * the full-screen skeleton, same convention as
 * [in.mysmartdoor.app.ui.screens.messages.MessagesUiState].
 */
data class AiReceptionistUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val data: AiReceptionistData? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class AiReceptionistViewModel @Inject constructor(
    private val repository: AiReceptionistRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AiReceptionistUiState())
    val uiState: StateFlow<AiReceptionistUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    /** Initial load / retry-after-error — shows the full-screen loading state. */
    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            fetch()
        }
    }

    /** Manual refresh (pull-to-refresh / top-bar icon) — keeps existing content visible while it runs. */
    fun refresh() {
        if (_uiState.value.isRefreshing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            fetch()
        }
    }

    private suspend fun fetch() {
        when (val result = repository.getAiReceptionistData()) {
            is Result.Success -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, data = result.data, errorMessage = null)
            }
            is Result.Error -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, errorMessage = result.error.message)
            }
            Result.Loading -> Unit
        }
    }
}
