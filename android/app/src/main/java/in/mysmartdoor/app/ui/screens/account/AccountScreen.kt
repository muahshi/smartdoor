package `in`.mysmartdoor.app.ui.screens.account

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.core.data.model.SettingsData
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SubscriptionDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDAvatar
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDDialog
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDStatCard
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorTextField
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.dashboardBottomNavItems
import `in`.mysmartdoor.app.ui.screens.settings.SettingsViewModel
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorElevation
import `in`.mysmartdoor.app.ui.theme.SmartDoorGlassBorder
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Profile (Phase 8 — SETTINGS, ACCOUNT & DEVICE MANAGEMENT; Phase 12B —
 * PREMIUM SCREEN REBUILD; Phase 12E.7 — PREMIUM PROFILE ECOSYSTEM).
 * Identity-focused: a hero owner-profile card, an at-a-glance premium
 * stats row, and a premium menu list — Subscription, Hardware,
 * Notifications, Privacy, Help, Logout.
 *
 * Data comes entirely from [AccountViewModel] → the same
 * [in.mysmartdoor.app.core.data.SettingsRepository] read
 * [in.mysmartdoor.app.ui.screens.settings.SettingsScreen] uses — no
 * duplicate repository, no mock data, no ViewModel changes this phase.
 * "Hardware" has no separate device table in production; the plate row
 * itself is the device record (see CTO audit), so its status/QR fields are
 * shown directly from [PlateDto], same as before. Every stat/badge on this
 * screen is derived from fields already on [SettingsData] — no invented
 * fields (no battery/firmware — production has no such columns).
 *
 * The Notifications and Help rows navigate to
 * [in.mysmartdoor.app.ui.screens.settings.SettingsScreen] — that is where
 * the real notification-preference toggles and FAQ/support links already
 * live; this screen doesn't duplicate that logic. Privacy opens the real
 * Privacy Policy link via the same [rememberWebLinkLauncher] utility
 * Settings already uses. Logout reuses [SettingsViewModel]'s existing,
 * already-hardened logout flow (confirm dialog, blocking overlay, back-press
 * guard) via a second instance of that same ViewModel scoped to this
 * screen — no logout logic is re-implemented, only its UI is re-hosted here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    navController: NavHostController,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val launchWebLink = rememberWebLinkLauncher()

    // Reused as-is from SettingsScreen — same ViewModel class, its own
    // instance/state scoped to this screen's back-stack entry. Only the
    // logout confirm/overlay/back-press wiring is duplicated here (UI only);
    // requestLogout()/confirmLogout()/dismissLogoutConfirm() and the
    // underlying AuthRepository call are the exact same production code.
    val logoutViewModel: SettingsViewModel = hiltViewModel()
    val logoutState by logoutViewModel.uiState.collectAsState()

    LaunchedEffect(uiState.isRefreshing, uiState.errorMessage) {
        val message = uiState.errorMessage
        if (!uiState.isRefreshing && message != null && uiState.data != null) {
            snackbarHostState.showSnackbar(message)
        }
    }

    BackHandler(enabled = logoutState.isLoggingOut) {
        // Intentionally does nothing — see SettingsScreen's identical guard.
    }

    LaunchedEffect(logoutState.loggedOut) {
        if (logoutState.loggedOut) {
            navController.navigate(Routes.LOGIN) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Profile",
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
                selectedRoute = Routes.ACCOUNT,
                onItemSelected = { item ->
                    if (item.route != Routes.ACCOUNT) {
                        navController.navigate(item.route) { launchSingleTop = true }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> AccountContent(
                    data = data,
                    uiState = uiState,
                    viewModel = viewModel,
                    onNavigateSettings = { navController.navigate(Routes.SETTINGS) },
                    onNavigateAnalytics = { navController.navigate(Routes.ANALYTICS) },
                    onOpenPrivacyPolicy = { launchWebLink(PublicWebLinks.PRIVACY_POLICY) },
                    onOpenFaq = { launchWebLink(PublicWebLinks.FAQ) },
                    onEmailSupport = { launchWebLink("mailto:${PublicWebLinks.SUPPORT_EMAIL}") },
                    onRequestLogout = logoutViewModel::requestLogout,
                )
                uiState.isLoading -> ProfileSkeleton()
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = viewModel::load,
                )
            }
        }
    }

    if (logoutState.showLogoutConfirm) {
        SDDialog(
            title = "Log out?",
            message = "You'll need your Plate ID and PIN to sign back in.",
            confirmLabel = "Log Out",
            onConfirmClick = logoutViewModel::confirmLogout,
            onDismissRequest = logoutViewModel::dismissLogoutConfirm,
            dismissLabel = "Cancel",
            onDismissClick = logoutViewModel::dismissLogoutConfirm,
            isDanger = true,
        )
    }

    if (logoutState.isLoggingOut) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.4f)),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun AccountContent(
    data: SettingsData,
    uiState: AccountUiState,
    viewModel: AccountViewModel,
    onNavigateSettings: () -> Unit,
    onNavigateAnalytics: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenFaq: () -> Unit,
    onEmailSupport: () -> Unit,
    onRequestLogout: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.md),
    ) {
        item { ProfileHeaderCard(data = data, uiState = uiState, viewModel = viewModel) }

        item { PremiumStatsRow(data = data) }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Account")
                MenuListCard {
                    SubscriptionMenuRow(subscription = data.subscription)
                    MenuDivider()
                    HardwareMenuRow(plate = data.plate)
                    MenuDivider()
                    NavMenuRow(
                        iconRes = R.drawable.ic_bell,
                        title = "Notifications",
                        subtitle = "Quiet hours, sound, and alert preferences",
                        onClick = onNavigateSettings,
                    )
                    MenuDivider()
                    NavMenuRow(
                        iconRes = R.drawable.ic_chart,
                        title = "Smart Analytics",
                        subtitle = "Visitor and call trends, AI performance",
                        onClick = onNavigateAnalytics,
                    )
                    MenuDivider()
                    NavMenuRow(
                        iconRes = R.drawable.ic_shield,
                        title = "Privacy",
                        subtitle = "Read our Privacy Policy",
                        onClick = onOpenPrivacyPolicy,
                    )
                    MenuDivider()
                    HelpMenuRow(onOpenFaq = onOpenFaq, onEmailSupport = onEmailSupport)
                    MenuDivider()
                    LogoutMenuRow(onClick = onRequestLogout)
                }
            }
        }
    }
}

