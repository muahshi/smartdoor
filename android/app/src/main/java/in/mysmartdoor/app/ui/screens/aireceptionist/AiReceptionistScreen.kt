package `in`.mysmartdoor.app.ui.screens.aireceptionist

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.AiReceptionistData
import `in`.mysmartdoor.app.core.network.dto.AiCallScreeningDto
import `in`.mysmartdoor.app.core.network.dto.AiCategoryBreakdownDto
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import `in`.mysmartdoor.app.core.network.dto.AiUrgencyBreakdownDto
import `in`.mysmartdoor.app.core.network.dto.AiWeeklyTrendDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDChip
import `in`.mysmartdoor.app.ui.components.SDSearchBar
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDStatCard
import `in`.mysmartdoor.app.ui.components.SDStatTrend
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorAi
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarning
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.Canvas
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
 * AI Receptionist (Phase 7 — AI RECEPTIONIST V2; Phase 12B — PREMIUM SCREEN
 * REBUILD; Phase 12E.6 — search/filter wiring, Weekly Trend, Urgency
 * Breakdown, richer activity cards, animated confidence ring, premium AI
 * status hero).
 *
 * Data comes entirely from [AiReceptionistViewModel] →
 * [in.mysmartdoor.app.core.data.AiReceptionistRepository], which reads the
 * exact same production backend the website's AI Receptionist surfaces
 * already use (`security_rules.current_status`, the
 * `get_ai_receptionist_insights` RPC, `ai_call_screenings`) — no mock data,
 * no new backend, no repository changes this phase. [AiActivityFilter] and
 * search matching (see [AiReceptionistViewModel]) are also unchanged from
 * Phase 12E.6's viewmodel work — this phase wires the already-built
 * [AiReceptionistUiState.filteredActivity]/`searchQuery`/`selectedFilter`
 * into the UI (search bar + filter chips), which the screen didn't yet
 * render. Built entirely on existing design-system components ([SDTopBar],
 * [GlassCard], [SDStatCard], [SDCard], [SDBadge], [SDChip], [SDSearchBar],
 * [SDBottomNavigation], [SDSectionHeader], [SDSkeletonLoaderGroup],
 * [EmptyStateScreen], [ErrorScreen]).
 *
 * Weekly Trend and Urgency Breakdown both render fields
 * [AiReceptionistInsightsDto] already carried
 * (`insights.weeklyTrend`/`insights.urgencyBreakdown`, both populated by
 * `get_ai_receptionist_insights`) but the screen previously left unrendered
 * — no new query, no new DTO field.
 *
 * "Today's conversations" and "AI success rate" (per the Phase 12B brief)
 * are both derived from real data already on [AiReceptionistData]: the
 * former is a client-side count of [AiReceptionistData.recentActivity]
 * entries whose `created_at` falls on today's date (same date-parsing
 * approach [in.mysmartdoor.app.ui.screens.visitors.VisitorFeedScreen]
 * already uses to group its own feed by day); the latter is
 * [AiReceptionistInsightsDto]'s existing `avgConfidence`, already computed
 * server-side and already rendered elsewhere on this screen. Neither is a
 * new query. The waveform and pulse rings under/around the AI avatar are a
 * purely decorative "listening" animation (no data behind them, same
 * spirit as [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * existing live-activity pulse) shown only while the AI is actually
 * available to take calls.
 *
 * Every section still hides gracefully when its backing data is null/empty
 * (owner status, insights, weekly trend, urgency breakdown, recent
 * activity each degrade independently) rather than showing a fake status
 * or invented numbers, per CTO direction.
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
                data != null -> AiReceptionistContent(
                    data = data,
                    uiState = uiState,
                    onRetry = viewModel::load,
                    onSearchQueryChange = viewModel::onSearchQueryChange,
                    onFilterSelected = viewModel::onFilterSelected,
                )
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
private fun AiReceptionistContent(
    data: AiReceptionistData,
    uiState: AiReceptionistUiState,
    onRetry: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onFilterSelected: (AiActivityFilter) -> Unit,
) {
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
    val filteredActivity = uiState.filteredActivity
    val hasActiveQuery = uiState.searchQuery.isNotBlank() || uiState.selectedFilter != AiActivityFilter.All

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
            if (insights.weeklyTrend.isNotEmpty()) {
                item { AiWeeklyTrendSection(trend = insights.weeklyTrend) }
            }
            if (insights.urgencyBreakdown.isNotEmpty()) {
                item { AiUrgencyBreakdownSection(breakdown = insights.urgencyBreakdown) }
            }
        }

        item {
            SDSectionHeader(
                title = "Recent AI Activity",
                modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
            )
        }

        if (hasActivity) {
            item {
                Column(modifier = Modifier.padding(bottom = SmartDoorSpacing.xs)) {
                    SDSearchBar(
                        value = uiState.searchQuery,
                        onValueChange = onSearchQueryChange,
                        placeholder = "Search visitor, company, intent",
                        onClear = { onSearchQueryChange("") },
                    )
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
                    ) {
                        AiActivityFilter.entries.forEach { filter ->
                            SDChip(
                                label = filter.label,
                                selected = uiState.selectedFilter == filter,
                                onClick = { onFilterSelected(filter) },
                            )
                        }
                    }
                }
            }
        }

        if (hasActivity && filteredActivity.isEmpty()) {
            item {
                Text(
                    text = if (hasActiveQuery) {
                        "No AI activity matches your search or filter."
                    } else {
                        "No AI-screened visitors yet."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else if (!hasActivity) {
            item {
                Text(
                    text = "No AI-screened visitors yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(filteredActivity, key = { it.id }) { entry -> AiActivityCard(entry) }
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

/** Premium AI avatar + status + pulse rings + waveform + "Today's conversations"/"AI Success Rate" stats, all from real data. */
@Composable
private fun AiAvatarHero(status: String, todayCount: Int, successRatePct: Int?) {
    val presentation = presentStatus(status)
    val isActive = status == "available"
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AiAvatarGlyph(color = presentation.color, pulsing = isActive)
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
            if (isActive) {
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

/**
 * The AI avatar circle with soft outward-expanding pulse rings behind it
 * (radar-style) when [pulsing] is true — purely decorative "AI is live"
 * signal, same non-data-bearing convention as [AiWaveform]. Static (no
 * animation) when the AI isn't actually available, so the motion always
 * matches real status.
 */
@Composable
private fun AiAvatarGlyph(color: Color, pulsing: Boolean) {
    val transition = rememberInfiniteTransition(label = "ai_avatar_pulse")
    val pulseScale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800, easing = SmartDoorMotion.decelerate),
            repeatMode = RepeatMode.Restart,
        ),
        label = "ai_avatar_pulse_scale",
    )
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800, easing = SmartDoorMotion.decelerate),
            repeatMode = RepeatMode.Restart,
        ),
        label = "ai_avatar_pulse_alpha",
    )

    Box(
        modifier = Modifier.size(64.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (pulsing) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .graphicsLayer {
                        scaleX = pulseScale
                        scaleY = pulseScale
                        alpha = pulseAlpha
                    }
                    .clip(CircleShape)
                    .background(color),
            )
        }
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(color.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(id = R.drawable.ic_bot),
                contentDescription = null,
                modifier = Modifier.size(30.dp),
                tint = color,
            )
        }
    }
}

/** Purely decorative "listening" waveform — no data behind it, same spirit as [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s existing pulsing live dot. */
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

// ────────── Weekly trend (Phase 12E.6) ──────────

/**
 * Renders `insights.weeklyTrend` — this-week vs last-week screening count
 * per visitor type, already computed server-side
 * (`get_ai_receptionist_insights`). Reuses [SDStatCard]'s existing
 * trend/trendLabel affordance rather than a new component: each tile is
 * this week's real count with a real percent-change badge, same visual
 * language the rest of the app already uses for trend metrics.
 */
@Composable
private fun AiWeeklyTrendSection(trend: List<AiWeeklyTrendDto>) {
    Column {
        SDSectionHeader(
            title = "Weekly Trend",
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
        )
        val rows = trend.take(6).chunked(2)
        Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
            rows.forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                    pair.forEach { entry -> WeeklyTrendTile(entry, Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun WeeklyTrendTile(entry: AiWeeklyTrendDto, modifier: Modifier = Modifier) {
    val pct = entry.changePct
    val trend = when {
        pct > 0 -> SDStatTrend.Up
        pct < 0 -> SDStatTrend.Down
        else -> SDStatTrend.Flat
    }
    val trendLabel = when {
        pct > 0 -> "+$pct% vs last week"
        pct < 0 -> "$pct% vs last week"
        else -> "Same as last week"
    }
    SDStatCard(
        label = entry.visitorType,
        value = entry.thisWeek.toString(),
        modifier = modifier,
        trend = trend,
        trendLabel = trendLabel,
    )
}

// ────────── Urgency breakdown (Phase 12E.6) ──────────

/**
 * Renders `insights.urgencyBreakdown` — real screening counts per
 * `priority` value, already computed server-side. Bar widths are a local
 * proportion-of-total calculation over these real counts (not a new
 * metric); colors reuse the exact same priority→color mapping
 * [priorityBadge] already uses elsewhere on this screen, so a "High"
 * screening reads as the same color everywhere.
 */
@Composable
private fun AiUrgencyBreakdownSection(breakdown: List<AiUrgencyBreakdownDto>) {
    val total = breakdown.sumOf { it.count }.coerceAtLeast(1)
    Column {
        SDSectionHeader(
            title = "Urgency Breakdown",
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
        )
        SDCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                breakdown.forEach { entry -> UrgencyRow(entry, total) }
            }
        }
    }
}

@Composable
private fun UrgencyRow(entry: AiUrgencyBreakdownDto, total: Int) {
    val color = priorityColor(entry.priority)
    val fraction = (entry.count.toFloat() / total).coerceIn(0f, 1f)
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = entry.priority,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = "${entry.count}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction = fraction)
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(color),
            )
        }
    }
}

