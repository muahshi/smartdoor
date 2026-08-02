package `in`.mysmartdoor.app.core.data.model

import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import java.time.LocalDate

/**
 * Smart Analytics (Phase 12E.9) — screen-ready model built by
 * [in.mysmartdoor.app.core.data.AnalyticsRepository] entirely from
 * production tables/RPCs already used elsewhere in this app:
 * `visitor_logs`, `call_logs`, `visitor_visits` (all three already read by
 * [in.mysmartdoor.app.core.data.DashboardRepository]) and the existing
 * `get_ai_receptionist_insights` RPC (already read by
 * [in.mysmartdoor.app.core.data.AiReceptionistRepository]). No new table,
 * column, Edge Function, or RPC — only date-ranged reads instead of the
 * `RECENT_LIMIT`-capped ones those two repositories already do, aggregated
 * client-side. Every number here is derived from real rows; nothing is
 * invented or randomly generated.
 */

/** Selectable reporting window for the Analytics screen — a 7/30/90-day lookback from today. */
enum class AnalyticsRange(val days: Int, val label: String) {
    Last7Days(7, "7D"),
    Last30Days(30, "30D"),
    Last90Days(90, "90D"),
}

/** One day's visitor count — backs the visitor trend line chart. */
data class DailyPoint(
    val date: LocalDate,
    val count: Int,
)

/** One day's call activity — backs the call trend chart (total vs missed). */
data class DailyCallPoint(
    val date: LocalDate,
    val total: Int,
    val missed: Int,
    val answered: Int,
)

/** One hour-of-day (0-23, device-local) bucket — backs the peak-hours bar chart. */
data class HourlyPoint(
    val hour: Int,
    val count: Int,
)

/**
 * Top-line summary cards. `*ChangePct` compares the selected window against
 * the immediately preceding window of equal length (e.g. last 7 days vs the
 * 7 days before that) — null when the previous window had zero activity to
 * compare against (avoids a divide-by-zero / meaningless "+∞%").
 */
data class AnalyticsSummary(
    val totalVisitors: Int,
    val visitorChangePct: Int?,
    val totalCalls: Int,
    val callChangePct: Int?,
    val missedCalls: Int,
    val missedCallRatePct: Int,
    val aiHandledCount: Int,
)

data class AnalyticsData(
    val range: AnalyticsRange,
    val summary: AnalyticsSummary,
    val visitorTrend: List<DailyPoint>,
    val callTrend: List<DailyCallPoint>,
    val peakHours: List<HourlyPoint>,
    /** Reused verbatim from the existing AI Receptionist RPC, windowed to [range]. Null when the RPC call fails/degrades. */
    val aiInsights: AiReceptionistInsightsDto?,
    /** Rule-based, plain-English observations computed client-side from the fields above — no LLM call, no fabricated data. */
    val executiveInsights: List<String>,
)
