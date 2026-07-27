package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing

/**
 * The app's single text-field component. Wraps M3 [OutlinedTextField] with
 * the brand's gold focus/label color, an inline error/supporting-text slot,
 * and a consistent content description pattern — replaces the ad hoc
 * `OutlinedTextField(...)` calls in `LoginScreen` (Plate ID, PIN fields)
 * with one reusable, consistently-styled component.
 *
 * [errorMessage] takes precedence over [supportingText] when both are set —
 * a field can't show a hint and an error at the same time.
 */
@Composable
fun SmartDoorTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supportingText: String? = null,
    errorMessage: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    contentDescriptionOverride: String? = null,
) {
    val isError = errorMessage != null

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = contentDescriptionOverride ?: label
                },
            enabled = enabled,
            singleLine = singleLine,
            isError = isError,
            label = { Text(text = label) },
            placeholder = placeholder?.let { { Text(text = it) } },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            visualTransformation = visualTransformation,
            shape = MaterialTheme.shapes.medium,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = SmartDoorSecondaryDark,
                focusedLabelColor = SmartDoorSecondaryDark,
                cursorColor = SmartDoorSecondaryDark,
                errorBorderColor = SmartDoorDanger,
                errorLabelColor = SmartDoorDanger,
            ),
        )

        val helper = errorMessage ?: supportingText
        if (helper != null) {
            Text(
                text = helper,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) SmartDoorDanger else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(
                    start = SmartDoorSpacing.sm,
                    top = SmartDoorSpacing.xxs,
                ),
            )
        }
    }
}
