package `in`.mysmartdoor.app.ui.screens.messages

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.network.dto.ConversationDto
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDAvatar
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDChip
import `in`.mysmartdoor.app.ui.components.SDSearchBar
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoader
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfo
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
 * Messages Inbox (Phase 6 — MESSAGES V2; Phase 12B — PREMIUM SCREEN
 * REBUILD; Phase 12E.5 — PREMIUM VISITORS & MESSAGES).
 *
 * Data comes entirely from [MessagesViewModel] → [in.mysmartdoor.app.core.data.MessagesRepository],
 * which reads the existing production `conversations` / `messages` tables
 * (the same backend the website's Inbox tab already uses) — no mock data,
 * no new backend, no ViewModel/repository changes this phase. Visual-only
 * upgrade built entirely on existing design-system components
 * ([SDTopBar], [SDSearchBar], [SDChip], [GlassCard], [SDCard], [SDAvatar],
 * [SDBadge], [SDSkeletonLoader], [ErrorScreen]).
 *
 * Phase 12E.5 keeps every Phase 12B behavior (search, filter chips,
 * AI Summary highlight, refresh) and layers on: day-grouped conversation
 * rows (mirroring the Visitors Timeline's grouping so the two premium
 * screens feel like one family), a wrapping [FlowRow] badge row instead of
 * one that clips on narrow screens, a gold unread-count bubble instead of
 * a generic info badge, a fade+slide entrance for the list, a card-shaped
 * skeleton, and dedicated empty states for "no messages yet" vs. "no
 * results for this search/filter" (both scoped to this file — the shared
 * `EmptyStateScreen` used elsewhere in the app is untouched).
 *
 * The new "AI Summary" highlight card surfaces the most recent conversation
 * that already has a real [ConversationDto.aiSummary] populated by the
 * production AI pipeline — it is never generated/invented client-side, and
 * it quietly disappears when no conversation in the current filtered list
 * has one, or while the owner is actively searching/filtering.
 *
 * There is no visitor name/phone anywhere in this system (see
 * [in.mysmartdoor.app.core.network.dto.ConversationDto]'s doc comment), so
 * each [MessageConversationCard] identifies a thread by its owner-authored
 * tag / handled-by state / plate ID instead of a fabricated name.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessagesScreen(
    navController: NavHostController,
    viewModel: MessagesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Messages",
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
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                uiState.items.isNotEmpty() || !uiState.isLoading -> MessagesContent(
                    uiState = uiState,
                    onSearchQueryChange = viewModel::onSearchQueryChange,
                    onFilterSelected = viewModel::onFilterSelected,
                    onRetry = viewModel::load,
                )
                else -> MessagesSkeleton()
            }
        }
    }
}

