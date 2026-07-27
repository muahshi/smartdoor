package `in`.mysmartdoor.app.core.data.model

import `in`.mysmartdoor.app.core.network.dto.AiCallScreeningDto
import `in`.mysmartdoor.app.core.network.dto.AiReceptionistInsightsDto

/**
 * Aggregate, screen-ready snapshot for
 * [in.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistScreen]. Built
 * by [in.mysmartdoor.app.core.data.AiReceptionistRepository] from three
 * independent, already-existing production reads — no new backend:
 *
 * [ownerStatus] — `security_rules.current_status` ('available' | 'busy' |
 *   'sleeping' | 'away' | 'custom'), the same column
 *   [in.mysmartdoor.app.core.data.DashboardRepository] already reads and
 *   the exact value `services/aiReceptionist.js#classifyCallPurpose` passes
 *   the AI as `context.ownerStatus`. Null (not defaulted) when the row
 *   can't be read, so the screen can hide the status card per CTO direction
 *   ("hide gracefully, never fake status") instead of showing a wrong one.
 *
 * [insights] — `get_ai_receptionist_insights` RPC result. Null when the
 *   read fails or the owner has no screenings yet — the screen distinguishes
 *   "no data" from "zero screenings" the same way, both render the
 *   insights section's empty state.
 *
 * [recentActivity] — a page of `ai_call_screenings` rows, newest first.
 *   Empty list (never null) — an empty timeline is a normal, renderable
 *   state (see [in.mysmartdoor.app.ui.screens.common.EmptyStateScreen]),
 *   distinct from a read failure.
 */
data class AiReceptionistData(
    val ownerStatus: String?,
    val insights: AiReceptionistInsightsDto?,
    val recentActivity: List<AiCallScreeningDto>,
)
