package `in`.mysmartdoor.app.ui.screens.login

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.BuildConfig
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.components.SmartDoorTextField
import `in`.mysmartdoor.app.ui.theme.SmartDoorBackgroundDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import kotlinx.coroutines.launch

/**
 * Client-side-only Plate ID validation — a UX guard against obviously-wrong
 * input, exactly like the equivalent check in login.html
 * (`plateId.length < 8`). The Edge Function's stricter `^SD-[A-Z0-9]{6}$`
 * regex remains the real source of truth server-side; this is not
 * duplicated here so the two never drift out of sync silently.
 */
private fun validatePlateId(plateId: String): String? = when {
    plateId.isEmpty() -> null // no error until the user types something
    plateId.length < 8 -> "Enter a valid Plate ID (e.g. SD-ABX9K7)"
    else -> null
}

private fun validatePin(pin: String): String? = when {
    pin.isEmpty() -> null
    pin.length < 4 -> "Enter your complete 4-digit PIN"
    else -> null
}

private fun isFormValid(plateId: String, pin: String): Boolean =
    plateId.trim().length >= 8 && pin.length == 4

/**
 * Stateful entry point wired into [in.mysmartdoor.app.navigation.SmartDoorNavHost].
 * Phase A1.5 replaced the phone/OTP placeholder with the real Owner Login
 * fields — Plate ID + 4-digit PIN — driven by [LoginViewModel], which calls
 * the existing production `verify-pin` flow via `AuthRepository`. On
 * success, navigates to [Routes.DASHBOARD] (a placeholder screen — real
 * Dashboard implementation is a later phase, out of scope here).
 *
 * Premium Login Experience phase: visuals only. Every field above this
 * doc comment — validation rules, form-valid gate, the ViewModel contract,
 * the navigation side effect below — is unchanged from A1.5. Only
 * [LoginContent]'s presentation changed.
 */
@Composable
fun LoginScreen(
    navController: NavHostController? = null,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val openWebLink = rememberWebLinkLauncher()

    var plateId by rememberSaveable { mutableStateOf("") }
    var pin by rememberSaveable { mutableStateOf("") }
    var rememberDevice by rememberSaveable { mutableStateOf(false) }
    var plateTouched by rememberSaveable { mutableStateOf(false) }
    var pinTouched by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(uiState.loginSucceeded) {
        if (uiState.loginSucceeded) {
            viewModel.consumeLoginSuccess()
            navController?.navigate(Routes.DASHBOARD) {
                popUpTo(Routes.LOGIN) { inclusive = true }
            }
        }
    }

    val plateError = if (plateTouched) validatePlateId(plateId) else null
    val pinError = if (pinTouched) validatePin(pin) else null

    LoginContent(
        plateId = plateId,
        onPlateIdChange = { input ->
            plateId = input.uppercase().filter { it.isLetterOrDigit() || it == '-' }.take(10)
            plateTouched = true
        },
        pin = pin,
        onPinChange = { input ->
            pin = input.filter { it.isDigit() }.take(4)
            pinTouched = true
        },
        rememberDevice = rememberDevice,
        onRememberDeviceChange = { rememberDevice = it },
        plateError = plateError,
        pinError = pinError,
        serverError = uiState.errorMessage,
        isLoading = uiState.isLoading,
        isContinueEnabled = isFormValid(plateId, pin) && !uiState.isLoading,
        onContinueClick = {
            plateTouched = true
            pinTouched = true
            if (isFormValid(plateId, pin)) {
                viewModel.clearError()
                viewModel.login(plateId, pin)
            }
        },
        onExploreClick = { navController?.navigate(Routes.PUBLIC_HOME) },
        onAiReceptionistDemoClick = { openWebLink(PublicWebLinks.FEATURES) },
        onBuyClick = { openWebLink(PublicWebLinks.PRODUCTS) },
        onVisitWebsiteClick = { openWebLink(PublicWebLinks.HOME) },
    )
}

/**
 * Stateless content — everything the screen renders, driven entirely by
 * parameters, so it can be previewed in every state without a ViewModel.
 *
 * [rememberDevice] is collected here (matching login.html's "Remember this
 * device for 30 days" checkbox) but is currently a UI-only value —
 * trusted-device persistence is out of scope for A1.5; see AuthRepository's
 * class doc.
 *
 * Premium Login Experience phase: rebuilt as a flagship hero screen —
 * dark navy backdrop, "My Smart Door" wordmark + tagline, the form inside
 * a [GlassCard], and a bottom trust block (Secure Login badge, privacy/
 * terms text, version). Built entirely from existing design-system
 * pieces (GlassCard, SmartDoorTextField, SmartDoorButton, SDBadge,
 * SmartDoorSpacing/Motion/Typography/Theme) — no new components, no new
 * colors, and no changes to the design-system files themselves. Entrance
 * motion is a one-shot fade/slide/scale driven by [remember]ed state so it
 * plays once per composition, not on every recomposition (e.g. while the
 * user types).
 */
