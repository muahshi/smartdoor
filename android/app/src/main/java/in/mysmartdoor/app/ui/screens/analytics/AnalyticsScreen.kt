package `in`.mysmartdoor.app.ui.screens.analytics

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.AnalyticsData
import `in`.mysmartdoor.app.core.data.model.AnalyticsRange
import `in`.mysmartdoor.app.core.data.model.AnalyticsSummary
import `in`.mysmartdoor.app.core.data.model.DailyCallPoint
import `in`.mysmartdoor.app.core.data.model.DailyPoint
import `in`.mysmartdoor.app.core.data.model.HourlyPoint
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDBarChart
import `in`.mysmartdoor.app.ui.components.SDBarPoint
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDChip
import `in`.mysmartdoor.app.ui.components.SDLineChart
import `in`.mysmartdoor.app.ui.components.SDLineSeries
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDStatCard
import `in`.mysmartdoor.app.ui.components.SDStatTrend
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Smart Analytics (Phase 12E.9) — a 7/30/90-day owner-facing reporting
 * surface built entirely on top of what [AnalyticsViewModel] →
 * [in.mysmartdoor.app.core.data.AnalyticsRepository] already aggregates
 * from production tables/RPC (`visitor_logs`, `call_logs`,
 * `visitor_visits`, `get_ai_receptionist_insights`) — no new backend, no
 * mock data. Reached from a Dashboard Quick Action tile and a Profile menu
 * row, same navigation convention every other Quick-Action destination in
 * this app already follows (see [in.mysmartdoor.app.ui.screens.callhistory.CallHistoryScreen]).
 *
 * Built entirely from existing design-system components ([SDTopBar],
 * [GlassCard], [SDCard], [SDStatCard], [SDChip], [SDSectionHeader],
 * [SDSkeletonLoaderGroup], [EmptyStateScreen], [ErrorScreen]) plus the two
 * new Canvas chart primitives this phase adds ([SDLineChart], [SDBarChart]).
 * Every section hides gracefully when its backing data is empty rather than
 * rendering a zeroed-out chart, per the same CTO direction every other
 * screen in this codebase follows.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(
    navController: NavHostController,
    viewModel: AnalyticsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Smart Analytics",
                onBackClick = { navController.popBackStack() },
                backIconRes = R.drawable.ic_back,
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
            val data = uiState.data
            when {
                data != null -> AnalyticsContent(
                    data = data,
                    selectedRange = uiState.range,
                    onRangeSelected = viewModel::onRangeSelected,
                )
                uiState.isLoading -> AnalyticsSkeleton()
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = viewModel::load,
                )
            }
        }
    }
}

@Composable
private fun AnalyticsContent(
    data: AnalyticsData,
    selectedRange: AnalyticsRange,
    onRangeSelected: (AnalyticsRange) -> Unit,
) {
    val hasAnyData = data.summary.totalVisitors > 0 || data.summary.totalCalls > 0

    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(400)) + slideInVertically(animationSpec = tween(400), initialOffsetY = { it / 12 }),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(SmartDoorSpacing.md),
            verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg),
        ) {
            item { RangeFilterRow(selectedRange = selectedRange, onRangeSelected = onRangeSelected) }

            if (!hasAnyData) {
                item {
                    EmptyStateScreen(
                        title = "No activity in this period",
                        subtitle = "Once visitors or calls come in, your analytics will show up here.",
                        modifier = Modifier.fillMaxWidth().padding(top = SmartDoorSpacing.xl),
                    )
                }
                return@LazyColumn
            }

            item { SummarySection(summary = data.summary) }

            if (data.visitorTrend.any { it.count > 0 }) {
                item { VisitorTrendSection(range = data.range, points = data.visitorTrend) }
            }

            if (data.callTrend.any { it.total > 0 }) {
                item { CallTrendSection(range = data.range, points = data.callTrend) }
            }

            if (data.peakHours.any { it.count > 0 }) {
                item { PeakHoursSection(points = data.peakHours) }
            }

            data.aiInsights?.takeIf { it.quality.totalScreenings > 0 }?.let { insights ->
                item { AiPerformanceSection(insights = insights) }
            }

            if (data.executiveInsights.isNotEmpty()) {
                item { ExecutiveInsightsSection(insights = data.executiveInsights) }
            }
        }
    }
}

// ────────── Range filter ──────────

@Composable
private fun RangeFilterRow(selectedRange: AnalyticsRange, onRangeSelected: (AnalyticsRange) -> Unit) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
    ) {
        AnalyticsRange.entries.forEach { range ->
            SDChip(
                label = range.label,
                selected = selectedRange == range,
                onClick = { onRangeSelected(range) },
            )
        }
    }
}

// ────────── Summary cards ──────────

