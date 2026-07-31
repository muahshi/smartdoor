package `in`.mysmartdoor.app.ui.screens.aireceptionist

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.AiReceptionistData
import `in`.mysmartdoor.app.core.network.dto.AiCallScreeningDto
import `in`.mysmartdoor.app.core.network.dto.AiCategoryBreakdownDto
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDStatCard
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarning
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import kotlin.math.roundToInt

/**
 * AI Receptionist (Phase 7 — AI RECEPTIONIST V2; Phase 12B — PREMIUM SCREEN REBUILD).
 *
 * Data comes entirely from [AiReceptionistViewModel] →
 * [in.mysmartdoor.app.core.data.AiReceptionistRepository], which reads the
 * exact same production backend the website's AI Receptionist surfaces
 * already use (`security_rules.current_status`, the
 * `get_ai_receptionist_insights` RPC, `ai_call_screenings`) — no mock data,
 * no new backend, no ViewModel/repository changes this phase. Visual-only
 * upgrade built entirely on existing design-system components
 * ([SDTopBar], [GlassCard], [SDStatCard], [SDCard], [SDBadge],
 * [SDBottomNavigation], [SDSectionHeader], [SDSkeletonLoaderGroup],
 * [EmptyStateScreen], [ErrorScreen]).
 *
 * "Today's conversations" and "AI success rate" (per the Phase 12B brief)
 * are both derived from real data already on [AiReceptionistData]: the
 * former is a client-side count of [AiReceptionistData.recentActivity]
 * entries whose `created_at` falls on today's date (same date-parsing
 * approach [in.mysmartdoor.app.ui.screens.visitors.VisitorFeedScreen]
 * already uses to group its own feed by day); the latter is
 * [AiReceptionistInsightsDto]'s existing `avgConfidence`, already computed
 * server-side and already rendered elsewhere on this screen. Neither is a
 * new query. The waveform under the AI avatar is a purely decorative
 * "listening" animation (no data behind it, like [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * existing live-activity pulse) shown only while the AI is actually
 * available to take calls.
 *
 * Every section still hides gracefully when its backing data is null/empty
 * (owner status, insights, recent activity each degrade independently)
 * rather than showing a fake status or invented numbers, per CTO direction.
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
                selectedRoute = Routes.AI_RECEPTIONIST,
                onItemSelected = { item ->
                    if (item.route != Routes.AI_RECEPTIONIST) {
                        navController.navigate(item.route) { launchSingleTop = true }
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

    val todayCount = remember(data.recentActivity) { countToday(data.recentActivity) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.md),
    ) {
        if (data.ownerStatus != null) {
            item {
                AiAvatarHero(
                    status = data.ownerStatus,
                    todayCount = todayCount,
                    successRatePct = insights?.let { (it.quality.avgConfidence * 100).roundToInt() },
                )
            }
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

// ────────── Premium AI avatar hero ──────────

private data class StatusPresentation(val label: String, val color: Color)

private fun presentStatus(status: String): StatusPresentation = when (status) {
    "available" -> StatusPresentation("AI Active", SmartDoorSuccess)
    "busy" -> StatusPresentation("AI Busy", SmartDoorWarning)
    "sleeping", "away" -> StatusPresentation("AI Offline", SmartDoorDanger)
    else -> StatusPresentation("AI Active · Custom", SmartDoorSecondaryDark)
}

/** Premium AI avatar + status + waveform + "Today's conversations"/"AI Success Rate" stats, all from real data. */
@Composable
private fun AiAvatarHero(status: String, todayCount: Int, successRatePct: Int?) {
    val presentation = presentStatus(status)
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(presentation.color.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_bot),
                        contentDescription = null,
                        modifier = Modifier.size(30.dp),
                        tint = presentation.color,
                    )
                }
                Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(presentation.color),
                        )
                        Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                        Text(
                            text = presentation.label,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    Text(
                        text = "Screening visitor calls before they reach you",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (status == "available") {
                Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
                AiWaveform(color = presentation.color)
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
            Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                SDStatCard(
                    label = "Today's Conversations",
                    value = todayCount.toString(),
                    modifier = Modifier.weight(1f),
                )
                if (successRatePct != null) {
                    SDStatCard(
                        label = "AI Success Rate",
                        value = "$successRatePct%",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** Purely decorative "listening" waveform — no data behind it, same spirit as [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s pulsing live dot. */
@Composable
private fun AiWaveform(color: Color) {
    val transition = rememberInfiniteTransition(label = "ai_waveform")
    val durations = listOf(520, 680, 460, 720, 560)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.height(28.dp),
    ) {
        durations.forEach { duration ->
            val scale by transition.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = duration, easing = SmartDoorMotion.standard),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "ai_waveform_bar",
            )
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeightFraction(scale)
                    .clip(RoundedCornerShape(2.dp))
                    .background(color.copy(alpha = 0.85f)),
            )
        }
    }
}

private fun Modifier.fillMaxHeightFraction(fraction: Float): Modifier =
    this.height((28 * fraction.coerceIn(0.15f, 1f)).dp)

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
                text = "${q.duplicateCount} repeat call${if (q.duplicateCount == 1) "" else "s"} detected in this window.",
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
                        Icon(
                            painter = painterResource(id = R.drawable.ic_mic),
                            contentDescription = "Voice call",
                            modifier = Modifier.size(12.dp),
                            tint = SmartDoorSecondaryDark,
                        )
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
                Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs)) {
                    suggestedActionBadge(entry.suggestedAction)
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

/** Client-side count of activity created "today" (device-local date) — same date-grouping approach VisitorFeedScreen uses. */
private fun countToday(activity: List<AiCallScreeningDto>): Int {
    val today = LocalDate.now()
    return activity.count { entry ->
        try {
            OffsetDateTime.parse(entry.createdAt).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate() == today
        } catch (e: Exception) {
            false
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