@Composable
private fun LoginContent(
    plateId: String,
    onPlateIdChange: (String) -> Unit,
    pin: String,
    onPinChange: (String) -> Unit,
    rememberDevice: Boolean,
    onRememberDeviceChange: (Boolean) -> Unit,
    plateError: String?,
    pinError: String?,
    serverError: String?,
    isLoading: Boolean,
    isContinueEnabled: Boolean,
    onContinueClick: () -> Unit,
    onExploreClick: () -> Unit = {},
    onAiReceptionistDemoClick: () -> Unit = {},
    onBuyClick: () -> Unit = {},
    onVisitWebsiteClick: () -> Unit = {},
) {
    val plateInputDescription = stringResource(R.string.login_plate_id_input_description)
    val pinInputDescription = stringResource(R.string.login_pin_input_description)
    val continueButtonLabel = stringResource(R.string.login_continue_button)
    val continueLoadingLabel = stringResource(R.string.login_continue_loading_description)
    val secureBadgeLabel = stringResource(R.string.login_secure_badge)
    val errorMessage = plateError ?: pinError ?: serverError

    // One-shot entrance choreography: hero block first, then the card,
    // then the trust footer — staggered fade+slide, played once.
    var heroVisible by remember { mutableStateOf(false) }
    var cardVisible by remember { mutableStateOf(false) }
    var footerVisible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        heroVisible = true
        kotlinx.coroutines.delay(120)
        cardVisible = true
        kotlinx.coroutines.delay(160)
        footerVisible = true
    }

    // The Premium Black + Gold treatment (GlassCard, gold CTA) is designed
    // to sit over the dark navy surface — force dark theme on this hero
    // screen specifically, matching the production web login's dark
    // background, regardless of system light/dark setting.
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
                        .imePadding()
                        .padding(horizontal = SmartDoorSpacing.lg, vertical = SmartDoorSpacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    AnimatedVisibility(
                        visible = heroVisible,
                        enter = fadeIn(tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.decelerate)) +
                            slideInVertically(
                                animationSpec = tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.decelerate),
                                initialOffsetY = { -it / 3 },
                            ),
                    ) {
                        LoginHero()
                    }

                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xl))

                    AnimatedVisibility(
                        visible = cardVisible,
                        enter = fadeIn(tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized)) +
                            slideInVertically(
                                animationSpec = tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized),
                                initialOffsetY = { it / 6 },
                            ) +
                            scaleIn(
                                animationSpec = tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized),
                                initialScale = 0.94f,
                            ),
                    ) {
                        GlassCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .widthIn(max = 480.dp),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(SmartDoorSpacing.lg),
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = stringResource(R.string.login_title),
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )

                                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))

                                Text(
                                    text = stringResource(R.string.login_subtitle),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )

                                Spacer(modifier = Modifier.height(SmartDoorSpacing.lg))

                                FocusAnimatedField {
                                    SmartDoorTextField(
                                        value = plateId,
                                        onValueChange = onPlateIdChange,
                                        label = stringResource(R.string.login_plate_id_label),
                                        modifier = Modifier.testTag("login_plate_id_input"),
                                        placeholder = stringResource(R.string.login_plate_id_placeholder),
                                        supportingText = stringResource(R.string.login_plate_id_hint),
                                        errorMessage = plateError,
                                        enabled = !isLoading,
                                        keyboardType = KeyboardType.Text,
                                        contentDescriptionOverride = plateInputDescription,
                                    )
                                }

                                Spacer(modifier = Modifier.height(SmartDoorSpacing.md))

                                FocusAnimatedField {
                                    SmartDoorTextField(
                                        value = pin,
                                        onValueChange = onPinChange,
                                        label = stringResource(R.string.login_pin_label),
                                        modifier = Modifier.testTag("login_pin_input"),
                                        errorMessage = pinError,
                                        enabled = !isLoading,
                                        keyboardType = KeyboardType.NumberPassword,
                                        visualTransformation = PasswordVisualTransformation(),
                                        contentDescriptionOverride = pinInputDescription,
                                    )
                                }

                                Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(
                                        checked = rememberDevice,
                                        onCheckedChange = onRememberDeviceChange,
                                        enabled = !isLoading,
                                        colors = CheckboxDefaults.colors(
                                            checkedColor = SmartDoorSecondaryDark,
                                        ),
                                    )
                                    Text(
                                        text = stringResource(R.string.login_remember_device),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }

                                AnimatedVisibility(
                                    visible = errorMessage != null,
                                    enter = fadeIn(tween(SmartDoorMotion.durationShort)) + expandVertically(),
                                    exit = fadeOut(tween(SmartDoorMotion.durationShort)) + shrinkVertically(),
                                ) {
                                    Column {
                                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                                        Text(
                                            text = errorMessage.orEmpty(),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.error,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .semantics {
                                                    liveRegion = LiveRegionMode.Polite
                                                    contentDescription = "Error: ${errorMessage.orEmpty()}"
                                                },
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(SmartDoorSpacing.lg))

                                PressScaleButton(
                                    label = if (isLoading) continueLoadingLabel else continueButtonLabel,
                                    onClick = onContinueClick,
                                    enabled = isContinueEnabled,
                                    isLoading = isLoading,
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xl))

                    AnimatedVisibility(
                        visible = footerVisible,
                        enter = fadeIn(tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.standard)) +
                            slideInVertically(
                                animationSpec = tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.standard),
                                initialOffsetY = { it / 4 },
                            ),
                    ) {
                        LoginFooter(secureBadgeLabel = secureBadgeLabel)
                    }

                    Spacer(modifier = Modifier.height(SmartDoorSpacing.xl))

                    AnimatedVisibility(
                        visible = footerVisible,
                        enter = fadeIn(tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.standard)) +
                            slideInVertically(
                                animationSpec = tween(SmartDoorMotion.durationMedium, easing = SmartDoorMotion.standard),
                                initialOffsetY = { it / 4 },
                            ),
                    ) {
                        ExploreSection(
                            onExploreClick = onExploreClick,
                            onAiReceptionistDemoClick = onAiReceptionistDemoClick,
                            onBuyClick = onBuyClick,
                            onVisitWebsiteClick = onVisitWebsiteClick,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Phase 8 — PUBLIC ONBOARDING & MARKETING EXPERIENCE.
 *
 * "New to My Smart Door?" section below the owner login card — the only
 * entry point into the Public/prospective-customer journey. Doesn't
 * disturb the owner login flow above it (no shared state, purely
 * additional content lower on the same screen), per CTO decision.
 *
 * [onExploreClick] navigates in-app to
 * [in.mysmartdoor.app.ui.screens.publicweb.PublicHomeScreen]. The other
 * three actions open the existing production website directly via
 * [in.mysmartdoor.app.core.common.rememberWebLinkLauncher] — reused as-is,
 * nothing rebuilt natively. Built entirely from existing design-system
 * pieces (GlassCard, SmartDoorButton) — no new components, no new colors.
 */
@Composable
private fun ExploreSection(
    onExploreClick: () -> Unit,
    onAiReceptionistDemoClick: () -> Unit,
    onBuyClick: () -> Unit,
    onVisitWebsiteClick: () -> Unit,
) {
    GlassCard(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 480.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(SmartDoorSpacing.lg),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.login_explore_section_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )

            SmartDoorButton(
                label = stringResource(R.string.login_explore_button),
                onClick = onExploreClick,
                modifier = Modifier.fillMaxWidth().testTag("login_explore_button"),
                variant = SmartDoorButtonVariant.Secondary,
                leadingIconRes = R.drawable.ic_home,
            )

            SmartDoorButton(
                label = stringResource(R.string.login_ai_receptionist_demo_button),
                onClick = onAiReceptionistDemoClick,
                modifier = Modifier.fillMaxWidth(),
                variant = SmartDoorButtonVariant.Ghost,
                leadingIconRes = R.drawable.ic_bot,
            )

            SmartDoorButton(
                label = stringResource(R.string.login_buy_button),
                onClick = onBuyClick,
                modifier = Modifier.fillMaxWidth(),
                variant = SmartDoorButtonVariant.Ghost,
                leadingIconRes = R.drawable.ic_cart,
            )

            SmartDoorButton(
                label = stringResource(R.string.login_visit_website_button),
                onClick = onVisitWebsiteClick,
                modifier = Modifier.fillMaxWidth(),
                variant = SmartDoorButtonVariant.Ghost,
                leadingIconRes = R.drawable.ic_web,
            )
        }
    }
}

