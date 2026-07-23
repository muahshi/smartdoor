package `in`.mysmartdoor.app.ui.screens.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Generic full-screen loading state. Not wired to any data source yet —
 * future screens show this while a repository call backed by
 * [in.mysmartdoor.app.core.common.Result.Loading] is in flight.
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
            CircularProgressIndicator()
            if (message != null) {
                Box(modifier = Modifier.height(16.dp))
                Text(text = message, style = MaterialTheme.typography.bodyMedium)
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
