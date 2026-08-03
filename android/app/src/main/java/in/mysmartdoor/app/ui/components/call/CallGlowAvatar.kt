package `in`.mysmartdoor.app.ui.components.call

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorPillShape
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * Large caller identity glyph with a pulsing gold glow ring and an
 * outward "sonar" wave — the premium call-screen equivalent of
 * [in.mysmartdoor.app.ui.components.SDAvatar] (initials-only, same reason:
 * no image-loading library in this project yet — see that component's
 * doc comment).
 *
 * [isActive] controls whether the glow/wave animate (ringing/connecting)
 * or sit static (an already-connected call, where a constantly pulsing
 * avatar would be distracting rather than communicative).
 */
@Composable
fun CallGlowAvatar(
    name: String?,
    modifier: Modifier = Modifier,
    size: Dp = 140.dp,
    isActive: Boolean = true,
) {
    val initials = remember(name) {
        name?.trim()
            ?.split(Regex("\\s+"))
            ?.filter { it.isNotEmpty() }
            ?.take(2)
            ?.joinToString("") { it.first().uppercase() }
            ?.ifEmpty { "?" } ?: "?"
    }

    val transition = rememberInfiniteTransition(label = "callGlow")

    val pulseScale by transition.animateFloat(
        initialValue = 1f,
        targetValue = if (isActive) 1.08f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseScale",
    )

    val waveProgress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "waveProgress",
    )

    Box(modifier = modifier.size(size * 1.8f), contentAlignment = Alignment.Center) {
        if (isActive) {
            Canvas(modifier = Modifier.size(size * 1.8f)) {
                val maxRadius = this.size.minDimension / 2f
                val radius = maxRadius * (0.55f + waveProgress * 0.45f)
                val alpha = (1f - waveProgress).coerceIn(0f, 1f) * 0.5f
                drawCircle(
                    color = SmartDoorSecondaryDark.copy(alpha = alpha),
                    radius = radius,
                    center = Offset(this.size.width / 2f, this.size.height / 2f),
                    style = Stroke(width = 2.dp.toPx()),
                )
            }
        }

        Box(
            modifier = Modifier
                .size(size)
                .scale(if (isActive) pulseScale else 1f)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            SmartDoorSecondaryDark.copy(alpha = 0.35f),
                            Color.Transparent,
                        ),
                    ),
                    shape = SmartDoorPillShape,
                ),
        )

        Box(
            modifier = Modifier
                .size(size * 0.78f)
                .background(color = SmartDoorSecondaryDark, shape = SmartDoorPillShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initials,
                style = MaterialTheme.typography.displaySmall,
                color = SmartDoorOnSecondaryDark,
            )
        }
    }
}
