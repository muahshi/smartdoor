package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.core.network.dto.CallLogDto
import `in`.mysmartdoor.app.core.network.dto.MessageLogDto
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.core.network.dto.OwnerProfileDto
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SecurityRulesDto
import `in`.mysmartdoor.app.core.network.dto.SubscriptionDto
import `in`.mysmartdoor.app.core.network.dto.VisitorLogDto
import `in`.mysmartdoor.app.core.network.dto.VisitorVisitDto
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owner Dashboard — reads-only aggregation over the exact same
 * production tables the website's `js/dashboard.js` + `services/` *.js
 * already use (`users`, `plates`, `subscriptions`, `security_rules`,
 * `visitor_logs`, `call_logs`, `message_logs`, `notifications`). Phase 2
 * additionally reads `visitor_visits` (`sql/41_visitor_memory.sql`) for the
 * AI Handled / Missed Visitor stats and the AI Receptionist's last-interaction
 * summary — same table the web's visitor-memory feature already reads. No
 * new tables, no new Edge Function — RLS (`owner_id = get_my_owner_id()`,
 * see `sql/65_fix_owner_id_rls_mismatch.sql`) already scopes every one of
 * these queries to the signed-in owner server-side; the `.eq("owner_id", …)`
 * filters here match what the web client sends for defence in depth /
 * query-planner efficiency, same as `services/logs.js` etc. do.
 *
 * [ownerId] used throughout is `users.id` (NOT the Supabase auth uid) —
 * confirmed against `supabase/functions/verify-pin/index.ts`, which is
 * exactly the value [SecureSessionManager.saveUserId] persisted at login.
 * Every other table's `owner_id` FK references this same `users.id`.
 *
 * Resilience: only the owner-profile read is fatal. Every other section
 * (plate, subscription, security rules, visitors/calls/messages/
 * notifications) is fetched independently via [safeSection] so one bad or
 * empty table (e.g. no active subscription — a normal state for
 * `hardware_only` owners per `services/subscriptions.js`) degrades that
 * one card instead of failing the whole screen.
 */
