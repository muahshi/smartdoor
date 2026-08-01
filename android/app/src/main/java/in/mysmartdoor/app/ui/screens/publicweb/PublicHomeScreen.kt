package `in`.mysmartdoor.app.ui.screens.publicweb

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SDActionCard
import `in`.mysmartdoor.app.ui.components.SDActionCardEmphasis
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.theme.SmartDoorBackgroundDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import kotlinx.coroutines.delay

/**
 * Phase 8 — PUBLIC ONBOARDING & MARKETING EXPERIENCE.
 *
 * Entry point for prospective customers who don't yet own a Smart Door.
 * Reached only from [in.mysmartdoor.app.ui.screens.login.LoginScreen]'s
 * "New to My Smart Door?" section — this is explicitly NOT the app's
 * start destination; [in.mysmartdoor.app.ui.screens.splash.SplashScreen]
 * still resolves only to Dashboard or Login.
 *
 * Per CTO decision: no product catalog, no commerce, and no marketing
 * content are rebuilt natively here. Every action below opens the
 * existing production website ([PublicWebLinks]) via a plain
 * `ACTION_VIEW` Intent ([rememberWebLinkLauncher]) — same backend, same
 * URLs, same content the website already serves. This screen is only a
 * premium, on-brand launching pad built entirely from existing
 * design-system pieces (GlassCard, SmartDoorButton, SmartDoorTheme) — no
 * new colors, no new components, no new dependency.
 *
 * [navController] is nullable so the Preview below can render with no
 * navigation graph attached.
 */

/** One entry in the Explore action list — drives [SDActionCard] + the web link it opens. */
private data class ExploreAction(
    val titleRes: Int,
    val subtitleRes: Int,
    val iconRes: Int,
    val link: String,
    val emphasis: SDActionCardEmphasis = SDActionCardEmphasis.Standard,
)

@Composable
fun PublicHomeScreen(navController: NavHostController? = null) {
    val openWebLink = rememberWebLinkLauncher()

    SmartDoorTheme(darkTheme = true) {
        SmartDoorScaffold { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(SmartDoorBackgroundDark, SmartDoorSurfaceVariantDark),
                        ),
                    )
                    .padding(innerPadding),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = SmartDoorSpacing.lg, vertical = SmartDoorSpacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.public_home_wordmark),
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center,
                    )

                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))

                    Text(
                        text = stringResource(R.string.public_home_tagline),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SmartDoorSecondaryDark,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    )

                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xl))

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .widthIn(max = 480.dp),
                        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
                    ) {
                        Text(
                            text = stringResource(R.string.public_home_section_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(
                                start = SmartDoorSpacing.xxs,
                                bottom = SmartDoorSpacing.xxs,
                            ),
                        )

                        val actions = remember {
                            listOf(
                                ExploreAction(
                                    R.string.public_home_buy_button,
                                    R.string.public_home_buy_button_subtitle,
                                    R.drawable.ic_cart,
                                    PublicWebLinks.PRODUCTS,
                                    SDActionCardEmphasis.Featured,
                                ),
                                ExploreAction(
                                    R.string.public_home_features_button,
                                    R.string.public_home_features_button_subtitle,
                                    R.drawable.ic_bot,
                                    PublicWebLinks.FEATURES,
                                ),
                                ExploreAction(
                                    R.string.public_home_pricing_button,
                                    R.string.public_home_pricing_button_subtitle,
                                    R.drawable.ic_receipt,
                                    PublicWebLinks.PRICING,
                                ),
                                ExploreAction(
                                    R.string.public_home_faq_button,
                                    R.string.public_home_faq_button_subtitle,
                                    R.drawable.ic_help,
                                    PublicWebLinks.FAQ,
                                ),
                                ExploreAction(
                                    R.string.public_home_visit_website_button,
                                    R.string.public_home_visit_website_button_subtitle,
                                    R.drawable.ic_web,
                                    PublicWebLinks.HOME,
                                ),
                            )
                        }

                        actions.forEachIndexed { index, action ->
                            var visible by remember { mutableStateOf(false) }
                            LaunchedEffect(Unit) {
                                delay(index * 70L)
                                visible = true
                            }
                            AnimatedVisibility(
                                visible = visible,
                                enter = fadeIn(tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.standard)) +
                                    slideInVertically(
                                        animationSpec = tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.standard),
                                        initialOffsetY = { it / 4 },
                                    ),
                            ) {
                                SDActionCard(
                                    title = stringResource(action.titleRes),
                                    subtitle = stringResource(action.subtitleRes),
                                    iconRes = action.iconRes,
                                    onClick = { openWebLink(action.link) },
                                    emphasis = action.emphasis,
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xl))

                    SmartDoorButton(
                        label = stringResource(R.string.public_home_back_to_login_button),
                        onClick = {
                            if (navController?.popBackStack() != true) {
                                navController?.navigate(Routes.LOGIN)
                            }
                        },
                        variant = SmartDoorButtonVariant.Ghost,
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PublicHomeScreenPreview() {
    PublicHomeScreen()
}
