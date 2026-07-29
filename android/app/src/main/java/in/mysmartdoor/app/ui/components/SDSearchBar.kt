package `in`.mysmartdoor.app.ui.components

import `in`.mysmartdoor.app.R
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Search input used above filterable lists (visitor feed, call log). Built
 * on [OutlinedTextField] rather than M3's `SearchBar` composable — that
 * component pulls in an app-bar-style expand/collapse interaction this
 * design system doesn't need yet (single inline field is the whole
 * requirement), and matches [SmartDoorTextField]'s underlying approach.
 *
 * Phase 9: leading/trailing glyphs are now real vector icons
 * (res/drawable/ic_search.xml, ic_close.xml) instead of plain [Text] —
 * no `material-icons-core` dependency was added, these are plain drawable
 * resources.
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
            Icon(
                painter = painterResource(id = R.drawable.ic_search),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
        },
        trailingIcon = {
            if (value.isNotEmpty() && onClear != null) {
                IconButton(onClick = onClear) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_close),
                        contentDescription = "Clear search",
                        modifier = Modifier.size(18.dp),
                    )
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
