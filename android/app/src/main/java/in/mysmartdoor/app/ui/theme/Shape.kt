package `in`.mysmartdoor.app.ui.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// Design System phase: added extraSmall/extraLarge (M3 provides both but
// the original A1.1 scale only defined small/medium/large) plus two
// design-system-only shapes used outside the M3 [Shapes] slot — [Pill] for
// chips/badges/gold buttons and [None] for edge-to-edge media inside cards.
// small/medium/large keep their exact original values.
val Shapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

/** Fully rounded — SDChip, SDBadge, SDAvatar, pill-style buttons. */
val SmartDoorPillShape = CircleShape

/** Square-cornered — used where a card's content should bleed to the edge. */
val SmartDoorNoShape = RoundedCornerShape(0.dp)