private fun priorityColor(priority: String): Color = when (priority) {
    "Critical" -> SmartDoorDanger
    "High" -> SmartDoorWarning
    "Low" -> SmartDoorSuccess
    else -> SmartDoorSecondaryDark
}

// ────────── Recent AI activity ──────────

@Composable
private fun AiActivityCard(entry: AiCallScreeningDto) {
    SDCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                // Visitor identity — real name when available, falling back to
                // visitor type the same way the summary line already did.
                Text(
                    text = entry.visitorName?.takeIf { it.isNotBlank() } ?: entry.visitorType,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface,
                )

                val subtitle = listOfNotNull(
                    entry.company?.takeIf { it.isNotBlank() },
                    entry.visitingWhom?.takeIf { it.isNotBlank() }?.let { "Visiting $it" },
                ).joinToString(" · ").ifBlank { entry.visitorType }
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                entry.aiSummary?.takeIf { it.isNotBlank() }?.let { summary ->
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    suggestedActionBadge(entry.suggestedAction)
                    priorityBadge(entry.priority)
                    conversationModeBadge(entry.conversationMode)
                }
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                ConfidenceRing(confidence = entry.confidence)
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Text(
                    text = formatRelativeTime(entry.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    softWrap = false,
                    modifier = Modifier.widthIn(max = 72.dp),
                )
            }
        }
    }
}

