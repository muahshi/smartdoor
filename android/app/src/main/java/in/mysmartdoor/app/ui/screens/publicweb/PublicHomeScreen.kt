package `in`.mysmartdoor.app.ui.screens.publicweb

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
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.theme.SmartDoorBackgroundDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

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

                    GlassCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .widthIn(max = 480.dp),
                        contentPadding = PaddingValues(SmartDoorSpacing.lg),
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
                        ) {
                            Text(
                                text = stringResource(R.string.public_home_section_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )

                            SmartDoorButton(
                                label = stringResource(R.string.public_home_buy_button),
                                onClick = { openWebLink(PublicWebLinks.PRODUCTS) },
                                modifier = Modifier.fillMaxWidth(),
                                variant = SmartDoorButtonVariant.Primary,
                                leadingIconRes = R.drawable.ic_cart,
                            )

                            SmartDoorButton(
                                label = stringResource(R.string.public_home_features_button),
                                onClick = { openWebLink(PublicWebLinks.FEATURES) },
                                modifier = Modifier.fillMaxWidth(),
                                variant = SmartDoorButtonVariant.Secondary,
                                leadingIconRes = R.drawable.ic_bot,
                            )

                            SmartDoorButton(
                                label = stringResource(R.string.public_home_pricing_button),
                                onClick = { openWebLink(PublicWebLinks.PRICING) },
                                modifier = Modifier.fillMaxWidth(),
                                variant = SmartDoorButtonVariant.Secondary,
                                leadingIconRes = R.drawable.ic_receipt,
                            )

                            SmartDoorButton(
                                label = stringResource(R.string.public_home_faq_button),
                                onClick = { openWebLink(PublicWebLinks.FAQ) },
                                modifier = Modifier.fillMaxWidth(),
                                variant = SmartDoorButtonVariant.Ghost,
                                leadingIconRes = R.drawable.ic_help,
                            )

                            SmartDoorButton(
                                label = stringResource(R.string.public_home_visit_website_button),
                                onClick = { openWebLink(PublicWebLinks.HOME) },
                                modifier = Modifier.fillMaxWidth(),
                                variant = SmartDoorButtonVariant.Ghost,
                                leadingIconRes = R.drawable.ic_web,
                            )
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
