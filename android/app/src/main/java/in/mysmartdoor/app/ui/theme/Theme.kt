package `in`.mysmartdoor.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = SmartDoorPrimary,
    onPrimary = SmartDoorOnPrimary,
    secondary = SmartDoorSecondary,
    onSecondary = SmartDoorOnSecondary,
    background = SmartDoorBackground,
    onBackground = SmartDoorOnBackground,
    surface = SmartDoorSurface,
    onSurface = SmartDoorOnSurface
)

private val DarkColors = darkColorScheme(
    primary = SmartDoorPrimaryDark,
    onPrimary = SmartDoorOnPrimaryDark,
    secondary = SmartDoorSecondaryDark,
    onSecondary = SmartDoorOnSecondaryDark,
    background = SmartDoorBackgroundDark,
    onBackground = SmartDoorOnBackgroundDark,
    surface = SmartDoorSurfaceDark,
    onSurface = SmartDoorOnSurfaceDark
)

/**
 * App-wide Material 3 theme. Every future screen (Owner dashboard, Guard
 * app, Visitor flow) wraps its content in this single composable, keeping
 * one consistent design system across the whole app.
 */
@Composable
fun SmartDoorTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = Shapes,
        content = content
    )
}
