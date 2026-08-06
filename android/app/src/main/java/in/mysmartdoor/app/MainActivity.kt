package `in`.mysmartdoor.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
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
 *
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing &
 * Notifications. [notificationPermissionLauncher]/[requestNotificationPermissionIfNeeded]
 * request POST_NOTIFICATIONS (API 33+ only — the permission doesn't exist
 * on older OS versions and posting notifications there needs no runtime
 * grant) so the incoming-call notification
 * [in.mysmartdoor.app.core.notification.CallNotificationManager] builds
 * can actually be shown. Declining it doesn't break calling itself — the
 * app-wide ring listener and [in.mysmartdoor.app.service.CallRingForegroundService]
 * still run either way; only the visible notification/full-screen intent
 * is affected, same as the OS's built-in Phone app on a denied grant. No
 * other change to this file's existing startup flow.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op either way — see class doc */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        requestNotificationPermissionIfNeeded()
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

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val alreadyGranted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!alreadyGranted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
