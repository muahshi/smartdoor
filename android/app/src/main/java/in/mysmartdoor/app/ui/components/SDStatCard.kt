package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess

/** Direction of the optional trend indicator on [SDStatCard]. */
enum class SDStatTrend { Up, Down, Flat }

/**
 * A single at-a-glance metric card — "Visitors Today: 12", "Pending
 * Approvals: 3" — the kind of tile a dashboard's summary row is made of.
 * Built on [SDCard] so it inherits the same elevation/shape as every other
 * content card; this is a content pattern, not a new surface type.
 *
 * [trend]/[trendLabel] are both optional — most stat cards won't show a
 * trend (e.g. a static "Plate ID" tile), only ones tracking a metric over
 * time will.
 */
@Composable
fun SDStatCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    trend: SDStatTrend? = null,
    trendLabel: String? = null,
) {
    SDCard(modifier = modifier) {
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (trend != null && trendLabel != null) {
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Row {
                    Text(
                        text = when (trend) {
                            SDStatTrend.Up -> "▲"
                            SDStatTrend.Down -> "▼"
                            SDStatTrend.Flat -> "▬"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = when (trend) {
                            SDStatTrend.Up -> SmartDoorSuccess
                            SDStatTrend.Down -> SmartDoorDanger
                            SDStatTrend.Flat -> SmartDoorSecondaryDark
                        },
                    )
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                    Text(
                        text = trendLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
