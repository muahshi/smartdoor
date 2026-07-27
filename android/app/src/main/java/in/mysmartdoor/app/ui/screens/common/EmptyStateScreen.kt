package `in`.mysmartdoor.app.ui.screens.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.theme.SmartDoorPillShape
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Generic full-screen "nothing here yet" state — e.g. Visitor Feed with no
 * visitors, Dashboard with no properties. [actionLabel]/[onAction] are both
 * optional since not every empty state has a call to action.
 *
 * Design System phase: same signature/behavior as before. Visual changes
 * only — a pill glyph mark above the title (a neutral placeholder shape;
 * this is deliberately not a `material-icons-core` icon, see [in.mysmartdoor.app.ui.components.SDTopBar]'s
 * doc comment for why), design-system spacing, and the action button (when
 * present) now renders as [SmartDoorButtonVariant.Secondary] instead of a
 * bare M3 `TextButton`.
 */
@Composable
fun EmptyStateScreen(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Box(
        modifier = modifier.fillMaxSize().padding(SmartDoorSpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(SmartDoorSurfaceVariantDark, SmartDoorPillShape),
            )
            Box(modifier = Modifier.height(SmartDoorSpacing.md))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            if (subtitle != null) {
                Box(modifier = Modifier.height(SmartDoorSpacing.xs))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
            if (actionLabel != null && onAction != null) {
                Box(modifier = Modifier.height(SmartDoorSpacing.lg))
                SmartDoorButton(
                    label = actionLabel,
                    onClick = onAction,
                    variant = SmartDoorButtonVariant.Secondary,
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun EmptyStateScreenPreview() {
    SmartDoorTheme {
        EmptyStateScreen(
            title = "No visitors yet",
            subtitle = "Visitors will show up here once someone scans your QR code.",
        )
    }
}
