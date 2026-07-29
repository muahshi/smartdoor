package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Premium top app bar. This is a new, separate component from
 * [SmartDoorScaffold]'s built-in top bar — existing screens (Splash, Login,
 * Dashboard) keep using [SmartDoorScaffold] unchanged for this phase, so
 * this ships ready for the next phase to adopt screen-by-screen rather than
 * forcing every current screen's top bar to change today.
 *
 * [backIcon] is an optional [ImageVector] supplied by the caller rather than
 * an `androidx.compose.material.icons.Icons.*` constant: `material-icons-core`
 * isn't a Gradle dependency anywhere in this app (see the same call in
 * `DashboardScreen.RefreshGlyph`), and adding one is out of scope for this
 * phase. [onBackClick]/[backIcon] are both null-by-default so a top-level
 * screen (no back target) can render with no navigation icon at all —
 * same optionality [SmartDoorScaffold] already gives callers.
 *
 * Phase 12A — PREMIUM UI REBUILD: added [backIconRes], a drawable-resource
 * alternative to [backIcon] for the same no-material-icons-core reason
 * every other icon in this app already uses `R.drawable.ic_*` +
 * `painterResource` (see [in.mysmartdoor.app.ui.components.SDSearchBar]).
 * Existing callers passing [backIcon] are unaffected; a new caller with no
 * `ImageVector` available (i.e. every caller in this app) can pass
 * [backIconRes] instead. If both are supplied, [backIcon] wins.
 *
 * [actions] is a trailing slot for icon buttons (e.g. notification bell,
 * search) — optional, most screens won't need it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SDTopBar(
    title: String,
    onBackClick: (() -> Unit)? = null,
    backIcon: ImageVector? = null,
    backIconRes: Int? = null,
    actions: @Composable () -> Unit = {},
) {
    CenterAlignedTopAppBar(
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = SmartDoorSecondaryDark,
            )
        },
        navigationIcon = {
            if (onBackClick != null && backIcon != null) {
                IconButton(onClick = onBackClick) {
                    Icon(imageVector = backIcon, contentDescription = stringResource(R.string.nav_back))
                }
            } else if (onBackClick != null && backIconRes != null) {
                IconButton(onClick = onBackClick) {
                    Icon(
                        painter = painterResource(id = backIconRes),
                        contentDescription = stringResource(R.string.nav_back),
                        modifier = androidx.compose.ui.Modifier.size(20.dp),
                        tint = SmartDoorSecondaryDark,
                    )
                }
            }
        },
        actions = { actions() },
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
            containerColor = MaterialTheme.colorScheme.background,
            titleContentColor = SmartDoorSecondaryDark,
        ),
    )
}
