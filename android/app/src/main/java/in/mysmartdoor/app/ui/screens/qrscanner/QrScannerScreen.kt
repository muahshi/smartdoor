package `in`.mysmartdoor.app.ui.screens.qrscanner

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius as GeometryCornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.compose.runtime.collectAsState
import java.util.concurrent.Executors

/**
 * Phase 12E.10 — NATIVE QR SCANNER.
 *
 * Live-camera QR scanner reached via [in.mysmartdoor.app.navigation.Routes.QR_SCANNER].
 * Not wired to a Dashboard/QrPreview trigger this phase (see Routes.kt) —
 * standalone and independently navigable in the meantime.
 *
 * On a valid scan (a code matching [in.mysmartdoor.app.core.config.PublicWebLinks.visitorPage]'s
 * URL shape) this opens the exact same production visitor web page every
 * other QR touchpoint in the app already opens, via
 * [rememberWebLinkLauncher] — no new visitor-detail screen, no backend
 * call. An unrecognized code shows the Invalid state with a "Scan Again"
 * action instead.
 */
@Composable
fun QrScannerScreen(
    navController: NavHostController,
    viewModel: QrScannerViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val launchWebLink = rememberWebLinkLauncher()
    val scanResult by viewModel.scanResult.collectAsState()

    val hasCameraHardware = remember {
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCameraPermission = granted
    }

    // Haptic tick the moment a code is found (transition into Loading),
    // independent of whether it later turns out valid or invalid.
    LaunchedEffect(scanResult) {
        if (scanResult is QrScanResult.Loading) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }

    // One-shot: open the existing visitor web flow, then leave the scanner.
    LaunchedEffect(Unit) {
        viewModel.openVisitorLink.collect { url ->
            launchWebLink(url)
            navController.popBackStack()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            !hasCameraHardware -> QrScannerUnavailableState(onBack = { navController.popBackStack() })
            !hasCameraPermission -> QrScannerPermissionState(
                onBack = { navController.popBackStack() },
                onRequestPermission = { permissionLauncher.launch(Manifest.permission.CAMERA) },
            )
            else -> QrScannerCameraContent(
                scanResult = scanResult,
                onQrDetected = viewModel::onQrDetected,
                onScanAgain = viewModel::reset,
                onBack = { navController.popBackStack() },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QrScannerUnavailableState(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            SDTopBar(title = "Scan QR Code", onBackClick = onBack, backIconRes = R.drawable.ic_back)
        },
    ) { padding ->
        EmptyStateScreen(
            modifier = Modifier.padding(padding),
            title = "Camera unavailable",
            subtitle = "This device doesn't have a usable camera, so QR scanning isn't available here.",
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QrScannerPermissionState(onBack: () -> Unit, onRequestPermission: () -> Unit) {
    Scaffold(
        topBar = {
            SDTopBar(title = "Scan QR Code", onBackClick = onBack, backIconRes = R.drawable.ic_back)
        },
    ) { padding ->
        EmptyStateScreen(
            modifier = Modifier.padding(padding),
            title = "Camera permission needed",
            subtitle = "Allow camera access to scan a My Smart Door QR code.",
            actionLabel = "Grant Camera Permission",
            onAction = onRequestPermission,
        )
    }
}

/**
 * The live camera + overlay + result-panel content, shown once hardware
 * and permission checks in [QrScannerScreen] both pass.
 */
@Composable
private fun QrScannerCameraContent(
    scanResult: QrScanResult,
    onQrDetected: (String) -> Unit,
    onScanAgain: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    // Stable across recompositions so the same analyzer instance keeps
    // getting paused/resumed rather than being rebuilt on every frame.
    val onQrDetectedState = rememberUpdatedState(onQrDetected)
    val analyzer = remember { QrCodeAnalyzer(onQrDetected = { onQrDetectedState.value(it) }) }

    var camera by remember { mutableStateOf<Camera?>(null) }
    var hasFlashUnit by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }

    // Pause frame decoding whenever a result is already being shown, so
    // the same code isn't re-detected on every subsequent frame; resumes
    // automatically once the ViewModel resets back to Scanning.
    LaunchedEffect(scanResult) {
        analyzer.setPaused(scanResult !is QrScanResult.Scanning)
        if (scanResult is QrScanResult.Scanning) {
            torchOn = false
        }
    }

    DisposableEffect(lifecycleOwner) {
        val cameraExecutor = Executors.newSingleThreadExecutor()
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener(
            {
                try {
                    val cameraProvider = cameraProviderFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val imageAnalysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { it.setAnalyzer(cameraExecutor, analyzer) }

                    cameraProvider.unbindAll()
                    val boundCamera = cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        imageAnalysis,
                    )
                    camera = boundCamera
                    hasFlashUnit = boundCamera.cameraInfo.hasFlashUnit()
                } catch (e: Exception) {
                    Logger.e(message = "QR scanner: failed to bind camera", throwable = e)
                }
            },
            ContextCompat.getMainExecutor(context),
        )

        onDispose {
            try {
                camera?.cameraControl?.enableTorch(false)
                cameraProviderFuture.get().unbindAll()
            } catch (e: Exception) {
                Logger.w(message = "QR scanner: camera teardown failed", throwable = e)
            }
            cameraExecutor.shutdown()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())

        ScannerFrameOverlay(scanResult = scanResult)

        // Transparent top bar: back + flash toggle.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(SmartDoorSpacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            ScannerCircleIconButton(
                iconRes = R.drawable.ic_back,
                contentDescription = "Back",
                onClick = onBack,
            )
            if (hasFlashUnit) {
                ScannerCircleIconButton(
                    iconRes = if (torchOn) R.drawable.ic_flash_off else R.drawable.ic_flash,
                    contentDescription = if (torchOn) "Turn flash off" else "Turn flash on",
                    onClick = {
                        val newState = !torchOn
                        camera?.cameraControl?.enableTorch(newState)
                        torchOn = newState
                    },
                )
            } else {
                Spacer(modifier = Modifier.size(44.dp))
            }
        }

        ScannerResultPanel(
            scanResult = scanResult,
            onScanAgain = onScanAgain,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(SmartDoorSpacing.lg),
        )
    }
}

/** Small translucent circular icon button used in the camera screen's overlay bar. */
@Composable
private fun ScannerCircleIconButton(iconRes: Int, contentDescription: String, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(44.dp)
            .background(Color.Black.copy(alpha = 0.45f), CircleShape),
    ) {
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = contentDescription,
            tint = Color.White,
        )
    }
}

