package `in`.mysmartdoor.app.ui.screens.callhistory

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.core.network.dto.CallLogDto
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
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.timeline.formatRelativeTime
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController

/**
 * Call History — Owner Dashboard V1 Quick Action.
 *
 * Was previously wired to [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * "coming soon" snackbar. [DashboardData.recentCalls] (`call_logs`, same
 * table [in.mysmartdoor.app.core.data.DashboardRepository] already reads
 * for the Dashboard preview and Live Activity's "Calls" filter) already
 * carries everything this screen needs, so this reuses the same
 * [DashboardViewModel] instance pattern
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen] established
 * — no new repository, no new query, no new ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallHistoryScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Call History",
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
                data != null -> CallHistoryContent(data.recentCalls)
                uiState.isLoading -> Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
                    SDSkeletonLoaderGroup(lineCount = 8, lineHeight = 56.dp)
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
private fun CallHistoryContent(calls: List<CallLogDto>) {
    if (calls.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "No calls yet.",
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
        items(calls) { call ->
            SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                CallRow(call)
            }
        }
    }
}

@Composable
private fun CallRow(call: CallLogDto) {
    val missed = call.callStatus.contains("missed", ignoreCase = true) ||
        call.callStatus.contains("declined", ignoreCase = true)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                painter = painterResource(id = R.drawable.ic_call),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = if (missed) MaterialTheme.colorScheme.error else SmartDoorSecondaryDark,
            )
            Column(modifier = Modifier.padding(start = SmartDoorSpacing.sm)) {
                Text(
                    text = call.callStatus.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = formatRelativeTime(call.startedAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (call.duration > 0) {
            SDBadge(text = "${call.duration}s", status = SDBadgeStatus.Neutral)
        } else if (missed) {
            SDBadge(text = "Missed", status = SDBadgeStatus.Danger)
        }
    }
}
