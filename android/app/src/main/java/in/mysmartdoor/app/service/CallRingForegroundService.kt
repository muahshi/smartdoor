package `in`.mysmartdoor.app.service

import `in`.mysmartdoor.app.core.call.IncomingCallController
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.core.notification.CallNotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing & Notifications.
 *
 * Keeps the incoming-call notification alive (`startForeground`) and
 * plays the ringtone + vibration while [IncomingCallController.session] is
 * [CallPhase.INCOMING]. Started (never bound) by
 * [IncomingCallController] the instant an offer arrives; stops itself the
 * moment the session leaves [CallPhase.INCOMING] for ANY reason —
 * accepted, declined, missed (ring timeout), or claimed by a sibling
 * device — so there is exactly one lifecycle path for "ringing has ended"
 * regardless of which of those four causes it. [IncomingCallController]
 * never calls `stopService`/`stopSelf` itself; this service reactively
 * tears itself down by observing the same [IncomingCallController.session]
 * StateFlow both it and every call UI already observe — no second source
 * of truth.
 */
@AndroidEntryPoint
class CallRingForegroundService : Service() {

    @Inject
    lateinit var incomingCallController: IncomingCallController

    @Inject
    lateinit var callNotificationManager: CallNotificationManager

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var sessionWatchJob: Job? = null
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        callNotificationManager.ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val session = incomingCallController.session.value
        if (session.phase != CallPhase.INCOMING) {
            // Session already resolved before the service finished starting
            // (e.g. instantly claimed by a sibling device) — nothing to ring for.
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = callNotificationManager.buildIncomingCallNotification(session)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(CallNotificationManager.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
            } else {
                startForeground(CallNotificationManager.NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Logger.e(message = "[CallRingForegroundService] startForeground failed", throwable = e)
            stopSelf()
            return START_NOT_STICKY
        }

        startRinging()
        observeSession()
        return START_NOT_STICKY
    }

    private fun observeSession() {
        sessionWatchJob?.cancel()
        sessionWatchJob = serviceScope.launch {
            incomingCallController.session.collect { session ->
                if (session.phase != CallPhase.INCOMING) {
                    stopRinging()
                    callNotificationManager.cancel()
                    stopSelf()
                }
            }
        }
    }

    private fun startRinging() {
        try {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
            ringtone = uri?.let { RingtoneManager.getRingtone(this, it) }?.apply { play() }
        } catch (e: Exception) {
            Logger.e(message = "[CallRingForegroundService] ringtone playback failed", throwable = e)
        }

        try {
            vibrator = (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.apply {
                val pattern = longArrayOf(0, 800, 600)
                vibrate(VibrationEffect.createWaveform(pattern, 0))
            }
        } catch (e: Exception) {
            Logger.e(message = "[CallRingForegroundService] vibration failed", throwable = e)
        }
    }

    private fun stopRinging() {
        runCatching { ringtone?.stop() }
        ringtone = null
        runCatching { vibrator?.cancel() }
        vibrator = null
    }

    override fun onDestroy() {
        super.onDestroy()
        sessionWatchJob?.cancel()
        stopRinging()
        serviceScope.cancel()
    }
}
