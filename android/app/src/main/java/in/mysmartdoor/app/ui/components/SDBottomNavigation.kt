package `in`.mysmartdoor.app.ui.components

import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * A single destination in [SDBottomNavigation]. [icon] is optional and left
 * as an [ImageVector] the caller supplies — this app has no
 * `material-icons-core` dependency yet (see [SDTopBar]'s doc comment), so a
 * destination with no icon just renders label-only rather than the
 * component silently reaching for an icon set that isn't there.
 */
data class SDNavItem(
    val label: String,
    val route: String,
    val icon: ImageVector? = null,
)

/**
 * Premium bottom navigation bar. Not wired into [in.mysmartdoor.app.navigation.SmartDoorNavHost]
 * in this phase — the current app has no tabbed destinations yet (Splash →
 * Login → Dashboard is a linear flow). This ships as a ready-to-use
 * component for whichever future phase introduces a tabbed shell (Owner
 * Dashboard / Visitors / Calls / Messages), consistent with "build the
 * foundation, don't redesign screens yet".
 */
@Composable
fun SDBottomNavigation(
    items: List<SDNavItem>,
    selectedRoute: String,
    onItemSelected: (SDNavItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        items.forEach { item ->
            val selected = item.route == selectedRoute
            NavigationBarItem(
                selected = selected,
                onClick = { onItemSelected(item) },
                icon = {
                    if (item.icon != null) {
                        Icon(imageVector = item.icon, contentDescription = item.label)
                    }
                },
                label = { Text(text = item.label, style = MaterialTheme.typography.labelMedium) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = SmartDoorSecondaryDark,
                    selectedTextColor = SmartDoorSecondaryDark,
                    indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
            )
        }
    }
}
