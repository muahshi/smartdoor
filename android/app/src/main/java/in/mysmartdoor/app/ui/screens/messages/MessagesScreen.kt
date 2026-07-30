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
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfo
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import androidx.compose.foundation.background
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Messages Inbox (Phase 6 — MESSAGES V2; Phase 12B — PREMIUM SCREEN REBUILD).
 *
 * Data comes entirely from [MessagesViewModel] → [in.mysmartdoor.app.core.data.MessagesRepository],
 * which reads the existing production `conversations` / `messages` tables
 * (the same backend the website's Inbox tab already uses) — no mock data,
 * no new backend, no ViewModel/repository changes this phase. Visual-only
 * upgrade built entirely on existing design-system components
 * ([SDTopBar], [SDSearchBar], [SDChip], [GlassCard], [SDCard], [SDAvatar],
 * [SDBadge], [SDSkeletonLoaderGroup], [EmptyStateScreen], [ErrorScreen]).
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

        when {
            uiState.errorMessage != null && uiState.items.isEmpty() -> ErrorScreen(
                message = uiState.errorMessage,
                onRetry = onRetry,
            )
            uiState.items.isEmpty() -> EmptyStateScreen(
                title = "No messages yet",
                subtitle = "Conversations with visitors — text, voice, or AI-handled — will show up here.",
            )
            else -> {
                val highlight = if (uiState.searchQuery.isBlank() && uiState.selectedFilter == MessagesFilter.All) {
                    uiState.items.firstOrNull { !it.aiSummary.isNullOrBlank() }
                } else {
                    null
                }
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
                    items(uiState.items, key = { it.id }) { entry ->
                        MessageConversationCard(entry)
                    }
                }
            }
        }
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

@Composable
private fun MessageConversationCard(entry: ConversationDto) {
    val threadLabel = entry.tags.firstOrNull()
        ?: entry.handledBy.replaceFirstChar { it.uppercase() }

    SDCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
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
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs)) {
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
                )
                if (entry.unreadCount > 0) {
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                    SDBadge(text = "${entry.unreadCount}", status = SDBadgeStatus.Info)
                }
            }
        }
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

@Composable
private fun MessagesSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        repeat(6) {
            SDCard(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.sm)) {
                SDSkeletonLoaderGroup(lineCount = 2)
            }
        }
    }
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
