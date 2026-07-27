package `in`.mysmartdoor.app.core.common

import android.util.Log
import `in`.mysmartdoor.app.BuildConfig

/**
 * Thin logging façade so the rest of the app never calls android.util.Log
 * (or a third-party logger) directly. Debug/verbose logs are stripped from
 * release builds; error logs always go through so a crash reporter can be
 * hooked in here later (Phase A1.2 does not add one — this is just the seam).
 *
 * Not called anywhere yet — first real usage arrives with the network
 * interceptor / repository layer in a later phase.
 */
object Logger {

    private const val DEFAULT_TAG = "SmartDoor"

    fun d(tag: String = DEFAULT_TAG, message: String) {
        if (BuildConfig.DEBUG) Log.d(tag, message)
    }

    fun i(tag: String = DEFAULT_TAG, message: String) {
        if (BuildConfig.DEBUG) Log.i(tag, message)
    }

    fun w(tag: String = DEFAULT_TAG, message: String, throwable: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.w(tag, message, throwable)
    }

    /** Errors always log, release included — but never log tokens/PII. */
    fun e(tag: String = DEFAULT_TAG, message: String, throwable: Throwable? = null) {
        Log.e(tag, message, throwable)
    }
}
