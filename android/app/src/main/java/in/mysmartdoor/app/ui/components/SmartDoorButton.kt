package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing

/**
 * Which visual weight a [SmartDoorButton] should render as. Named after
 * intent (primary action vs. secondary vs. low-emphasis) rather than color,
 * so call sites read as "this is the main CTA" instead of "make it gold".
 */
enum class SmartDoorButtonVariant {
    /** Solid gold fill — the one primary call-to-action per screen. */
    Primary,

    /** Outlined, gold stroke — secondary action alongside a Primary button. */
    Secondary,

    /** No container, text-only — lowest-emphasis / tertiary action. */
    Ghost,
}

/**
 * The app's single button component, covering the three variants the
 * design system defines. Screens should use this instead of reaching for
 * M3's `Button`/`OutlinedButton`/`TextButton` directly, so every button in
 * the app shares sizing, loading behavior, and disabled treatment.
 *
 * [isLoading] shows an inline spinner in place of [label] and forces
 * [enabled] to false while true — callers don't need to separately disable
 * the button during an in-flight action.
 *
 * [leadingIconRes] is an optional drawable-resource glyph rendered before
 * [label] — the premium-design replacement for the raw emoji characters
 * that used to be baked directly into button label strings (house/robot/
 * cart/globe glyphs on the Login and Public Home explore buttons). Purely
 * presentational: no behavior change for existing call sites that omit it.
 */
@Composable
fun SmartDoorButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: SmartDoorButtonVariant = SmartDoorButtonVariant.Primary,
    enabled: Boolean = true,
    isLoading: Boolean = false,
    leadingIconRes: Int? = null,
) {
    val isEnabled = enabled && !isLoading
    val shape = MaterialTheme.shapes.medium
    val contentPadding = PaddingValues(
        horizontal = SmartDoorSpacing.lg,
        vertical = SmartDoorSpacing.sm,
    )

    when (variant) {
        SmartDoorButtonVariant.Primary -> Button(
            onClick = onClick,
            modifier = modifier.height(48.dp),
            enabled = isEnabled,
            shape = shape,
            contentPadding = contentPadding,
            colors = ButtonDefaults.buttonColors(
                containerColor = SmartDoorSecondaryDark,
                contentColor = SmartDoorOnSecondaryDark,
            ),
        ) {
            SmartDoorButtonContent(label, isLoading, SmartDoorOnSecondaryDark, leadingIconRes)
        }

        SmartDoorButtonVariant.Secondary -> OutlinedButton(
            onClick = onClick,
            modifier = modifier.height(48.dp),
            enabled = isEnabled,
            shape = shape,
            contentPadding = contentPadding,
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = SmartDoorSecondaryDark,
            ),
        ) {
            SmartDoorButtonContent(label, isLoading, SmartDoorSecondaryDark, leadingIconRes)
        }

        SmartDoorButtonVariant.Ghost -> TextButton(
            onClick = onClick,
            modifier = modifier.height(48.dp),
            enabled = isEnabled,
            shape = shape,
            contentPadding = contentPadding,
        ) {
            SmartDoorButtonContent(label, isLoading, MaterialTheme.colorScheme.onSurface, leadingIconRes)
        }
    }
}

@Composable
private fun SmartDoorButtonContent(
    label: String,
    isLoading: Boolean,
    contentColor: Color,
    leadingIconRes: Int? = null,
) {
    if (isLoading) {
        CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            color = contentColor,
            strokeWidth = 2.dp,
        )
    } else if (leadingIconRes != null) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
        ) {
            Icon(
                painter = painterResource(id = leadingIconRes),
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(18.dp),
            )
            Text(text = label, style = MaterialTheme.typography.labelLarge)
        }
    } else {
        Text(text = label, style = MaterialTheme.typography.labelLarge)
    }
}
