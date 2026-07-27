package `in`.mysmartdoor.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Design-system spacing scale. Every screen/component should reach for one
 * of these instead of an inline `.dp` literal, so paddings/gaps stay
 * consistent across the app instead of drifting screen-by-screen (the
 * problem the pre-design-system code had — raw `8.dp`/`16.dp`/`24.dp`
 * sprinkled ad hoc in Login/Dashboard).
 *
 * Steps follow a 4dp base grid, matching Material 3 guidance.
 */
@Immutable
object SmartDoorSpacing {
    val none: Dp = 0.dp
    val xxs: Dp = 4.dp
    val xs: Dp = 8.dp
    val sm: Dp = 12.dp
    val md: Dp = 16.dp
    val lg: Dp = 24.dp
    val xl: Dp = 32.dp
    val xxl: Dp = 48.dp
}
