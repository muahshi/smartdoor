package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorElevation
import `in`.mysmartdoor.app.ui.theme.SmartDoorGlassBorder
import `in`.mysmartdoor.app.ui.theme.SmartDoorGlassHighlight
import `in`.mysmartdoor.app.ui.theme.SmartDoorGlassSurface
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing

/**
 * The premium glassmorphism container the design system is built around —
 * a translucent surface with a hairline gold-tinted border and a faint top
 * highlight, meant to sit over the dark navy background (and, later, over
 * imagery/gradients) the way a frosted-glass panel would.
 *
 * Note on "blur": this renders the frosted look via translucency + border +
 * highlight, matching the web app's `.glass-card` treatment
 * (`css/styles.css`). It does not apply a live Gaussian blur to whatever
 * renders *behind* it — Compose's `Modifier.blur` blurs the modified
 * composable's own content, not its background, and a true backdrop blur
 * needs a `RenderEffect` capture of sibling content (API 31+ only). That's
 * a legitimate follow-on enhancement, not implemented here to avoid a
 * two-tier visual (blurred on newer devices, flat on older ones) inside
 * the foundation phase.
 *
 * This is the "hero" card style — reach for [SDCard] instead for ordinary
 * list rows/content cards where a plain elevated surface is more
 * appropriate and a translucent tint would hurt legibility.
 *
 * [content] receives no padding by default beyond [contentPadding] — callers
 * lay out their own content, same pattern as M3's `Card`.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(20.dp),
    contentPadding: PaddingValues = PaddingValues(SmartDoorSpacing.md),
    elevation: Dp = SmartDoorElevation.level2,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .shadow(elevation = elevation, shape = shape, clip = false)
            .clip(shape)
            .background(SmartDoorGlassSurface)
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(SmartDoorGlassHighlight, Color.Transparent),
                ),
                shape = shape,
            )
            .border(width = 1.dp, color = SmartDoorGlassBorder, shape = shape)
            .padding(contentPadding),
    ) {
        content()
    }
}
