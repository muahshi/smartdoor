package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.model.AnalyticsData
import `in`.mysmartdoor.app.core.data.model.AnalyticsRange
import `in`.mysmartdoor.app.core.data.model.AnalyticsSummary
import `in`.mysmartdoor.app.core.data.model.DailyCallPoint
import `in`.mysmartdoor.app.core.data.model.DailyPoint
import `in`.mysmartdoor.app.core.data.model.HourlyPoint
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import `in`.mysmartdoor.app.core.network.dto.CallLogDto
import `in`.mysmartdoor.app.core.network.dto.GetAiReceptionistInsightsParams
import `in`.mysmartdoor.app.core.network.dto.VisitorLogDto
import `in`.mysmartdoor.app.core.network.dto.VisitorVisitDto
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.roundToInt

/**
 * Smart Analytics (Phase 12E.9) — reads-only aggregation over the exact
 * same production tables/RPC [DashboardRepository]/[AiReceptionistRepository]
 * already use: `visitor_logs`, `call_logs`, `visitor_visits`
 * (`sql/41_visitor_memory.sql`), and `get_ai_receptionist_insights`
 * (`sql/54_ai_receptionist_intelligence.sql`). Zero new DTOs, zero SQL
 * changes — this repository just widens the query window from
 * [DashboardRepository]'s `RECENT_LIMIT`-capped reads to a date range
 * (current + immediately-preceding window of equal length, fetched in one
 * query per table) and aggregates client-side into trend/peak-hour/summary
 * shapes. Everything on [AnalyticsData] is derived from real rows — no
 * fake/random data, per CTO direction.
 *
 * [ownerId] is `users.id`, sourced via [SecureSessionManager] exactly like
 * every other repository in this package. RLS already scopes every read to
 * the signed-in owner server-side; the `.eq("owner_id", …)` filters here
 * match the same defense-in-depth convention.
 *
 * Resilience: only the two count/trend queries needed for the summary
 * cards are semi-fatal (a genuine fetch failure surfaces as an error
 * screen, same as any other screen); the AI-insights RPC degrades to null
 * via [safeSection] exactly like [AiReceptionistRepository] already does,
 * so a bad/empty AI window doesn't blank the whole Analytics screen.
 */