/**
 * Top hero block — "My Smart Door" wordmark + tagline. Pure branding, no
 * state, no logic; a static asset/vector logo can slot in above the
 * wordmark later without touching anything else in this file.
 */
@Composable
private fun LoginHero() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = stringResource(R.string.login_brand_wordmark),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Text(
            text = stringResource(R.string.login_brand_tagline),
            style = MaterialTheme.typography.bodyMedium,
            color = SmartDoorSecondaryDark,
            fontWeight = FontWeight.Medium,
        )
    }
}

/**
 * Bottom trust block — Secure Login badge, privacy/terms notice, and the
 * real app version pulled from [BuildConfig] (not hardcoded, so it can't
 * silently drift from the actual release build).
 */
@Composable
private fun LoginFooter(secureBadgeLabel: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        SDBadge(text = secureBadgeLabel, status = SDBadgeStatus.Success)

        Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))

        Text(
            text = stringResource(R.string.login_terms_notice),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.widthIn(max = 320.dp),
        )

        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))

        Text(
            text = stringResource(R.string.login_version_label, BuildConfig.VERSION_NAME),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * Wraps a design-system field with a subtle focus-driven scale, without
 * modifying [SmartDoorTextField] itself. [Modifier.onFocusChanged] on this
 * wrapper observes `hasFocus` (true while the field or any descendant
 * holds focus) and animates a barely-there 1.0 → 1.02 scale — the "focus
 * animation" the brief calls for, implemented entirely at the call site.
 */
@Composable
private fun FocusAnimatedField(content: @Composable () -> Unit) {
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.02f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "field-focus-scale",
    )

    Box(
        modifier = Modifier
            .scale(scale)
            .onFocusChanged { isFocused = it.hasFocus },
    ) {
        content()
    }
}

