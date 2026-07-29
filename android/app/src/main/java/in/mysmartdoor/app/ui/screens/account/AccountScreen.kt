package `in`.mysmartdoor.app.ui.screens.account

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.SettingsData
import `in`.mysmartdoor.app.core.network.dto.PlateDto
import `in`.mysmartdoor.app.core.network.dto.SubscriptionDto
import `in`.mysmartdoor.app.ui.components.SDAvatar
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.SmartDoorTextField
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.screens.common.LoadingScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
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
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Account (Phase 8 — SETTINGS, ACCOUNT & DEVICE MANAGEMENT). Identity-
 * focused: Owner Profile, Plate Information, Subscription, Linked Device.
 * Toggles/preferences live on
 * [in.mysmartdoor.app.ui.screens.settings.SettingsScreen] instead —
 * Dashboard already treats "Settings" and "Account" as separate Quick
 * Actions.
 *
 * Data comes entirely from [AccountViewModel] → the same
 * [in.mysmartdoor.app.core.data.SettingsRepository] read
 * [in.mysmartdoor.app.ui.screens.settings.SettingsScreen] uses — no
 * duplicate repository, no mock data. "Linked Device" has no separate
 * device table in production; the plate row itself is the device record
 * (see CTO audit), so its status/QR fields are shown directly from [PlateDto].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    navController: NavHostController,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Phase 9: if a refresh fails while data is already on screen, surface
    // it as a Snackbar instead of falling through to ErrorScreen — the
    // existing `data != null` branch below already keeps showing
    // AccountContent, this just adds the missing user-facing feedback.
    // Initial-load failures (data == null) are untouched: ErrorScreen still
    // owns that case below.
    LaunchedEffect(uiState.isRefreshing, uiState.errorMessage) {
        val message = uiState.errorMessage
        if (!uiState.isRefreshing && message != null && uiState.data != null) {
            snackbarHostState.showSnackbar(message)
        }
    }

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Account",
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
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val data = uiState.data
            when {
                data != null -> AccountContent(data = data, uiState = uiState, viewModel = viewModel)
                uiState.isLoading -> LoadingScreen(message = "Loading account…")
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = viewModel::load,
                )
            }
        }
    }
}

@Composable
private fun AccountContent(data: SettingsData, uiState: AccountUiState, viewModel: AccountViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Owner Profile")
                SDCard {
                    OwnerProfileCard(data = data, uiState = uiState, viewModel = viewModel)
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Plate Information")
                if (data.plate != null) {
                    SDCard { PlateInfoCard(plate = data.plate) }
                } else {
                    EmptyStateScreen(
                        modifier = Modifier.fillMaxWidth(),
                        title = "No plate linked yet",
                        subtitle = "Your Smart Door plate will show up here once it's provisioned.",
                    )
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Subscription")
                if (data.subscription != null) {
                    SDCard { SubscriptionCard(subscription = data.subscription) }
                } else {
                    EmptyStateScreen(
                        modifier = Modifier.fillMaxWidth(),
                        title = "No active subscription",
                        subtitle = "Hardware-only owners won't see a plan here — that's expected.",
                    )
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                SDSectionHeader(title = "Linked Device")
                if (data.plate != null) {
                    SDCard { LinkedDeviceCard(plate = data.plate) }
                } else {
                    EmptyStateScreen(
                        modifier = Modifier.fillMaxWidth(),
                        title = "No device linked yet",
                    )
                }
            }
        }
    }
}

@Composable
private fun OwnerProfileCard(data: SettingsData, uiState: AccountUiState, viewModel: AccountViewModel) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SDAvatar(name = data.owner.fullName, size = 48.dp)
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
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = data.owner.plateId,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (!uiState.isEditingName) {
                SmartDoorButton(label = "Edit", onClick = viewModel::startEditingName, variant = SmartDoorButtonVariant.Ghost)
            }
        }
        Spacer(modifier = Modifier.height(SmartDoorSpacing.sm))
        InfoRow(label = "Registered Mobile", value = data.owner.phone)
        data.owner.email?.let { InfoRow(label = "Email", value = it) }
        InfoRow(label = "Registration Date", value = formatDate(data.owner.createdAt))
    }
}

@Composable
private fun PlateInfoCard(plate: PlateDto) {
    Column {
        InfoRow(label = "Plate ID", value = plate.plateId)
        plate.productType?.let { InfoRow(label = "Product Type", value = it) }
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "Status",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SDBadge(text = plate.status, status = plateStatusBadge(plate.status))
        }
        plate.expiryDate?.let { InfoRow(label = "Expires", value = formatDate(it)) }
    }
}

@Composable
private fun SubscriptionCard(subscription: SubscriptionDto) {
    Column {
        InfoRow(label = "Plan", value = subscription.plan)
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "Status",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SDBadge(
                text = subscription.status,
                status = if (subscription.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Neutral,
            )
        }
        InfoRow(label = "Renews / Expires", value = formatDate(subscription.expiryDate))
    }
}

@Composable
private fun LinkedDeviceCard(plate: PlateDto) {
    // Per CTO audit: there is no separate "device" table in production —
    // the plate row itself is the device record. QR status is derived from
    // whether a qr_slug has been provisioned for this plate.
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "Plate Status",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SDBadge(text = plate.status, status = plateStatusBadge(plate.status))
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween,
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

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.xxs),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
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
