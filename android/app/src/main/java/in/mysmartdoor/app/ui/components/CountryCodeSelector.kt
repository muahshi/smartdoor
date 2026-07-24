package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.width
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenu
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * A single dialing-code entry. Presentation-only model — not backed by any
 * repository/API. The list below covers the launch markets relevant to
 * SmartDoor today; expanding it later is a data-only change to
 * [defaultCountryCodes].
 */
data class CountryCode(
    val isoCode: String,
    val dialCode: String,
    val displayName: String,
) {
    /** e.g. "🇮🇳 +91" shown in the collapsed field. */
    val label: String get() = "$isoCode  $dialCode"
}

/**
 * Static list used until this becomes a real, server-driven country list.
 * India is first/default since it's SmartDoor's primary market.
 */
val defaultCountryCodes = listOf(
    CountryCode("IN", "+91", "India"),
    CountryCode("US", "+1", "United States"),
    CountryCode("GB", "+44", "United Kingdom"),
    CountryCode("AE", "+971", "United Arab Emirates"),
    CountryCode("SG", "+65", "Singapore"),
    CountryCode("AU", "+61", "Australia"),
    CountryCode("CA", "+1", "Canada"),
)

/**
 * Country-code picker for the login phone field. Purely visual/state-local:
 * selecting an entry only updates [selected] via [onSelectedChange], nothing
 * is persisted or sent anywhere. Built on [ExposedDropdownMenuBox] so it
 * gets standard Material3 anchoring/positioning and TalkBack support for
 * free instead of a hand-rolled popup.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CountryCodeSelector(
    selected: CountryCode,
    onSelectedChange: (CountryCode) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    countries: List<CountryCode> = defaultCountryCodes,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { if (enabled) expanded = it },
        modifier = modifier.width(110.dp),
    ) {
        OutlinedTextField(
            value = selected.dialCode,
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            singleLine = true,
            label = { Text("Code") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryEditable)
                .semantics {
                    contentDescription = "Country calling code, currently ${selected.displayName} ${selected.dialCode}"
                },
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            countries.forEach { country ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "${country.displayName}  ${country.dialCode}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    },
                    onClick = {
                        onSelectedChange(country)
                        expanded = false
                    },
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                )
            }
        }
    }
}
