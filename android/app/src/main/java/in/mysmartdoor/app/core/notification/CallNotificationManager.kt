package `in`.mysmartdoor.app.core.notification

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.call.CallActionReceiver
import `in`.mysmartdoor.app.core.data.model.CallSession
import `in`.mysmartdoor.app.ui.incomingcall.IncomingCallActivity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing & Notifications.
 *
 * Builds the ongoing, full-screen-intent incoming-call notification and
 * owns the one notification channel it's posted on. Deliberately does
 * NOT attach a channel sound/vibration pattern — [CallRingForegroundService]
 * plays the ringtone and vibration explicitly while it's foregrounded, so
 * the channel is silent to avoid a double-alert. [SmartDoorSecondaryDark]
 * (`#C8963C`, the existing gold brand color — see
 * [in.mysmartdoor.app.ui.theme.Color]) is used as the notification accent
 * color; not imported directly from the Compose theme module here to keep
 * this class free of any Compose dependency, but the literal value is
 * copied verbatim, not invented.
 */
@Singleton
class CallNotificationManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        const val CHANNEL_ID = "incoming_call"
        const val NOTIFICATION_ID = 8801

        const val ACTION_ACCEPT = "in.mysmartdoor.app.action.CALL_ACCEPT"
        const val ACTION_REJECT = "in.mysmartdoor.app.action.CALL_REJECT"
        const val EXTRA_CALL_ID = "extra_call_id"

        /** `#C8963C` — the existing My Smart Door gold brand color (see [in.mysmartdoor.app.ui.theme.Color.SmartDoorSecondaryDark]). */
        private const val BRAND_GOLD = 0xFFC8963C.toInt()
    }

    /** Creates the incoming-call notification channel if it doesn't already exist. Safe to call repeatedly. */
    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.call_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.call_notification_channel_description)
            setSound(null, null) // CallRingForegroundService plays the ringtone explicitly.
            enableVibration(false) // ditto — service handles vibration.
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    /** Builds the ongoing, full-screen-intent notification for [session] (must be [in.mysmartdoor.app.core.data.model.CallPhase.INCOMING]). */
    fun buildIncomingCallNotification(session: CallSession): Notification {
        ensureChannel()

        val fullScreenIntent = Intent(context, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_CALL_ID, session.callId)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            0,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val acceptPendingIntent = PendingIntent.getBroadcast(
            context,
            1,
            Intent(context, CallActionReceiver::class.java).apply {
                action = ACTION_ACCEPT
                putExtra(EXTRA_CALL_ID, session.callId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val rejectPendingIntent = PendingIntent.getBroadcast(
            context,
            2,
            Intent(context, CallActionReceiver::class.java).apply {
                action = ACTION_REJECT
                putExtra(EXTRA_CALL_ID, session.callId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val callerLabel = session.callerName ?: context.getString(R.string.call_notification_default_caller)

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_GOLD)
            .setContentTitle(context.getString(R.string.call_notification_title))
            .setContentText(callerLabel)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(0, context.getString(R.string.call_notification_reject), rejectPendingIntent)
            .addAction(0, context.getString(R.string.call_notification_accept), acceptPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    /** Cancels the incoming-call notification. Safe to call when none is showing. */
    fun cancel() {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
}
