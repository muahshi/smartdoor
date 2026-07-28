package `in`.mysmartdoor.app.core.data.model

import `in`.mysmartdoor.app.core.network.dto.NotificationPreferencesDto
import `in`.mysmartdoor.app.core.network.dto.OwnerProfileDto
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SecurityRulesDto
import `in`.mysmartdoor.app.core.network.dto.SubscriptionDto

/**
 * Aggregate, screen-ready snapshot shared by
 * [in.mysmartdoor.app.ui.screens.settings.SettingsScreen] and
 * [in.mysmartdoor.app.ui.screens.account.AccountScreen]. Built by
 * [in.mysmartdoor.app.core.data.SettingsRepository] from the exact same
 * `users` / `plates` / `subscriptions` / `security_rules` reads
 * [in.mysmartdoor.app.core.data.DashboardRepository] already performs, plus
 * one new table this phase reads for the first time: `notification_preferences`.
 *
 * [owner] is the only fatal section — everything else degrades
 * independently (same [in.mysmartdoor.app.core.data.DashboardRepository]
 * convention) so one bad/missing row (e.g. no active subscription, no
 * saved notification preferences yet) doesn't blank the whole screen.
 *
 * [notificationPreferences] is never null even when no row exists yet —
 * [NotificationPreferencesDto]'s constructor defaults mirror the table's
 * own SQL `DEFAULT`s, so a first-time owner sees the real production
 * defaults, not a blank/fake state. The very first save upserts a row.
 */
data class SettingsData(
    val owner: OwnerProfileDto,
    val plate: PlateDto?,
    val subscription: SubscriptionDto?,
    val securityRules: SecurityRulesDto?,
    val notificationPreferences: NotificationPreferencesDto,
)
