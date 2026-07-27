package `in`.mysmartdoor.app.ui.screens.aireceptionist

import `in`.mysmartdoor.app.core.data.model.AiReceptionistData
import `in`.mysmartdoor.app.core.network.dto.AiCallScreeningDto
import `in`.mysmartdoor.app.core.network.dto.AiCategoryBreakdownDto
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDStatCard
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarning
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import kotlin.math.roundToInt

/**
 * AI Receptionist (Phase 7 — AI RECEPTIONIST V2).
 *
 * Data comes entirely from [AiReceptionistViewModel] →
 * [in.mysmartdoor.app.core.data.AiReceptionistRepository], which reads the
 * exact same production backend the website's AI Receptionist surfaces
 * already use (`security_rules.current_status`, the
 * `get_ai_receptionist_insights` RPC, `ai_call_screenings`) — no mock data,
 * no new backend. Built entirely on existing design-system components
 * ([SDTopBar], [GlassCard], [SDStatCard], [SDCard], [SDBadge],
 * [SDSectionHeader], [SDSkeletonLoaderGroup], [EmptyStateScreen],
 * [ErrorScreen]), matching [in.mysmartdoor.app.ui.screens.messages.MessagesScreen]'s
 * structure.
 *
 * Every section hides gracefully when its backing data is null/empty
 * (owner status, insights, recent activity each degrade independently —
 * see [AiReceptionistData]) rather than showing a fake status or invented
 * numbers, per CTO direction.
 *
 * FUTURE READY, NOT IMPLEMENTED (per CTO direction — architecture only):
 * Voice AI, Video AI, Visitor Consent, Face Verification, Smart Delivery,
 * AI Learning, and Multi-language AI have no UI or backend call here. The
 * activity timeline's [AiActivityCard] is already the natural extension
 * point for a future detail/transcript screen (tap-through), and
 * [AiReceptionistData] documents the same for the repository layer — none
 * of it is wired up this phase.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiReceptionistScreen(
    navController: NavHostController,
    viewModel: AiReceptionistViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "AI Receptionist",
                actions = {
                    IconButton(onClick = { if (!uiState.isRefreshing) viewModel.refresh() }) {
                        if (uiState.isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = SmartDoorSecondaryDark,
                            )
                        } else {
                            Text(text = "⟳", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> AiReceptionistContent(data = data, onRetry = viewModel::load)
                uiState.isLoading -> AiReceptionistSkeleton()
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = viewModel::load,
                )
            }
        }
    }
}

@Composable
private fun AiReceptionistContent(data: AiReceptionistData, onRetry: () -> Unit) {
    val insights = data.insights?.takeIf { it.quality.totalScreenings > 0 }
    val hasActivity = data.recentActivity.isNotEmpty()

    if (data.ownerStatus == null && insights == null && !hasActivity) {
        EmptyStateScreen(
            title = "AI Receptionist is warming up",
            subtitle = "Once a visitor's call is screened, your AI activity and insights will show up here.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.md),
    ) {
        if (data.ownerStatus != null) {
            item { AiStatusHero(status = data.ownerStatus) }
        }

        if (insights != null) {
            item { AiQualitySection(insights = insights) }
            if (insights.categoryBreakdown.isNotEmpty()) {
                item { AiCategoryBreakdownSection(categories = insights.categoryBreakdown) }
            }
        }

        item {
            SDSectionHeader(
                title = "Recent AI Activity",
                modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
            )
        }
        if (hasActivity) {
            items(data.recentActivity, key = { it.id }) { entry -> AiActivityCard(entry) }
        } else {
            item {
                Text(
                    text = "No AI-screened visitors yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ────────── AI Status hero ──────────

private data class StatusPresentation(val label: String, val color: Color)

private fun presentStatus(status: String): StatusPresentation = when (status) {
    "available" -> StatusPresentation("AI Active", SmartDoorSuccess)
    "busy" -> StatusPresentation("AI Busy", SmartDoorWarning)
    "sleeping", "away" -> StatusPresentation("AI Offline", SmartDoorDanger)
    else -> StatusPresentation("AI Active · Custom", SmartDoorSecondaryDark)
}

@Composable
private fun AiStatusHero(status: String) {
    val presentation = presentStatus(status)
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(presentation.color),
            )
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column {
                Text(
                    text = presentation.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "Screening visitor calls before they reach you",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ────────── AI Quality ──────────

@Composable
private fun AiQualitySection(insights: AiReceptionistInsightsDto) {
    val q = insights.quality
    val avgConfidencePct = (q.avgConfidence * 100).roundToInt()
    val voicePct = if (q.totalScreenings > 0) (q.voiceCount * 100 / q.totalScreenings) else 0
    val rulesAppliedPct = if (q.totalScreenings > 0) (q.ruleMatchedCount * 100 / q.totalScreenings) else 0

    Column {
        SDSectionHeader(
            title = "AI Insights · Last ${insights.windowDays} Days",
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
        )
        Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                SDStatCard(
                    label = "Visitors Screened",
                    value = q.totalScreenings.toString(),
                    modifier = Modifier.weight(1f),
                )
                SDStatCard(
                    label = "Avg. Confidence",
                    value = "$avgConfidencePct%",
                    modifier = Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                SDStatCard(
                    label = "Voice AI Usage",
                    value = "$voicePct%",
                    modifier = Modifier.weight(1f),
                )
                SDStatCard(
                    label = "Owner Rules Applied",
                    value = "$rulesAppliedPct%",
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (q.duplicateCount > 0) {
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
            Text(
                text = "🔁 ${q.duplicateCount} repeat call${if (q.duplicateCount == 1) "" else "s"} detected in this window.",
                style = MaterialTheme.typography.bodySmall,
                color = SmartDoorWarning,
            )
        }
    }
}

// ────────── Category breakdown ──────────

@Composable
private fun AiCategoryBreakdownSection(categories: List<AiCategoryBreakdownDto>) {
    Column {
        SDSectionHeader(
            title = "Visitor Categories",
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
        )
        SDCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                categories.take(6).forEach { category -> CategoryRow(category) }
            }
        }
    }
}

@Composable
private fun CategoryRow(category: AiCategoryBreakdownDto) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = category.visitorType,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Text(
                text = "${category.count} · ${category.pct}%",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction = (category.pct / 100.0).toFloat().coerceIn(0f, 1f))
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(SmartDoorSecondaryDark),
            )
        }
    }
}

// ────────── Recent AI activity ──────────

@Composable
private fun AiActivityCard(entry: AiCallScreeningDto) {
    SDCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = entry.visitorType,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (entry.conversationMode.startsWith("voice")) {
                        Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                        Text(text = "🎙️", style = MaterialTheme.typography.labelSmall)
                    }
                }
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Text(
                    text = entry.aiSummary?.takeIf { it.isNotBlank() } ?: entry.visitorType,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Row {
                    suggestedActionBadge(entry.suggestedAction)
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                    priorityBadge(entry.priority)
                }
            }
            Text(
                text = formatRelativeTime(entry.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun suggestedActionBadge(action: String) {
    val status = when (action) {
        "Accept", "Auto Allow", "Auto Connect" -> SDBadgeStatus.Success
        "Decline", "Blocked" -> SDBadgeStatus.Danger
        "Ask Owner", "Notify Owner" -> SDBadgeStatus.Info
        else -> SDBadgeStatus.Neutral
    }
    SDBadge(text = action, status = status)
}

@Composable
private fun priorityBadge(priority: String) {
    if (priority == "Normal") return // default/expected state — no badge noise, matches MessagesScreen's statusBadge convention
    val status = when (priority) {
        "Critical" -> SDBadgeStatus.Danger
        "High" -> SDBadgeStatus.Warning
        else -> SDBadgeStatus.Neutral
    }
    SDBadge(text = priority, status = status)
}

@Composable
private fun AiReceptionistSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            SDSkeletonLoaderGroup(lineCount = 2)
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
        repeat(4) {
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