/**
 * Animated confidence ring — [entry.confidence] (0.0–1.0, real, already on
 * [AiCallScreeningDto]) rendered as a Canvas progress arc that sweeps in
 * from 0 the first time it's composed, rather than a bare percentage.
 * Color scales with the value: high confidence reads success-green, mid
 * reads the AI accent, low reads warning — same semantic direction
 * [presentStatus]/[priorityBadge] already use elsewhere on this screen.
 */
@Composable
private fun ConfidenceRing(confidence: Double, size: androidx.compose.ui.unit.Dp = 44.dp) {
    val pct = (confidence * 100).roundToInt().coerceIn(0, 100)
    val target = (confidence.toFloat()).coerceIn(0f, 1f)
    val animatedProgress by animateFloatAsState(
        targetValue = target,
        animationSpec = tween(durationMillis = SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized),
        label = "confidence_ring_progress",
    )
    val ringColor = when {
        pct >= 80 -> SmartDoorSuccess
        pct >= 50 -> SmartDoorAi
        else -> SmartDoorWarning
    }
    val trackColor = MaterialTheme.colorScheme.surfaceVariant
    Box(modifier = Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(size)) {
            val strokeWidth = 4.dp.toPx()
            val diameter = kotlin.math.min(this.size.width, this.size.height) - strokeWidth
            val topLeft = Offset(strokeWidth / 2f, strokeWidth / 2f)
            val arcSize = Size(diameter, diameter)
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
            drawArc(
                color = ringColor,
                startAngle = -90f,
                sweepAngle = 360f * animatedProgress,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
        }
        Text(
            text = "$pct%",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = ringColor,
        )
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

/**
 * Displays `conversation_mode` (Phase 12E.6) — the same real column
 * already used for the mic glyph. Voice/chip only; no fabricated modes.
 */
@Composable
private fun conversationModeBadge(conversationMode: String) {
    val label = if (conversationMode.startsWith("voice")) "Voice" else "Chip"
    SDBadge(text = label, status = SDBadgeStatus.Neutral)
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
