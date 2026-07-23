package `in`.mysmartdoor.app.ui.screens.splash

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.ui.components.SmartDoorScaffold
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme

/**
 * App entry screen. Purely presentational in A1.3 — it does not check auth
 * state or navigate anywhere on its own, because no session/auth check is
 * wired to the UI yet (that lands with the Login/Dashboard phases). Once it
 * does, this screen becomes the place that decides Routes.LOGIN vs
 * Routes.DASHBOARD as its start-up effect.
 */
@Composable
fun SplashScreen() {
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

@Preview(showBackground = true)
@Composable
private fun SplashScreenPreview() {
    SmartDoorTheme {
        SplashScreen()
    }
}