/**
 * The premium owner-identity hero card. Uses the same [GlassCard]
 * treatment every other "hero" surface in the app already uses, with a
 * larger avatar, a plate-ID identity pill, and — only when
 * [SettingsData.subscription] is an active plan — a gold "Premium Plan"
 * badge. No plan/no badge is the correct, honest state for a
 * hardware-only owner; nothing here is invented when the field is null.
 */
@Composable
private fun ProfileHeaderCard(data: SettingsData, uiState: AccountUiState, viewModel: AccountViewModel) {
    GlassCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    SDAvatar(name = data.owner.fullName, size = 72.dp)
                    if (data.subscription?.status == "active") {
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(22.dp)
                                .background(SmartDoorSecondaryDark, CircleShape)
                                .border(2.dp, MaterialTheme.colorScheme.background, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_receipt),
                                contentDescription = "Premium member",
                                tint = MaterialTheme.colorScheme.background,
                                modifier = Modifier.size(12.dp),
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
                Column(modifier = Modifier.weight(1f)) {
                    if (uiState.isEditingName) {
                        var draftName by remember(uiState.isEditingName) { mutableStateOf(data.owner.fullName) }
                        SmartDoorTextField(
                            value = draftName,
                            onValueChange = { draftName = it },
                            label = "Full name",
                            errorMessage = uiState.nameError,
                        )
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                            SmartDoorButton(
                                label = "Save",
                                onClick = { viewModel.saveName(draftName) },
                                isLoading = uiState.isSavingName,
                                modifier = Modifier.weight(1f),
                            )
                            SmartDoorButton(
                                label = "Cancel",
                                onClick = viewModel::cancelEditingName,
                                variant = SmartDoorButtonVariant.Ghost,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    } else {
                        Text(
                            text = data.owner.fullName,
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IdentityPill(text = data.owner.plateId)
                            if (data.subscription?.status == "active") {
                                Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                                SDBadge(text = data.subscription.plan, status = SDBadgeStatus.Success)
                            }
                        }
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                        Text(
                            text = data.owner.phone,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (!uiState.isEditingName) {
                    SmartDoorButton(label = "Edit", onClick = viewModel::startEditingName, variant = SmartDoorButtonVariant.Ghost)
                }
            }
            data.owner.email?.let {
                Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
                HeroDivider()
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                InfoRow(label = "Email", value = it)
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
            InfoRow(label = "Member Since", value = formatDate(data.owner.createdAt))
        }
    }
}

@Composable
private fun IdentityPill(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = SmartDoorSecondaryDark,
        modifier = Modifier
            .background(SmartDoorSecondaryDark.copy(alpha = 0.14f), RoundedCornerShape(6.dp))
            .padding(horizontal = SmartDoorSpacing.xs, vertical = 2.dp),
    )
}

@Composable
private fun HeroDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(SmartDoorGlassBorder),
    )
}

