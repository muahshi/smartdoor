package `in`.mysmartdoor.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import dagger.hilt.android.AndroidEntryPoint
import `in`.mysmartdoor.app.navigation.SmartDoorNavHost
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * Single activity for the whole app. Phase A1.1 rendered a static
 * placeholder Scaffold here to prove Compose + Hilt + theming worked
 * end to end; Phase A1.3 replaces that placeholder with the real
 * navigation graph ([SmartDoorNavHost]). No other change to this file —
 * it stays a thin host for the theme + nav graph and picks up new
 * screens automatically as they're added to the graph in later phases.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SmartDoorTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    SmartDoorNavHost()
                }
            }
        }
    }
}
