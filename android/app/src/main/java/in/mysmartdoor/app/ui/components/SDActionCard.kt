package `in`.mysmartdoor.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarningDim
import kotlinx.coroutines.launch

/**
 * Visual weight of an [SDActionCard]. [Featured] is for the single most
 * important action in a group (e.g. the primary CTA in an explore list) —
 * a solid gold icon chip on a [GlassCard] surface. [Standard] is for every
 * other action in the same group — a dimmer gold icon chip on an [SDCard]
 * surface, so the featured action reads as the obvious first tap without
 * a second color being introduced.
 */
enum class SDActionCardEmphasis { Featured, Standard }

/**
 * A single tappable "explore" action — icon chip, title, optional one-line
 * subtitle, and a trailing chevron — replacing a plain list button with a
 * self-contained premium card. Built entirely from existing design-system
 * primitives ([GlassCard]/[SDCard], [SmartDoorSpacing]/[SmartDoorMotion],
 * brand colors) — no new colors, no new shapes.
 *
 * Used by the Login screen's "New to My Smart Door?" section and by
 * [in.mysmartdoor.app.ui.screens.publicweb.PublicHomeScreen] so both
 * surfaces present the same set of actions the same premium way instead of
 * a stacked list of buttons.
 */
@Composable
fun SDActionCard(
    title: String,
    iconRes: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    emphasis: SDActionCardEmphasis = SDActionCardEmphasis.Standard,
) {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    val interactionSource = remember { MutableInteractionSource() }

    val pressableModifier = modifier
        .fillMaxWidth()
        .scale(scale.value)
        .clickable(
            interactionSource = interactionSource,
            indication = null,
        ) {
            scope.launch {
                scale.animateTo(0.97f, tween(SmartDoorMotion.durationShort, easing = SmartDoorMotion.standard))
                scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
            }
            onClick()
        }

    val row: @Composable () -> Unit = {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val chipTint = if (emphasis == SDActionCardEmphasis.Featured) {
                SmartDoorSecondaryDark.copy(alpha = 0.28f)
            } else {
                SmartDoorWarningDim
            }
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(chipTint),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(id = iconRes),
                    contentDescription = null,
                    tint = SmartDoorSecondaryDark,
                    modifier = Modifier.size(22.dp),
                )
            }

            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = SmartDoorOnSurfaceVariantDark,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))

            Icon(
                painter = painterResource(id = R.drawable.ic_chevron_right),
                contentDescription = null,
                tint = Color(0x80FFFFFF),
                modifier = Modifier.size(18.dp),
            )
        }
    }

    if (emphasis == SDActionCardEmphasis.Featured) {
        GlassCard(
            modifier = pressableModifier,
            shape = RoundedCornerShape(16.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = SmartDoorSpacing.md,
                vertical = SmartDoorSpacing.sm,
            ),
        ) { row() }
    } else {
        SDCard(
            modifier = pressableModifier,
            shape = RoundedCornerShape(16.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = SmartDoorSpacing.md,
                vertical = SmartDoorSpacing.sm,
            ),
        ) { row() }
    }
}
