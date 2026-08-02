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
 * Owner Dashboard V1 phase: [DASHBOARD] itself is registered with the real
 * [in.mysmartdoor.app.ui.screens.dashboard.DashboardScreen].
 *
 * Phase 12E — ANDROID FEATURE COMPLETION PASS: every constant below is now
 * registered in [SmartDoorNavHost] and reachable from a Dashboard Quick
 * Action / bottom-nav item — none fall through to a "coming soon" snackbar
 * anymore. [CALL_HISTORY], [QR_PREVIEW], [SMART_PLATE], and [NOTIFICATIONS]
 * were the last four; each reuses the existing DashboardViewModel /
 * DashboardRepository, same as [LIVE_ACTIVITY] already did.
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

    // Owner Dashboard V1 — Quick Action destinations. All registered in
    // SmartDoorNavHost (see class doc above).
    const val CALL_HISTORY = "call_history"
    const val MESSAGES = "messages"
    const val QR_PREVIEW = "qr_preview"
    const val SMART_PLATE = "smart_plate"
    const val AI_RECEPTIONIST = "ai_receptionist"
    const val SETTINGS = "settings"
    const val NOTIFICATIONS = "notifications"
    const val ACCOUNT = "account"

    // Phase 12A — PREMIUM UI REBUILD. Reached from Dashboard's live-activity
    // pill card (and the bottom nav's Home tab while already on this
    // screen). Backed by the same DashboardViewModel/DashboardRepository
    // DashboardScreen already uses — no new repository, no new query.
    const val LIVE_ACTIVITY = "live_activity"

    // Phase 12E.9 — SMART ANALYTICS. Reached from a Dashboard Quick Action
    // tile and a Profile menu row, same convention as every other
    // Quick-Action destination above. Backed by the new
    // AnalyticsViewModel/AnalyticsRepository (existing tables/RPC only —
    // see AnalyticsRepository's doc comment).
    const val ANALYTICS = "analytics"
}
