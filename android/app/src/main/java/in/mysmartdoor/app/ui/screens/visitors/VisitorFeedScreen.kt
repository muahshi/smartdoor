package `in`.mysmartdoor.app.ui.screens.visitors

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.network.dto.VisitorActivityDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDAvatar
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDChip
import `in`.mysmartdoor.app.ui.components.SDSearchBar
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfo
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarning
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

/**
 * Visitors Timeline (Phase 4 — VISITORS V2; Phase 12B — PREMIUM SCREEN REBUILD).
 *
 * Data comes entirely from [VisitorFeedViewModel] → [in.mysmartdoor.app.core.data.VisitorRepository],
 * which reads the existing `get_owner_activity_feed` RPC — no mock data,
 * no new backend, no ViewModel/repository changes this phase. Visual-only
 * upgrade built entirely on existing design-system components ([SDTopBar],
 * [SDSearchBar], [SDChip], [GlassCard], [SDAvatar], [SDBadge],
 * [SDBottomNavigation], [SDSkeletonLoaderGroup], [EmptyStateScreen],
 * [ErrorScreen]).
 *
 * Per CTO direction: no image-loading library is added this phase. Even
 * though [VisitorActivityDto.photoUrl] may be non-null, every row renders
 * an [SDAvatar] initials glyph — the architecture (the field is already
 * modeled end-to-end) is ready for a future phase to swap in a real image
 * once an image-loading dependency is approved. The premium avatar "ring"
 * added this phase is a pure status-color border around the existing
 * initials glyph, not a photo.
 *
 * "Delivery status" (per the Phase 12B brief) is rendered from the real
 * [VisitorActivityDto.label]/[VisitorActivityDto.labelColor] fields — the
 * same owner-assigned label the production backend already stores per
 * visitor entry — never a fabricated delivery state.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VisitorFeedScreen(
    navController: NavHostController,
    viewModel: VisitorFeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            totalItems > 0 && lastVisible >= totalItems - 3
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Visitors",
                actions = {
                    IconButton(onClick = { if (!uiState.isRefreshing) viewModel.refresh() }) {
                        if (uiState.isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = SmartDoorSecondaryDark,
                            )
                        } else {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_refresh),
                                contentDescription = "Refresh",
                                modifier = Modifier.size(20.dp),
                                tint = SmartDoorSecondaryDark,
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            SDBottomNavigation(
                items = dashboardBottomNavItems,
                selectedRoute = Routes.VISITOR_FEED,
                onItemSelected = { item ->
                    if (item.route != Routes.VISITOR_FEED) {
                        navController.navigate(item.route) { launchSingleTop = true }
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                uiState.items.isNotEmpty() || !uiState.isLoading -> VisitorFeedContent(
                    uiState = uiState,
                    listState = listState,
                    onSearchQueryChange = viewModel::onSearchQueryChange,
                    onFilterSelected = viewModel::onFilterSelected,
                    onRetry = viewModel::load,
                )
                else -> VisitorFeedSkeleton()
            }
        }
    }
}

@Composable
private fun VisitorFeedContent(
    uiState: VisitorFeedUiState,
    listState: LazyListState,
    onSearchQueryChange: (String) -> Unit,
    onFilterSelected: (VisitorFeedFilter) -> Unit,
    onRetry: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm)) {
            SDSearchBar(
                value = uiState.searchQuery,
                onValueChange = onSearchQueryChange,
                placeholder = "Search visitors, phone, plate",
                onClear = { onSearchQueryChange("") },
            )
            Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
            ) {
                VisitorFeedFilter.entries.forEach { filter ->
                    SDChip(
                        label = filter.label,
                        selected = uiState.selectedFilter == filter,
                        onClick = { onFilterSelected(filter) },
                    )
                }
            }
        }

        when {
            uiState.errorMessage != null && uiState.items.isEmpty() -> ErrorScreen(
                message = uiState.errorMessage,
                onRetry = onRetry,
            )
            uiState.items.isEmpty() -> EmptyStateScreen(
                title = "No visitors yet",
                subtitle = "Visitor calls, deliveries, and guests will show up here once someone rings your Smart Door.",
            )
            else -> {
                val grouped = remember(uiState.items) { groupByDay(uiState.items) }
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = SmartDoorSpacing.md,
                        end = SmartDoorSpacing.md,
                        top = SmartDoorSpacing.xs,
                        bottom = SmartDoorSpacing.lg,
                    ),
                    verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
                ) {
                    grouped.forEach { (dayLabel, entries) ->
                        item(key = "header_$dayLabel") {
                            SDSectionHeader(
                                title = dayLabel,
                                modifier = Modifier.padding(vertical = SmartDoorSpacing.xxs),
                            )
                        }
                        items(entries, key = { it.id }) { entry ->
                            VisitorCard(entry)
                        }
                    }
                    if (uiState.isLoadingMore) {
                        item(key = "loading_more") {
                            Box(modifier = Modifier.fillMaxWidth().padding(SmartDoorSpacing.md)) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp).align(Alignment.Center),
                                    strokeWidth = 2.dp,
                                    color = SmartDoorSecondaryDark,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Premium visitor row — status-ring avatar, badge row (status/label/delivery/favorite/blocked), relative time + duration. */
