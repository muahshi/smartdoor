package `in`.mysmartdoor.app.ui.screens.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

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
 * Phase A1.5 replaces the phone/OTP placeholder with the real Owner Login
 * fields — Plate ID + 4-digit PIN — driven by [LoginViewModel], which calls
 * the existing production `verify-pin` flow via `AuthRepository`. On
 * success, navigates to [Routes.DASHBOARD] (a placeholder screen — real
 * Dashboard implementation is a later phase, out of scope here).
 */
@Composable
fun LoginScreen(
    navController: NavHostController? = null,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

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
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val plateInputDescription = stringResource(R.string.login_plate_id_input_description)
    val pinInputDescription = stringResource(R.string.login_pin_input_description)
    val continueButtonLabel = stringResource(R.string.login_continue_button)
    val continueLoadingLabel = stringResource(R.string.login_continue_loading_description)
    val errorMessage = plateError ?: pinError ?: serverError

    SmartDoorScaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.login_title),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Spacer(modifier = Modifier.height(32.dp))

            OutlinedTextField(
                value = plateId,
                onValueChange = onPlateIdChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_plate_id_input")
                    .semantics { contentDescription = plateInputDescription },
                enabled = !isLoading,
                singleLine = true,
                label = { Text(stringResource(R.string.login_plate_id_label)) },
                placeholder = { Text(stringResource(R.string.login_plate_id_placeholder)) },
                supportingText = { Text(stringResource(R.string.login_plate_id_hint)) },
                isError = plateError != null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Next,
                ),
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = pin,
                onValueChange = onPinChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_pin_input")
                    .semantics { contentDescription = pinInputDescription },
                enabled = !isLoading,
                singleLine = true,
                label = { Text(stringResource(R.string.login_pin_label)) },
                visualTransformation = PasswordVisualTransformation(),
                isError = pinError != null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.NumberPassword,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        keyboardController?.hide()
                        if (isContinueEnabled) onContinueClick()
                    },
                ),
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = rememberDevice,
                    onCheckedChange = onRememberDeviceChange,
                    enabled = !isLoading,
                )
                Text(
                    text = stringResource(R.string.login_remember_device),
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = "Error: $errorMessage"
                        },
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onContinueClick,
                enabled = isContinueEnabled,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("login_continue_button")
                    .semantics {
                        contentDescription = if (isLoading) continueLoadingLabel else continueButtonLabel
                    },
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .height(20.dp)
                            .wrapContentHeight(),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(text = stringResource(R.string.login_continue_button))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.login_terms_notice),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
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
