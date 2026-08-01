package `in`.mysmartdoor.app.ui.screens.splash

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.QrCodeGenerator
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.core.session.SmartPlateSnapshot
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnBackgroundDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

/**
 * App entry screen. In A1.3 this was purely presentational with nowhere to
 * navigate to. Phase A1.4 added the one piece of navigation this brief
 * mandates — Splash to Login — as a plain timed transition, still with no
 * auth/session check involved (that decision, Routes.LOGIN vs
 * Routes.DASHBOARD, is a later phase; for now Login is unconditionally the
 * next screen).
 *
 * [navController] is nullable so the Preview below can keep rendering the
 * screen with no navigation graph attached.
 *
 * Phase 8 architecture decision: Splash's only job is to decide Dashboard
 * vs. Login *before* the very first navigation — Public Home is never
 * reached from here (only from Login's "New to My Smart Door?" section).
 * [SplashViewModel.hasSession] reads the existing encrypted session store
 * ([in.mysmartdoor.app.core.session.SecureSessionManager]); this waits for
 * its first non-null value alongside the display-duration delay (whichever
 * finishes last) so a slow DataStore read can't cut the splash short.
 *
 * Phase 12E.2 — PREMIUM APP IDENTITY, Tasks 3–5. Navigation logic itself
 * (this [LaunchedEffect]) is untouched — still the same "wait for
 * hasSession, wait for the display duration, whichever finishes last,
 * navigate" contract, still Dashboard vs. Login only. What changes is
 * purely the visual content ([SplashContent] below): a premium animated
 * presentation (logo fade/scale + soft gold glow + loading indicator) that
 * additionally renders [SplashViewModel.plateSnapshot] as a dynamic Smart
 * Plate card when one is available (logged in, live or cached), and the
 * generic branding otherwise (logged out) — see [SplashViewModel]'s doc
 * for exactly how that snapshot is sourced.
 */
@Composable
fun SplashScreen(
    navController: NavHostController? = null,
    viewModel: SplashViewModel = hiltViewModel(),
) {
    val plateSnapshot by viewModel.plateSnapshot.collectAsState()

    LaunchedEffect(navController) {
        if (navController != null) {
            val hasSessionDeferred = async { viewModel.hasSession.filterNotNull().first() }
            delay(SPLASH_DISPLAY_DURATION_MS)
            val destination = if (hasSessionDeferred.await()) Routes.DASHBOARD else Routes.LOGIN
            navController.navigate(destination) {
                popUpTo(Routes.SPLASH) { inclusive = true }
            }
        }
    }

    SplashContent(plateSnapshot = plateSnapshot)
}

/**
 * Stateless visual content — kept separate so [SplashScreenPreview] can
 * render it without a Hilt graph, same pattern as
 * [in.mysmartdoor.app.ui.screens.login.LoginScreen]/`LoginContent`.
 *
 * [plateSnapshot] null renders the generic Premium Splash (logged out, or
 * still resolving); non-null renders the personalized Smart Plate — Task 4.
 */
@Composable
private fun SplashContent(plateSnapshot: SmartPlateSnapshot?) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(SmartDoorSpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AnimatedLogo()

            Box(modifier = Modifier.size(SmartDoorSpacing.lg))

            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = SmartDoorOnBackgroundDark,
            )
            Box(modifier = Modifier.size(SmartDoorSpacing.xxs))
            Text(
                text = stringResource(R.string.login_brand_tagline),
                style = MaterialTheme.typography.bodyMedium,
                color = SmartDoorOnSurfaceVariantDark,
            )

            AnimatedVisibility(visible = plateSnapshot != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(modifier = Modifier.size(SmartDoorSpacing.lg))
                    plateSnapshot?.let { SmartPlateCard(it) }
                }
            }

            Box(modifier = Modifier.size(SmartDoorSpacing.xl))

            LoadingIndicator()
        }
    }
}

/**
 * Logo fade-in + slight scale + a soft pulsing gold glow behind it — Task
 * 3's required animation set, ~650–700ms in, no flashing/looping beyond
 * the gentle glow pulse. Uses the new brand foreground asset
 * ([R.mipmap.ic_launcher_foreground], Task 1) rather than any placeholder.
 */
