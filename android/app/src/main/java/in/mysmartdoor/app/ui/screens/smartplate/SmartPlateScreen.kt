package `in`.mysmartdoor.app.ui.screens.smartplate

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.QrCodeGenerator
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SecurityRulesDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
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
import `in`.mysmartdoor.app.ui.theme.SmartDoorAi
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch

/**
 * Smart Plate — Owner Dashboard V1 Quick Action.
 *
 * Phase 12E.8 — PREMIUM SMART PLATE ECOSYSTEM: redesigned as the flagship
 * product-experience screen (hero plate preview, activation/AI/hardware
 * status, elegant info cards) while keeping the exact same data source as
 * before — [DashboardData.plate]/[DashboardData.subscription]/
 * [DashboardData.securityRules] (`plates`/`subscriptions`/`security_rules`
 * tables) via the same [DashboardViewModel] instance pattern
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen]
 * established. No new repository, no new query, no new ViewModel.
 *
 * "Hardware status" below is derived from [PlateDto.status] — there is no
 * separate firmware/battery/connectivity field in the schema, so this
 * screen intentionally does not invent one (see this phase's compliance
 * report). "AI status" comes from [SecurityRulesDto.autoReplyEnabled], the
 * same AI Receptionist toggle [in.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistScreen]
 * reads/writes.
 *
 * The public visitor link is opened/copied via [PublicWebLinks.visitorPage],
 * the same `/p/:slug` URL the physical nameplate's printed QR code already
 * encodes — see [QrPreviewScreen] for the dedicated large-format view of
 * that same link, now rendered as a real scannable QR via [QrCodeGenerator]
 * on both screens.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmartPlateScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

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
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> SmartPlateContent(
                    data = data,
                    onOpenQrPreview = { navController.navigate(Routes.QR_PREVIEW) },
                    onCopyPlateId = { plateId ->
                        clipboardManager.setText(AnnotatedString(plateId))
                        scope.launch { snackbarHostState.showSnackbar("Plate ID copied.") }
                    },
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
private fun SmartPlateContent(
    data: DashboardData,
    onOpenQrPreview: () -> Unit,
    onCopyPlateId: (String) -> Unit,
) {
    val plate = data.plate
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg),
    ) {
        StaggeredEntrance(visible = visible, index = 0) {
            HeroPlateCard(
                ownerName = data.owner.fullName,
                plate = plate,
                onTapQr = if (plate != null) onOpenQrPreview else null,
            )
        }

        if (plate != null) {
            StaggeredEntrance(visible = visible, index = 1) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
                ) {
                    ActivationStatusTile(plate = plate, modifier = Modifier.weight(1f))
                    AiStatusTile(securityRules = data.securityRules, modifier = Modifier.weight(1f))
                }
            }

            StaggeredEntrance(visible = visible, index = 2) {
                Column {
                    SDSectionHeader(title = "Device Details", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
                    SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                DetailLine(label = "Plate ID", value = plate.plateId, modifier = Modifier.weight(1f))
                                IconButton(onClick = { onCopyPlateId(plate.plateId) }, modifier = Modifier.size(32.dp)) {
                                    Icon(
                                        painter = painterResource(id = R.drawable.ic_copy),
                                        contentDescription = "Copy Plate ID",
                                        modifier = Modifier.size(16.dp),
                                        tint = SmartDoorSecondaryDark,
                                    )
                                }
                            }
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
                            DetailLine(label = "Last Sync", value = formatTimestamp(plate.updatedAt))
                        }
                    }
                }
            }

            StaggeredEntrance(visible = visible, index = 3) {
                Column {
                    SDSectionHeader(title = "Public Visitor Link", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
                    SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                            Text(
                                text = PublicWebLinks.visitorPage(plate.qrSlug),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            SmartDoorButton(
                                label = "View Full QR Code",
                                onClick = onOpenQrPreview,
                                variant = SmartDoorButtonVariant.Primary,
                                leadingIconRes = R.drawable.ic_qr,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        } else {
            StaggeredEntrance(visible = visible, index = 1) {
                SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                    Text(
                        text = "No Smart Plate registered to this account yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        StaggeredEntrance(visible = visible, index = 4) {
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
}

/**
 * Premium hero preview — the physical nameplate rendered as a card:
 * owner name, plate ID, activation badge, and a tappable mini QR (real
 * bitmap via [QrCodeGenerator], the same link the full [QrPreviewScreen]
 * shows large) on a black+gold gradient [GlassCard].
 */