@Composable
private fun SummarySection(summary: AnalyticsSummary) {
    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
            SDStatCard(
                label = "Total Visitors",
                value = summary.totalVisitors.toString(),
                modifier = Modifier.weight(1f),
                trend = trendFor(summary.visitorChangePct),
                trendLabel = trendLabelFor(summary.visitorChangePct),
            )
            SDStatCard(
                label = "Total Calls",
                value = summary.totalCalls.toString(),
                modifier = Modifier.weight(1f),
                trend = trendFor(summary.callChangePct),
                trendLabel = trendLabelFor(summary.callChangePct),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
            SDStatCard(
                label = "Missed Calls",
                value = "${summary.missedCalls} (${summary.missedCallRatePct}%)",
                modifier = Modifier.weight(1f),
            )
            SDStatCard(
                label = "AI Handled",
                value = summary.aiHandledCount.toString(),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

private fun trendFor(pct: Int?): SDStatTrend? = when {
    pct == null -> null
    pct > 0 -> SDStatTrend.Up
    pct < 0 -> SDStatTrend.Down
    else -> SDStatTrend.Flat
}

private fun trendLabelFor(pct: Int?): String? = when {
    pct == null -> null
    pct > 0 -> "+$pct% vs prior period"
    pct < 0 -> "$pct% vs prior period"
    else -> "Same as prior period"
}

// ────────── Visitor trend ──────────

@Composable
private fun VisitorTrendSection(range: AnalyticsRange, points: List<DailyPoint>) {
    Column {
        SDSectionHeader(title = "Visitor Trend", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            SDLineChart(
                series = listOf(
                    SDLineSeries(label = "Visitors", values = points.map { it.count.toFloat() }, color = SmartDoorSecondaryDark),
                ),
                xLabels = points.map { formatAxisDate(it.date, range) },
            )
        }
    }
}

// ────────── Call trend ──────────

@Composable
private fun CallTrendSection(range: AnalyticsRange, points: List<DailyCallPoint>) {
    Column {
        SDSectionHeader(title = "Call Trend", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            SDLineChart(
                series = listOf(
                    SDLineSeries(label = "Total", values = points.map { it.total.toFloat() }, color = SmartDoorSecondaryDark),
                    SDLineSeries(label = "Missed", values = points.map { it.missed.toFloat() }, color = SmartDoorDanger),
                ),
                xLabels = points.map { formatAxisDate(it.date, range) },
            )
        }
    }
}

private fun formatAxisDate(date: java.time.LocalDate, range: AnalyticsRange): String =
    if (range == AnalyticsRange.Last7Days) {
        date.format(DateTimeFormatter.ofPattern("EEE", Locale.getDefault()))
    } else {
        date.format(DateTimeFormatter.ofPattern("d MMM", Locale.getDefault()))
    }

// ────────── Peak hours ──────────

@Composable
private fun PeakHoursSection(points: List<HourlyPoint>) {
    Column {
        SDSectionHeader(title = "Peak Hours", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            SDBarChart(
                points = points.map { SDBarPoint(label = formatHourLabel(it.hour), value = it.count) },
            )
        }
    }
}

private fun formatHourLabel(hour: Int): String =
    java.time.LocalTime.of(hour, 0).format(DateTimeFormatter.ofPattern("h a", Locale.getDefault()))

// ────────── AI Receptionist performance ──────────

/**
 * Reuses the exact same [AiReceptionistInsightsDto] fields
 * [in.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistScreen]'s
 * `AiQualitySection` already renders — no new query, same RPC response,
 * just surfaced again here in the Analytics context.
 */
@Composable
private fun AiPerformanceSection(insights: AiReceptionistInsightsDto) {
    val q = insights.quality
    val avgConfidencePct = (q.avgConfidence * 100).roundToInt()
    val voicePct = if (q.totalScreenings > 0) (q.voiceCount * 100 / q.totalScreenings) else 0

    Column {
        SDSectionHeader(
            title = "AI Receptionist Performance",
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
                    label = "High Confidence",
                    value = q.highConfidenceCount.toString(),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// ────────── Executive insights ──────────

@Composable
private fun ExecutiveInsightsSection(insights: List<String>) {
    Column {
        SDSectionHeader(title = "Executive Insights", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                insights.forEach { insight -> InsightRow(insight) }
            }
        }
    }
}

@Composable
private fun InsightRow(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .padding(top = 7.dp)
                .size(6.dp)
                .background(SmartDoorSecondaryDark, androidx.compose.foundation.shape.CircleShape),
        )
        Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

// ────────── Loading skeleton ──────────

@Composable
private fun AnalyticsSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
            repeat(3) {
                SDCard(modifier = Modifier.weight(1f)) { SDSkeletonLoaderGroup(lineCount = 1) }
            }
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
        repeat(3) {
            SDCard(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.sm)) {
                SDSkeletonLoaderGroup(lineCount = 3)
            }
        }
    }
}
