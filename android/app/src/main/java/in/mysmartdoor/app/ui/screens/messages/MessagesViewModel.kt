package `in`.mysmartdoor.app.ui.screens.messages

import `in`.mysmartdoor.app.core.data.MessagesRepository
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.dto.ConversationDto
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
 * Filter chip options shown above the Messages Inbox. Each maps to
 * [MessagesRepository.getConversations]'s existing `filter` parameter,
 * which itself mirrors `listConversations()`'s filter values on the
 * website 1:1 — no new backend concept, just a friendlier label.
 */
enum class MessagesFilter(val label: String, val apiValue: String) {
    All("All", "all"),
    Unread("Unread", "unread"),
    Pinned("Pinned", "pinned"),
    Active("Active", "active"),
    Resolved("Resolved", "resolved"),
}

/**
 * Presentation state for [MessagesScreen].
 *
 * [items] is kept during [isRefreshing] so a manual refresh doesn't blank
 * already-loaded content — only the very first load (no items yet) shows
 * the full-screen skeleton, same convention as
 * [in.mysmartdoor.app.ui.screens.visitors.VisitorFeedUiState].
 *
 * Per CTO direction (initial load + pull-to-refresh only, no Realtime, no
 * pagination this phase) there is no `isLoadingMore`/`hasMore` here, unlike
 * [in.mysmartdoor.app.ui.screens.visitors.VisitorFeedUiState] — intentional,
 * not an oversight.
 */
data class MessagesUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val items: List<ConversationDto> = emptyList(),
    val searchQuery: String = "",
    val selectedFilter: MessagesFilter = MessagesFilter.All,
    val errorMessage: String? = null,
) {
    val unreadTotal: Int get() = items.sumOf { it.unreadCount }
}

@HiltViewModel
class MessagesViewModel @Inject constructor(
    private val messagesRepository: MessagesRepository,
) : ViewModel() {

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 400L
    }

    private val _uiState = MutableStateFlow(MessagesUiState())
    val uiState: StateFlow<MessagesUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

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

    /** Manual refresh (pull-to-refresh) — keeps existing content visible while it runs. */
    fun refresh() {
        if (_uiState.value.isRefreshing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            fetch()
        }
    }

    /** Debounced search — matches server-side `last_message_preview` search. */
    fun onSearchQueryChange(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            fetch()
        }
    }

    fun onFilterSelected(filter: MessagesFilter) {
        if (_uiState.value.selectedFilter == filter) return
        _uiState.update { it.copy(selectedFilter = filter, isLoading = true, errorMessage = null) }
        viewModelScope.launch { fetch() }
    }

    private suspend fun fetch() {
        val state = _uiState.value
        when (
            val result = messagesRepository.getConversations(
                filter = state.selectedFilter.apiValue,
                search = state.searchQuery,
            )
        ) {
            is Result.Success -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, items = result.data)
            }
            is Result.Error -> _uiState.update {
                it.copy(isLoading = false, isRefreshing = false, errorMessage = result.error.message)
            }
            Result.Loading -> Unit
        }
    }
}
