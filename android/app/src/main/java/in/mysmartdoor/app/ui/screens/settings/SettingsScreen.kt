package `in`.mysmartdoor.app.ui.screens.settings

import `in`.mysmartdoor.app.BuildConfig
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.core.data.model.SettingsData
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDDialog
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorTextField
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.common.LoadingScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorElevation
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.navigation.Routes
import androidx.activity.compose.BackHandler
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Settings (Phase 8 — SETTINGS, ACCOUNT & DEVICE MANAGEMENT; Phase 12E.7 —
 * PREMIUM PROFILE ECOSYSTEM). Toggles/preferences plus a read-only
 * identity/device glance — grouped into premium sections: General,
 * Security, Notifications, Hardware, AI, Support, About.
 *
 * Every switch here still writes through [SettingsViewModel] to the exact
 * production tables the CTO audit confirmed already exist
 * (`security_rules`, `notification_preferences`) — no mock toggles, no
 * ViewModel change this phase, only the grouping/visual treatment. The new
 * Hardware section reads the exact same [PlateDto] fields
 * [in.mysmartdoor.app.ui.screens.account.AccountScreen] already reads from
 * the same [SettingsData] — no new query. Privacy Settings, Language, and
 * Theme remain intentionally omitted: no backend/persistence exists for
 * any of them (see audit), and a fake toggle that doesn't actually do
 * anything is worse than no toggle.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavHostController,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val launchWebLink = rememberWebLinkLauncher()

    // Phase 10 — LOGOUT RELIABILITY FIX. While logout is actually in
    // flight (network signOut() call + local session clear), block the
    // system back button rather than letting it pop this screen off the
    // back stack. Settings' ViewModel is scoped to its NavBackStackEntry —
    // popping it mid-logout would clear that ViewModelStore and cancel the
    // in-flight coroutine before the session is wiped (see
    // AuthRepository.logout doc for the full root-cause writeup). This is
    // the other half of that fix: pair it with logout() itself now being
    // resilient (NonCancellable) to any cancellation this doesn't catch.
    BackHandler(enabled = uiState.isLoggingOut) {
        // Intentionally does nothing — swallows the back press until
        // logout finishes and LaunchedEffect(uiState.loggedOut) below
        // navigates to Login on its own.
    }

    LaunchedEffect(uiState.actionError) {
        uiState.actionError?.let {
            scope.launch { snackbarHostState.showSnackbar(it) }
            viewModel.dismissActionError()
        }
    }

    LaunchedEffect(uiState.pinChangeSuccess) {
        if (uiState.pinChangeSuccess) {
            scope.launch { snackbarHostState.showSnackbar("PIN changed successfully.") }
            viewModel.dismissPinChangeSuccess()
        }
    }

    LaunchedEffect(uiState.loggedOut) {
        if (uiState.loggedOut) {
            navController.navigate(Routes.LOGIN) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Settings",
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
        snackbarHost = { SnackbarHost(snackbarHostState) { data -> Snackbar(data) } },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> SettingsContent(
                    data = data,
                    uiState = uiState,
                    viewModel = viewModel,
                    onOpenTerms = { launchWebLink(PublicWebLinks.TERMS_OF_SERVICE) },
                    onOpenPrivacyPolicy = { launchWebLink(PublicWebLinks.PRIVACY_POLICY) },
                    onOpenFaq = { launchWebLink(PublicWebLinks.FAQ) },
                    onEmailSupport = { launchWebLink("mailto:${PublicWebLinks.SUPPORT_EMAIL}") },
                )
                uiState.isLoading -> LoadingScreen(message = "Loading settings…")
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = viewModel::load,
                )
            }
        }
    }

    if (uiState.pinChangeStep != PinChangeStep.CLOSED) {
        ChangePinDialog(uiState = uiState, viewModel = viewModel)
    }

    if (uiState.showLogoutConfirm) {
        SDDialog(
            title = "Log out?",
            message = "You'll need your Plate ID and PIN to sign back in.",
            confirmLabel = "Log Out",
            onConfirmClick = viewModel::confirmLogout,
            onDismissRequest = viewModel::dismissLogoutConfirm,
            dismissLabel = "Cancel",
            onDismissClick = viewModel::dismissLogoutConfirm,
            isDanger = true,
        )
    }

    // Phase 10 — LOGOUT RELIABILITY FIX. Blocking overlay for the window
    // between tapping "Log Out" and the session actually being cleared.
    // Previously isLoggingOut existed in state but nothing rendered it —
    // the owner got no feedback at all during the signOut() network call,
    // which is exactly the gap that invited them to hit back mid-flight.
    // Paired with the BackHandler above, this also visually communicates
    // why back is (briefly) not doing anything.
    if (uiState.isLoggingOut) {
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
private fun SettingsContent(
    data: SettingsData,
    uiState: SettingsUiState,
    viewModel: SettingsViewModel,
    onOpenTerms: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenFaq: () -> Unit,
    onEmailSupport: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg),
    ) {
        // ────────── General ──────────
        item {
            PremiumSection(title = "General", iconRes = R.drawable.ic_person) {
                Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs)) {
                    SettingsInfoRow(label = "Name", value = data.owner.fullName)
                    SettingsInfoRow(label = "Plate ID", value = data.owner.plateId)
                    SettingsInfoRow(label = "Phone", value = data.owner.phone)
                }
            }
        }

        // ────────── Security ──────────
        item {
            PremiumSection(title = "Security", iconRes = R.drawable.ic_pin) {
                Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                    ToggleRow(
                        label = "Call Forwarding",
                        subtitle = "Forward visitor calls to your masked number when you're away.",
                        checked = data.securityRules?.callForwarding ?: true,
                        saving = uiState.callForwardingSaving,
                        enabled = data.securityRules != null,
                        onCheckedChange = viewModel::setCallForwarding,
                    )
                    SettingsDivider()
                    SettingsActionRow(label = "Change PIN", onClick = viewModel::openChangePin)
                    SettingsActionRow(label = "Log Out", isDanger = true, onClick = viewModel::requestLogout)
                }
            }
        }

        // ────────── Notifications ──────────
        item {
            PremiumSection(title = "Notifications", iconRes = R.drawable.ic_bell) {
                Column {
                    ToggleRow(
                        label = "Sound",
                        subtitle = "Play a sound for new visitor/call/message notifications.",
                        checked = data.notificationPreferences.soundEnabled,
                        saving = uiState.notificationPrefsSaving,
                        onCheckedChange = viewModel::setSoundEnabled,
                    )
                    ToggleRow(
                        label = "Quiet Hours",
                        subtitle = "${data.notificationPreferences.quietHoursStart.take(5)} – " +
                            data.notificationPreferences.quietHoursEnd.take(5),
                        checked = data.notificationPreferences.quietHoursEnabled,
                        saving = uiState.notificationPrefsSaving,
                        onCheckedChange = viewModel::setQuietHoursEnabled,
                    )
                }
            }
        }

        // ────────── Hardware ──────────
        item {
            PremiumSection(title = "Hardware", iconRes = R.drawable.ic_plug) {
                HardwareSectionContent(plate = data.plate)
            }
        }

        // ────────── AI ──────────
        item {
            PremiumSection(title = "AI", iconRes = R.drawable.ic_bot) {
                ToggleRow(
                    label = "Auto-Reply",
                    subtitle = "Let the AI Receptionist answer visitors automatically.",
                    checked = data.securityRules?.autoReplyEnabled ?: true,
                    saving = uiState.autoReplySaving,
                    enabled = data.securityRules != null,
                    onCheckedChange = viewModel::setAutoReplyEnabled,
                )
            }
        }

        // ────────── Support ──────────
        item {
            PremiumSection(title = "Support", iconRes = R.drawable.ic_help) {
                Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                    SettingsActionRow(label = "FAQ", onClick = onOpenFaq)
                    SettingsActionRow(label = "Email Support", onClick = onEmailSupport)
                }
            }
        }

        // ────────── About ──────────
        item {
            PremiumSection(title = "About", iconRes = R.drawable.ic_shield) {
                Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                    SettingsActionRow(label = "Terms of Service", onClick = onOpenTerms)
                    SettingsActionRow(label = "Privacy Policy", onClick = onOpenPrivacyPolicy)
                    SettingsDivider()
                    SettingsInfoRow(label = "App Version", value = BuildConfig.VERSION_NAME)
                }
            }
        }
    }
}

