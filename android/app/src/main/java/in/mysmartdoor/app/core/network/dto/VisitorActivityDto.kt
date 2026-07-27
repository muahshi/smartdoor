package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Row/parameter DTOs for the Visitors Timeline (Phase 4 — VISITORS V2).
 *
 * Backed entirely by the existing `get_owner_activity_feed(...)` RPC —
 * see `sql/44_visitor_management_upgrade.sql` (extends `sql/43_owner_activity_center.sql`).
 * No new table, column, or RPC: this phase only adds the Android-side
 * request/response shape for an RPC the web app's Owner Activity Center
 * already calls in production. Field names/nullability mirror exactly
 * what that RPC's `RETURNS TABLE (...)` declares.
 */

/**
 * Request parameters for `get_owner_activity_feed`. Field names use the
 * RPC's own `p_*` parameter names via [SerialName] so the Postgrest RPC
 * call serializes to exactly what the function signature expects.
 */
@Serializable
data class GetOwnerActivityFeedParams(
    @SerialName("p_owner_id") val ownerId: String,
    @SerialName("p_search") val search: String? = null,
    @SerialName("p_date_range") val dateRange: String = "all",
    @SerialName("p_status") val status: String = "all",
    @SerialName("p_limit") val limit: Int = 20,
    @SerialName("p_offset") val offset: Int = 0,
    @SerialName("p_label") val label: String = "all",
)

/**
 * One row returned by `get_owner_activity_feed`.
 *
 * [callStatus] is one of the production values already validated by
 * `record_visitor_call` (see `sql/43_owner_activity_center.sql`):
 * 'incoming' | 'connected' | 'missed' | 'rejected' | 'cancelled' | 'failed'.
 * [photoUrl] is read (and kept in the model) for architectural
 * forward-readiness only — per CTO direction this phase does not add an
 * image-loading library, so the UI renders [SDAvatar]-style initials
 * regardless of whether this is null.
 * [totalCount] is the same value on every row for a given query (a SQL
 * window-function `COUNT(*) OVER()`) — used client-side to know whether
 * more pages remain, not per-row data.
 */
@Serializable
data class VisitorActivityDto(
    val id: String,
    @SerialName("visitor_profile_id") val visitorProfileId: String? = null,
    @SerialName("visitor_name") val visitorName: String? = null,
    val phone: String? = null,
    @SerialName("plate_id") val plateId: String? = null,
    @SerialName("call_status") val callStatus: String? = null,
    val duration: Int = 0,
    @SerialName("network_type") val networkType: String? = null,
    @SerialName("created_at") val createdAt: String,
    val label: String? = null,
    @SerialName("label_color") val labelColor: String? = null,
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    @SerialName("photo_url") val photoUrl: String? = null,
    val blocked: Boolean = false,
    @SerialName("visit_count") val visitCount: Int = 1,
    @SerialName("total_count") val totalCount: Long = 0,
)