@Composable
private fun AnimatedLogo() {
    val alpha = remember { Animatable(0f) }
    val scale = remember { Animatable(0.85f) }

    LaunchedEffect(Unit) {
        alpha.animateTo(1f, animationSpec = tween(durationMillis = 650, easing = SmartDoorMotion.standard))
    }
    LaunchedEffect(Unit) {
        scale.animateTo(1f, animationSpec = tween(durationMillis = 700, easing = SmartDoorMotion.emphasized))
    }

    val glowTransition = rememberInfiniteTransition(label = "splash_glow")
    val glowAlpha by glowTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.65f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = SmartDoorMotion.standard),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "splash_glow_alpha",
    )

    Box(contentAlignment = Alignment.Center) {
        // Soft gold glow — a blurred radial gradient sitting behind the
        // logo. Modifier.blur silently no-ops below API 31; the radial
        // gradient itself still reads as a soft glow either way.
        Box(
            modifier = Modifier
                .size(160.dp)
                .blur(40.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            SmartDoorSecondaryDark.copy(alpha = glowAlpha),
                            Color.Transparent,
                        ),
                    ),
                    shape = CircleShape,
                ),
        )

        Image(
            painter = painterResource(id = R.mipmap.ic_launcher_foreground),
            contentDescription = stringResource(R.string.app_name),
            modifier = Modifier
                .size(96.dp)
                .scale(scale.value)
                .alpha(alpha.value),
            contentScale = ContentScale.Fit,
        )
    }
}

/** Subtle gold indeterminate progress bar + "Loading…" label. */
@Composable
private fun LoadingIndicator() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        LinearProgressIndicator(
            modifier = Modifier.fillMaxWidth(0.4f),
            color = SmartDoorSecondaryDark,
            trackColor = SmartDoorSecondaryDark.copy(alpha = 0.15f),
        )
        Box(modifier = Modifier.size(SmartDoorSpacing.sm))
        Text(
            text = stringResource(R.string.splash_loading),
            style = MaterialTheme.typography.labelMedium,
            color = SmartDoorOnSurfaceVariantDark,
        )
    }
}

/**
 * Dynamic Smart Plate — Task 4. Owner name, plate/product label, Plate ID,
 * a real scannable QR ([QrCodeGenerator], encoding the same visitor link
 * the physical nameplate prints), subscription, and AI status. Every value
 * comes from [snapshot] (sourced from live or cached
 * [in.mysmartdoor.app.core.data.DashboardRepository] data) — nothing here
 * is hardcoded.
 */
@Composable
private fun SmartPlateCard(snapshot: SmartPlateSnapshot) {
    GlassCard(
        modifier = Modifier.fillMaxWidth(0.82f),
        shape = RoundedCornerShape(24.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = snapshot.ownerName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = SmartDoorOnBackgroundDark,
                textAlign = TextAlign.Center,
            )
            Box(modifier = Modifier.size(SmartDoorSpacing.xxs))
            Text(
                text = snapshot.plateId + (snapshot.productType?.let { " · $it" } ?: ""),
                style = MaterialTheme.typography.bodyMedium,
                color = SmartDoorOnSurfaceVariantDark,
                textAlign = TextAlign.Center,
            )

            val qrContent = snapshot.qrSlug?.let { PublicWebLinks.visitorPage(it) }
            if (qrContent != null) {
                Box(modifier = Modifier.size(SmartDoorSpacing.md))
                val qrBitmap = remember(qrContent) { QrCodeGenerator.generate(qrContent, sizePx = 480) }
                if (qrBitmap != null) {
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .background(Color.White, RoundedCornerShape(12.dp))
                            .padding(SmartDoorSpacing.xs),
                    ) {
                        Image(
                            painter = BitmapPainter(qrBitmap),
                            contentDescription = stringResource(R.string.splash_scan_to_connect),
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    Box(modifier = Modifier.size(SmartDoorSpacing.xxs))
                    Text(
                        text = stringResource(R.string.splash_scan_to_connect),
                        style = MaterialTheme.typography.labelSmall,
                        color = SmartDoorOnSurfaceVariantDark,
                    )
                }
            }

            Box(modifier = Modifier.size(SmartDoorSpacing.md))

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                snapshot.subscriptionPlan?.let { plan ->
                    Text(
                        text = stringResource(R.string.splash_subscription_label, plan),
                        style = MaterialTheme.typography.labelMedium,
                        color = SmartDoorSecondaryDark,
                    )
                }
                Text(
                    text = if (snapshot.aiEnabled) {
                        stringResource(R.string.splash_ai_active)
                    } else {
                        stringResource(R.string.splash_ai_inactive)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = SmartDoorOnSurfaceVariantDark,
                )
            }
        }
    }
}

/** How long Splash stays visible before handing off to Dashboard/Login. */
private const val SPLASH_DISPLAY_DURATION_MS = 1800L

@Preview(showBackground = true)
@Composable
private fun SplashScreenPreview() {
    SmartDoorTheme(darkTheme = true) {
        SplashContent(plateSnapshot = null)
    }
}

@Preview(showBackground = true)
@Composable
private fun SplashScreenWithPlatePreview() {
    SmartDoorTheme(darkTheme = true) {
        SplashContent(
            plateSnapshot = SmartPlateSnapshot(
                ownerName = "Preview Owner",
                plateId = "SD-PREVIEW",
                productType = "Smart Home",
                qrSlug = "preview-slug",
                subscriptionPlan = "Premium",
                subscriptionStatus = "active",
                aiEnabled = true,
            ),
        )
    }
}
