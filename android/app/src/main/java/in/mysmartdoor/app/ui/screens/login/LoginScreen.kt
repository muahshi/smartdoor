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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.ui.components.CountryCode
import `in`.mysmartdoor.app.ui.components.CountryCodeSelector
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.components.defaultCountryCodes
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Client-side-only phone validation for the Login screen. Deliberately
 * dumb: length/shape checks so the user gets instant feedback before an
 * OTP is ever requested. Real verification (does this number exist / can
 * it receive SMS) happens server-side once the OTP phase is implemented —
 * this function is never the source of truth for whether a number is
 * valid, only a UX guard against obviously-wrong input.
 */
private fun validatePhoneNumber(digitsOnly: String, country: CountryCode): String? {
    return when {
        digitsOnly.isEmpty() -> null // no error shown until the user types something
        country.isoCode == "IN" && digitsOnly.length < 10 ->
            "Enter a 10-digit mobile number"
        country.isoCode == "IN" && digitsOnly.length == 10 && digitsOnly[0] !in '6'..'9' ->
            "Enter a valid Indian mobile number"
        country.isoCode != "IN" && digitsOnly.length < 6 ->
            "Enter a valid mobile number"
        digitsOnly.length > 12 ->
            "Mobile number is too long"
        else -> null
    }
}

private fun isPhoneValid(digitsOnly: String, country: CountryCode): Boolean {
    if (digitsOnly.isEmpty()) return false
    return validatePhoneNumber(digitsOnly, country) == null
}

/**
 * Stateful entry point wired into [in.mysmartdoor.app.navigation.SmartDoorNavHost].
 * Owns only UI-local state (typed digits, selected country, loading/error
 * flags) via `rememberSaveable`/`remember` — there is no ViewModel here on
 * purpose. [onContinueClick] is currently a no-op default; the phase that
 * adds the OTP flow will pass a real callback (and drive [isLoading] /
 * error text from an actual repository result) without needing to touch
 * this screen's layout.
 */
@Composable
fun LoginScreen(
    navController: NavHostController? = null,
    onContinueClick: (fullPhoneNumber: String) -> Unit = {},
) {
    var selectedCountry by rememberSaveable(stateSaver = countryCodeSaver) {
        mutableStateOf(defaultCountryCodes.first())
    }
    var phoneDigits by rememberSaveable { mutableStateOf("") }
    var isLoading by rememberSaveable { mutableStateOf(false) }
    var touched by rememberSaveable { mutableStateOf(false) }

    val validationError = if (touched) validatePhoneNumber(phoneDigits, selectedCountry) else null

    LoginContent(
        selectedCountry = selectedCountry,
        onCountryChange = { selectedCountry = it },
        phoneDigits = phoneDigits,
        onPhoneDigitsChange = { newDigits ->
            phoneDigits = newDigits
            touched = true
        },
        errorMessage = validationError,
        isLoading = isLoading,
        isContinueEnabled = isPhoneValid(phoneDigits, selectedCountry) && !isLoading,
        onContinueClick = {
            touched = true
            if (isPhoneValid(phoneDigits, selectedCountry)) {
                // Visual-only: a real async call (added with the OTP phase)
                // is what will eventually flip isLoading back to false.
                isLoading = true
                onContinueClick("${selectedCountry.dialCode}$phoneDigits")
            }
        },
    )
}

private val countryCodeSaver: Saver<CountryCode, List<String>> = listSaver(
    save = { listOf(it.isoCode, it.dialCode, it.displayName) },
    restore = { CountryCode(it[0], it[1], it[2]) },
)

/**
 * Stateless content — everything the screen renders, driven entirely by
 * parameters. Kept separate from [LoginScreen] so it can be previewed in
 * every state (empty, error, loading) without needing the stateful
 * wrapper, and so a future ViewModel can drive it directly.
 */
@Composable
private fun LoginContent(
    selectedCountry: CountryCode,
    onCountryChange: (CountryCode) -> Unit,
    phoneDigits: String,
    onPhoneDigitsChange: (String) -> Unit,
    errorMessage: String?,
    isLoading: Boolean,
    isContinueEnabled: Boolean,
    onContinueClick: () -> Unit,
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val phoneInputDescription = stringResource(R.string.login_phone_input_description)
    val continueButtonLabel = stringResource(R.string.login_continue_button)
    val continueLoadingLabel = stringResource(R.string.login_continue_loading_description)

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

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CountryCodeSelector(
                    selected = selectedCountry,
                    onSelectedChange = onCountryChange,
                    enabled = !isLoading,
                )

                OutlinedTextField(
                    value = phoneDigits,
                    onValueChange = { input ->
                        val digitsOnly = input.filter { it.isDigit() }.take(12)
                        onPhoneDigitsChange(digitsOnly)
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("login_phone_input")
                        .semantics {
                            contentDescription = phoneInputDescription
                        },
                    enabled = !isLoading,
                    singleLine = true,
                    label = { Text(stringResource(R.string.login_phone_label)) },
                    placeholder = { Text(stringResource(R.string.login_phone_placeholder)) },
                    isError = errorMessage != null,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            keyboardController?.hide()
                            if (isContinueEnabled) onContinueClick()
                        },
                    ),
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
            selectedCountry = defaultCountryCodes.first(),
            onCountryChange = {},
            phoneDigits = "",
            onPhoneDigitsChange = {},
            errorMessage = null,
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
            selectedCountry = defaultCountryCodes.first(),
            onCountryChange = {},
            phoneDigits = "123",
            onPhoneDigitsChange = {},
            errorMessage = "Enter a 10-digit mobile number",
            isLoading = false,
            isContinueEnabled = false,
            onContinueClick = {},
        )
    }
}

@Preview(showBackground = true, name = "Login — loading")
@Composable
private fun LoginScreenLoadingPreview() {
    SmartDoorTheme {
        LoginContent(
            selectedCountry = defaultCountryCodes.first(),
            onCountryChange = {},
            phoneDigits = "9876543210",
            onPhoneDigitsChange = {},
            errorMessage = null,
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
            selectedCountry = defaultCountryCodes.first(),
            onCountryChange = {},
            phoneDigits = "98765",
            onPhoneDigitsChange = {},
            errorMessage = null,
            isLoading = false,
            isContinueEnabled = false,
            onContinueClick = {},
        )
    }
}
