package `in`.mysmartdoor.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing

/** One labeled bar for [SDBarChart] — e.g. an hour-of-day bucket. */
data class SDBarPoint(
    val label: String,
    val value: Int,
)

/**
 * Animated Canvas bar chart — grows in from zero on first composition, with
 * the tallest bar (the busiest bucket) highlighted in the brand gold and
 * every other bar in a dimmer neutral tone. Built the same plain-[Canvas]
 * way as [SDLineChart] (see that file's doc comment for why no charting
 * library is used).
 *
 * Only every few [points] labels are drawn under the axis to avoid 24
 * overlapping hour labels — same "thin out the labels" approach
 * [SDLineChart] already uses.
 */
@Composable
fun SDBarChart(
    points: List<SDBarPoint>,
    modifier: Modifier = Modifier,
    height: androidx.compose.ui.unit.Dp = 140.dp,
    barColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    highlightColor: Color = SmartDoorSecondaryDark,
) {
    val maxValue = (points.maxOfOrNull { it.value } ?: 0).coerceAtLeast(1)
    val busiestIndex = points.indices.maxByOrNull { points[it].value } ?: -1

    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(durationMillis = SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized),
        label = "sd_bar_chart_reveal",
    )

    Column(modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxWidth().height(height)) {
            if (points.isEmpty()) return@Canvas
            val barGap = 3.dp.toPx()
            val barWidth = (size.width - barGap * (points.size - 1)) / points.size

            points.forEachIndexed { index, point ->
                val barHeight = (point.value.toFloat() / maxValue) * size.height * progress
                val left = index * (barWidth + barGap)
                val top = size.height - barHeight
                val color = if (index == busiestIndex && point.value > 0) highlightColor else barColor
                drawRoundRect(
                    color = color,
                    topLeft = Offset(left, top),
                    size = Size(barWidth, barHeight.coerceAtLeast(0f)),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(3.dp.toPx(), 3.dp.toPx()),
                    style = Fill,
                )
            }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(top = SmartDoorSpacing.xxs)) {
            val step = (points.size / 6).coerceAtLeast(1)
            points.forEachIndexed { i, point ->
                if (i % step == 0 || i == points.lastIndex) {
                    Text(
                        text = point.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