@Singleton
class AnalyticsRepository @Inject constructor(
    private val client: SupabaseClient,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    suspend fun getAnalyticsData(range: AnalyticsRange): Result<AnalyticsData> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall { fetchAnalytics(ownerId, range) }
    }

    private suspend fun fetchAnalytics(ownerId: String, range: AnalyticsRange): AnalyticsData = coroutineScope {
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val currentStart = today.minusDays((range.days - 1).toLong())
        val previousStart = currentStart.minusDays(range.days.toLong())
        val windowStartIso = previousStart.atStartOfDay(zone).toOffsetDateTime().toString()
        val currentStartIso = currentStart.atStartOfDay(zone).toOffsetDateTime().toString()

        val visitorLogsDeferred = async { fetchVisitorLogs(ownerId, windowStartIso) }
        val callLogsDeferred = async { fetchCallLogs(ownerId, windowStartIso) }
        val visitorVisitsDeferred = async { fetchVisitorVisits(ownerId, currentStartIso) }
        val aiInsightsDeferred = async { safeSection(null) { fetchAiInsights(ownerId, range.days) } }

        val allVisitorLogs = visitorLogsDeferred.await()
        val allCallLogs = callLogsDeferred.await()
        val aiHandledVisits = visitorVisitsDeferred.await()
        val aiInsights = aiInsightsDeferred.await()

        val currentVisitorLogs = allVisitorLogs.filter { it.dateIn(zone) >= currentStart }
        val previousVisitorLogs = allVisitorLogs.filter { it.dateIn(zone) < currentStart }
        val currentCallLogs = allCallLogs.filter { it.dateIn(zone) >= currentStart }
        val previousCallLogs = allCallLogs.filter { it.dateIn(zone) < currentStart }

        val visitorTrend = buildDailyPoints(currentVisitorLogs.map { it.dateIn(zone) }, currentStart, today)
        val callTrend = buildCallTrend(currentCallLogs, zone, currentStart, today)
        val peakHours = buildPeakHours(currentVisitorLogs.map { it.hourIn(zone) } + currentCallLogs.map { it.hourIn(zone) })

        val missedCalls = currentCallLogs.count { it.isMissed() }
        val missedCallRatePct = if (currentCallLogs.isNotEmpty()) {
            (missedCalls * 100.0 / currentCallLogs.size).roundToInt()
        } else {
            0
        }
        val aiHandledCount = aiHandledVisits.count { it.accepted == false && it.purpose != null }

        val summary = AnalyticsSummary(
            totalVisitors = currentVisitorLogs.size,
            visitorChangePct = percentChange(previousVisitorLogs.size, currentVisitorLogs.size),
            totalCalls = currentCallLogs.size,
            callChangePct = percentChange(previousCallLogs.size, currentCallLogs.size),
            missedCalls = missedCalls,
            missedCallRatePct = missedCallRatePct,
            aiHandledCount = aiHandledCount,
        )

        AnalyticsData(
            range = range,
            summary = summary,
            visitorTrend = visitorTrend,
            callTrend = callTrend,
            peakHours = peakHours,
            aiInsights = aiInsights,
            executiveInsights = buildExecutiveInsights(range, summary, peakHours, aiInsights),
        )
    }

    /** Runs [block]; any failure logs and falls back to [default] so one bad section can't blank the screen. */
    private suspend fun <T> safeSection(default: T, block: suspend () -> T): T =
        try {
            block()
        } catch (e: Exception) {
            Logger.e(message = "Analytics section fetch failed", throwable = e)
            default
        }

    private suspend fun fetchVisitorLogs(ownerId: String, sinceIso: String): List<VisitorLogDto> =
        client.postgrest.from("visitor_logs")
            .select(columns = Columns.list("id", "event_type", "ai_intent", "created_at")) {
                filter {
                    eq("owner_id", ownerId)
                    gte("created_at", sinceIso)
                }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()

    private suspend fun fetchCallLogs(ownerId: String, sinceIso: String): List<CallLogDto> =
        client.postgrest.from("call_logs")
            .select(columns = Columns.list("id", "call_status", "duration", "started_at")) {
                filter {
                    eq("owner_id", ownerId)
                    gte("started_at", sinceIso)
                }
                order("started_at", Order.ASCENDING)
            }
            .decodeList()

    /**
     * Only the current window is needed for the AI-Handled summary tile
     * (unlike visitor/call trend, there's no "AI Handled change vs previous
     * period" card this phase), so this fetches from [currentStartIso]
     * only rather than the full doubled window the other two tables use.
     */
    private suspend fun fetchVisitorVisits(ownerId: String, currentStartIso: String): List<VisitorVisitDto> =
        client.postgrest.from("visitor_visits")
            .select(columns = Columns.list("id", "purpose", "call_type", "accepted", "duration", "created_at")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("accepted", false)
                    gte("created_at", currentStartIso)
                }
            }
            .decodeList()

    private suspend fun fetchAiInsights(ownerId: String, days: Int): AiReceptionistInsightsDto =
        client.postgrest.rpc(
            function = "get_ai_receptionist_insights",
            parameters = GetAiReceptionistInsightsParams(ownerId = ownerId, days = days),
        ).decodeAs()

    private fun VisitorLogDto.dateIn(zone: ZoneId): LocalDate =
        parseIsoOrEpoch(createdAt).atZoneSameInstant(zone).toLocalDate()

    private fun VisitorLogDto.hourIn(zone: ZoneId): Int =
        parseIsoOrEpoch(createdAt).atZoneSameInstant(zone).hour

    private fun CallLogDto.dateIn(zone: ZoneId): LocalDate =
        parseIsoOrEpoch(startedAt).atZoneSameInstant(zone).toLocalDate()

    private fun CallLogDto.hourIn(zone: ZoneId): Int =
        parseIsoOrEpoch(startedAt).atZoneSameInstant(zone).hour

    private fun CallLogDto.isMissed(): Boolean =
        callStatus.contains("missed", ignoreCase = true) || callStatus.contains("declined", ignoreCase = true)

    private fun parseIsoOrEpoch(iso: String): java.time.Instant =
        try {
            OffsetDateTime.parse(iso).toInstant()
        } catch (e: Exception) {
            java.time.Instant.EPOCH
        }

    private fun buildDailyPoints(dates: List<LocalDate>, start: LocalDate, end: LocalDate): List<DailyPoint> {
        val counts = dates.groupingBy { it }.eachCount()
        val points = mutableListOf<DailyPoint>()
        var day = start
        while (!day.isAfter(end)) {
            points += DailyPoint(date = day, count = counts[day] ?: 0)
            day = day.plusDays(1)
        }
        return points
    }

    private fun buildCallTrend(calls: List<CallLogDto>, zone: ZoneId, start: LocalDate, end: LocalDate): List<DailyCallPoint> {
        val byDay = calls.groupBy { it.dateIn(zone) }
        val points = mutableListOf<DailyCallPoint>()
        var day = start
        while (!day.isAfter(end)) {
            val dayCalls = byDay[day].orEmpty()
            val missed = dayCalls.count { it.isMissed() }
            points += DailyCallPoint(date = day, total = dayCalls.size, missed = missed, answered = dayCalls.size - missed)
            day = day.plusDays(1)
        }
        return points
    }

    private fun buildPeakHours(hours: List<Int>): List<HourlyPoint> {
        val counts = hours.groupingBy { it }.eachCount()
        return (0..23).map { hour -> HourlyPoint(hour = hour, count = counts[hour] ?: 0) }
    }

    /** Percent change from [previous] to [current]; null when [previous] is zero (no meaningful baseline to compare against). */
    private fun percentChange(previous: Int, current: Int): Int? =
        if (previous == 0) null else (((current - previous).toDouble() / previous) * 100).roundToInt()

    /**
     * Plain-English, rule-based observations — no LLM call, nothing
     * fabricated. Each line is included only when the underlying data
     * actually supports it; sections with no signal are simply omitted
     * rather than padded with a generic filler sentence.
     */
    private fun buildExecutiveInsights(
        range: AnalyticsRange,
        summary: AnalyticsSummary,
        peakHours: List<HourlyPoint>,
        aiInsights: AiReceptionistInsightsDto?,
    ): List<String> {
        val insights = mutableListOf<String>()

        summary.visitorChangePct?.let { pct ->
            val direction = if (pct >= 0) "up" else "down"
            insights += "Visitor traffic is $direction ${kotlin.math.abs(pct)}% versus the previous ${range.days}-day period."
        }

        summary.callChangePct?.let { pct ->
            val direction = if (pct >= 0) "up" else "down"
            insights += "Call volume is $direction ${kotlin.math.abs(pct)}% versus the previous ${range.days}-day period."
        }

        if (summary.totalCalls > 0) {
            insights += "${summary.missedCallRatePct}% of calls in this period were missed or declined."
        }

        peakHours.maxByOrNull { it.count }?.takeIf { it.count > 0 }?.let { peak ->
            insights += "Most visitor activity happens around ${formatHour(peak.hour)}."
        }

        aiInsights?.categoryBreakdown?.maxByOrNull { it.count }?.takeIf { it.count > 0 }?.let { top ->
            insights += "${top.visitorType} is the most common visitor category (${top.pct.roundToInt()}%)."
        }

        if (summary.aiHandledCount > 0) {
            insights += "The AI receptionist handled ${summary.aiHandledCount} visit${if (summary.aiHandledCount == 1) "" else "s"} this period."
        }

        return insights
    }

    private fun formatHour(hour: Int): String {
        val time = java.time.LocalTime.of(hour, 0)
        return time.format(DateTimeFormatter.ofPattern("h a", Locale.getDefault()))
    }
}
