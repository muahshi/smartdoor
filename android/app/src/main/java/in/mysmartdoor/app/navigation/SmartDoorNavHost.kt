package `in`.mysmartdoor.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import `in`.mysmartdoor.app.ui.screens.splash.SplashScreen

/**
 * Root navigation graph for the app. Every screen the app will ever show
 * lives in this single graph — there is no nested-graph split yet because
 * there is only one destination.
 *
 * Phase A1.3 registers [Routes.SPLASH] only. [Routes.LOGIN] is not wired
 * here — no auth screen or session check exists yet (that starts once
 * authentication is actually implemented), so Splash currently has nowhere
 * to navigate to and simply renders as a static branding screen.
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
            SplashScreen()
        }

        // Added in later phases, once the corresponding screen exists:
        //   composable(Routes.LOGIN) { LoginScreen(navController) }
        //   composable(Routes.DASHBOARD) { DashboardScreen(navController) }
        //   composable(Routes.VISITOR_FEED) { VisitorFeedScreen(navController) }
    }
}
