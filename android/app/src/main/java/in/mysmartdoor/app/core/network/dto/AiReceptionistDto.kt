package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Row/parameter DTOs for the AI Receptionist screen (Phase 7).
 *
 * Backed entirely by existing production backend — no new table, column,
 * Edge Function, or RPC:
 *   - `get_ai_receptionist_insights(p_owner_id, p_days)` RPC
 *     (`sql/54_ai_receptionist_intelligence.sql`) — the same read-only,
 *     owner-scoped SECURITY DEFINER RPC `services/aiReceptionistAnalytics.js`
 *     already calls on the website. Field names/nullability mirror exactly
 *     what that RPC's `json_build_object(...)` returns.
 *   - `ai_call_screenings` table (`sql/52_ai_call_screening.sql`, extended
 *     by `sql/54`) — the same table `services/aiReceptionist.js#getRecentCallScreening`
 *     reads, used here for the Recent AI Activity timeline (a small page of
 *     rows rather than a single freshness-windowed lookup).
 *
 * Both are already RLS-scoped to `owner_id = get_my_owner_id()` server-side
 * (the RPC additionally self-checks `p_owner_id = get_my_owner_id()`) —
 * same defense-in-depth convention [DashboardRepository] and
 * [VisitorRepository] already follow.
 */

/**
 * Request parameters for `get_ai_receptionist_insights`. Field names use
 * the RPC's own `p_*` parameter names via [SerialName], same pattern as
 * [GetOwnerActivityFeedParams].
 */
@Serializable
data class GetAiReceptionistInsightsParams(
    @SerialName("p_owner_id") val ownerId: String,
    @SerialName("p_days") val days: Int = 30,
)

/** One entry of `insights.category_breakdown` — visitor-type share of total screenings. */
@Serializable
data class AiCategoryBreakdownDto(
    @SerialName("visitor_type") val visitorType: String,
    val count: Int = 0,
    val pct: Double = 0.0,
    @SerialName("avg_confidence") val avgConfidence: Double = 0.0,
)

/** One entry of `insights.weekly_trend` — this-week vs last-week count per visitor type. */
@Serializable
data class AiWeeklyTrendDto(
    @SerialName("visitor_type") val visitorType: String,
    @SerialName("this_week") val thisWeek: Int = 0,
    @SerialName("last_week") val lastWeek: Int = 0,
) {
    /** Mirrors `services/aiReceptionistAnalytics.js`'s `_pct()` helper exactly. */
    val changePct: Int
        get() = if (lastWeek == 0) {
            if (thisWeek > 0) 100 else 0
        } else {
            Math.round(((thisWeek - lastWeek).toDouble() / lastWeek) * 100).toInt()
        }
}

/** One entry of `insights.urgency_breakdown` — count of screenings per priority. */
@Serializable
data class AiUrgencyBreakdownDto(
    val priority: String,
    val count: Int = 0,
)

/** `insights.quality` — the AI quality/confidence grid, same fields the web renders. */
@Serializable
data class AiQualityDto(
    @SerialName("total_screenings") val totalScreenings: Int = 0,
    @SerialName("avg_confidence") val avgConfidence: Double = 0.0,
    @SerialName("high_confidence_count") val highConfidenceCount: Int = 0,
    @SerialName("low_confidence_count") val lowConfidenceCount: Int = 0,
    @SerialName("voice_count") val voiceCount: Int = 0,
    @SerialName("chip_count") val chipCount: Int = 0,
    @SerialName("rule_matched_count") val ruleMatchedCount: Int = 0,
    @SerialName("spam_flagged_count") val spamFlaggedCount: Int = 0,
    @SerialName("duplicate_count") val duplicateCount: Int = 0,
)

/** Full decoded response of `get_ai_receptionist_insights`. */
@Serializable
data class AiReceptionistInsightsDto(
    @SerialName("category_breakdown") val categoryBreakdown: List<AiCategoryBreakdownDto> = emptyList(),
    @SerialName("weekly_trend") val weeklyTrend: List<AiWeeklyTrendDto> = emptyList(),
    @SerialName("urgency_breakdown") val urgencyBreakdown: List<AiUrgencyBreakdownDto> = emptyList(),
    val quality: AiQualityDto = AiQualityDto(),
    @SerialName("window_days") val windowDays: Int = 30,
    @SerialName("generated_at") val generatedAt: String? = null,
)

/**
 * One row of `ai_call_screenings`, for the Recent AI Activity timeline.
 * Only the columns the timeline card renders are selected — no
 * `transcript` (kept server-side; the timeline is a summary view, not a
 * transcript viewer this phase).
 */
@Serializable
data class AiCallScreeningDto(
    val id: String,
    @SerialName("visitor_name") val visitorName: String? = null,
    @SerialName("visitor_type") val visitorType: String,
    val company: String? = null,
    @SerialName("visiting_whom") val visitingWhom: String? = null,
    val confidence: Double = 0.7,
    @SerialName("suggested_action") val suggestedAction: String = "Notify Owner",
    @SerialName("ai_summary") val aiSummary: String? = null,
    @SerialName("conversation_mode") val conversationMode: String = "chip",
    val priority: String = "Normal",
    @SerialName("created_at") val createdAt: String,
)
