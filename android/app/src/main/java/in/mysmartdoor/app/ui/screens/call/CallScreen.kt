package `in`.mysmartdoor.app.ui.screens.call

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import `in`.mysmartdoor.app.core.data.model.CallEndReason
import `in`.mysmartdoor.app.core.data.model.CallPhase
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SmartDoorButton
import `in`.mysmartdoor.app.ui.components.SmartDoorButtonVariant
import `in`.mysmartdoor.app.ui.components.call.CallAcceptRejectBar
import `in`.mysmartdoor.app.ui.components.call.CallControlBar
import `in`.mysmartdoor.app.ui.components.call.CallGlowAvatar
import `in`.mysmartdoor.app.ui.theme.SmartDoorBackgroundDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorOnPrimaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark

/**
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE.
 *
 * Single route ([in.mysmartdoor.app.navigation.Routes.CALL]) that renders
 * every call phase the CTO brief listed as its own premium composable,
 * switching between them off [CallViewModel]'s state machine with a
 * shared Black+Gold glassmorphism background — one call *screen*, not six
 * separate nav destinations, so there's nothing to duplicate in the back
 * stack and the existing navigation graph shape is untouched (only one
 * new route added — see [in.mysmartdoor.app.navigation.SmartDoorNavHost]).
 */
@Composable
fun CallScreen(
    navController: NavHostController,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val phase = uiState.session.phase

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(SmartDoorBackgroundDark, SmartDoorSurfaceVariantDark),
                ),
            ),
    ) {
        AnimatedContent(
            targetState = phase,
            transitionSpec = {
                (fadeIn(tween(SmartDoorMotion.durationMedium)) + slideInVertically(tween(SmartDoorMotion.durationMedium)) { it / 6 })
                    .togetherWith(fadeOut(tween(SmartDoorMotion.durationShort)))
            },
            label = "callPhase",
        ) { targetPhase ->
            when (targetPhase) {
                CallPhase.IDLE -> IdleContent()

                CallPhase.INCOMING -> IncomingCallContent(
                    callerName = uiState.session.callerName,
                    plateId = uiState.session.plateId,
                    onAccept = viewModel::acceptCall,
                    onReject = viewModel::rejectCall,
                )

                CallPhase.OUTGOING, CallPhase.RINGING -> OutgoingRingingContent(
                    callerName = uiState.session.callerName,
                    isRinging = targetPhase == CallPhase.RINGING,
                    onEndCall = viewModel::endCall,
                )

                CallPhase.CONNECTING -> ConnectingContent(
                    callerName = uiState.session.callerName,
                    onEndCall = viewModel::endCall,
                )

                CallPhase.CONNECTED -> ActiveCallContent(
                    callerName = uiState.session.callerName,
                    plateId = uiState.session.plateId,
                    elapsedSeconds = uiState.elapsedSeconds,
                    isMuted = uiState.isMuted,
                    isSpeakerOn = uiState.isSpeakerOn,
                    isOnHold = uiState.isOnHold,
                    isKeypadOpen = uiState.isKeypadOpen,
                    networkQuality = uiState.networkQuality,
                    onToggleMute = viewModel::toggleMute,
                    onToggleSpeaker = viewModel::toggleSpeaker,
                    onToggleKeypad = viewModel::toggleKeypad,
                    onToggleBluetooth = { /* Bluetooth SCO routing — needs AudioManager wiring alongside the real media engine */ },
                    onToggleHold = viewModel::toggleHold,
                    onEndCall = viewModel::endCall,
                )

                CallPhase.DISCONNECTED, CallPhase.FAILED, CallPhase.BUSY,
                CallPhase.REJECTED, CallPhase.MISSED -> CallEndedContent(
                    callerName = uiState.session.callerName,
                    phase = targetPhase,
                    endReason = uiState.session.endReason,
                    durationSeconds = uiState.elapsedSeconds,
                    onDone = {
                        viewModel.dismissEndedCall()
                        if (navController.previousBackStackEntry != null) navController.popBackStack()
                    },
                )
            }
        }
    }
}

