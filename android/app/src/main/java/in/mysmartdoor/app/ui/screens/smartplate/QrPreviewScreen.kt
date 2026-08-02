package `in`.mysmartdoor.app.ui.screens.smartplate

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.QrCodeGenerator
import `in`.mysmartdoor.app.core.common.QrImageUtil
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardViewModel
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import android.Manifest
import android.os.Build
import android.content.pm.PackageManager
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Image
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch

/**
 * QR Preview — Owner Dashboard V1 Quick Action.
 *
 * Phase 12E.8 — PREMIUM SMART PLATE ECOSYSTEM: full-screen premium QR
 * experience with a real scannable [QrCodeGenerator] bitmap (zxing-core,
 * already a Gradle dependency — see that file's doc), Share/Download/Copy
 * actions via [QrImageUtil], and an entrance animation. Still reuses the
 * same [DashboardViewModel] instance pattern
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen]
 * established to read [in.mysmartdoor.app.core.data.model.DashboardData.plate]
 * (`plates.qr_slug`, encoded as [PublicWebLinks.visitorPage] — the same
 * value the physical nameplate's printed QR already encodes, per
 * `vercel.json`'s `/p/:slug` rewrite) — no new repository, no new query,
 * no new ViewModel.
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
    val context = LocalContext.current

    // Pre-Q (API 26-28) needs WRITE_EXTERNAL_STORAGE granted before a
    // MediaStore insert succeeds; API 29+ needs no permission for this.
    // See QrImageUtil.saveToGallery's doc.
    var pendingSaveFileLabel by remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
    val storagePermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val label = pendingSaveFileLabel
        pendingSaveFileLabel = null
        if (granted && label != null) {
            val bitmap = QrCodeGenerator.generate(PublicWebLinks.visitorPage(uiState.data?.plate?.qrSlug.orEmpty()), sizePx = 1024)
            val saved = bitmap != null && QrImageUtil.saveToGallery(context, bitmap, label)
            scope.launch {
                snackbarHostState.showSnackbar(if (saved) "QR saved to gallery." else "Couldn't save QR — storage permission needed.")
            }
        } else {
            scope.launch { snackbarHostState.showSnackbar("Storage permission needed to save the QR.") }
        }
    }

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
                    plateId = plate.plateId,
                    isActive = plate.status == "active",
                    onCopyLink = {
                        clipboardManager.setText(AnnotatedString(PublicWebLinks.visitorPage(plate.qrSlug)))
                        scope.launch { snackbarHostState.showSnackbar("Link copied.") }
                    },
                    onCopyPlateId = {
                        clipboardManager.setText(AnnotatedString(plate.plateId))
                        scope.launch { snackbarHostState.showSnackbar("Plate ID copied.") }
                    },
                    onOpen = { launchWebLink(PublicWebLinks.visitorPage(plate.qrSlug)) },
                    onShare = { bitmap ->
                        val ok = QrImageUtil.share(
                            context = context,
                            imageBitmap = bitmap,
                            fileLabel = "smartdoor_${plate.plateId}",
                            linkText = PublicWebLinks.visitorPage(plate.qrSlug),
                        )
                        if (!ok) scope.launch { snackbarHostState.showSnackbar("Couldn't open the share sheet.") }
                    },
                    onDownload = {
                        val fileLabel = "smartdoor_${plate.plateId}"
                        val needsRuntimePermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
                        if (needsRuntimePermission) {
                            pendingSaveFileLabel = fileLabel
                            storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        } else {
                            val bitmap = QrCodeGenerator.generate(PublicWebLinks.visitorPage(plate.qrSlug), sizePx = 1024)
                            val saved = bitmap != null && QrImageUtil.saveToGallery(context, bitmap, fileLabel)
                            scope.launch {
                                snackbarHostState.showSnackbar(if (saved) "QR saved to gallery." else "Couldn't save the QR.")
                            }
                        }
                    },
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
private fun QrPreviewContent(
    link: String,
    plateId: String,
    isActive: Boolean,
    onCopyLink: () -> Unit,
    onCopyPlateId: () -> Unit,
    onOpen: () -> Unit,
    onShare: (androidx.compose.ui.graphics.ImageBitmap) -> Unit,
    onDownload: () -> Unit,
) {
    val qrBitmap = remember(link) { QrCodeGenerator.generate(link, sizePx = 720) }
    val scale = remember { Animatable(0.85f) }
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(link) {
        scale.snapTo(0.85f)
        alpha.snapTo(0f)
        launch { scale.animateTo(1f, animationSpec = tween(durationMillis = 420)) }
        launch { alpha.animateTo(1f, animationSpec = tween(durationMillis = 420)) }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        GlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .graphicsLayer {
                    scaleX = scale.value
                    scaleY = scale.value
                    this.alpha = alpha.value
                },
            shape = RoundedCornerShape(28.dp),
            contentPadding = PaddingValues(SmartDoorSpacing.lg),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                SDBadge(
                    text = if (isActive) "Active" else "Inactive",
                    status = if (isActive) SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                )
                Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
                Box(
                    modifier = Modifier
                        .size(220.dp)
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .padding(SmartDoorSpacing.sm),
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
                            modifier = Modifier.size(72.dp),
                            tint = Color.Black,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
                Text(
                    text = plateId,
                    style = MaterialTheme.typography.titleMedium,
                    color = SmartDoorSecondaryDark,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Text(
                    text = link,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Spacer(modifier = Modifier.height(SmartDoorSpacing.lg))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            QrActionButton(
                iconRes = R.drawable.ic_share,
                label = "Share",
                onClick = { qrBitmap?.let(onShare) },
            )
            QrActionButton(
                iconRes = R.drawable.ic_download,
                label = "Download",
                onClick = onDownload,
            )
            QrActionButton(
                iconRes = R.drawable.ic_copy,
                label = "Copy ID",
                onClick = onCopyPlateId,
            )
        }

        Spacer(modifier = Modifier.height(SmartDoorSpacing.lg))

        SmartDoorButton(
            label = "Copy Link",
            onClick = onCopyLink,
            modifier = Modifier.fillMaxWidth(),
            variant = SmartDoorButtonVariant.Secondary,
        )
        Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
        SmartDoorButton(
            label = "Open Visitor Page",
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth(),
            variant = SmartDoorButtonVariant.Primary,
        )
    }
}

@Composable
private fun QrActionButton(iconRes: Int, label: String, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = onClick,
            modifier = Modifier
                .size(52.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp)),
        ) {
            Icon(
                painter = painterResource(id = iconRes),
                contentDescription = label,
                modifier = Modifier.size(22.dp),
                tint = SmartDoorSecondaryDark,
            )
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
