package `in`.mysmartdoor.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import `in`.mysmartdoor.app.ui.screens.login.LoginScreen
import `in`.mysmartdoor.app.ui.screens.splash.SplashScreen

/**
 * Root navigation graph for the app. Every screen the app will ever show
 * lives in this single graph — there is no nested-graph split yet because
 * there are only two destinations.
 *
 * Phase A1.4 adds [Routes.LOGIN] as a pure presentation-layer screen —
 * Splash now hands off to it after its display delay. Login itself does
 * not navigate onward yet (no OTP/auth flow exists to navigate to); that
 * wiring, plus Routes.DASHBOARD / Routes.VISITOR_FEED, lands in later
 * phases.
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

        // Added in later phases, once the corresponding screen exists:
        //   composable(Routes.DASHBOARD) { DashboardScreen(navController) }
        //   composable(Routes.VISITOR_FEED) { VisitorFeedScreen(navController) }
    }
}
