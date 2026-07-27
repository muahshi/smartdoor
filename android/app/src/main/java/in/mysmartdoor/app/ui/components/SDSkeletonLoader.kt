package `in`.mysmartdoor.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark

/**
 * A single shimmering placeholder block — the content-shaped rectangle
 * shown in place of real content while it loads (replaces a bare
 * [androidx.compose.material3.CircularProgressIndicator] with a shape that
 * previews the coming layout, matching what `DashboardScreen`'s bespoke
 * `DashboardSkeleton` already does today, generalized into a reusable
 * primitive other screens can build their own skeletons from).
 */
@Composable
fun SDSkeletonLoader(
    modifier: Modifier = Modifier,
    height: Dp = 16.dp,
    shape: Shape = RoundedCornerShape(6.dp),
) {
    val transition = rememberInfiniteTransition(label = "sd_skeleton_shimmer")
    val shimmerProgress by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = SmartDoorMotion.durationShimmer,
                easing = LinearEasing,
            ),
            repeatMode = RepeatMode.Restart,
        ),
        label = "sd_skeleton_shimmer_progress",
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(
            SmartDoorSurfaceVariantDark,
            SmartDoorSurfaceVariantDark.copy(alpha = 0.4f),
            SmartDoorSurfaceVariantDark,
        ),
        start = Offset(shimmerProgress * 400f, 0f),
        end = Offset(shimmerProgress * 400f + 400f, 400f),
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .background(shimmerBrush),
    )
}

/**
 * A stack of [SDSkeletonLoader] rows — the common case of "N placeholder
 * lines while a list/card is loading".
 */
@Composable
fun SDSkeletonLoaderGroup(
    modifier: Modifier = Modifier,
    lineCount: Int = 3,
    lineHeight: Dp = 16.dp,
) {
    Column(modifier = modifier) {
        repeat(lineCount) { index ->
            SDSkeletonLoader(height = lineHeight)
            if (index != lineCount - 1) {
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
            }
        }
    }
}
