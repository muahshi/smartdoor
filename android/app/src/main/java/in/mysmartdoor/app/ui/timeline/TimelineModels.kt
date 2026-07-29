package `in`.mysmartdoor.app.ui.timeline

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Phase 12A — PREMIUM UI REBUILD.
 *
 * This file is [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * original `TimelineKind`/`TimelineEntry`/`buildTimeline` (from the Owner
 * Dashboard "Live Activity Timeline" section), moved here unchanged in
 * substance and made non-private so a second screen
 * ([in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen]) can
 * build the exact same merged feed from the exact same already-fetched
 * [DashboardData] — no new repository, no new Postgrest query, no new
 * ViewModel. Both the Dashboard's compact preview and the full-screen Live
 * Activity feed call [buildTimeline] and get the same entries; only how
 * many they show / how they're filtered differs at the call site.
 *
 * Two additions beyond the original Dashboard-only version:
 * - [TimelineEntry.isAlert] — a client-side classification (missed call /
 *   AI-blocked spam / visitor not accepted) derived from fields already on
 *   [DashboardData], used to back Live Activity's "Alerts" filter chip.
 *   No new data source; just a second way of grouping what's already here.
 * - [timelineKindIconRes] — maps each kind to one of the existing
 *   `res/drawable/ic_*.xml` vector drawables already shipping in this app
 *   (ic_qr, ic_call, ic_chat, ic_receipt, ic_bot) — per CTO direction, no
 *   `material-icons-core` dependency and no new icon assets beyond what
 *   Phase 12A's audit already called out as missing (ic_home, ic_back).
 */
enum class TimelineKind { Visitor, Call, Message, Delivery, AiEvent }

data class TimelineEntry(
    val kind: TimelineKind,
    val primary: String,
    val secondary: String?,
    val createdAt: String,
    val isAlert: Boolean,
)

/**
 * Merges [DashboardData.recentVisitors]/[recentCalls]/[recentMessages] with
 * Delivery/AI-event entries derived from [DashboardData.recentVisitorVisits]
 * into one time-sorted feed. Notifications are intentionally excluded —
 * Dashboard's Notifications Preview section covers those separately, same
 * as before this move.
 *
 * [limit] defaults to the Dashboard preview's original cap of 12; Live
 * Activity's full-screen feed passes a much higher number so the CTO's
 * "device screenshot is the source of truth" list can actually scroll.
 */
fun buildTimeline(data: DashboardData, limit: Int = 12): List<TimelineEntry> {
    val visitorEntries = data.recentVisitors.map {
        TimelineEntry(
            kind = TimelineKind.Visitor,
            primary = it.eventType.replace('_', ' ').replaceFirstChar { c -> c.uppercase() },
            secondary = it.aiIntent,
            createdAt = it.createdAt,
            isAlert = false,
        )
    }
    val callEntries = data.recentCalls.map {
        val missed = it.callStatus.contains("missed", ignoreCase = true) ||
            it.callStatus.contains("declined", ignoreCase = true)
        TimelineEntry(
            kind = TimelineKind.Call,
            primary = it.callStatus.replace('_', ' ').replaceFirstChar { c -> c.uppercase() },
            secondary = if (it.duration > 0) "${it.duration}s" else null,
            createdAt = it.startedAt,
            isAlert = missed,
        )
    }
    val messageEntries = data.recentMessages.map {
        TimelineEntry(
            kind = TimelineKind.Message,
            primary = it.messageType.replaceFirstChar { c -> c.uppercase() },
            secondary = it.content,
            createdAt = it.createdAt,
            isAlert = it.priority.equals("urgent", ignoreCase = true),
        )
    }
    val visitEntries = data.recentVisitorVisits.filter { it.purpose != null }.map {
        val isDelivery = it.purpose.orEmpty().contains("deliver", ignoreCase = true)
        TimelineEntry(
            kind = if (isDelivery) TimelineKind.Delivery else TimelineKind.AiEvent,
            primary = it.purpose.orEmpty(),
            secondary = if (it.accepted == false) "Not accepted" else null,
            createdAt = it.createdAt,
            isAlert = it.accepted == false,
        )
    }
    return (visitorEntries + callEntries + messageEntries + visitEntries)
        .sortedByDescending { runCatching { OffsetDateTime.parse(it.createdAt) }.getOrNull() }
        .take(limit)
}

fun timelineKindLabel(kind: TimelineKind): String = when (kind) {
    TimelineKind.Visitor -> "Visitor"
    TimelineKind.Call -> "Call"
    TimelineKind.Message -> "Message"
    TimelineKind.Delivery -> "Delivery"
    TimelineKind.AiEvent -> "AI"
}

fun timelineKindStatus(kind: TimelineKind): SDBadgeStatus = when (kind) {
    TimelineKind.Visitor -> SDBadgeStatus.Info
    TimelineKind.Call -> SDBadgeStatus.Warning
    TimelineKind.Message -> SDBadgeStatus.Neutral
    TimelineKind.Delivery -> SDBadgeStatus.Success
    TimelineKind.AiEvent -> SDBadgeStatus.Info
}

/** Existing vector drawable each kind renders in its Live Activity icon circle — no new icon assets. */
fun timelineKindIconRes(kind: TimelineKind): Int = when (kind) {
    TimelineKind.Visitor -> R.drawable.ic_qr
    TimelineKind.Call -> R.drawable.ic_call
    TimelineKind.Message -> R.drawable.ic_chat
    TimelineKind.Delivery -> R.drawable.ic_receipt
    TimelineKind.AiEvent -> R.drawable.ic_bot
}

/** Shared relative-time formatter — same output as the original Dashboard-only copy. */
fun formatRelativeTime(iso: String?): String {
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
