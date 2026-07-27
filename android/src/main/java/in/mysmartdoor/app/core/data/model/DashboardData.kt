package `in`.mysmartdoor.app.core.data.model

import `in`.mysmartdoor.app.core.network.dto.CallLogDto
import `in`.mysmartdoor.app.core.network.dto.MessageLogDto
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.core.network.dto.OwnerProfileDto
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SecurityRulesDto
import `in`.mysmartdoor.app.core.network.dto.SubscriptionDto
import `in`.mysmartdoor.app.core.network.dto.VisitorLogDto

/**
 * Aggregate, screen-ready snapshot for [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen].
 * Built by [in.mysmartdoor.app.core.data.DashboardRepository] from several
 * independent Postgrest reads. Sections beyond [owner] are nullable/empty
 * by design: a single failed query (e.g. no active subscription — a normal
 * state for `hardware_only` owners, see `services/subscriptions.js`) must
 * not take down the whole dashboard.
 */
data class DashboardData(
    val owner: OwnerProfileDto,
    val plate: PlateDto?,
    val subscription: SubscriptionDto?,
    val securityRules: SecurityRulesDto?,
    val todayVisitorCount: Int,
    val recentVisitors: List<VisitorLogDto>,
    val recentCalls: List<CallLogDto>,
    val recentMessages: List<MessageLogDto>,
    val unreadMessageCount: Int,
    val recentNotifications: List<NotificationDto>,
    val unreadNotificationCount: Int,
)