@Composable
private fun MessagesContent(
    uiState: MessagesUiState,
    onSearchQueryChange: (String) -> Unit,
    onFilterSelected: (MessagesFilter) -> Unit,
    onRetry: () -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm)) {
            SDSearchBar(
                value = uiState.searchQuery,
                onValueChange = onSearchQueryChange,
                placeholder = "Search messages, tags, plate",
                onClear = { onSearchQueryChange("") },
            )
            Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
            ) {
                MessagesFilter.entries.forEach { filter ->
                    SDChip(
                        label = if (filter == MessagesFilter.Unread && uiState.unreadTotal > 0) {
                            "${filter.label} (${uiState.unreadTotal})"
                        } else {
                            filter.label
                        },
                        selected = uiState.selectedFilter == filter,
                        onClick = { onFilterSelected(filter) },
                    )
                }
            }
        }

        val hasActiveQuery = uiState.searchQuery.isNotBlank() || uiState.selectedFilter != MessagesFilter.All

        when {
            uiState.errorMessage != null && uiState.items.isEmpty() -> ErrorScreen(
                message = uiState.errorMessage,
                onRetry = onRetry,
            )
            uiState.items.isEmpty() -> MessagesEmptyState(hasActiveQuery = hasActiveQuery)
            else -> {
                val highlight = if (uiState.searchQuery.isBlank() && uiState.selectedFilter == MessagesFilter.All) {
                    uiState.items.firstOrNull { !it.aiSummary.isNullOrBlank() }
                } else {
                    null
                }
                val grouped = remember(uiState.items) { groupConversationsByDay(uiState.items) }
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn(tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.emphasized)) +
                        slideInVertically(
                            animationSpec = tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.emphasized),
                            initialOffsetY = { it / 16 },
                        ),
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = SmartDoorSpacing.md,
                            end = SmartDoorSpacing.md,
                            top = SmartDoorSpacing.xs,
                            bottom = SmartDoorSpacing.lg,
                        ),
                        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
                    ) {
                        if (highlight != null) {
                            item(key = "ai_summary_${highlight.id}") {
                                AiSummaryCard(highlight)
                                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                            }
                        }
                        grouped.forEach { (dayLabel, entries) ->
                            item(key = "header_$dayLabel") {
                                MessageDayHeader(label = dayLabel, count = entries.size)
                            }
                            items(entries, key = { it.id }) { entry ->
                                MessageConversationCard(entry)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Day-group header — mirrors the Visitors Timeline's [in.mysmartdoor.app.ui.screens.visitors.VisitorFeedScreen] grouping so the two premium screens read as one family. */
@Composable
private fun MessageDayHeader(label: String, count: Int) {
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

/** Premium highlight card — surfaces the most recent conversation's real, backend-generated AI summary. */
@Composable
private fun AiSummaryCard(entry: ConversationDto) {
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(SmartDoorInfo.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_bot),
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = SmartDoorInfo,
                )
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "AI Summary",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
                    Text(
                        text = formatRelativeTime(entry.lastMessageAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Text(
                    text = entry.aiSummary.orEmpty(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MessageConversationCard(entry: ConversationDto) {
    val threadLabel = entry.tags.firstOrNull()
        ?: entry.handledBy.replaceFirstChar { it.uppercase() }

    SDCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            SDAvatar(name = threadLabel, size = 44.dp)
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = threadLabel,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (entry.pinned) {
                        Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                        Icon(
                            painter = painterResource(id = R.drawable.ic_pin),
                            contentDescription = "Pinned",
                            modifier = Modifier.size(12.dp),
                            tint = SmartDoorSecondaryDark,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Text(
                    text = entry.lastMessagePreview?.takeIf { it.isNotBlank() } ?: "No messages yet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs),
                    verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs),
                ) {
                    handledByBadge(entry.handledBy)
                    statusBadge(entry.status)
                }
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = formatRelativeTime(entry.lastMessageAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                if (entry.unreadCount > 0) {
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                    UnreadCountBadge(count = entry.unreadCount)
                }
            }
        }
    }
}

/** Gold filled-circle unread bubble — reads as a proper "N unread" chip instead of borrowing the generic [SDBadge] info style, without adding a new shared component used by other screens. */
@Composable
private fun UnreadCountBadge(count: Int) {
    val label = if (count > 99) "99+" else "$count"
    Box(
        modifier = Modifier
            .background(SmartDoorSecondaryDark, CircleShape)
            .padding(horizontal = SmartDoorSpacing.xs, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = SmartDoorOnSecondaryDark,
        )
    }
}

@Composable
private fun handledByBadge(handledBy: String) {
    val (label, status) = when (handledBy) {
        "ai" -> "AI" to SDBadgeStatus.Info
        "owner" -> "You" to SDBadgeStatus.Neutral
        else -> return
    }
    SDBadge(text = label, status = status)
}

@Composable
private fun statusBadge(status: String) {
    val (label, badgeStatus) = when (status) {
        "resolved" -> "Resolved" to SDBadgeStatus.Success
        "archived" -> "Archived" to SDBadgeStatus.Neutral
        "active" -> return // active is the default/expected state — no badge noise
        else -> return
    }
    SDBadge(text = label, status = badgeStatus)
}

/** Card-shaped skeleton — an avatar circle + two line placeholders, so the loading state previews the real row instead of generic bars. */
@Composable
private fun MessagesSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        repeat(6) {
            SDCard(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(SmartDoorSurfaceVariantDark),
                    )
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
                    Column(modifier = Modifier.weight(1f)) {
                        SDSkeletonLoader(height = 14.dp, modifier = Modifier.fillMaxWidth(0.55f))
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                        SDSkeletonLoader(height = 12.dp, modifier = Modifier.fillMaxWidth(0.8f))
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
private fun MessagesEmptyState(hasActiveQuery: Boolean) {
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
                        id = if (hasActiveQuery) R.drawable.ic_search else R.drawable.ic_chat,
                    ),
                    contentDescription = null,
                    modifier = Modifier.size(28.dp),
                    tint = SmartDoorSecondaryDark,
                )
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
            Text(
                text = if (hasActiveQuery) "No matching conversations" else "No messages yet",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
            Text(
                text = if (hasActiveQuery) {
                    "Try a different search term, or clear your filters."
                } else {
                    "Conversations with visitors — text, voice, or AI-handled — will show up here."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** Groups conversations into "Today" / "Yesterday" / a formatted date by [ConversationDto.lastMessageAt], preserving server order within each group — same convention as the Visitors Timeline's grouping. */
private fun groupConversationsByDay(items: List<ConversationDto>): List<Pair<String, List<ConversationDto>>> {
    val today = LocalDate.now()
    val grouped = LinkedHashMap<String, MutableList<ConversationDto>>()
    items.forEach { entry ->
        val label = try {
            val date = OffsetDateTime.parse(entry.lastMessageAt).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()
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
