package `in`.mysmartdoor.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import `in`.mysmartdoor.app.ui.screens.common.EmptyStateScreen
import `in`.mysmartdoor.app.ui.screens.login.LoginScreen
import `in`.mysmartdoor.app.ui.screens.splash.SplashScreen

/**
 * Root navigation graph for the app.
 *
 * Phase A1.4 added [Routes.LOGIN] as a pure presentation-layer screen.
 * Phase A1.5 wires Login to the real verify-pin auth flow, so it now
 * navigates onward on success — to [Routes.DASHBOARD], registered below
 * with [EmptyStateScreen] as a placeholder. That placeholder is
 * intentional: A1.5's scope is authentication only, not the Dashboard UI
 * itself (visitor feed, calls, billing, etc. all land in later phases) —
 * but "navigate to Dashboard after login" still needs a real destination
 * to land on instead of crashing on an unregistered route.
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

        // Phase A1.5 — placeholder only; see class doc above. Replaced with
        // the real DashboardScreen() in the phase that implements it.
        composable(Routes.DASHBOARD) {
            EmptyStateScreen(
                title = "You're in!",
                subtitle = "Dashboard is coming in a later phase.",
            )
        }

        // Added in a later phase, once the corresponding screen exists:
        //   composable(Routes.VISITOR_FEED) { VisitorFeedScreen(navController) }
    }
}
