package `in`.mysmartdoor.app.ui.incomingcall

import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.screens.call.CallScreen
import `in`.mysmartdoor.app.ui.screens.call.CallViewModel
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint

/**
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing & Notifications.
 *
 * Full-screen incoming-call UI launched either by
 * [in.mysmartdoor.app.core.notification.CallNotificationManager]'s
 * full-screen intent (rings while the device is locked/backgrounded) or
 * by [in.mysmartdoor.app.core.call.CallActionReceiver] when the owner taps
 * "Accept" directly from the notification shade (with
 * [EXTRA_AUTO_ACCEPT] set, so the call is accepted the instant this
 * Activity's [CallViewModel] observes the INCOMING state — no separate
 * accept path, no duplicated business logic).
 *
 * Deliberately a *second* Activity rather than routing through
 * [in.mysmartdoor.app.MainActivity]'s existing [in.mysmartdoor.app.navigation.SmartDoorNavHost]:
 * a full-screen-intent notification needs an Activity that can be shown
 * over the lock screen ([setShowWhenLocked]) and turn the screen on
 * ([setTurnScreenOn]) independent of whatever back stack MainActivity's
 * single-Activity nav graph currently holds — launching MainActivity
 * itself for this would either disrupt that back stack or require new
 * flags/logic on a screen this phase was told not to touch. This
 * Activity's own content is a *single*-destination [NavHost] hosting the
 * exact same [CallScreen] MainActivity's graph uses at
 * [Routes.CALL] — the UI itself is 100% reused, per the CTO brief.
 *
 * [CallViewModel] here is backed by the same app-wide
 * [in.mysmartdoor.app.core.call.IncomingCallController] singleton every
 * other [CallViewModel] instance is, so this Activity always reflects
 * whatever the real call state is — including a call already answered
 * from a different entry point — with no extra wiring.
 */
@AndroidEntryPoint
class IncomingCallActivity : ComponentActivity() {

    companion object {
        const val EXTRA_AUTO_ACCEPT = "extra_auto_accept"
        const val EXTRA_CALL_ID = "extra_call_id"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            )
        }
        (getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.requestDismissKeyguard(this, null)

        val autoAccept = intent?.getBooleanExtra(EXTRA_AUTO_ACCEPT, false) ?: false

        setContent {
            SmartDoorTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    val navController = rememberNavController()
                    val viewModel: CallViewModel = hiltViewModel()
                    val uiState by viewModel.uiState.collectAsState()

                    var callWasActive by remember { mutableStateOf(false) }
                    var autoAcceptTriggered by remember { mutableStateOf(false) }

                    LaunchedEffect(uiState.session.phase) {
                        val phase = uiState.session.phase
                        if (phase != CallPhase.IDLE) callWasActive = true

                        if (autoAccept && phase == CallPhase.INCOMING && !autoAcceptTriggered) {
                            autoAcceptTriggered = true
                            viewModel.acceptCall()
                        }

                        // Finish once the call this Activity was launched for has run its
                        // full course and CallScreen's "Done" button reset the controller
                        // back to IDLE. Guarded by callWasActive so the *initial* IDLE
                        // frame (before any offer has been observed yet) never finishes
                        // this Activity immediately after launch.
                        if (callWasActive && phase == CallPhase.IDLE) {
                            finish()
                        }
                    }

                    NavHost(navController = navController, startDestination = Routes.CALL) {
                        composable(Routes.CALL) {
                            CallScreen(navController = navController, viewModel = viewModel)
                        }
                    }
                }
            }
        }
    }
}
