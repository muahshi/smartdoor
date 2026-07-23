package `in`.mysmartdoor.app.ui.screens.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Generic full-screen "nothing here yet" state — e.g. Visitor Feed with no
 * visitors, Dashboard with no properties. [actionLabel]/[onAction] are both
 * optional since not every empty state has a call to action.
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
        modifier = modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            if (subtitle != null) {
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
            if (actionLabel != null && onAction != null) {
                Box(modifier = Modifier.height(16.dp))
                TextButton(onClick = onAction) {
                    Text(text = actionLabel)
                }
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
