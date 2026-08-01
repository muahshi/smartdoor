package `in`.mysmartdoor.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
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
 *
 * Phase 12E.2 — PREMIUM APP IDENTITY, Task 2: [installSplashScreen] wires
 * up the official Android 12+ SplashScreen API (`Theme.SmartDoor.Starting`
 * in the manifest — black background, new launcher icon). It must be
 * called before `super.onCreate()`. Left on its default dismiss behavior
 * (exits once the first frame is drawn) — Routes.SPLASH's own Premium
 * Compose splash ([in.mysmartdoor.app.ui.screens.splash.SplashScreen])
 * is that first frame, so the two hand off seamlessly with no gap and no
 * extra `keepOnScreenCondition` needed.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
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