/**
 * The primary CTA, wrapped with a local press/click bounce.
 * [SmartDoorButton]'s public API is completely untouched — no new
 * parameters, no modification to that file. The animation here is driven
 * entirely by our own [onClick] wrapper (a quick scale-down/scale-back-up
 * [Animatable] sequence fired the instant the real tap is registered), not
 * by intercepting or duplicating any pointer/touch handling underneath
 * [SmartDoorButton]. The real [onClick] still runs exactly as before —
 * this only adds a coroutine that animates a `Modifier.scale` alongside it.
 * Also hides the keyboard on submit here (rather than via a text-field
 * keyboard-action callback), since that's a call-site concern.
 */
@Composable
private fun PressScaleButton(
    label: String,
    onClick: () -> Unit,
    enabled: Boolean,
    isLoading: Boolean,
) {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current

    SmartDoorButton(
        label = label,
        onClick = {
            keyboardController?.hide()
            scope.launch {
                scale.animateTo(0.96f, tween(SmartDoorMotion.durationShort, easing = SmartDoorMotion.standard))
                scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
            }
            onClick()
        },
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale.value)
            .testTag("login_continue_button")
            .semantics { contentDescription = label },
        variant = SmartDoorButtonVariant.Primary,
        enabled = enabled,
        isLoading = isLoading,
    )
}

@Preview(showBackground = true, name = "Login — default")
@Composable
private fun LoginScreenPreview() {
    SmartDoorTheme {
        LoginContent(
            plateId = "",
            onPlateIdChange = {},
            pin = "",
            onPinChange = {},
            rememberDevice = false,
            onRememberDeviceChange = {},
            plateError = null,
            pinError = null,
            serverError = null,
            isLoading = false,
            isContinueEnabled = false,
            onContinueClick = {},
        )
    }
}

@Preview(showBackground = true, name = "Login — error")
@Composable
private fun LoginScreenErrorPreview() {
    SmartDoorTheme {
        LoginContent(
            plateId = "SD-ABX9K7",
            onPlateIdChange = {},
            pin = "1234",
            onPinChange = {},
            rememberDevice = false,
            onRememberDeviceChange = {},
            plateError = null,
            pinError = null,
            serverError = "Invalid Plate ID or PIN. 4 attempt(s) remaining.",
            isLoading = false,
            isContinueEnabled = true,
            onContinueClick = {},
        )
    }
}

@Preview(showBackground = true, name = "Login — loading")
@Composable
private fun LoginScreenLoadingPreview() {
    SmartDoorTheme {
        LoginContent(
            plateId = "SD-ABX9K7",
            onPlateIdChange = {},
            pin = "1234",
            onPinChange = {},
            rememberDevice = true,
            onRememberDeviceChange = {},
            plateError = null,
            pinError = null,
            serverError = null,
            isLoading = true,
            isContinueEnabled = false,
            onContinueClick = {},
        )
    }
}

@Preview(showBackground = true, uiMode = 0x20, name = "Login — dark mode")
@Composable
private fun LoginScreenDarkPreview() {
    SmartDoorTheme(darkTheme = true) {
        LoginContent(
            plateId = "SD-ABX9",
            onPlateIdChange = {},
            pin = "12",
            onPinChange = {},
            rememberDevice = false,
            onRememberDeviceChange = {},
            plateError = null,
            pinError = null,
            serverError = null,
            isLoading = false,
            isContinueEnabled = false,
            onContinueClick = {},
        )
    }
}
