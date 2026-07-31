package `in`.mysmartdoor.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorGlassBorder
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSurfaceVariantDark
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
 * Premium floating bottom navigation — Premium UI parity pass.
 *
 * Visual goal (per reference): a floating rounded pill, inset from the
 * screen edges, sitting on the near-black surface with a hairline gold
 * border, where the *selected* item lifts into a solid gold circle that
 * floats above the bar line — not a stock Material `NavigationBar`
 * indicator. Kept as the same public API (`items`/`selectedRoute`/
 * `onItemSelected`) as before so every existing call site is unaffected.
 *
 * Rebuilt on plain Row/Box instead of `NavigationBar` because the raised
 * floating-circle look (icon breaking above the bar's top edge, unselected
 * icons flattened to a muted tone with no visible indicator pill) isn't
 * reachable through `NavigationBarItemDefaults` — it needs a manual
 * per-item offset + shadow.
 */
@Composable
fun SDBottomNavigation(
    items: List<SDNavItem>,
    selectedRoute: String,
    onItemSelected: (SDNavItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp)
                .shadow(elevation = 18.dp, shape = RoundedCornerShape(32.dp), clip = false)
                .clip(RoundedCornerShape(32.dp))
                .background(SmartDoorSurfaceDark.copy(alpha = 0.97f))
                .border(
                    border = BorderStroke(width = 1.dp, color = SmartDoorGlassBorder),
                    shape = RoundedCornerShape(32.dp),
                )
                .padding(horizontal = 8.dp),
            horizontalArrangement = if (items.size <= 1) Arrangement.Center else Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            items.forEach { item ->
                val selected = item.route == selectedRoute
                SDNavSlot(
                    item = item,
                    selected = selected,
                    onClick = { onItemSelected(item) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun SDNavSlot(
    item: SDNavItem,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val lift by animateDpAsState(
        targetValue = if (selected) 18.dp else 0.dp,
        animationSpec = spring(dampingRatio = 0.65f, stiffness = 380f),
        label = "nav_lift",
    )
    val circleColor by animateColorAsState(
        targetValue = if (selected) SmartDoorSecondaryDark else Color.Transparent,
        label = "nav_circle_color",
    )
    val iconTint = if (selected) SmartDoorOnSecondaryDark else SmartDoorOnSurfaceVariantDark
    val interactionSource = remember(item.route) { MutableInteractionSource() }

    Column(
        modifier = modifier.clickable(
            interactionSource = interactionSource,
            indication = null,
            onClick = onClick,
        ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .offset(y = -lift)
                .size(if (selected) 48.dp else 40.dp)
                .then(
                    if (selected) Modifier.shadow(elevation = 10.dp, shape = CircleShape, clip = false)
                    else Modifier,
                )
                .clip(CircleShape)
                .background(circleColor),
            contentAlignment = Alignment.Center,
        ) {
            when {
                item.icon != null -> Icon(
                    imageVector = item.icon,
                    contentDescription = item.label,
                    tint = iconTint,
                    modifier = Modifier.size(if (selected) 22.dp else 20.dp),
                )
                item.iconRes != null -> Icon(
                    painter = painterResource(id = item.iconRes),
                    contentDescription = item.label,
                    tint = iconTint,
                    modifier = Modifier.size(if (selected) 22.dp else 20.dp),
                )
            }
        }
        if (!selected) {
            Text(
                text = item.label,
                style = MaterialTheme.typography.labelSmall,
                color = SmartDoorOnSurfaceVariantDark,
                modifier = Modifier.offset(y = -lift),
            )
        }
    }
}
