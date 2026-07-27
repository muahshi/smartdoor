package `in`.mysmartdoor.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Tonal elevation scale for the dark Premium Black + Gold surface. On a
 * dark scheme, "elevation" is communicated primarily through a lighter
 * surface tint (see [SmartDoorSurfaceVariantDark]) rather than shadow
 * alone — these dp values drive the shadow component of that, used by
 * [in.mysmartdoor.app.ui.components.GlassCard]/[in.mysmartdoor.app.ui.components.SDCard]
 * and other elevated surfaces so every card in the app rises off the
 * background by the same consistent amount.
 */
@Immutable
object SmartDoorElevation {
    /** Flush with the background — chips, list rows, inline dividers. */
    val level0: Dp = 0.dp

    /** Default resting card elevation (SDCard, empty/error/loading states). */
    val level1: Dp = 2.dp

    /** Emphasized cards — GlassCard, stat cards on a dashboard. */
    val level2: Dp = 6.dp

    /** Floating, temporarily-elevated surfaces — dialogs, bottom sheets. */
    val level3: Dp = 12.dp

    /** Highest layer — floating action button. */
    val level4: Dp = 16.dp
}