/**
 * "Premium statistics" tile row — three at-a-glance tiles summarizing
 * hardware, subscription, and AI Receptionist status. Every value is
 * derived from fields [SettingsData] already carries — a hardware-only
 * owner correctly sees "No Device" rather than a fabricated status.
 */
@Composable
private fun PremiumStatsRow(data: SettingsData) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
    ) {
        SDStatCard(
            label = "Hardware",
            value = if (data.plate != null) "1 Plate" else "None",
            modifier = Modifier.weight(1f),
        )
        SDStatCard(
            label = "Subscription",
            value = data.subscription?.plan ?: "None",
            modifier = Modifier.weight(1f),
        )
        SDStatCard(
            label = "AI Status",
            value = when (data.securityRules?.autoReplyEnabled) {
                true -> "Online"
                false -> "Off"
                null -> "—"
            },
            modifier = Modifier.weight(1f),
        )
    }
}

// ────────── Premium menu list ──────────

@Composable
private fun MenuListCard(content: @Composable ColumnScope.() -> Unit) {
    SDCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = SmartDoorElevation.level2,
        contentPadding = PaddingValues(0.dp),
    ) {
        Column(modifier = Modifier.padding(vertical = SmartDoorSpacing.xs), content = content)
    }
}

@Composable
private fun MenuDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = SmartDoorSpacing.md)
            .height(1.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
    )
}

@Composable
private fun MenuIconCircle(iconRes: Int, tint: Color) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .background(color = tint.copy(alpha = 0.14f), shape = CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = tint,
        )
    }
}

/**
 * Shared press-scale micro-interaction (the same spring curve
 * [in.mysmartdoor.app.ui.components.SDActionCard] uses) applied to every
 * premium menu row so the whole list feels like one consistent, tactile
 * surface rather than plain [clickable] rows.
 */
@Composable
private fun premiumPressable(onClick: () -> Unit): Modifier {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    val interactionSource = remember { MutableInteractionSource() }
    return Modifier
        .scale(scale.value)
        .clickable(interactionSource = interactionSource, indication = null) {
            scope.launch {
                scale.animateTo(0.98f, tween(SmartDoorMotion.durationShort, easing = SmartDoorMotion.standard))
                scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
            }
            onClick()
        }
}

