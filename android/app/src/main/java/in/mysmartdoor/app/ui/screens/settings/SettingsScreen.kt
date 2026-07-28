package `in`.mysmartdoor.app.ui.screens.settings

import `in`.mysmartdoor.app.core.common.rememberWebLinkLauncher
import `in`.mysmartdoor.app.core.config.PublicWebLinks
import `in`.mysmartdoor.app.core.data.model.SettingsData
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDDialog
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorTextField
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.common.LoadingScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.navigation.Routes
import kotlinx.coroutines.launch

/**
 * Settings (Phase 8 — SETTINGS, ACCOUNT & DEVICE MANAGEMENT). Toggles/
 * preferences only — identity/plate/subscription info lives on
 * [in.mysmartdoor.app.ui.screens.account.AccountScreen], reached
 * separately from Dashboard's own "Account" Quick Action.
 *
 * Every switch here writes through [SettingsViewModel] to the exact
 * production tables the CTO audit confirmed already exist
 * (`security_rules`, `notification_preferences`) — no mock toggles.
 * Privacy Settings, Language, and Theme are intentionally omitted: no
 * backend/persistence exists for any of them (see audit), and a fake
 * toggle that doesn't actually do anything is worse than no toggle.
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
                            Text(text = "⟳", style = MaterialTheme.typography.titleMedium)
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
        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "AI Receptionist")
                SDCard {
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
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Masked Calling")
                SDCard {
                    ToggleRow(
                        label = "Call Forwarding",
                        subtitle = "Forward visitor calls to your masked number when you're away.",
                        checked = data.securityRules?.callForwarding ?: true,
                        saving = uiState.callForwardingSaving,
                        enabled = data.securityRules != null,
                        onCheckedChange = viewModel::setCallForwarding,
                    )
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Notification Preferences")
                SDCard {
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
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Security")
                SDCard {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        SettingsActionRow(label = "Change PIN", onClick = viewModel::openChangePin)
                        SettingsActionRow(label = "Log Out", isDanger = true, onClick = viewModel::requestLogout)
                    }
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Help & Support")
                SDCard {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        SettingsActionRow(label = "FAQ", onClick = onOpenFaq)
                        SettingsActionRow(label = "Email Support", onClick = onEmailSupport)
                    }
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "About")
                SDCard {
                    Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                        SettingsActionRow(label = "Terms of Service", onClick = onOpenTerms)
                        SettingsActionRow(label = "Privacy Policy", onClick = onOpenPrivacyPolicy)
                    }
                }
            }
        }
    }
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
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (isDanger) SmartDoorDanger else MaterialTheme.colorScheme.onSurface,
        )
        SmartDoorButton(label = "›", onClick = onClick, variant = SmartDoorButtonVariant.Ghost)
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