/**
 * Standard premium section wrapper — a small gold icon chip + title above
 * an [SDCard] group, replacing the old bare [in.mysmartdoor.app.ui.components.SDSectionHeader]
 * + [SDCard] pairing with a consistent, slightly larger-radius premium
 * treatment used by every group on this screen.
 */
@Composable
private fun PremiumSection(title: String, iconRes: Int, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(SmartDoorSecondaryDark.copy(alpha = 0.14f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(id = iconRes),
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = SmartDoorSecondaryDark,
                )
            }
            Spacer(modifier = Modifier.size(SmartDoorSpacing.xs))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        SDCard(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            elevation = SmartDoorElevation.level1,
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = SmartDoorSpacing.xxs)
            .height(1.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
    )
}

@Composable
private fun SettingsInfoRow(label: String, value: String) {
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
        Spacer(modifier = Modifier.size(SmartDoorSpacing.sm))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}

/**
 * "Hardware" reads the exact same [PlateDto] fields
 * [in.mysmartdoor.app.ui.screens.account.AccountScreen]'s Hardware row
 * already reads from the same [SettingsData.plate] — plate ID, status,
 * last-sync timestamp (`updated_at`), and QR provisioning state. There is
 * no separate device/battery/firmware table in production (see CTO
 * audit), so those fields are correctly never shown here rather than
 * invented.
 */