@Composable
private fun IdleContent() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = "Waiting for a visitor call…",
            style = MaterialTheme.typography.bodyLarge,
            color = SmartDoorOnPrimaryDark,
        )
    }
}

@Composable
private fun IncomingCallContent(
    callerName: String?,
    plateId: String?,
    onAccept: () -> Unit,
    onReject: () -> Unit,
) {
    CallScaffold(
        topLabel = "Incoming Call",
        callerName = callerName,
        plateId = plateId,
        isAvatarActive = true,
    ) {
        CallAcceptRejectBar(
            onAccept = onAccept,
            onReject = onReject,
            modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.xxl),
        )
    }
}

@Composable
private fun OutgoingRingingContent(
    callerName: String?,
    isRinging: Boolean,
    onEndCall: () -> Unit,
) {
    CallScaffold(
        topLabel = if (isRinging) "Ringing…" else "Calling…",
        callerName = callerName,
        plateId = null,
        isAvatarActive = true,
    ) {
        SingleEndCallButton(onEndCall)
    }
}

@Composable
private fun ConnectingContent(
    callerName: String?,
    onEndCall: () -> Unit,
) {
    CallScaffold(
        topLabel = "Connecting…",
        callerName = callerName,
        plateId = null,
        isAvatarActive = true,
    ) {
        SingleEndCallButton(onEndCall)
    }
}

@Composable
private fun ActiveCallContent(
    callerName: String?,
    plateId: String?,
    elapsedSeconds: Int,
    isMuted: Boolean,
    isSpeakerOn: Boolean,
    isOnHold: Boolean,
    isKeypadOpen: Boolean,
    networkQuality: NetworkQuality,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onToggleKeypad: () -> Unit,
    onToggleBluetooth: () -> Unit,
    onToggleHold: () -> Unit,
    onEndCall: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(SmartDoorSpacing.xxl))
        NetworkStatusPill(networkQuality)
        Spacer(Modifier.height(SmartDoorSpacing.lg))
        CallGlowAvatar(name = callerName, isActive = false)
        Spacer(Modifier.height(SmartDoorSpacing.lg))
        Text(text = callerName ?: "Visitor", style = MaterialTheme.typography.headlineSmall, color = SmartDoorOnPrimaryDark)
        if (plateId != null) {
            Text(text = plateId, style = MaterialTheme.typography.bodyMedium, color = SmartDoorOnPrimaryDark.copy(alpha = 0.7f))
        }
        Spacer(Modifier.height(SmartDoorSpacing.xs))
        Text(
            text = formatDuration(elapsedSeconds) + if (isOnHold) " · On hold" else "",
            style = MaterialTheme.typography.bodyLarge,
            color = SmartDoorSecondaryDark,
        )

        Spacer(Modifier.weight(1f))

        AnimatedVisibility(visible = isKeypadOpen, enter = fadeIn() + slideInVertically { it / 2 }, exit = fadeOut() + slideOutVertically { it / 2 }) {
            CallKeypad(modifier = Modifier.padding(bottom = SmartDoorSpacing.lg))
        }

        CallControlBar(
            isMuted = isMuted,
            isSpeakerOn = isSpeakerOn,
            isOnHold = isOnHold,
            isKeypadOpen = isKeypadOpen,
            onToggleMute = onToggleMute,
            onToggleSpeaker = onToggleSpeaker,
            onToggleKeypad = onToggleKeypad,
            onToggleBluetooth = onToggleBluetooth,
            onToggleHold = onToggleHold,
            onEndCall = onEndCall,
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xl),
        )
    }
}

