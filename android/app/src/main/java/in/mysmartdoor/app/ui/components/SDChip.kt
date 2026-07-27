package `in`.mysmartdoor.app.ui.components

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorPillShape
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Selectable filter/tag chip — e.g. filtering the visitor feed by
 * "Today"/"Delivery"/"Guest". Wraps M3 [FilterChip] with the design
 * system's pill shape and gold-selected treatment instead of every screen
 * styling its own.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SDChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = SmartDoorPillShape,
        label = {
            Text(text = label, style = MaterialTheme.typography.labelLarge)
        },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = SmartDoorSecondaryDark,
            selectedLabelColor = SmartDoorOnSecondaryDark,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = enabled,
            selected = selected,
            borderColor = SmartDoorSecondaryDark,
            selectedBorderColor = SmartDoorSecondaryDark,
        ),
    )
}