@Composable
private fun HardwareSectionContent(plate: PlateDto?) {
    if (plate == null) {
        Text(
            text = "No device linked yet.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Status",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SDBadge(text = plate.status, status = plateStatusBadge(plate.status))
        }
        SettingsInfoRow(label = "Plate ID", value = plate.plateId)
        plate.productType?.let { SettingsInfoRow(label = "Product Type", value = it) }
        plate.expiryDate?.let { SettingsInfoRow(label = "Expires", value = formatSettingsDate(it)) }
        plate.updatedAt?.let { SettingsInfoRow(label = "Last Sync", value = formatSettingsDate(it)) }
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "QR Status",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val qrProvisioned = plate.qrSlug.isNotBlank()
            SDBadge(
                text = if (qrProvisioned) "Active" else "Not Provisioned",
                status = if (qrProvisioned) SDBadgeStatus.Success else SDBadgeStatus.Warning,
            )
        }
    }
}

private fun plateStatusBadge(status: String): SDBadgeStatus = when (status.lowercase()) {
    "active" -> SDBadgeStatus.Success
    "inactive", "expired" -> SDBadgeStatus.Danger
    "pending" -> SDBadgeStatus.Warning
    else -> SDBadgeStatus.Neutral
}

private fun formatSettingsDate(isoString: String): String =
    try {
        OffsetDateTime.parse(isoString).format(DateTimeFormatter.ofPattern("dd MMM yyyy"))
    } catch (e: Exception) {
        isoString
    }

@Composable
private fun ToggleRow(
    label: String,
    subtitle: String,
    checked: Boolean,
    saving: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = SmartDoorSpacing.sm)) {
            Text(text = label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (saving) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = SmartDoorSecondaryDark,
            )
        } else {
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = SmartDoorSecondaryDark,
                    checkedTrackColor = SmartDoorSecondaryDark.copy(alpha = 0.4f),
                ),
            )
        }
    }
}

