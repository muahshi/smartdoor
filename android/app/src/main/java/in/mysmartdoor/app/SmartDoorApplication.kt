package `in`.mysmartdoor.app

import `in`.mysmartdoor.app.core.call.IncomingCallController
import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * Application entry point that bootstraps the Hilt DI graph for the whole app.
 *
 * Phase A1.1: no modules provided yet — this class exists purely to make
 * @HiltAndroidApp available so every future phase (auth, Supabase client,
 * Room DB, WebRTC session manager, etc.) can add a @Module and have it
 * injected without any change to this file or to MainActivity.
 *
 * Phase 12E.13 — NATIVE CALLING EXPERIENCE: Foreground Ringing &
 * Notifications. [IncomingCallController.startListening] is kicked off
 * exactly once here — the single app-wide entry point for the app's one
 * ring-channel subscription (see that class's doc comment for the
 * duplicate-subscription bug this replaces).
 */
@HiltAndroidApp
class SmartDoorApplication : Application() {

    @Inject
    lateinit var incomingCallController: IncomingCallController

    override fun onCreate() {
        super.onCreate()
        incomingCallController.startListening()
    }
}
