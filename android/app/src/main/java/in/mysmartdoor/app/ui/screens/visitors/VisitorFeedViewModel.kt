package `in`.mysmartdoor.app.ui.screens.visitors

import `in`.mysmartdoor.app.core.data.VisitorRepository
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.dto.VisitorActivityDto
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Filter chip options shown above the Visitors Timeline. Each maps to the
 * `get_owner_activity_feed` RPC's existing `p_status` / `p_label`
 * parameters (see [VisitorRepository]) — no new backend concept, just a
 * friendlier label for values the RPC already accepts.
 */
enum class VisitorFeedFilter(val label: String) {
    All("All"),
    Accepted("Accepted"),
    Missed("Missed"),
    Declined("Declined"),
    Favorites("Favorites"),
}

private fun VisitorFeedFilter.toRpcStatusAndLabel(): Pair<String, String> = when (this) {
    VisitorFeedFilter.All -> "all" to "all"
    VisitorFeedFilter.Accepted -> "connected" to "all"
    VisitorFeedFilter.Missed -> "missed" to "all"
    VisitorFeedFilter.Declined -> "rejected" to "all"
    VisitorFeedFilter.Favorites -> "all" to "favorites"
}

/**
 * Presentation state for [VisitorFeedScreen].
 *
 * [items] is kept during [isRefreshing]/[isLoadingMore] so those actions
 * don't blank already-loaded content — only the very first load (no items
 * yet) shows the full-screen skeleton, same convention as
 * [in.mysmartdoor.app.ui.screens.dashboard.DashboardUiState].
 */
data class VisitorFeedUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val items: List<VisitorActivityDto> = emptyList(),
    val searchQuery: String = "",
    val selectedFilter: VisitorFeedFilter = VisitorFeedFilter.All,
    val hasMore: Boolean = true,
    val errorMessage: String? = null,
)

@HiltViewModel
class VisitorFeedViewModel @Inject constructor(
    private val visitorRepository: VisitorRepository,
) : ViewModel() {

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 400L
    }

    private val _uiState = MutableStateFlow(VisitorFeedUiState())
    val uiState: StateFlow<VisitorFeedUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        load()
    }

    /** Initial load / retry-after-error — shows the full-screen loading state. */
    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            fetchPage(offset = 0, append = false)
        }
    }

    /** Manual refresh — keeps existing content visible while it runs. */
    fun refresh() {
        if (_uiState.value.isRefreshing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            fetchPage(offset = 0, append = false)
        }
    }

    /** Fetches the next page once the list is scrolled near the bottom. */
    fun loadMore() {
        val current = _uiState.value
        if (current.isLoadingMore || current.isLoading || !current.hasMore) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }
            fetchPage(offset = current.items.size, append = true)
        }
    }

    /** Debounced search — matches server-side name/phone/plate search on the RPC. */
    fun onSearchQueryChange(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            fetchPage(offset = 0, append = false)
        }
    }

    fun onFilterSelected(filter: VisitorFeedFilter) {
        if (_uiState.value.selectedFilter == filter) return
        _uiState.update { it.copy(selectedFilter = filter, isLoading = true, errorMessage = null) }
        viewModelScope.launch { fetchPage(offset = 0, append = false) }
    }

    private suspend fun fetchPage(offset: Int, append: Boolean) {
        val state = _uiState.value
        val (status, label) = state.selectedFilter.toRpcStatusAndLabel()
        when (
            val result = visitorRepository.getVisitorFeed(
                search = state.searchQuery,
                status = status,
                label = label,
                offset = offset,
            )
        ) {
            is Result.Success -> {
                val page = result.data
                val total = page.firstOrNull()?.totalCount ?: 0L
                _uiState.update {
                    val combined = if (append) it.items + page else page
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        isLoadingMore = false,
                        items = combined,
                        hasMore = combined.size < total,
                    )
                }
            }
            is Result.Error -> _uiState.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    isLoadingMore = false,
                    errorMessage = result.error.message,
                )
            }
            Result.Loading -> Unit
        }
    }
}
