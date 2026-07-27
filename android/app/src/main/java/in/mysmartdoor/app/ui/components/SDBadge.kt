package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorDangerDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfo
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfoDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorPillShape
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccessDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarning
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarningDim

/**
 * Semantic status a [SDBadge] communicates — e.g. a visitor's
 * approved/pending/denied state, a call's answered/missed state, a plate's
 * active/inactive state. Colors are the same success/warning/danger/info
 * set the production web app already uses (`css/styles.css`).
 */
enum class SDBadgeStatus {
    Success, Warning, Danger, Info, Neutral,
}

/**
 * Small pill-shaped status label — "Approved", "Pending", "3 new", etc.
 * Purely presentational; callers decide what text/status maps to what
 * business state.
 */
@Composable
fun SDBadge(
    text: String,
    modifier: Modifier = Modifier,
    status: SDBadgeStatus = SDBadgeStatus.Neutral,
) {
    val (containerColor, contentColor) = when (status) {
        SDBadgeStatus.Success -> SmartDoorSuccessDim to SmartDoorSuccess
        SDBadgeStatus.Warning -> SmartDoorWarningDim to SmartDoorWarning
        SDBadgeStatus.Danger -> SmartDoorDangerDim to SmartDoorDanger
        SDBadgeStatus.Info -> SmartDoorInfoDim to SmartDoorInfo
        SDBadgeStatus.Neutral -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }

    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = contentColor,
        modifier = modifier
            .background(color = containerColor, shape = SmartDoorPillShape)
            .padding(horizontal = SmartDoorSpacing.xs, vertical = SmartDoorSpacing.xxs),
    )
}
