package `in`.mysmartdoor.app.ui.screens.notifications

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorElevation
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.timeline.formatRelativeTime
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Notifications — Owner Dashboard V1 Quick Action; Phase 12E.7 — PREMIUM
 * PROFILE ECOSYSTEM premium notification center rebuild.
 *
 * Was previously wired to [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * "coming soon" snackbar. [in.mysmartdoor.app.core.data.model.DashboardData.recentNotifications]
 * (`notifications` table, same data already backing the Dashboard's
 * Notifications Preview card) already has everything this full-list screen
 * needs — reuses the same [DashboardViewModel] instance pattern
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen] established.
 * No new repository, no new query, no new ViewModel.
 *
 * Phase 12E.7 adds: a Today/Earlier grouping (computed client-side from
 * each row's existing `created_at`, same convention already used by
 * [formatRelativeTime] elsewhere in the app — no new column, no new
 * fetch), a per-[NotificationDto.type] icon (mapped from the exact `type`
 * strings production already writes — see `services/notifications.js`:
 * 'bell'/'voice'/'call'/'inbox_message'/'status_change'/'sos'/'payment'/
 * 'admin_action'/'security_alert' — no invented category column), and a
 * richer unread/empty-state treatment. [DashboardData.unreadNotificationCount]
 * (already fetched, previously unused by this screen) now drives the top
 * bar's unread badge.
 *
 * No search: [in.mysmartdoor.app.core.data.model.DashboardData] has no
 * server-side notification search/filter to back one, so none is added
 * here per the "no placeholder UI" rule — same reasoning the FAQ's
 * omitted Language/Theme toggles document.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Notifications",
                onBackClick = { navController.popBackStack() },
                backIconRes = R.drawable.ic_back,
                actions = {
                    val unread = uiState.data?.unreadNotificationCount ?: 0
                    if (unread > 0) {
                        SDBadge(
                            text = if (unread > 99) "99+" else unread.toString(),
                            status = SDBadgeStatus.Warning,
                            modifier = Modifier.padding(end = SmartDoorSpacing.xs),
                        )
                    }
                    IconButton(onClick = { if (!uiState.isRefreshing) viewModel.refresh() }) {
                        if (uiState.isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = SmartDoorSecondaryDark,
                            )
                        } else {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_refresh),
                                contentDescription = "Refresh",
                                modifier = Modifier.size(20.dp),
                                tint = SmartDoorSecondaryDark,
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            SDBottomNavigation(
                items = dashboardBottomNavItems,
                selectedRoute = Routes.DASHBOARD,
                onItemSelected = { item -> navController.navigate(item.route) { launchSingleTop = true } },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> NotificationsContent(data.recentNotifications)
                uiState.isLoading -> Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
                    SDSkeletonLoaderGroup(lineCount = 8, lineHeight = 64.dp)
                }
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = { viewModel.load() },
                )
            }
        }
    }
}

/** Client-side-only grouping bucket — no new data, just how [createdAt] sorts into sections. */
private enum class NotificationBucket { Today, Earlier }

private fun bucketFor(createdAt: String): NotificationBucket = try {
    val then = OffsetDateTime.parse(createdAt).toInstant()
    val hours = Duration.between(then, Instant.now()).toHours()
    if (hours < 24) NotificationBucket.Today else NotificationBucket.Earlier
} catch (e: Exception) {
    NotificationBucket.Earlier
}

@Composable
private fun NotificationsContent(notifications: List<NotificationDto>) {
    if (notifications.isEmpty()) {
        EmptyNotificationsState()
        return
    }

    val grouped = notifications.groupBy { bucketFor(it.createdAt) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
    ) {
        grouped[NotificationBucket.Today]?.let { todayItems ->
            item { BucketHeader(title = "Today") }
            items(todayItems) { notification ->
                SDCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    elevation = SmartDoorElevation.level1,
                ) {
                    NotificationDetailRow(notification)
                }
            }
        }
        grouped[NotificationBucket.Earlier]?.let { earlierItems ->
            item { BucketHeader(title = "Earlier") }
            items(earlierItems) { notification ->
                SDCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    elevation = SmartDoorElevation.level1,
                ) {
                    NotificationDetailRow(notification)
                }
            }
        }
    }
}

@Composable
private fun BucketHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = SmartDoorSpacing.xs),
    )
}

@Composable
private fun NotificationDetailRow(notification: NotificationDto) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        NotificationTypeIcon(type = notification.type)
        Spacer(modifier = Modifier.size(SmartDoorSpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = notification.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (!notification.isRead) {
                    Spacer(modifier = Modifier.size(SmartDoorSpacing.xxs))
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(SmartDoorSecondaryDark),
                    )
                }
            }
            if (!notification.body.isNullOrBlank()) {
                Text(
                    text = notification.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.size(SmartDoorSpacing.xxs))
            Text(
                text = formatRelativeTime(notification.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * Icon chip keyed off [NotificationDto.type] — the exact `type` string
 * values production already writes (`services/notifications.js`:
 * 'bell', 'voice', 'call', 'inbox_message', 'status_change', 'sos',
 * 'payment', 'admin_action', 'security_alert'). Mapped to existing
 * `res/drawable/ic_*.xml` assets only — no new icon files added. Any
 * type this app hasn't seen yet safely falls back to the generic bell.
 */
@Composable
private fun NotificationTypeIcon(type: String) {
    val iconRes = when (type) {
        "call", "voice" -> R.drawable.ic_call
        "inbox_message" -> R.drawable.ic_chat
        "payment" -> R.drawable.ic_receipt
        "security_alert", "sos" -> R.drawable.ic_shield
        else -> R.drawable.ic_bell
    }
    Box(
        modifier = Modifier
            .size(36.dp)
            .background(color = SmartDoorSecondaryDark.copy(alpha = 0.14f), shape = CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = SmartDoorSecondaryDark,
        )
    }
}

@Composable
private fun EmptyNotificationsState() {
    Column(
        modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(color = SmartDoorSecondaryDark.copy(alpha = 0.14f), shape = CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(id = R.drawable.ic_bell),
                contentDescription = null,
                modifier = Modifier.size(28.dp),
                tint = SmartDoorSecondaryDark,
            )
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
        Text(
            text = "You're all caught up.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Text(
            text = "New visitor, call, and message alerts will show up here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
