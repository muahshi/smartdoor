package `in`.mysmartdoor.app.core.common

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/**
 * Opens a URL on the existing production website (mysmartdoor.in) in the
 * device's default browser via a plain `ACTION_VIEW` [Intent] — no
 * Custom Tabs, no WebView, no new Gradle dependency, per CTO decision for
 * Phase 8 (Public Onboarding & Marketing Experience).
 *
 * Used exclusively by the app's Public/prospective-customer entry points —
 * [in.mysmartdoor.app.ui.screens.login.LoginScreen]'s "New to My Smart
 * Door?" section and [in.mysmartdoor.app.ui.screens.publicweb.PublicHomeScreen] —
 * to reuse the existing commerce/marketing website rather than rebuilding
 * any of it natively. See [in.mysmartdoor.app.core.config.PublicWebLinks]
 * for the URLs themselves.
 */
@Composable
fun rememberWebLinkLauncher(): (String) -> Unit {
    val context = LocalContext.current
    return { url ->
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            // No app on the device can handle a web Intent — nothing else
            // this action can do, so no-op rather than crash.
        }
    }
}
