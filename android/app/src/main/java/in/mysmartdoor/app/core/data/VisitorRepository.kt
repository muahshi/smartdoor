package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.dto.GetOwnerActivityFeedParams
import `in`.mysmartdoor.app.core.network.dto.VisitorActivityDto
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Visitors Timeline (Phase 4 — VISITORS V2) — reads the exact same
 * production RPC the website's Owner Activity Center already calls,
 * `get_owner_activity_feed` (see `sql/43_owner_activity_center.sql`,
 * extended by `sql/44_visitor_management_upgrade.sql`). No new table,
 * column, or RPC; RLS/authorization inside the RPC itself already checks
 * `p_owner_id = get_my_owner_id()` server-side (same defense-in-depth
 * pattern [DashboardRepository] follows by also passing ownerId explicitly).
 *
 * [ownerId] is `users.id`, sourced the same way [DashboardRepository] does —
 * via [SecureSessionManager], not the Supabase auth uid.
 */
@Singleton
class VisitorRepository @Inject constructor(
    private val client: SupabaseClient,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    companion object {
        const val PAGE_SIZE = 20
    }

    /**
     * One page of the visitor activity feed.
     *
     * @param search free-text search — matches visitor name/phone/plate ID
     *   server-side (RPC's `p_search`).
     * @param dateRange one of 'all' | 'today' | 'yesterday' | 'last7' | 'last30'.
     * @param status one of 'all' | 'connected' | 'missed' | 'rejected' | 'cancelled'.
     * @param label one of 'all' | 'favorites' | 'blocked' | an exact label string.
     * @param offset pagination offset; page size is fixed at [PAGE_SIZE] to
     *   match the RPC's own default.
     */
    suspend fun getVisitorFeed(
        search: String? = null,
        dateRange: String = "all",
        status: String = "all",
        label: String = "all",
        offset: Int = 0,
    ): Result<List<VisitorActivityDto>> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall {
            client.postgrest.rpc(
                function = "get_owner_activity_feed",
                parameters = GetOwnerActivityFeedParams(
                    ownerId = ownerId,
                    search = search?.takeIf { it.isNotBlank() },
                    dateRange = dateRange,
                    status = status,
                    limit = PAGE_SIZE,
                    offset = offset,
                    label = label,
                ),
            ).decodeList()
        }
    }
}
