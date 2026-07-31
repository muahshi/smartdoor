package `in`.mysmartdoor.app.ui.screens.smartplate

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch

/**
 * QR Preview — Owner Dashboard V1 Quick Action.
 *
 * Was previously wired to [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]'s
 * "coming soon" snackbar. Reuses the same [DashboardViewModel] instance
 * pattern [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen]
 * established to read [in.mysmartdoor.app.core.data.model.DashboardData.plate]
 * (`plates.qr_slug`, the same value the physical nameplate's printed QR
 * code already encodes as `PublicWebLinks.visitorPage`, per `vercel.json`'s
 * `/p/:slug` rewrite) — no new repository, no new query, no new ViewModel.
 *
 * Renders the visitor link as text with Copy/Open actions rather than a
 * scanned barcode image: no QR-bitmap rendering library exists anywhere in
 * this Gradle project today, and adding one is a dependency decision, not
 * a "wire the existing screen up" change — flagged in this phase's report
 * as remaining work rather than added silently.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrPreviewScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val clipboardManager = LocalClipboardManager.current
    val launchWebLink = rememberWebLinkLauncher()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            SDTopBar(
                title = "QR Preview",
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
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val plate = uiState.data?.plate
            when {
                plate != null -> QrPreviewContent(
                    link = PublicWebLinks.visitorPage(plate.qrSlug),
                    onCopy = {
                        clipboardManager.setText(AnnotatedString(PublicWebLinks.visitorPage(plate.qrSlug)))
                        scope.launch { snackbarHostState.showSnackbar("Link copied.") }
                    },
                    onOpen = { launchWebLink(PublicWebLinks.visitorPage(plate.qrSlug)) },
                )
                uiState.isLoading -> Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
                    SDSkeletonLoaderGroup(lineCount = 4, lineHeight = 56.dp)
                }
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = { viewModel.load() },
                )
                else -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "No Smart Plate registered to this account yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun QrPreviewContent(link: String, onCopy: () -> Unit, onOpen: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        SDCard(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_qr),
                    contentDescription = null,
                    modifier = Modifier.size(96.dp),
                    tint = SmartDoorSecondaryDark,
                )
                androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(SmartDoorSpacing.md))
                Text(
                    text = "Visitor Link",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(SmartDoorSpacing.xxs))
                Text(
                    text = link,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
        }
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(SmartDoorSpacing.lg))
        SmartDoorButton(
            label = "Copy Link",
            onClick = onCopy,
            modifier = Modifier.fillMaxWidth(),
            variant = SmartDoorButtonVariant.Secondary,
        )
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(SmartDoorSpacing.sm))
        SmartDoorButton(
            label = "Open Visitor Page",
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth(),
            variant = SmartDoorButtonVariant.Primary,
        )
    }
}
