package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.model.AiReceptionistData
import `in`.mysmartdoor.app.core.network.dto.AiCallScreeningDto
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto
import `in`.mysmartdoor.app.core.network.dto.GetAiReceptionistInsightsParams
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AI Receptionist (Phase 7) — reads-only aggregation over the exact same
 * production backend the website's AI Receptionist surfaces already use:
 * `security_rules` (owner status), the `get_ai_receptionist_insights` RPC
 * (`sql/54_ai_receptionist_intelligence.sql`), and `ai_call_screenings`
 * (`sql/52_ai_call_screening.sql`). No new table, column, Edge Function, or
 * RPC — see [AiReceptionistData]'s doc comment for exactly what each field
 * maps to and why.
 *
 * [ownerId] is `users.id`, sourced the same way [DashboardRepository] /
 * [VisitorRepository] do — via [SecureSessionManager], not the Supabase
 * auth uid. RLS (and, for the RPC, its own internal
 * `p_owner_id = get_my_owner_id()` check) already scopes every read
 * server-side; the explicit filters/params here match what the web client
 * sends, same defense-in-depth convention as the rest of this package.
 *
 * Resilience: each of the three sections is fetched independently via
 * [safeSection] so one bad/empty read degrades only that section instead of
 * failing the whole screen — the status card, insights section, and
 * activity timeline all hide gracefully per CTO direction rather than
 * showing fake data.
 *
 * FUTURE READY, NOT IMPLEMENTED (per CTO direction — architecture only):
 * this repository intentionally exposes only what already exists server
 * side. Voice AI, Video AI, Visitor Consent, Face Verification, AI
 * Learning, Smart Delivery, and Multi-language AI each already have a
 * natural extension point here (a new `safeSection` fetch feeding a new
 * field on [AiReceptionistData]) without changing this class's shape —
 * none of them are wired up, and no backend call for them is made.
 */
@Singleton
class AiReceptionistRepository @Inject constructor(
    private val client: SupabaseClient,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    private companion object {
        const val RECENT_ACTIVITY_LIMIT = 10L
        const val INSIGHTS_WINDOW_DAYS = 30
    }

    suspend fun getAiReceptionistData(): Result<AiReceptionistData> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall { fetchAiReceptionistData(ownerId) }
    }

    private suspend fun fetchAiReceptionistData(ownerId: String): AiReceptionistData = coroutineScope {
        val ownerStatusDeferred = async { safeSection(null) { fetchOwnerStatus(ownerId) } }
        val insightsDeferred = async { safeSection(null) { fetchInsights(ownerId) } }
        val recentActivityDeferred = async { safeSection(emptyList()) { fetchRecentActivity(ownerId) } }

        AiReceptionistData(
            ownerStatus = ownerStatusDeferred.await(),
            insights = insightsDeferred.await(),
            recentActivity = recentActivityDeferred.await(),
        )
    }

    /** Runs [block]; any failure logs and falls back to [default] so one bad section can't blank the screen. */
    private suspend fun <T> safeSection(default: T, block: suspend () -> T): T =
        try {
            block()
        } catch (e: Exception) {
            Logger.e(message = "AI Receptionist section fetch failed", throwable = e)
            default
        }

    private suspend fun fetchOwnerStatus(ownerId: String): String? =
        client.postgrest.from("security_rules")
            .select(columns = Columns.list("current_status")) {
                filter { eq("owner_id", ownerId) }
            }
            .decodeSingleOrNull<OwnerStatusRow>()
            ?.currentStatus

    private suspend fun fetchInsights(ownerId: String): AiReceptionistInsightsDto =
        client.postgrest.rpc(
            function = "get_ai_receptionist_insights",
            parameters = GetAiReceptionistInsightsParams(
                ownerId = ownerId,
                days = INSIGHTS_WINDOW_DAYS,
            ),
        ).decodeAs()

    private suspend fun fetchRecentActivity(ownerId: String): List<AiCallScreeningDto> =
        client.postgrest.from("ai_call_screenings")
            .select(
                columns = Columns.list(
                    "id", "visitor_name", "visitor_type", "company", "visiting_whom",
                    "confidence", "suggested_action", "ai_summary", "conversation_mode",
                    "priority", "created_at",
                ),
            ) {
                filter { eq("owner_id", ownerId) }
                order("created_at", Order.DESCENDING)
                limit(RECENT_ACTIVITY_LIMIT)
            }
            .decodeList()

    @kotlinx.serialization.Serializable
    private data class OwnerStatusRow(
        @kotlinx.serialization.SerialName("current_status") val currentStatus: String? = null,
    )
}