@Composable
private fun SubscriptionMenuRow(subscription: SubscriptionDto?) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .then(premiumPressable { expanded = !expanded })
            .animateContentSize()
            .padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            MenuIconCircle(iconRes = R.drawable.ic_receipt, tint = SmartDoorSecondaryDark)
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Subscription",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = subscription?.plan ?: "No active plan",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (subscription != null) {
                SDBadge(
                    text = subscription.status,
                    status = if (subscription.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                )
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
            ChevronGlyph(expanded)
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(animationSpec = tween(SmartDoorMotion.durationMedium)) + fadeIn(),
            exit = shrinkVertically(animationSpec = tween(SmartDoorMotion.durationShort)) + fadeOut(),
        ) {
            Column(modifier = Modifier.padding(top = SmartDoorSpacing.sm, start = 56.dp)) {
                if (subscription != null) {
                    InfoRow(label = "Plan", value = subscription.plan)
                    InfoRow(label = "Renews / Expires", value = formatDate(subscription.expiryDate))
                } else {
                    Text(
                        text = "Hardware-only owners won't see a plan here — that's expected.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun HardwareMenuRow(plate: PlateDto?) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .then(premiumPressable { expanded = !expanded })
            .animateContentSize()
            .padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            MenuIconCircle(iconRes = R.drawable.ic_plug, tint = SmartDoorSecondaryDark)
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Hardware",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = plate?.plateId ?: "No device linked",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (plate != null) {
                SDBadge(text = plate.status, status = plateStatusBadge(plate.status))
            }
            Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
            ChevronGlyph(expanded)
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(animationSpec = tween(SmartDoorMotion.durationMedium)) + fadeIn(),
            exit = shrinkVertically(animationSpec = tween(SmartDoorMotion.durationShort)) + fadeOut(),
        ) {
            Column(modifier = Modifier.padding(top = SmartDoorSpacing.sm, start = 56.dp)) {
                if (plate != null) {
                    InfoRow(label = "Plate ID", value = plate.plateId)
                    plate.productType?.let { InfoRow(label = "Product Type", value = it) }
                    plate.expiryDate?.let { InfoRow(label = "Expires", value = formatDate(it)) }
                    plate.updatedAt?.let { InfoRow(label = "Last Sync", value = formatDate(it)) }
                    val qrProvisioned = plate.qrSlug.isNotBlank()
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "QR Status",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        SDBadge(
                            text = if (qrProvisioned) "Active" else "Not Provisioned",
                            status = if (qrProvisioned) SDBadgeStatus.Success else SDBadgeStatus.Warning,
                        )
                    }
                } else {
                    Text(
                        text = "No device linked yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun HelpMenuRow(onOpenFaq: () -> Unit, onEmailSupport: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .then(premiumPressable { expanded = !expanded })
            .animateContentSize()
            .padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            MenuIconCircle(iconRes = R.drawable.ic_help, tint = SmartDoorSecondaryDark)
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Help",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "Get assistance",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            ChevronGlyph(expanded)
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(animationSpec = tween(SmartDoorMotion.durationMedium)) + fadeIn(),
            exit = shrinkVertically(animationSpec = tween(SmartDoorMotion.durationShort)) + fadeOut(),
        ) {
            Column(
                modifier = Modifier.padding(top = SmartDoorSpacing.sm, start = 56.dp),
                verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm),
            ) {
                Text(
                    text = "FAQ",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SmartDoorSecondaryDark,
                    modifier = Modifier.clickable(onClick = onOpenFaq),
                )
                Text(
                    text = "Email Support",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SmartDoorSecondaryDark,
                    modifier = Modifier.clickable(onClick = onEmailSupport),
                )
            }
        }
    }
}

@Composable
private fun NavMenuRow(iconRes: Int, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .then(premiumPressable(onClick))
            .padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
    ) {
        MenuIconCircle(iconRes = iconRes, tint = SmartDoorSecondaryDark)
        Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            painter = painterResource(id = R.drawable.ic_chevron_right),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LogoutMenuRow(onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .then(premiumPressable(onClick))
            .padding(horizontal = SmartDoorSpacing.md, vertical = SmartDoorSpacing.sm),
    ) {
        MenuIconCircle(iconRes = R.drawable.ic_logout, tint = SmartDoorDanger)
        Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
        Text(
            text = "Logout",
            style = MaterialTheme.typography.bodyLarge,
            color = SmartDoorDanger,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ChevronGlyph(expanded: Boolean) {
    Icon(
        painter = painterResource(id = if (expanded) R.drawable.ic_close else R.drawable.ic_chevron_right),
        contentDescription = null,
        modifier = Modifier.size(16.dp),
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}

@Composable
private fun ProfileSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.md)) {
        GlassCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp)) {
            SDSkeletonLoaderGroup(lineCount = 3)
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
            repeat(3) {
                SDCard(modifier = Modifier.weight(1f)) { SDSkeletonLoaderGroup(lineCount = 2) }
            }
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            SDSkeletonLoaderGroup(lineCount = 4)
        }
    }
}

private fun plateStatusBadge(status: String): SDBadgeStatus = when (status.lowercase()) {
    "active" -> SDBadgeStatus.Success
    "inactive", "expired" -> SDBadgeStatus.Danger
    "pending" -> SDBadgeStatus.Warning
    else -> SDBadgeStatus.Neutral
}

private fun formatDate(isoString: String): String =
    try {
        OffsetDateTime.parse(isoString).format(DateTimeFormatter.ofPattern("dd MMM yyyy"))
    } catch (e: Exception) {
        isoString
    }