/**
 * Draws the dark scrim, gold corner-bracket viewfinder, and the animated
 * scan line — all via Compose Canvas (no drawable/image asset), same
 * convention already established for this app's dynamic graphics (see
 * [in.mysmartdoor.app.core.common.QrCodeGenerator]). Bracket/line color
 * reflects the current [scanResult] (gold while scanning, red on Invalid,
 * green on Success) so the viewfinder itself communicates state.
 */
@Composable
private fun ScannerFrameOverlay(scanResult: QrScanResult) {
    val frameColor = when (scanResult) {
        is QrScanResult.Invalid -> SmartDoorDanger
        is QrScanResult.Success -> SmartDoorSuccess
        else -> SmartDoorSecondaryDark
    }
    val showScanLine = scanResult is QrScanResult.Scanning

    val infiniteTransition = rememberInfiniteTransition(label = "qr-scan-line")
    val scanLineProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800, easing = SmartDoorMotion.standard),
            repeatMode = RepeatMode.Restart,
        ),
        label = "qr-scan-line-progress",
    )

    Canvas(modifier = Modifier.fillMaxSize()) {
        val frameSize = size.minDimension * 0.68f
        val left = (size.width - frameSize) / 2f
        val top = (size.height - frameSize) / 2f
        val frameRect = Rect(offset = Offset(left, top), size = androidx.compose.ui.geometry.Size(frameSize, frameSize))

        // Dim everything outside the viewfinder frame (even-odd cutout).
        val scrimPath = Path().apply {
            addRect(Rect(Offset.Zero, size))
            addRoundRect(RoundRect(frameRect, GeometryCornerRadius(28.dp.toPx())))
            fillType = PathFillType.EvenOdd
        }
        drawPath(scrimPath, color = Color.Black.copy(alpha = 0.55f))

        // Corner brackets.
        val bracketLength = frameSize * 0.14f
        val strokeWidthPx = 4.dp.toPx()
        val corners = listOf(
            Triple(frameRect.topLeft, 1, 1),
            Triple(Offset(frameRect.right, frameRect.top), -1, 1),
            Triple(Offset(frameRect.left, frameRect.bottom), 1, -1),
            Triple(Offset(frameRect.right, frameRect.bottom), -1, -1),
        )
        corners.forEach { (corner, dirX, dirY) ->
            drawLine(
                color = frameColor,
                start = corner,
                end = Offset(corner.x + bracketLength * dirX, corner.y),
                strokeWidth = strokeWidthPx,
                cap = StrokeCap.Round,
            )
            drawLine(
                color = frameColor,
                start = corner,
                end = Offset(corner.x, corner.y + bracketLength * dirY),
                strokeWidth = strokeWidthPx,
                cap = StrokeCap.Round,
            )
        }

        if (showScanLine) {
            val lineY = frameRect.top + frameRect.height * scanLineProgress
            drawLine(
                color = frameColor.copy(alpha = 0.85f),
                start = Offset(frameRect.left + 8.dp.toPx(), lineY),
                end = Offset(frameRect.right - 8.dp.toPx(), lineY),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round,
            )
        }
    }
}

/** Bottom overlay panel — hint text while scanning, then Loading/Success/Invalid results. */
@Composable
private fun ScannerResultPanel(
    scanResult: QrScanResult,
    onScanAgain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        AnimatedContent(targetState = scanResult, label = "qr-scan-result") { result ->
            when (result) {
                is QrScanResult.Scanning -> Text(
                    text = "Point your camera at a My Smart Door QR code",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                is QrScanResult.Loading -> GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = SmartDoorSecondaryDark,
                        )
                        Text(text = "Checking code\u2026", color = Color.White)
                    }
                }

                is QrScanResult.Success -> GlassCard(modifier = Modifier.fillMaxWidth()) {
                    // Scale-in from 0.4 -> 1 the moment this Success composable
                    // enters composition, giving the checkmark a brief "pop".
                    var animateIn by remember { mutableStateOf(false) }
                    LaunchedEffect(Unit) { animateIn = true }
                    val iconScale by animateFloatAsState(
                        targetValue = if (animateIn) 1f else 0.4f,
                        animationSpec = tween(durationMillis = SmartDoorMotion.durationMedium, easing = SmartDoorMotion.emphasized),
                        label = "qr-success-icon-scale",
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.ic_check_circle),
                            contentDescription = null,
                            tint = SmartDoorSuccess,
                            modifier = Modifier
                                .size(24.dp)
                                .scale(iconScale),
                        )
                        Text(text = "Valid code \u2014 opening visitor page\u2026", color = Color.White)
                    }
                }

                is QrScanResult.Invalid -> GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            painter = painterResource(id = R.drawable.ic_close),
                            contentDescription = null,
                            tint = SmartDoorDanger,
                        )
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                        Text(
                            text = "Not a My Smart Door QR code",
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
                        SmartDoorButton(
                            label = "Scan Again",
                            onClick = onScanAgain,
                            variant = SmartDoorButtonVariant.Primary,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}
