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
import `in`.mysmartdoor.app.ui.theme.SmartDoorDangerDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorPillShape
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Generic full-screen error state. [message] is expected to come from
 * [in.mysmartdoor.app.core.common.AppError.message] once repository calls
 * are wired to screens; [onRetry] is optional since not every error is
 * retryable (e.g. it's omitted for a hard validation failure).
 *
 * Design System phase: same signature/behavior as before. Visual changes
 * only — a danger-tinted glyph mark above the message, design-system
 * spacing, and [onRetry]'s button now renders as [SmartDoorButton]
 * (Primary variant) instead of a bare M3 `Button`.
 */
@Composable
fun ErrorScreen(
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    Box(
        modifier = modifier.fillMaxSize().padding(SmartDoorSpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(SmartDoorDangerDim, SmartDoorPillShape),
            )
            Box(modifier = Modifier.height(SmartDoorSpacing.md))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            if (onRetry != null) {
                Box(modifier = Modifier.height(SmartDoorSpacing.lg))
                SmartDoorButton(
                    label = "Retry",
                    onClick = onRetry,
                    variant = SmartDoorButtonVariant.Primary,
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ErrorScreenPreview() {
    SmartDoorTheme {
        ErrorScreen(message = "Something went wrong on our end", onRetry = {})
    }
}
