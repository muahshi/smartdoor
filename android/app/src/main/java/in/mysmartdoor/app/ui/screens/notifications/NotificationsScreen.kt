package `in`.mysmartdoor.app.ui.screens.notifications

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.timeline.formatRelativeTime
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController

/**
 * Notifications — Owner Dashboard V1 Quick Action.
 *
 * Was previously wired to [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * "coming soon" snackbar. [in.mysmartdoor.app.core.data.model.DashboardData.recentNotifications]
 * (`notifications` table, same data already backing the Dashboard's
 * Notifications Preview card) already has everything this full-list screen
 * needs — reuses the same [DashboardViewModel] instance pattern
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen] established.
 * No new repository, no new query, no new ViewModel.
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

@Composable
private fun NotificationsContent(notifications: List<NotificationDto>) {
    if (notifications.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "You're all caught up.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
    ) {
        items(notifications) { notification ->
            SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                NotificationDetailRow(notification)
            }
        }
    }
}

@Composable
private fun NotificationDetailRow(notification: NotificationDto) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        if (!notification.isRead) {
            Box(
                modifier = Modifier
                    .padding(top = SmartDoorSpacing.xxs)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(SmartDoorSecondaryDark),
            )
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(SmartDoorSpacing.sm))
        } else {
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(16.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = notification.title, style = MaterialTheme.typography.bodyMedium)
            if (!notification.body.isNullOrBlank()) {
                Text(
                    text = notification.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = formatRelativeTime(notification.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