@Composable
private fun VisitorCard(entry: VisitorActivityDto) {
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .border(width = 2.dp, color = statusRingColor(entry.callStatus), shape = CircleShape)
                    .padding(3.dp),
                contentAlignment = Alignment.Center,
            ) {
                SDAvatar(name = entry.visitorName ?: entry.phone ?: "?", size = 44.dp)
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.visitorName?.takeIf { it.isNotBlank() } ?: entry.phone ?: "Unknown visitor",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs),
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState()),
                ) {
                    statusBadge(entry.callStatus)
                    labelBadge(entry.label, entry.labelColor)
                    if (entry.isFavorite) SDBadge(text = "★ Favorite", status = SDBadgeStatus.Warning)
                    if (entry.blocked) SDBadge(text = "Blocked", status = SDBadgeStatus.Danger)
                }
                if (entry.visitCount > 1) {
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                    Text(
                        text = "${entry.visitCount} visits",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = formatRelativeTime(entry.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (entry.duration > 0) {
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                    Text(
                        text = "${entry.duration}s",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Owner-assigned label (e.g. "Delivery", "Guest") shown from real [VisitorActivityDto.label]/[VisitorActivityDto.labelColor] data — never invented. */
@Composable
private fun labelBadge(label: String?, labelColor: String?) {
    if (label.isNullOrBlank()) return
    val dotColor = parseHexColorOrNull(labelColor) ?: SmartDoorInfo
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(color = dotColor, shape = CircleShape),
        )
        Spacer(modifier = Modifier.width(3.dp))
        SDBadge(text = label, status = SDBadgeStatus.Info)
    }
}

private fun parseHexColorOrNull(hex: String?): Color? {
    if (hex.isNullOrBlank()) return null
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (e: IllegalArgumentException) {
        null
    }
}

private fun statusRingColor(callStatus: String?): Color = when (callStatus) {
    "connected" -> SmartDoorSuccess
    "missed" -> SmartDoorWarning
    "rejected" -> SmartDoorDanger
    "incoming" -> SmartDoorInfo
    else -> SmartDoorSecondaryDark
}

@Composable
private fun statusBadge(callStatus: String?) {
    val (label, status) = when (callStatus) {
        "connected" -> "Accepted" to SDBadgeStatus.Success
        "missed" -> "Missed" to SDBadgeStatus.Warning
        "rejected" -> "Declined" to SDBadgeStatus.Danger
        "cancelled", "failed" -> "Cancelled" to SDBadgeStatus.Neutral
        "incoming" -> "Incoming" to SDBadgeStatus.Info
        else -> return
    }
    SDBadge(text = label, status = status)
}

@Composable
private fun VisitorFeedSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        repeat(6) {
            GlassCard(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.sm)) {
                SDSkeletonLoaderGroup(lineCount = 2)
            }
        }
    }
}

/** Groups entries into "Today" / "Yesterday" / a formatted date, preserving server order within each group. */
private fun groupByDay(items: List<VisitorActivityDto>): List<Pair<String, List<VisitorActivityDto>>> {
    val today = LocalDate.now()
    val grouped = LinkedHashMap<String, MutableList<VisitorActivityDto>>()
    items.forEach { entry ->
        val label = try {
            val date = OffsetDateTime.parse(entry.createdAt).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()
            when (date) {
                today -> "Today"
                today.minusDays(1) -> "Yesterday"
                else -> "${date.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${date.dayOfMonth}"
            }
        } catch (e: Exception) {
            "Earlier"
        }
        grouped.getOrPut(label) { mutableListOf() }.add(entry)
    }
    return grouped.map { it.key to it.value }
}

private fun formatRelativeTime(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return try {
        val then = OffsetDateTime.parse(iso).toInstant()
        val minutes = Duration.between(then, Instant.now()).toMinutes()
        when {
            minutes < 1 -> "Just now"
            minutes < 60 -> "${minutes}m ago"
            minutes < 60 * 24 -> "${minutes / 60}h ago"
            else -> "${minutes / (60 * 24)}d ago"
        }
    } catch (e: Exception) {
        "—"
    }
}
