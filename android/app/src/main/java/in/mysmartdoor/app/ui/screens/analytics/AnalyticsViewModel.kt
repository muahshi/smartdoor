package `in`.mysmartdoor.app.ui.screens.analytics

import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.AnalyticsRepository
import `in`.mysmartdoor.app.core.data.model.AnalyticsData
import `in`.mysmartdoor.app.core.data.model.AnalyticsRange
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
 * Presentation state for [AnalyticsScreen]. Same shape/behavior convention
 * as [in.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel]'s
 * [in.mysmartdoor.app.ui.screens.dashboard.DashboardUiState] — [data] is
 * kept across refreshes/range switches so the screen doesn't blank while a
 * new range loads; only the very first load (no [data] yet) shows the
 * full-screen skeleton.
 */
data class AnalyticsUiState(
    val range: AnalyticsRange = AnalyticsRange.Last7Days,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val data: AnalyticsData? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class AnalyticsViewModel @Inject constructor(
    private val analyticsRepository: AnalyticsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnalyticsUiState())
    val uiState: StateFlow<AnalyticsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    /** Initial load / retry-after-error — shows the full-screen loading state. */
    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            fetch(_uiState.value.range)
        }
    }

    /** Pull-to-refresh / manual refresh — keeps existing content visible while it runs. */
    fun refresh() {
        if (_uiState.value.isRefreshing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            fetch(_uiState.value.range)
        }
    }

    /** 7/30/90-day filter switch — re-fetches for the newly selected range, keeping current content visible while it loads. */
    fun onRangeSelected(range: AnalyticsRange) {
        if (range == _uiState.value.range) return
        _uiState.update { it.copy(range = range) }
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            fetch(range)
        }
    }

    private suspend fun fetch(range: AnalyticsRange) {
        when (val result = analyticsRepository.getAnalyticsData(range)) {
            is Result.Success -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, data = result.data, errorMessage = null)
            }
            is Result.Error -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, errorMessage = result.error.message)
            }
            Result.Loading -> Unit // safeApiCall never emits this; exhaustive branch only
        }
    }
}
