package `in`.mysmartdoor.app.ui.components

import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import `in`.mysmartdoor.app.ui.theme.SmartDoorElevation
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Gold FAB. [content] is a free composable slot rather than a required
 * `ImageVector` icon param — this app has no `material-icons-core`
 * dependency yet (see [SDTopBar]'s doc comment), so callers pass a [Text]
 * glyph (e.g. "+") today and can drop in a real vector icon later without
 * this component's API changing.
 */
@Composable
fun SDFloatingButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier,
        containerColor = SmartDoorSecondaryDark,
        contentColor = SmartDoorOnSecondaryDark,
        elevation = FloatingActionButtonDefaults.elevation(defaultElevation = SmartDoorElevation.level4),
    ) {
        content()
    }
}

/** Extended (label + glyph) variant — e.g. "+ Add Visitor". */
@Composable
fun SDFloatingButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit = {},
) {
    ExtendedFloatingActionButton(
        onClick = onClick,
        modifier = modifier,
        containerColor = SmartDoorSecondaryDark,
        contentColor = SmartDoorOnSecondaryDark,
        elevation = FloatingActionButtonDefaults.elevation(defaultElevation = SmartDoorElevation.level4),
        icon = icon,
        text = { Text(text = label, style = MaterialTheme.typography.labelLarge) },
    )
}
