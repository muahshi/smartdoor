package `in`.mysmartdoor.app.ui.components.call

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnPrimaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * The full in-call control grid (Mute / Speaker / Keypad / Bluetooth /
 * Hold) plus the large End Call button, used by the Connecting/Connected
 * screens. [CallAcceptRejectBar] is the separate pair of buttons used on
 * the Incoming screen.
 *
 * Buttons render a [Text] glyph rather than an `ImageVector`/`Icon` — this
 * project has no `material-icons-core` Gradle dependency (see
 * [in.mysmartdoor.app.ui.components.SDFloatingButton]/`SDTopBar`'s doc
 * comments for the same project-wide convention: a Text glyph today,
 * swappable for a real vector icon later without any call-site change).
 */
@Composable
fun CallControlBar(
    isMuted: Boolean,
    isSpeakerOn: Boolean,
    isOnHold: Boolean,
    isKeypadOpen: Boolean,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onToggleKeypad: () -> Unit,
    onToggleBluetooth: () -> Unit,
    onToggleHold: () -> Unit,
    onEndCall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg)) {
            CallControlButton(glyph = if (isMuted) "\uD83D\uDD07" else "\uD83C\uDFA4", label = "Mute", isActive = isMuted, onClick = onToggleMute)
            CallControlButton(glyph = "\uD83D\uDD0A", label = "Speaker", isActive = isSpeakerOn, onClick = onToggleSpeaker)
            CallControlButton(glyph = "#", label = "Keypad", isActive = isKeypadOpen, onClick = onToggleKeypad)
        }
        Box(Modifier.size(SmartDoorSpacing.md))
        Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg)) {
            CallControlButton(glyph = "BT", label = "Bluetooth", isActive = false, onClick = onToggleBluetooth)
            CallControlButton(glyph = if (isOnHold) "\u25B6" else "\u23F8", label = if (isOnHold) "Resume" else "Hold", isActive = isOnHold, onClick = onToggleHold)
            EndCallButton(onClick = onEndCall)
        }
    }
}

/** Accept/Reject pair for the Incoming Call screen. */
@Composable
fun CallAcceptRejectBar(
    onAccept: () -> Unit,
    onReject: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.SpaceEvenly) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            RoundGlyphButton(glyph = "\u2715", backgroundColor = SmartDoorDanger, contentColor = Color.White, size = 64.dp, onClick = onReject)
            Text(text = "Decline", style = MaterialTheme.typography.labelMedium, color = SmartDoorDanger)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            RoundGlyphButton(glyph = "\uD83D\uDCDE", backgroundColor = SmartDoorSecondaryDark, contentColor = SmartDoorOnSecondaryDark, size = 64.dp, onClick = onAccept)
            Text(text = "Accept", style = MaterialTheme.typography.labelMedium, color = SmartDoorSecondaryDark)
        }
    }
}

@Composable
private fun EndCallButton(onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        RoundGlyphButton(glyph = "\u2715", backgroundColor = SmartDoorDanger, contentColor = Color.White, size = 56.dp, onClick = onClick)
        Text(text = "End", style = MaterialTheme.typography.labelSmall, color = SmartDoorDanger)
    }
}

@Composable
private fun CallControlButton(
    glyph: String,
    label: String,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        RoundGlyphButton(
            glyph = glyph,
            backgroundColor = if (isActive) SmartDoorSecondaryDark else SmartDoorSurfaceVariantDark,
            contentColor = if (isActive) SmartDoorOnSecondaryDark else SmartDoorOnPrimaryDark,
            size = 52.dp,
            onClick = onClick,
        )
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = SmartDoorOnPrimaryDark)
    }
}

@Composable
private fun RoundGlyphButton(
    glyph: String,
    backgroundColor: Color,
    contentColor: Color,
    size: Dp,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(size)
            .background(color = backgroundColor, shape = CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = glyph, color = contentColor, fontSize = (size.value * 0.4f).sp)
    }
}
