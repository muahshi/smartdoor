package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorElevation
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing

/**
 * The default, everyday content card — an ordinary opaque elevated
 * surface (list rows, form sections, grouped settings). This is the
 * workhorse card; reach for [GlassCard] instead only for hero/emphasis
 * surfaces where the translucent premium treatment earns its keep.
 *
 * Wraps M3 [Card] rather than reinventing it, so it inherits standard
 * ripple/state-layer behavior for free — this exists to fix the "12 raw
 * `Card(...)` calls with no shared component" problem in
 * `DashboardScreen`, not to replace Material's card mechanics.
 */
@Composable
fun SDCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = MaterialTheme.shapes.large,
    elevation: Dp = SmartDoorElevation.level1,
    contentPadding: PaddingValues = PaddingValues(SmartDoorSpacing.md),
    content: @Composable () -> Unit,
) {
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier,
            shape = shape,
            colors = CardDefaults.cardColors(),
            elevation = CardDefaults.cardElevation(defaultElevation = elevation),
        ) {
            Box(modifier = Modifier.padding(contentPadding)) {
                content()
            }
        }
    } else {
        Card(
            modifier = modifier,
            shape = shape,
            colors = CardDefaults.cardColors(),
            elevation = CardDefaults.cardElevation(defaultElevation = elevation),
        ) {
            Box(modifier = Modifier.padding(contentPadding)) {
                content()
            }
        }
    }
}