@Singleton
class DashboardRepository @Inject constructor(
    private val client: SupabaseClient,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    private companion object {
        const val RECENT_LIMIT = 5L
    }

    suspend fun getDashboardData(): Result<DashboardData> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall { fetchDashboard(ownerId) }
    }

    private suspend fun fetchDashboard(ownerId: String): DashboardData = coroutineScope {
        val owner = client.postgrest.from("users")
            .select(columns = Columns.list("id", "full_name", "phone", "email", "plate_id", "created_at")) {
                filter { eq("id", ownerId) }
            }
            .decodeSingleOrNull<OwnerProfileDto>()
            ?: throw IllegalStateException("Owner profile not found. Please log in again.")

        // Start-of-today, device-local timezone — matches getTodayStats()'s
        // `todayStart.setHours(0,0,0,0)` on the web (services/logs.js).
        val todayStartIso = LocalDate.now()
            .atStartOfDay(ZoneId.systemDefault())
            .toOffsetDateTime()
            .toString()

        val plateDeferred = async { safeSection(null) { fetchPlate(ownerId) } }
        val subscriptionDeferred = async { safeSection(null) { fetchSubscription(ownerId) } }
        val securityRulesDeferred = async { safeSection(null) { fetchSecurityRules(ownerId) } }
        val todayVisitorCountDeferred = async { safeSection(0) { fetchTodayVisitorCount(ownerId, todayStartIso) } }
        val recentVisitorsDeferred = async { safeSection(emptyList()) { fetchRecentVisitors(ownerId) } }
        val recentCallsDeferred = async { safeSection(emptyList()) { fetchRecentCalls(ownerId) } }
        val recentMessagesDeferred = async { safeSection(emptyList()) { fetchRecentMessages(ownerId) } }
        val unreadMessageCountDeferred = async { safeSection(0) { fetchUnreadMessageCount(ownerId) } }
        val recentNotificationsDeferred = async { safeSection(emptyList()) { fetchRecentNotifications(ownerId) } }
        val unreadNotificationCountDeferred = async { safeSection(0) { fetchUnreadNotificationCount(ownerId) } }
        val recentVisitorVisitsDeferred = async { safeSection(emptyList()) { fetchRecentVisitorVisits(ownerId) } }
        val missedAndAiHandledDeferred = async { safeSection(0 to 0) { fetchMissedAndAiHandledCounts(ownerId) } }

        val missedAndAiHandled = missedAndAiHandledDeferred.await()

        DashboardData(
            owner = owner,
            plate = plateDeferred.await(),
            subscription = subscriptionDeferred.await(),
            securityRules = securityRulesDeferred.await(),
            todayVisitorCount = todayVisitorCountDeferred.await(),
            recentVisitors = recentVisitorsDeferred.await(),
            recentCalls = recentCallsDeferred.await(),
            recentMessages = recentMessagesDeferred.await(),
            unreadMessageCount = unreadMessageCountDeferred.await(),
            recentNotifications = recentNotificationsDeferred.await(),
            unreadNotificationCount = unreadNotificationCountDeferred.await(),
            recentVisitorVisits = recentVisitorVisitsDeferred.await(),
            missedVisitorCount = missedAndAiHandled.first,
            aiHandledCount = missedAndAiHandled.second,
        )
    }

    /** Runs [block]; any failure logs and falls back to [default] so one bad section can't blank the dashboard. */
    private suspend fun <T> safeSection(default: T, block: suspend () -> T): T =
        try {
            block()
        } catch (e: Exception) {
            Logger.e(message = "Dashboard section fetch failed", throwable = e)
            default
        }

    private suspend fun fetchPlate(ownerId: String): PlateDto? =
        client.postgrest.from("plates")
            .select(
                columns = Columns.list("plate_id", "qr_slug", "product_type", "status", "expiry_date", "updated_at"),
            ) {
                filter { eq("owner_id", ownerId) }
            }
            .decodeSingleOrNull()

    private suspend fun fetchSubscription(ownerId: String): SubscriptionDto? =
        client.postgrest.from("subscriptions")
            .select(columns = Columns.list("plan", "status", "expiry_date")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("status", "active")
                }
                order("created_at", Order.DESCENDING)
                limit(1)
            }
            .decodeSingleOrNull()

    private suspend fun fetchSecurityRules(ownerId: String): SecurityRulesDto? =
        client.postgrest.from("security_rules")
            .select(
                columns = Columns.list(
                    "current_status", "custom_message", "call_forwarding", "auto_reply_enabled", "night_mode_on",
                ),
            ) {
                filter { eq("owner_id", ownerId) }
            }
            .decodeSingleOrNull()

    private suspend fun fetchTodayVisitorCount(ownerId: String, todayStartIso: String): Int =
        client.postgrest.from("visitor_logs")
            .select(columns = Columns.list("id")) {
                filter {
                    eq("owner_id", ownerId)
                    gte("created_at", todayStartIso)
                }
                count(Count.EXACT)
            }
            .countOrNull()
            ?.toInt() ?: 0

    private suspend fun fetchRecentVisitors(ownerId: String): List<VisitorLogDto> =
        client.postgrest.from("visitor_logs")
            .select(columns = Columns.list("id", "event_type", "ai_intent", "created_at")) {
                filter { eq("owner_id", ownerId) }
                order("created_at", Order.DESCENDING)
                limit(RECENT_LIMIT)
            }
            .decodeList()

    private suspend fun fetchRecentCalls(ownerId: String): List<CallLogDto> =
        client.postgrest.from("call_logs")
            .select(columns = Columns.list("id", "call_status", "duration", "started_at")) {
                filter { eq("owner_id", ownerId) }
                order("started_at", Order.DESCENDING)
                limit(RECENT_LIMIT)
            }
            .decodeList()

    private suspend fun fetchRecentMessages(ownerId: String): List<MessageLogDto> =
        client.postgrest.from("message_logs")
            .select(
                columns = Columns.list("id", "message_type", "content", "priority", "is_read", "created_at"),
            ) {
                filter { eq("owner_id", ownerId) }
                order("created_at", Order.DESCENDING)
                limit(RECENT_LIMIT)
            }
            .decodeList()

    private suspend fun fetchUnreadMessageCount(ownerId: String): Int =
        client.postgrest.from("message_logs")
            .select(columns = Columns.list("id")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("is_read", false)
                }
                count(Count.EXACT)
            }
            .countOrNull()
            ?.toInt() ?: 0

    private suspend fun fetchRecentNotifications(ownerId: String): List<NotificationDto> =
        client.postgrest.from("notifications")
            .select(columns = Columns.list("id", "type", "title", "body", "is_read", "created_at")) {
                filter { eq("owner_id", ownerId) }
                order("created_at", Order.DESCENDING)
                limit(RECENT_LIMIT)
            }
            .decodeList()

    private suspend fun fetchUnreadNotificationCount(ownerId: String): Int =
        client.postgrest.from("notifications")
            .select(columns = Columns.list("id")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("is_read", false)
                }
                count(Count.EXACT)
            }
            .countOrNull()
            ?.toInt() ?: 0

    private suspend fun fetchRecentVisitorVisits(ownerId: String): List<VisitorVisitDto> =
        client.postgrest.from("visitor_visits")
            .select(
                columns = Columns.list("id", "purpose", "call_type", "accepted", "duration", "created_at"),
            ) {
                filter { eq("owner_id", ownerId) }
                order("created_at", Order.DESCENDING)
                limit(RECENT_LIMIT)
            }
            .decodeList()

    /**
     * Returns (missedVisitorCount, aiHandledCount) per the CTO-approved
     * production definitions on [VisitorVisitDto]:
     *   Missed Visitor = accepted == false
     *   AI Handled      = accepted == false AND purpose != null
     *
     * Deliberately fetches every `accepted = false` row for this owner and
     * counts client-side, rather than a server-side compound
     * `accepted=false AND purpose IS NOT NULL` filter: this file's only
     * proven-working Postgrest filter primitives are `eq`/`gte` (every
     * query above uses just these), and a null-check filter operator isn't
     * exercised anywhere in this codebase to verify against a real build in
     * this environment — same caution `DashboardScreen.RefreshGlyph`
     * already documents for not adding an unverified dependency mid-phase.
     * `eq("accepted", false)` is exact and already proven, so this fetch
     * gives real, exact production counts without gambling on unverified
     * DSL surface. Per-owner row volume here is small (visitor traffic for
     * one residence), so fetching the full matching set is not a scale risk.
     */
    private suspend fun fetchMissedAndAiHandledCounts(ownerId: String): Pair<Int, Int> {
        val missedVisits = client.postgrest.from("visitor_visits")
            .select(columns = Columns.list("id", "purpose", "created_at")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("accepted", false)
                }
            }
            .decodeList<VisitorVisitDto>()
        val aiHandledCount = missedVisits.count { it.purpose != null }
        return missedVisits.size to aiHandledCount
    }
}
