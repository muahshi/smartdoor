package `in`.mysmartdoor.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Application entry point that bootstraps the Hilt DI graph for the whole app.
 *
 * Phase A1.1: no modules provided yet — this class exists purely to make
 * @HiltAndroidApp available so every future phase (auth, Supabase client,
 * Room DB, WebRTC session manager, etc.) can add a @Module and have it
 * injected without any change to this file or to MainActivity.
 */
@HiltAndroidApp
class SmartDoorApplication : Application()
