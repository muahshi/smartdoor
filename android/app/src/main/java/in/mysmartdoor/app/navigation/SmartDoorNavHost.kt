package `in`.mysmartdoor.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import `in`.mysmartdoor.app.ui.screens.dashboard.DashboardScreen
import `in`.mysmartdoor.app.ui.screens.login.LoginScreen
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
    }
}
