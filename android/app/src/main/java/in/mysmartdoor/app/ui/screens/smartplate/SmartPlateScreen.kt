package `in`.mysmartdoor.app.ui.screens.smartplate

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
 * Smart Plate — Owner Dashboard V1 Quick Action.
 *
 * Was previously wired to [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * "coming soon" snackbar. [DashboardData.plate]/[DashboardData.subscription]
 * (`plates`/`subscriptions` tables, the exact same fields the Dashboard's
 * hero card and Smart Door Status section already render) already cover
 * this screen's device-management summary — reuses the same
 * [DashboardViewModel] instance pattern
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen] established.
 * No new repository, no new query, no new ViewModel.
 *
 * The public visitor link is opened/copied via [PublicWebLinks.visitorPage],
 * the same `/p/:slug` URL the physical nameplate's printed QR code already
 * encodes — see [in.mysmartdoor.app.ui.screens.smartplate.QrPreviewScreen]
 * for the dedicated large-format view of that same link.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmartPlateScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Smart Plate",
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
                data != null -> SmartPlateContent(
                    data = data,
                    onOpenQrPreview = { navController.navigate(Routes.QR_PREVIEW) },
                )
                uiState.isLoading -> Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
                    SDSkeletonLoaderGroup(lineCount = 6, lineHeight = 56.dp)
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
private fun SmartPlateContent(data: DashboardData, onOpenQrPreview: () -> Unit) {
    val plate = data.plate
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg),
    ) {
        if (plate == null) {
            SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                Text(
                    text = "No Smart Plate registered to this account yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Column {
                SDSectionHeader(title = "Device Details", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
                SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        DetailLine(label = "Plate ID", value = plate.plateId)
                        DetailLine(
                            label = "Product Type",
                            value = plate.productType?.replaceFirstChar { it.uppercase() } ?: "—",
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(text = "Status", style = MaterialTheme.typography.bodyMedium)
                            SDBadge(
                                text = plate.status.replaceFirstChar { it.uppercase() },
                                status = if (plate.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                            )
                        }
                        DetailLine(label = "Expiry", value = plate.expiryDate ?: "—")
                    }
                }
            }
        }

        Column {
            SDSectionHeader(title = "Public Visitor Link", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
            SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                if (plate == null) {
                    Text(
                        text = "Register a plate to get its QR link.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        Text(
                            text = PublicWebLinks.visitorPage(plate.qrSlug),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        SmartDoorButton(
                            label = "View QR Code",
                            onClick = onOpenQrPreview,
                            variant = SmartDoorButtonVariant.Primary,
                            leadingIconRes = R.drawable.ic_qr,
                        )
                    }
                }
            }
        }

        Column {
            SDSectionHeader(title = "Subscription", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
            SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                if (data.subscription == null) {
                    Text(
                        text = "No active subscription plan.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs)) {
                        DetailLine(label = "Plan", value = data.subscription.plan.replaceFirstChar { it.uppercase() })
                        DetailLine(label = "Status", value = data.subscription.status.replaceFirstChar { it.uppercase() })
                        DetailLine(label = "Renews / Expires", value = data.subscription.expiryDate)
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
    }
}