@Composable
private fun HeroPlateCard(ownerName: String, plate: PlateDto?, onTapQr: (() -> Unit)?) {
    GlassCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(SmartDoorSpacing.lg),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(SmartDoorSecondaryDark.copy(alpha = 0.10f), Color.Transparent),
                    ),
                    shape = RoundedCornerShape(24.dp),
                ),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "MY SMART DOOR",
                        style = MaterialTheme.typography.labelMedium,
                        color = SmartDoorSecondaryDark,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
                    Text(
                        text = ownerName,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                    Text(
                        text = plate?.plateId ?: "No plate registered",
                        style = MaterialTheme.typography.titleMedium,
                        color = SmartDoorSecondaryDark,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (plate != null) {
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
                        SDBadge(
                            text = plate.status.replaceFirstChar { it.uppercase() },
                            status = if (plate.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                        )
                    }
                }

                if (plate != null) {
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.md))
                    val link = PublicWebLinks.visitorPage(plate.qrSlug)
                    val qrBitmap = remember(link) { QrCodeGenerator.generate(link, sizePx = 240) }
                    val qrInteractionSource = remember { MutableInteractionSource() }
                    Box(
                        modifier = Modifier
                            .size(88.dp)
                            .background(Color.White, RoundedCornerShape(12.dp))
                            .then(
                                if (onTapQr != null) {
                                    Modifier.clickable(
                                        interactionSource = qrInteractionSource,
                                        indication = null,
                                        onClick = onTapQr,
                                    )
                                } else Modifier,
                            )
                            .padding(SmartDoorSpacing.xs),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (qrBitmap != null) {
                            Image(
                                bitmap = qrBitmap,
                                contentDescription = "Smart Plate QR code",
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_qr),
                                contentDescription = null,
                                tint = Color.Black,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ActivationStatusTile(plate: PlateDto, modifier: Modifier = Modifier) {
    val isActive = plate.status == "active"
    SDCard(modifier = modifier, shape = RoundedCornerShape(16.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isActive) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_check_circle),
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = SmartDoorSuccess,
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(color = MaterialTheme.colorScheme.onSurfaceVariant, shape = CircleShape),
                    )
                }
                Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
                Text(
                    text = "Activation",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
            Text(
                text = if (isActive) "Active" else plate.status.replaceFirstChar { it.uppercase() },
                style = MaterialTheme.typography.titleMedium,
                color = if (isActive) SmartDoorSuccess else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun AiStatusTile(securityRules: SecurityRulesDto?, modifier: Modifier = Modifier) {
    val aiOnline = securityRules?.autoReplyEnabled ?: false
    SDCard(modifier = modifier, shape = RoundedCornerShape(16.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = if (aiOnline) SmartDoorAi else MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = CircleShape,
                        ),
                )
                Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
                Text(
                    text = "AI Receptionist",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
            Text(
                text = if (aiOnline) "Online" else "Offline",
                style = MaterialTheme.typography.titleMedium,
                color = if (aiOnline) SmartDoorAi else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * Staggered fade + rise-in entrance shared by [SmartPlateScreen] and
 * [QrPreviewScreen] — each section index adds a small extra delay so
 * cards arrive in sequence instead of all at once, without a heavier
 * animation dependency.
 */
@Composable
internal fun StaggeredEntrance(visible: Boolean, index: Int, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(animationSpec = tween(durationMillis = 350, delayMillis = index * 60)) +
            slideInVertically(
                animationSpec = tween(durationMillis = 350, delayMillis = index * 60),
                initialOffsetY = { it / 6 },
            ),
    ) {
        content()
    }
}

/** Formats an ISO-8601 timestamp (`plates.updated_at`) for display; falls back to the raw value if unparsable. */
internal fun formatTimestamp(raw: String?): String {
    if (raw.isNullOrBlank()) return "—"
    return try {
        val instant = java.time.Instant.parse(raw)
        val formatter = java.time.format.DateTimeFormatter
            .ofPattern("d MMM yyyy, h:mm a")
            .withZone(java.time.ZoneId.systemDefault())
        formatter.format(instant)
    } catch (e: Exception) {
        raw
    }
}
