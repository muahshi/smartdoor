package `in`.mysmartdoor.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Single activity for Phase A1.1.
 *
 * No navigation graph yet — this just renders a placeholder screen inside
 * the Material 3 theme, proving Compose + Hilt + theming are wired
 * correctly end to end. In a later phase this becomes the NavHost
 * container once Navigation-Compose is introduced.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SmartDoorTheme {
                SmartDoorScaffoldPlaceholder()
            }
        }
    }
}

@Composable
private fun SmartDoorScaffoldPlaceholder() {
    Scaffold { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "SmartDoor — Project Scaffold Ready",
                style = MaterialTheme.typography.titleMedium
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun SmartDoorScaffoldPlaceholderPreview() {
    SmartDoorTheme {
        SmartDoorScaffoldPlaceholder()
    }
}
