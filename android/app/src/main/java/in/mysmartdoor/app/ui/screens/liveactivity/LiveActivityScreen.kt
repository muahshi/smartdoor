package `in`.mysmartdoor.app.ui.screens.liveactivity

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDChip
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel
import `in`.mysmartdoor.app.ui.screens.dashboard.TimelineRow
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.timeline.TimelineKind
import `in`.mysmartdoor.app.ui.timeline.buildTimeline
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController

/**
 * Live Activity — Phase 12A PREMIUM UI REBUILD.
 *
 * Per the CTO's Phase 12A brief: "the device screenshot is the source of
 * truth" for this screen's visual design, and it must reuse existing
 * backend/repositories/ViewModels/APIs. This screen therefore takes its own
 * [DashboardViewModel] instance (same class Dashboard uses — Hilt resolves
 * a fresh instance per NavHost back-stack entry, so this is not shared
 * *state* with Dashboard, but it is the exact same data source: no new
 * repository, no new query) and reuses
 * [in.mysmartdoor.app.ui.timeline.buildTimeline] — the identical merge
 * logic Dashboard's own Live Activity preview calls — over a much higher
 * item cap so the full feed the reference shows can actually scroll.
 *
 * Filter chips (All / Visitors / Calls / AI / Alerts) map onto
 * [in.mysmartdoor.app.ui.timeline.TimelineKind] plus the [TimelineEntry.isAlert]
 * flag added to that shared model this phase — both derived client-side
 * from fields [DashboardRepository] already fetches, not a new query per
 * filter.
 *
 * Row rendering reuses [TimelineRow] from [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]
 * directly rather than a second copy of the same layout, and the bottom
 * nav reuses [dashboardBottomNavItems] from the same file — per CTO
 * direction, no second navigation component.
 */
private enum class LiveActivityFilter(val label: String) {
    All("All"),
    Visitors("Visitors"),
    Calls("Calls"),
    Ai("AI"),
    Alerts("Alerts"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveActivityScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var filter by remember { mutableStateOf(LiveActivityFilter.All) }

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Live Activity",
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
                            androidx.compose.material3.Icon(
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
                // This screen is a Dashboard sub-view (reached from its
                // live-scan pill / "See all"), so Home stays highlighted —
                // matches the reference screenshot's Live Activity bottom nav.
                selectedRoute = Routes.DASHBOARD,
                onItemSelected = { item ->
                    navController.navigate(item.route) { launchSingleTop = true }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> LiveActivityContent(data = data, filter = filter, onFilterChange = { filter = it })
                uiState.isLoading -> LiveActivitySkeleton()
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = { viewModel.load() },
                )
            }
        }
    }
}

@Composable
private fun LiveActivityContent(
    data: DashboardData,
    filter: LiveActivityFilter,
    onFilterChange: (LiveActivityFilter) -> Unit,
) {
    val allEntries = remember(data) { buildTimeline(data, limit = 200) }
    val entries = remember(allEntries, filter) {
        when (filter) {
            LiveActivityFilter.All -> allEntries
            LiveActivityFilter.Visitors -> allEntries.filter { it.kind == TimelineKind.Visitor }
            LiveActivityFilter.Calls -> allEntries.filter { it.kind == TimelineKind.Call }
            LiveActivityFilter.Ai -> allEntries.filter { it.kind == TimelineKind.AiEvent }
            LiveActivityFilter.Alerts -> allEntries.filter { it.isAlert }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
        ) {
            LiveActivityFilter.entries.forEach { option ->
                SDChip(
                    label = option.label,
                    selected = option == filter,
                    onClick = { onFilterChange(option) },
                )
            }
        }

        if (entries.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text(
                    text = "No activity in this filter yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.xs),
                verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
            ) {
                items(entries) { entry ->
                    SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                        TimelineRow(entry)
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveActivitySkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        SDSkeletonLoaderGroup(lineCount = 8, lineHeight = 56.dp)
    }
}
