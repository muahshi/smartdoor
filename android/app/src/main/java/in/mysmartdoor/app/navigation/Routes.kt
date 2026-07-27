package `in`.mysmartdoor.app.navigation

/**
 * Route string constants for [SmartDoorNavHost].
 *
 * Phase A1.3 only registers a composable for [SPLASH] in the NavHost.
 * [LOGIN], [DASHBOARD], and [VISITOR_FEED] are declared here now purely as
 * the contract for later phases — each one is added to the graph with a
 * single `composable(Routes.X) { XScreen() }` block, without touching this
 * file or the graph's overall structure.
 *
 * Owner Dashboard V1 phase: [DASHBOARD] itself is now registered with the
 * real [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen]. Its Quick
 * Actions each need a destination contract, so the remaining constants
 * below are added the same way [VISITOR_FEED] already was — declared here,
 * not yet registered in the NavHost, and not yet navigated to (the
 * Dashboard's Quick Action buttons show a "coming soon" snackbar instead
 * of navigating to an unregistered route). Each one is future-roadmap
 * scope (Visitor Timeline, Messaging, AI Receptionist config, etc.).
 */
object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val VISITOR_FEED = "visitor_feed"

    // Phase 8 — PUBLIC ONBOARDING & MARKETING EXPERIENCE. Entry point for
    // prospective customers who don't own a Smart Door yet. Reached only
    // from Login's "New to My Smart Door?" section (see LoginScreen) —
    // explicitly NOT the app's start destination; Splash still only ever
    // resolves to DASHBOARD or LOGIN. No other future-module routes are
    // declared here per CTO decision — only what this phase registers.
    const val PUBLIC_HOME = "public_home"

    // Owner Dashboard V1 — Quick Action destination contracts only; no
    // composable registered yet, see class doc above.
    const val CALL_HISTORY = "call_history"
    const val MESSAGES = "messages"
    const val QR_PREVIEW = "qr_preview"
    const val SMART_PLATE = "smart_plate"
    const val AI_RECEPTIONIST = "ai_receptionist"
    const val SETTINGS = "settings"
    const val NOTIFICATIONS = "notifications"
    const val ACCOUNT = "account"
}
