package `in`.mysmartdoor.app.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Standard confirm/cancel dialog — e.g. "Revoke visitor access?",
 * "Delete this plate?". Wraps M3 [AlertDialog] with the design system's
 * gold confirm-button treatment so every dialog in the app looks the same
 * without each call site re-styling `TextButton`s by hand.
 *
 * [dismissLabel]/[onDismissClick] are optional — an informational dialog
 * with only an acknowledge action can omit them.
 */
@Composable
fun SDDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirmClick: () -> Unit,
    onDismissRequest: () -> Unit,
    dismissLabel: String? = null,
    onDismissClick: (() -> Unit)? = null,
    isDanger: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { Text(text = title, style = MaterialTheme.typography.titleLarge) },
        text = { Text(text = message, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            if (isDanger) {
                Button(
                    onClick = onConfirmClick,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = SmartDoorDanger,
                        contentColor = SmartDoorOnDanger,
                    ),
                ) {
                    Text(text = confirmLabel, style = MaterialTheme.typography.labelLarge)
                }
            } else {
                SmartDoorButton(
                    label = confirmLabel,
                    onClick = onConfirmClick,
                    variant = SmartDoorButtonVariant.Primary,
                )
            }
        },
        dismissButton = if (dismissLabel != null && onDismissClick != null) {
            {
                SmartDoorButton(
                    label = dismissLabel,
                    onClick = onDismissClick,
                    variant = SmartDoorButtonVariant.Ghost,
                )
            }
        } else null,
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = SmartDoorSecondaryDark,
    )
}
