package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceDark

/**
 * A single destination in [SDBottomNavigation]. [icon] ([ImageVector]) is
 * kept for source compatibility; [iconRes] is the drawable-resource
 * alternative every real caller in this app actually uses, since
 * `material-icons-core` isn't a Gradle dependency here (see [SDTopBar]'s
 * doc comment) — same reasoning as [SDTopBar.backIconRes]. If both are
 * null the item renders label-only. If both are set, [icon] wins.
 */
data class SDNavItem(
    val label: String,
    val route: String,
    val icon: ImageVector? = null,
    val iconRes: Int? = null,
)

/**
 * Premium bottom navigation bar — Phase 12A wires this into the Dashboard
 * and Live Activity screens (the only two screens in scope this phase).
 * Still the same component from the Design System phase, not a new one:
 * this only adds [SDNavItem.iconRes] rendering and a slightly richer
 * selected-state treatment (gold pill indicator) to read as "premium"
 * against the reference, per CTO direction — the public API
 * (`items`/`selectedRoute`/`onItemSelected`) is unchanged, so any future
 * screen can adopt it exactly as already documented.
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
        containerColor = SmartDoorSurfaceDark,
        tonalElevation = 0.dp,
    ) {
        items.forEach { item ->
            val selected = item.route == selectedRoute
            NavigationBarItem(
                selected = selected,
                onClick = { onItemSelected(item) },
                icon = {
                    when {
                        item.icon != null -> Icon(
                            imageVector = item.icon,
                            contentDescription = item.label,
                            modifier = Modifier.size(22.dp),
                        )
                        item.iconRes != null -> Icon(
                            painter = painterResource(id = item.iconRes),
                            contentDescription = item.label,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                },
                label = { Text(text = item.label, style = MaterialTheme.typography.labelMedium) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = SmartDoorOnSecondaryDark,
                    selectedTextColor = SmartDoorSecondaryDark,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    indicatorColor = SmartDoorSecondaryDark,
                ),
            )
        }
    }
}
