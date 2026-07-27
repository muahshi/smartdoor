package `in`.mysmartdoor.app.ui.screens.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Generic full-screen loading state. Not wired to any data source yet —
 * future screens show this while a repository call backed by
 * [in.mysmartdoor.app.core.common.Result.Loading] is in flight.
 *
 * Design System phase: same signature/behavior as before — [message] is
 * still optional and this is still just a spinner + text. Only the visual
 * treatment changed: the spinner now renders in the brand gold instead of
 * the M3 default primary color, sized/spaced from the design system's
 * tokens instead of ad hoc dp literals.
 */
@Composable
fun LoadingScreen(
    modifier: Modifier = Modifier,
    message: String? = null,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(
                modifier = Modifier.size(40.dp),
                color = SmartDoorSecondaryDark,
                strokeWidth = 3.dp,
            )
            if (message != null) {
                Box(modifier = Modifier.height(SmartDoorSpacing.md))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun LoadingScreenPreview() {
    SmartDoorTheme {
        LoadingScreen(message = "Loading…")
    }
}
