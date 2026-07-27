package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Search input used above filterable lists (visitor feed, call log). Built
 * on [OutlinedTextField] rather than M3's `SearchBar` composable — that
 * component pulls in an app-bar-style expand/collapse interaction this
 * design system doesn't need yet (single inline field is the whole
 * requirement), and matches [SmartDoorTextField]'s underlying approach.
 *
 * Leading/trailing glyphs are plain [Text] rather than
 * `androidx.compose.material.icons.Icons.*` — no `material-icons-core`
 * dependency exists in this app (see [SDTopBar]'s doc comment).
 */
@Composable
fun SDSearchBar(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search",
    onClear: (() -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = placeholder },
        placeholder = { Text(text = placeholder) },
        singleLine = true,
        leadingIcon = {
            Text(text = "⌕", style = MaterialTheme.typography.titleMedium)
        },
        trailingIcon = {
            if (value.isNotEmpty() && onClear != null) {
                IconButton(onClick = onClear) {
                    Text(text = "✕", style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        shape = MaterialTheme.shapes.extraLarge,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = SmartDoorSecondaryDark,
            cursorColor = SmartDoorSecondaryDark,
        ),
    )
}
