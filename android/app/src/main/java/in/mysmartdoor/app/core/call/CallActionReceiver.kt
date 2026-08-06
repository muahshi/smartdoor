package `in`.mysmartdoor.app.core.call

import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.notification.CallNotificationManager
import `in`.mysmartdoor.app.ui.incomingcall.IncomingCallActivity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing & Notifications.
 *
 * Handles the Accept/Reject action buttons on the incoming-call
 * notification built by [CallNotificationManager]:
 *  - Accept: the notification-shade UI can't render the full incoming
 *    call screen itself, so this launches [IncomingCallActivity] with
 *    [IncomingCallActivity.EXTRA_AUTO_ACCEPT] set, which then calls
 *    [IncomingCallController.acceptCall] itself once composed — same
 *    accept path a manual tap on the Accept button uses, nothing
 *    duplicated here.
 *  - Reject: handled entirely here via [IncomingCallController.rejectCall]
 *    — no UI needs to launch for a decline. [goAsync] extends the
 *    receiver's lifetime past `onReceive` returning so the suspend call
 *    can actually complete (a bare `BroadcastReceiver` is otherwise
 *    eligible to be killed the instant `onReceive` returns).
 */
@AndroidEntryPoint
class CallActionReceiver : BroadcastReceiver() {

    @Inject
    lateinit var incomingCallController: IncomingCallController

    @Inject
    lateinit var callNotificationManager: CallNotificationManager

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            CallNotificationManager.ACTION_ACCEPT -> {
                val launchIntent = Intent(context, IncomingCallActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra(IncomingCallActivity.EXTRA_AUTO_ACCEPT, true)
                }
                context.startActivity(launchIntent)
            }

            CallNotificationManager.ACTION_REJECT -> {
                val pendingResult = goAsync()
                CoroutineScope(Dispatchers.Main.immediate).launch {
                    try {
                        incomingCallController.rejectCall()
                        callNotificationManager.cancel()
                    } catch (e: Exception) {
                        Logger.e(message = "[CallActionReceiver] reject action failed", throwable = e)
                    } finally {
                        pendingResult.finish()
                    }
                }
            }

            else -> Unit
        }
    }
}
