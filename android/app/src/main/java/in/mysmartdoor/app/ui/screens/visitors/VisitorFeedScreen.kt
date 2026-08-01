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
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoader
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfo
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarning
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.LazyListScope
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

/**
 * Visitors Timeline (Phase 4 — VISITORS V2; Phase 12B — PREMIUM SCREEN
 * REBUILD; Phase 12E.5 — PREMIUM VISITORS & MESSAGES).
 *
 * Data comes entirely from [VisitorFeedViewModel] → [in.mysmartdoor.app.core.data.VisitorRepository],
 * which reads the existing `get_owner_activity_feed` RPC — no mock data,
 * no new backend, no ViewModel/repository changes this phase. Visual-only
 * upgrade built entirely on existing design-system components ([SDTopBar],
 * [SDSearchBar], [SDChip], [GlassCard], [SDAvatar], [SDBadge],
 * [SDBottomNavigation], [SDSkeletonLoader], [ErrorScreen]).
 *
 * Phase 12E.5 keeps every Phase 12B behavior (search, filter chips,
 * infinite scroll, day grouping, refresh) and layers on: a badge row that
 * wraps via [FlowRow] instead of clipping/scrolling off-card, a staggered
 * fade+slide entrance for the list, a card-shaped skeleton that previews
 * the real row layout instead of generic bars, and dedicated empty states
 * for "no visitors yet" vs. "no results for this search/filter" (both
 * scoped to this file — the shared `EmptyStateScreen` used by other
 * screens is intentionally left untouched).
 *
 * Per CTO direction: no image-loading library is added this phase. Even
 * though [VisitorActivityDto.photoUrl] may be non-null, every row renders
 * an [SDAvatar] initials glyph — the architecture (the field is already
 * modeled end-to-end) is ready for a future phase to swap in a real image
 * once an image-loading dependency is approved. The premium avatar "ring"
 * added in 12B is a pure status-color border around the existing initials
 * glyph, not a photo.
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
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

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

        val hasActiveQuery = uiState.searchQuery.isNotBlank() || uiState.selectedFilter != VisitorFeedFilter.All

        when {
            uiState.errorMessage != null && uiState.items.isEmpty() -> ErrorScreen(
                message = uiState.errorMessage,
                onRetry = onRetry,
            )
            uiState.items.isEmpty() -> VisitorEmptyState(hasActiveQuery = hasActiveQuery)
            else -> {
                val grouped = remember(uiState.items) { groupByDay(uiState.items) }
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn(tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.emphasized)) +
                        slideInVertically(
                            animationSpec = tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.emphasized),
                            initialOffsetY = { it / 16 },
                        ),
                ) {
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
                                VisitorDayHeader(label = dayLabel, count = entries.size)
                            }
                            visitorItemsIndexed(entries) { index, entry ->
                                VisitorCard(entry, staggerIndex = index)
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
}

/** [LazyColumn.items] with a per-group index (used to stagger each card's entrance), keyed by entry id. */
private fun LazyListScope.visitorItemsIndexed(
    entries: List<VisitorActivityDto>,
    itemContent: @Composable (Int, VisitorActivityDto) -> Unit,
) {
    items(entries.size, key = { entries[it].id }) { index ->
        itemContent(index, entries[index])
    }
}

/** Day-group header — "Today · 5" style count, gold uppercase label, and a hairline divider so groups read cleanly without extra vertical bulk. */
@Composable
private fun VisitorDayHeader(label: String, count: Int) {
    Column(modifier = Modifier.padding(top = SmartDoorSpacing.xs, bottom = SmartDoorSpacing.xxs)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = SmartDoorSecondaryDark,
            )
            Text(
                text = "$count",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f)),
        )
    }
}

/** Premium visitor row — status-ring avatar, wrapping badge row (status/label/delivery/favorite/blocked), relative time + duration, staggered fade-in. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VisitorCard(entry: VisitorActivityDto, staggerIndex: Int = 0) {
    var visible by remember(entry.id) { mutableStateOf(false) }
    LaunchedEffect(entry.id) {
        delay((staggerIndex.coerceAtMost(8) * 35).toLong())
        visible = true
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(SmartDoorMotion.durationShort, easing = SmartDoorMotion.standard)) +
            slideInVertically(
                animationSpec = tween(SmartDoorMotion.durationShort, easing = SmartDoorMotion.standard),
                initialOffsetY = { it / 6 },
            ),
    ) {
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.Top) {
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
                    if (entry.visitCount > 1) {
                        Text(
                            text = "${entry.visitCount} visits",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs),
                        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs),
                    ) {
                        statusBadge(entry.callStatus)
                        labelBadge(entry.label, entry.labelColor)
                        if (entry.isFavorite) SDBadge(text = "Favorite", status = SDBadgeStatus.Warning)
                        if (entry.blocked) SDBadge(text = "Blocked", status = SDBadgeStatus.Danger)
                    }
                }
                Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = formatRelativeTime(entry.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                    if (entry.duration > 0) {
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                        Text(
                            text = formatDuration(entry.duration),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
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

/** Card-shaped skeleton — an avatar circle + two line placeholders, so the loading state previews the real row instead of generic bars. */
@Composable
private fun VisitorFeedSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        repeat(6) {
            GlassCard(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(SmartDoorSurfaceVariantDark),
                    )
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
                    Column(modifier = Modifier.weight(1f)) {
                        SDSkeletonLoader(height = 14.dp, modifier = Modifier.fillMaxWidth(0.6f))
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                        SDSkeletonLoader(height = 12.dp, modifier = Modifier.fillMaxWidth(0.4f))
                    }
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
                    SDSkeletonLoader(height = 10.dp, modifier = Modifier.width(40.dp))
                }
            }
        }
    }
}

/**
 * Premium empty state, scoped to this screen only (the shared
 * `EmptyStateScreen` used elsewhere in the app is untouched). Distinguishes
 * a true empty inbox from an empty result set caused by the owner's own
 * search/filter, so the copy always matches what actually happened.
 */
@Composable
private fun VisitorEmptyState(hasActiveQuery: Boolean) {
    Box(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.lg), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .background(SmartDoorSecondaryDark.copy(alpha = 0.12f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(
                        id = if (hasActiveQuery) R.drawable.ic_search else R.drawable.ic_people,
                    ),
                    contentDescription = null,
                    modifier = Modifier.size(28.dp),
                    tint = SmartDoorSecondaryDark,
                )
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
            Text(
                text = if (hasActiveQuery) "No matching visitors" else "No visitors yet",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
            Text(
                text = if (hasActiveQuery) {
                    "Try a different name, phone number, or clear your filters."
                } else {
                    "Visitor calls, deliveries, and guests will show up here once someone rings your Smart Door."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
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

/** "45s" for sub-minute durations, "1m 05s" beyond that — same underlying [VisitorActivityDto.duration] seconds value, just friendlier formatting. */
private fun formatDuration(totalSeconds: Int): String {
    if (totalSeconds < 60) return "${totalSeconds}s"
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return if (seconds == 0) "${minutes}m" else "${minutes}m ${seconds.toString().padStart(2, '0')}s"
}