@Composable
private fun SettingsActionRow(label: String, onClick: () -> Unit, isDanger: Boolean = false) {
    // Phase 11 — TOUCH TARGET FIX. Previously only the trailing "›"
    // SmartDoorButton carried onClick, so the label text and most of the
    // row's width looked tappable but did nothing. The click is now on the
    // Row itself (full width, 48dp minimum height per Material a11y
    // guidance) with a Role.Button semantics merge so TalkBack announces
    // the row using the existing label text — no separate
    // contentDescription needed. The chevron is now purely decorative.
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(onClick = onClick, role = Role.Button)
            .padding(vertical = SmartDoorSpacing.xxs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (isDanger) SmartDoorDanger else MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "›",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/**
 * In-app Change PIN — the two-step OTP recovery flow `owner-forgot-pin`
 * already implements (request OTP → enter OTP + new PIN). Custom
 * [AlertDialog] content rather than [SDDialog] since this needs form
 * fields, not just a confirm/cancel message — built entirely from existing
 * atoms ([SmartDoorTextField], [SmartDoorButton]), no new component.
 */
@Composable
private fun ChangePinDialog(uiState: SettingsUiState, viewModel: SettingsViewModel) {
    when (uiState.pinChangeStep) {
        PinChangeStep.CHOOSE_CHANNEL -> {
            var channel by remember { mutableStateOf("phone") }
            AlertDialog(
                onDismissRequest = viewModel::dismissChangePin,
                title = { Text(text = "Change PIN", style = MaterialTheme.typography.titleLarge) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        Text(
                            text = "We'll send a one-time code to verify it's you.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                            SmartDoorButton(
                                label = "SMS",
                                onClick = { channel = "phone" },
                                variant = if (channel == "phone") SmartDoorButtonVariant.Primary else SmartDoorButtonVariant.Secondary,
                            )
                            SmartDoorButton(
                                label = "Email",
                                onClick = { channel = "email" },
                                variant = if (channel == "email") SmartDoorButtonVariant.Primary else SmartDoorButtonVariant.Secondary,
                            )
                        }
                        if (uiState.pinChangeError != null) {
                            Text(text = uiState.pinChangeError, color = SmartDoorDanger, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                },
                confirmButton = {
                    SmartDoorButton(
                        label = "Send Code",
                        onClick = { viewModel.requestPinChangeOtp(channel) },
                        isLoading = uiState.pinChangeLoading,
                    )
                },
                dismissButton = {
                    SmartDoorButton(label = "Cancel", onClick = viewModel::dismissChangePin, variant = SmartDoorButtonVariant.Ghost)
                },
                containerColor = MaterialTheme.colorScheme.surface,
                titleContentColor = SmartDoorSecondaryDark,
            )
        }

        PinChangeStep.ENTER_OTP -> {
            var otp by remember { mutableStateOf("") }
            var newPin by remember { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = viewModel::dismissChangePin,
                title = { Text(text = "Enter Code", style = MaterialTheme.typography.titleLarge) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        Text(
                            text = "Code sent to ${uiState.pinChangeMaskedContact ?: "your registered contact"}.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        SmartDoorTextField(
                            value = otp,
                            onValueChange = { if (it.length <= 6) otp = it },
                            label = "6-digit code",
                            keyboardType = KeyboardType.NumberPassword,
                        )
                        SmartDoorTextField(
                            value = newPin,
                            onValueChange = { if (it.length <= 4) newPin = it },
                            label = "New 4-digit PIN",
                            keyboardType = KeyboardType.NumberPassword,
                        )
                        if (uiState.pinChangeError != null) {
                            Text(text = uiState.pinChangeError, color = SmartDoorDanger, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                },
                confirmButton = {
                    SmartDoorButton(
                        label = "Confirm",
                        onClick = { viewModel.submitPinChangeOtp(otp, newPin) },
                        isLoading = uiState.pinChangeLoading,
                        enabled = otp.length == 6 && newPin.length == 4,
                    )
                },
                dismissButton = {
                    SmartDoorButton(label = "Cancel", onClick = viewModel::dismissChangePin, variant = SmartDoorButtonVariant.Ghost)
                },
                containerColor = MaterialTheme.colorScheme.surface,
                titleContentColor = SmartDoorSecondaryDark,
            )
        }

        PinChangeStep.CLOSED -> Unit
    }
}
