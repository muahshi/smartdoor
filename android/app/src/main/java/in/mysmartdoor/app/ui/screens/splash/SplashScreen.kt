package `in`.mysmartdoor.app.ui.screens.splash

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * App entry screen. In A1.3 this was purely presentational with nowhere to
 * navigate to. Phase A1.4 adds the one piece of navigation this brief
 * mandates — Splash to Login — as a plain timed transition, still with no
 * auth/session check involved (that decision, Routes.LOGIN vs
 * Routes.DASHBOARD, is a later phase; for now Login is unconditionally the
 * next screen).
 *
 * [navController] is nullable so the Preview below can keep rendering the
 * screen with no navigation graph attached.
 *
 * Phase 8 architecture decision: Splash's only job is to decide Dashboard
 * vs. Login *before* the very first navigation — Public Home is never
 * reached from here (only from Login's "New to My Smart Door?" section).
 * [SplashViewModel.hasSession] reads the existing encrypted session store
 * ([in.mysmartdoor.app.core.session.SecureSessionManager]); this waits for
 * its first non-null value alongside the display-duration delay (whichever
 * finishes last) so a slow DataStore read can't cut the splash short.
 */
@Composable
fun SplashScreen(
    navController: NavHostController? = null,
    viewModel: SplashViewModel = hiltViewModel(),
) {
    LaunchedEffect(navController) {
        if (navController != null) {
            val hasSessionDeferred = async { viewModel.hasSession.filterNotNull().first() }
            delay(SPLASH_DISPLAY_DURATION_MS)
            val destination = if (hasSessionDeferred.await()) Routes.DASHBOARD else Routes.LOGIN
            navController.navigate(destination) {
                popUpTo(Routes.SPLASH) { inclusive = true }
            }
        }
    }

    SplashContent()
}

/**
 * Stateless visual content, with no ViewModel dependency — kept separate
 * so [SplashScreenPreview] can render it without a Hilt graph, same
 * pattern as [in.mysmartdoor.app.ui.screens.login.LoginScreen]/`LoginContent`.
 */
@Composable
private fun SplashContent() {
    SmartDoorScaffold { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.headlineSmall,
                )
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = "Smart visitor management",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/** How long Splash stays visible before handing off to Dashboard/Login. */
private const val SPLASH_DISPLAY_DURATION_MS = 1200L

@Preview(showBackground = true)
@Composable
private fun SplashScreenPreview() {
    SmartDoorTheme {
        SplashContent()
    }
}