@Composable
private fun CallEndedContent(
    callerName: String?,
    phase: CallPhase,
    endReason: CallEndReason?,
    durationSeconds: Int,
    onDone: () -> Unit,
) {
    val (title, subtitle) = when (phase) {
        CallPhase.MISSED -> "Missed Call" to (callerName ?: "Visitor")
        CallPhase.REJECTED -> "Call Declined" to (callerName ?: "Visitor")
        CallPhase.BUSY -> "You were busy" to (callerName ?: "Visitor")
        CallPhase.FAILED -> "Call Failed" to "Couldn't connect — check your network"
        else -> "Call Ended" to formatDuration(durationSeconds)
    }
    val statusColor = when (phase) {
        CallPhase.DISCONNECTED -> SmartDoorSuccess
        else -> SmartDoorDanger
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CallGlowAvatar(name = callerName, isActive = false, size = 96.dp)
            Spacer(Modifier.height(SmartDoorSpacing.lg))
            Text(text = title, style = MaterialTheme.typography.headlineSmall, color = statusColor)
            Spacer(Modifier.height(SmartDoorSpacing.xxs))
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = SmartDoorOnPrimaryDark.copy(alpha = 0.75f))
            Spacer(Modifier.height(SmartDoorSpacing.xl))
            SmartDoorButton(label = "Done", onClick = onDone, variant = SmartDoorButtonVariant.Primary)
        }
    }
}

/** Shared layout for phases that show a top label + avatar + name + a bottom action slot. */
@Composable
private fun CallScaffold(
    topLabel: String,
    callerName: String?,
    plateId: String?,
    isAvatarActive: Boolean,
    bottomContent: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(SmartDoorSpacing.lg)) {
        Spacer(Modifier.height(SmartDoorSpacing.xxl))
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(text = topLabel, style = MaterialTheme.typography.titleMedium, color = SmartDoorSecondaryDark)
        }
        Spacer(Modifier.weight(1f))
        Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            CallGlowAvatar(name = callerName, isActive = isAvatarActive)
            Spacer(Modifier.height(SmartDoorSpacing.lg))
            Text(text = callerName ?: "Visitor", style = MaterialTheme.typography.headlineMedium, color = SmartDoorOnPrimaryDark)
            if (plateId != null) {
                Spacer(Modifier.height(SmartDoorSpacing.xxs))
                Text(text = plateId, style = MaterialTheme.typography.bodyMedium, color = SmartDoorOnPrimaryDark.copy(alpha = 0.7f))
            }
        }
        Spacer(Modifier.weight(1f))
        bottomContent()
    }
}

@Composable
private fun SingleEndCallButton(onEndCall: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().padding(bottom = SmartDoorSpacing.xxl), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(color = SmartDoorDanger, shape = CircleShape)
                .clickable(onClick = onEndCall),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = "\u2715", color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable
private fun NetworkStatusPill(quality: NetworkQuality) {
    val (label, color) = when (quality) {
        NetworkQuality.GOOD -> "Good connection" to SmartDoorSuccess
        NetworkQuality.FAIR -> "Fair connection" to SmartDoorSecondaryDark
        NetworkQuality.POOR -> "Poor connection" to SmartDoorDanger
        NetworkQuality.UNKNOWN -> "Connecting audio…" to SmartDoorOnPrimaryDark.copy(alpha = 0.6f)
    }
    GlassCard(contentPadding = PaddingValues(horizontal = SmartDoorSpacing.sm, vertical = SmartDoorSpacing.xxs)) {
        Text(text = label, style = MaterialTheme.typography.labelMedium, color = color)
    }
}

@Composable
private fun CallKeypad(modifier: Modifier = Modifier) {
    val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#")
    GlassCard(modifier = modifier.fillMaxWidth()) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.height(220.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalArrangement = Arrangement.SpaceEvenly,
        ) {
            items(keys) { key ->
                Box(
                    modifier = Modifier
                        .aspectRatio(1f)
                        .padding(SmartDoorSpacing.xxs)
                        .background(color = SmartDoorSurfaceVariantDark, shape = CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = key, style = MaterialTheme.typography.titleLarge, color = SmartDoorOnPrimaryDark)
                }
            }
        }
    }
}

private fun formatDuration(totalSeconds: Int): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}
