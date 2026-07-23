package `in`.mysmartdoor.app.navigation

/**
 * Route string constants for [SmartDoorNavHost].
 *
 * Phase A1.3 only registers a composable for [SPLASH] in the NavHost.
 * [LOGIN], [DASHBOARD], and [VISITOR_FEED] are declared here now purely as
 * the contract for later phases — each one is added to the graph with a
 * single `composable(Routes.X) { XScreen() }` block, without touching this
 * file or the graph's overall structure.
 */
object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val VISITOR_FEED = "visitor_feed"
}
