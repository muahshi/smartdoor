package `in`.mysmartdoor.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorPillShape
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark

/**
 * Circular initials avatar — visitor/owner/guard identity glyph used
 * anywhere a person needs a compact visual identity (visitor feed rows,
 * chat headers, profile). Initials-only for now: there's no image-loading
 * library (Coil/Glide) in this project yet, so a photo-avatar variant would
 * need that dependency decided first rather than being half-built here.
 *
 * [name] drives the initials shown — first letter of up to the first two
 * words, uppercased (e.g. "Rahul Sharma" → "RS", "Rahul" → "R").
 */
@Composable
fun SDAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
) {
    val initials = remember(name) {
        name.trim()
            .split(Regex("\\s+"))
            .filter { it.isNotEmpty() }
            .take(2)
            .joinToString("") { it.first().uppercase() }
            .ifEmpty { "?" }
    }

    Box(
        modifier = modifier
            .size(size)
            .background(color = SmartDoorSecondaryDark, shape = SmartDoorPillShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.labelLarge,
            color = SmartDoorOnSecondaryDark,
        )
    }
}
