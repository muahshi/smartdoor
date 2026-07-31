package `in`.mysmartdoor.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import `in`.mysmartdoor.app.ui.screens.account.AccountScreen
import `in`.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistScreen
import `in`.mysmartdoor.app.ui.screens.callhistory.CallHistoryScreen
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardScreen
import `in`.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen
import `in`.mysmartdoor.app.ui.screens.login.LoginScreen
import `in`.mysmartdoor.app.ui.screens.messages.MessagesScreen
import `in`.mysmartdoor.app.ui.screens.notifications.NotificationsScreen
import `in`.mysmartdoor.app.ui.screens.publicweb.PublicHomeScreen
import `in`.mysmartdoor.app.ui.screens.settings.SettingsScreen
import `in`.mysmartdoor.app.ui.screens.smartplate.QrPreviewScreen
import `in`.mysmartdoor.app.ui.screens.smartplate.SmartPlateScreen
import `in`.mysmartdoor.app.ui.screens.splash.SplashScreen
import `in`.mysmartdoor.app.ui.screens.visitors.VisitorFeedScreen

/**
 * Root navigation graph for the app.
 *
 * Phase A1.4 added [Routes.LOGIN] as a pure presentation-layer screen.
 * Phase A1.5 wired Login to the real verify-pin auth flow, navigating on
 * success to [Routes.DASHBOARD], which at that point was registered with
 * `EmptyStateScreen` as a placeholder ("Dashboard is coming in a later
 * phase") since A1.5's scope was authentication only.
 *
 * Owner Dashboard V1 phase: that placeholder is replaced with the real
 * [DashboardScreen] below. Nothing about how Login navigates here changes —
 * it still just calls `navController.navigate(Routes.DASHBOARD)` — only
 * what's registered at that route changes.
 */
@Composable
fun SmartDoorNavHost(
    navController: NavHostController = rememberNavController(),
    startDestination: String = Routes.SPLASH,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(Routes.SPLASH) {
            SplashScreen(navController)
        }

        composable(Routes.LOGIN) {
            LoginScreen(navController)
        }

        // Phase 8 — PUBLIC ONBOARDING & MARKETING EXPERIENCE: reached only
        // from Login's "New to My Smart Door?" section, never navigated to
        // from Splash. Opens the existing production website for every
        // action (see PublicHomeScreen doc) — no native catalog/commerce.
        composable(Routes.PUBLIC_HOME) {
            PublicHomeScreen(navController)
        }

        // Owner Dashboard V1 — real screen, backed by DashboardViewModel /
        // DashboardRepository. Replaces the earlier EmptyStateScreen placeholder.
        composable(Routes.DASHBOARD) {
            DashboardScreen(navController)
        }

        // Phase 4 — VISITORS V2: real screen, backed by VisitorFeedViewModel /
        // VisitorRepository (reads the existing get_owner_activity_feed RPC).
        composable(Routes.VISITOR_FEED) {
            VisitorFeedScreen(navController)
        }

        // Phase 6 — MESSAGES V2: real screen, backed by MessagesViewModel /
        // MessagesRepository (reads the existing conversations/messages
        // tables — the same backend the website's Inbox tab already uses).
        composable(Routes.MESSAGES) {
            MessagesScreen(navController)
        }

        // Phase 7 — AI RECEPTIONIST V2: real screen, backed by
        // AiReceptionistViewModel / AiReceptionistRepository (reads the
        // existing security_rules status, get_ai_receptionist_insights RPC,
        // and ai_call_screenings — the same backend the website's AI
        // Receptionist surfaces already use).
        composable(Routes.AI_RECEPTIONIST) {
            AiReceptionistScreen(navController)
        }

        // Phase 8 — SETTINGS, ACCOUNT & DEVICE MANAGEMENT: real screens,
        // backed by SettingsViewModel/AccountViewModel + the new
        // SettingsRepository (reads the same users/plates/subscriptions/
        // security_rules tables DashboardRepository already reads, plus
        // notification_preferences read/written for the first time this
        // phase). Replaces the "coming soon" snackbar Dashboard's Settings
        // and Account Quick Actions previously fell through to.
        composable(Routes.SETTINGS) {
            SettingsScreen(navController)
        }

        composable(Routes.ACCOUNT) {
            AccountScreen(navController)
        }

        // Phase 12A — PREMIUM UI REBUILD: full-screen Live Activity feed.
        // Deliberately backed by the same DashboardViewModel Dashboard
        // uses (hiltViewModel() with no explicit graph scoping resolves a
        // new instance per back-stack entry, same as every other screen
        // here) rather than a new ViewModel/repository — the CTO's Phase
        // 12A brief is explicit that this reuses existing data, and
        // DashboardData already carries every field the feed needs (see
        // in.mysmartdoor.app.ui.timeline.buildTimeline).
        composable(Routes.LIVE_ACTIVITY) {
            LiveActivityScreen(navController)
        }

        // Owner Dashboard V1 — remaining Quick Action destinations. All four
        // reuse DashboardViewModel/DashboardRepository exactly like
        // LIVE_ACTIVITY above (same instance-per-back-stack-entry pattern);
        // no new repository, ViewModel, or query for any of them. Replaces
        // the "coming soon" snackbar DashboardScreen previously fell through
        // to for these four Quick Actions.
        composable(Routes.CALL_HISTORY) {
            CallHistoryScreen(navController)
        }

        composable(Routes.NOTIFICATIONS) {
            NotificationsScreen(navController)
        }

        composable(Routes.SMART_PLATE) {
            SmartPlateScreen(navController)
        }

        composable(Routes.QR_PREVIEW) {
            QrPreviewScreen(navController)
        }
    }
}
