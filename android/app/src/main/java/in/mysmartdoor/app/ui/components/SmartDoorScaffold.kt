package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import `in`.mysmartdoor.app.R

/**
 * Shared Scaffold every screen in the app wraps its content in, so top-bar
 * styling, back-navigation affordance, and content padding stay consistent
 * without each screen re-implementing them.
 *
 * [title] and [onBackClick] are both optional: Splash and other top-level
 * screens can render with no app bar at all by leaving [title] null.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmartDoorScaffold(
    title: String? = null,
    onBackClick: (() -> Unit)? = null,
    backIcon: ImageVector? = null,
    content: @Composable (innerPadding: PaddingValues) -> Unit,
) {
    Scaffold(
        topBar = {
            if (title != null) {
                CenterAlignedTopAppBar(
                    title = { Text(text = title, style = MaterialTheme.typography.titleMedium) },
                    navigationIcon = {
                        if (onBackClick != null && backIcon != null) {
                            IconButton(onClick = onBackClick) {
                                Icon(
                                    imageVector = backIcon,
                                    contentDescription = stringResource(R.string.nav_back),
                                )
                            }
                        }
                    },
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(),
                )
            }
        },
    ) { innerPadding ->
        content(innerPadding)
    }
}
