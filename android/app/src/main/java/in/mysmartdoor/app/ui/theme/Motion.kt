package `in`.mysmartdoor.app.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.runtime.Immutable

/**
 * Motion system: durations + easing curves every animation in the app
 * should be built from, so transitions feel like one consistent product
 * instead of each screen picking its own numbers.
 *
 * Durations follow Material 3's duration scale. Easing curves are the
 * standard M3 easing set (emphasized / standard / legacy-decelerate), kept
 * here as plain [CubicBezierEasing] rather than pulling in
 * `androidx.compose.material3.MotionScheme` — the latter is a Material 3
 * Expressive API not available on the Compose BOM this app currently
 * targets (this phase intentionally does not bump the BOM).
 *
 * Usage guidelines:
 * - [emphasized] for anything drawing attention to itself entering/leaving
 *   the screen (dialogs, FAB expand, skeleton→content swap).
 * - [standard] for everyday state changes (card press, chip select).
 * - Prefer [durationMedium] as the default; drop to [durationShort] for
 *   small/local changes (a chip toggling) and up to [durationLong] only for
 *   full-screen transitions.
 */
@Immutable
object SmartDoorMotion {
    const val durationShort = 150
    const val durationMedium = 300
    const val durationLong = 500

    /** Shimmer loop duration for [in.mysmartdoor.app.ui.components.SDSkeletonLoader]. */
    const val durationShimmer = 1200

    val standard: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val emphasized: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
    val decelerate: Easing = CubicBezierEasing(0f, 0f, 0f, 1f)
}
