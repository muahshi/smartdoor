package `in`.mysmartdoor.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing

/** One named series of values for [SDLineChart] — e.g. "Visitors", "Calls". */
data class SDLineSeries(
    val label: String,
    val values: List<Float>,
    val color: Color,
)

/**
 * Animated Canvas line chart — multi-series, gradient fill under the first
 * series, wipe-in reveal on first composition. Built from scratch on plain
 * Compose [Canvas] rather than a charting library: no chart dependency
 * exists anywhere in this app's `build.gradle` (confirmed before writing
 * this), and adding one mid-phase would be an unverified-dependency risk
 * this codebase's own conventions already avoid (see
 * [in.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistScreen]'s
 * `ConfidenceRing`, built the same way for the same reason).
 *
 * All [series] are expected to share the same [xLabels] length. Renders
 * nothing (a flat baseline) gracefully when every value is zero — callers
 * decide whether to show this at all vs. an empty state.
 */
@Composable
fun SDLineChart(
    series: List<SDLineSeries>,
    xLabels: List<String>,
    modifier: Modifier = Modifier,
    height: androidx.compose.ui.unit.Dp = 160.dp,
) {
    val maxValue = (series.maxOfOrNull { s -> s.values.maxOrNull() ?: 0f } ?: 0f).coerceAtLeast(1f)

    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(durationMillis = SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized),
        label = "sd_line_chart_reveal",
    )

    Column(modifier = modifier) {
        if (series.size > 1) {
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.xs)) {
                series.forEach { s ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(end = SmartDoorSpacing.sm),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(s.color),
                        )
                        Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                        Text(text = s.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        Canvas(modifier = Modifier.fillMaxWidth().height(height)) {
            val pointCount = xLabels.size
            if (pointCount < 2) return@Canvas
            val stepX = size.width / (pointCount - 1)

            series.forEachIndexed { index, s ->
                val points = s.values.mapIndexed { i, value ->
                    Offset(x = i * stepX, y = size.height - (value / maxValue) * size.height * progress)
                }

                if (index == 0) {
                    val fillPath = androidx.compose.ui.graphics.Path().apply {
                        moveTo(points.first().x, size.height)
                        points.forEach { lineTo(it.x, it.y) }
                        lineTo(points.last().x, size.height)
                        close()
                    }
                    drawPath(
                        path = fillPath,
                        brush = Brush.verticalGradient(
                            colors = listOf(s.color.copy(alpha = 0.28f), Color.Transparent),
                        ),
                    )
                }

                val linePath = androidx.compose.ui.graphics.Path().apply {
                    points.forEachIndexed { i, point ->
                        if (i == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
                    }
                }
                drawPath(
                    path = linePath,
                    color = s.color,
                    style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round),
                )

                points.forEach { point ->
                    drawCircle(color = s.color, radius = 3.dp.toPx(), center = point)
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(top = SmartDoorSpacing.xxs)) {
            val step = (xLabels.size / 5).coerceAtLeast(1)
            xLabels.forEachIndexed { i, label ->
                if (i % step == 0 || i == xLabels.lastIndex) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
