package `in`.mysmartdoor.app.ui.screens.dashboard

import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.core.network.dto.VisitorVisitDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDAvatar
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDStatCard
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Owner Dashboard Phase 2 — "premium smart home control center" redesign.
 *
 * All data still comes from [DashboardViewModel] → [in.mysmartdoor.app.core.data.DashboardRepository]
 * (unchanged data flow from Phase 1; only the composition layer below is
 * new). No mock data anywhere in this file — every value rendered traces
 * back to a real field on [DashboardData]. Sections with no reliable
 * production data source (live device online/offline, AI conversation
 * transcripts, hardware telemetry) are deliberately omitted rather than
 * faked — see the Phase 2 CTO handoff for the full data-availability audit.
 *
 * Built entirely on the Phase 1 design system ([GlassCard], [SDCard],
 * [SDTopBar], [SDStatCard], [SDBadge], [SDSectionHeader], [SDAvatar],
 * [SDSkeletonLoader]) plus [SmartDoorSpacing]/[SmartDoorElevation]/
 * [SmartDoorMotion] tokens — no new design language introduced.
 *
 * Quick Actions still show a "coming soon" snackbar (unchanged from Phase
 * 1) since most of their destination screens don't exist in
 * [in.mysmartdoor.app.navigation.SmartDoorNavHost] yet. Phase 4 —
 * VISITORS V2 was the first exception ("Visitor History" →
 * [in.mysmartdoor.app.ui.screens.visitors.VisitorFeedScreen]); Phase 6 —
 * MESSAGES V2 added a second ("Messages" →
 * [in.mysmartdoor.app.ui.screens.messages.MessagesScreen]); Phase 7 — AI
 * RECEPTIONIST V2 adds a third: "AI Receptionist" now navigates to the
 * real [in.mysmartdoor.app.ui.screens.aireceptionist.AiReceptionistScreen]
 * instead of showing the snackbar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    navController: NavHostController,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    fun showComingSoon(feature: String) {
        scope.launch { snackbarHostState.showSnackbar("$feature is coming in a later phase.") }
    }

    // A refresh that fails while we already have data shouldn't blank the
    // screen — surface it as a snackbar instead, keeping the stale-but-usable content.
    LaunchedEffect(uiState.errorMessage, uiState.data) {
        if (uiState.errorMessage != null && uiState.data != null) {
            snackbarHostState.showSnackbar(uiState.errorMessage.orEmpty())
        }
    }

    Scaffold(
        topBar = {
            SDTopBar(
                title = "Dashboard",
                actions = {
                    IconButton(onClick = { if (!uiState.isRefreshing) viewModel.refresh() }) {
                        if (uiState.isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = SmartDoorSecondaryDark,
                            )
                        } else {
                            RefreshGlyph()
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) { data -> Snackbar(data) } },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val currentData = uiState.data
            when {
                currentData != null -> DashboardContent(
                    data = currentData,
                    onQuickAction = { feature ->
                        when (feature) {
                            "Visitor History" -> navController.navigate(Routes.VISITOR_FEED)
                            "Messages" -> navController.navigate(Routes.MESSAGES)
                            "AI Receptionist" -> navController.navigate(Routes.AI_RECEPTIONIST)
                            // Phase 8 — SETTINGS, ACCOUNT & DEVICE MANAGEMENT
                            "Settings" -> navController.navigate(Routes.SETTINGS)
                            "Account" -> navController.navigate(Routes.ACCOUNT)
                            else -> showComingSoon(feature)
                        }
                    },
                )
                uiState.isLoading -> DashboardSkeleton()
                uiState.errorMessage != null -> ErrorScreen(
                    message = uiState.errorMessage.orEmpty(),
                    onRetry = { viewModel.load() },
                )
            }
        }
    }
}

@Composable
private fun DashboardContent(
    data: DashboardData,
    onQuickAction: (String) -> Unit,
) {
    // Skeleton → content swap: a single gentle fade + rise, per the design
    // system's motion guidance (Motion.kt: "emphasized for skeleton→content
    // swap"). Runs once per composition of real content, not per scroll.
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized)) +
            slideInVertically(
                animationSpec = tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.emphasized),
                initialOffsetY = { it / 12 },
            ),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(SmartDoorSpacing.md),
            verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.md),
        ) {
            item { HeroSmartDoorCard(data) }
            item { AiReceptionistCard(data) }
            item { SmartStatisticsSection(data) }
            item { QuickActionsSection(onQuickAction) }
            item { LiveActivityTimelineSection(data) }
            item { NotificationsPreviewSection(data) }
            item { SmartDoorStatusSection(data) }
            item { SubscriptionSummaryCard(data) }
            item { LastSyncFooter(data) }
        }
    }
}

// ────────── 1. HERO SMART DOOR CARD ──────────

@Composable
private fun HeroSmartDoorCard(data: DashboardData) {
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PlatePreview(plateId = data.owner.plateId, modifier = Modifier.size(64.dp))
                Spacer(modifier = Modifier.width(SmartDoorSpacing.md))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = data.owner.fullName,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = data.owner.plateId,
                        style = MaterialTheme.typography.bodyMedium,
                        color = SmartDoorSecondaryDark,
                    )
                    Text(
                        text = "Member since ${formatDate(data.owner.createdAt)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                SDAvatar(name = data.owner.fullName, size = 40.dp)
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
            // UI Stabilization pass: this was a plain Row, which never wraps —
            // a long subscription plan label next to the plate-status badge
            // could exceed the card's width on a small screen and get cut off
            // by GlassCard's clip(shape). FlowRow keeps the same badges/
            // spacing/colors but drops the second badge to its own line
            // instead of clipping it when it doesn't fit.
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
                verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
            ) {
                SDBadge(
                    text = data.plate?.status?.replaceFirstChar { it.uppercase() } ?: "Not linked",
                    status = if (data.plate?.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                )
                SDBadge(
                    text = subscriptionBadgeLabel(data),
                    status = if (data.subscription?.status == "active") SDBadgeStatus.Info else SDBadgeStatus.Neutral,
                )
            }
        }
    }
}

/**
 * Stylized plate mockup drawn entirely in Compose (gold ring + monogram +
 * a hairline "engraved" plate-id chip) rather than a real product image —
 * this app has no image-loading library (Coil/Glide) and no QR-generation
 * dependency yet (confirmed against `build.gradle.kts`), and adding one
 * mid-phase without being able to run a build to verify resolution is
 * riskier than a vector-drawn placeholder. Swap for a real rendered plate
 * photo/QR once an image pipeline is a deliberate, verified decision.
 */
@Composable
private fun PlatePreview(plateId: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(width = 1.dp, color = SmartDoorSecondaryDark.copy(alpha = 0.4f), shape = RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = plateId.take(2).uppercase(),
            style = MaterialTheme.typography.titleMedium,
            color = SmartDoorSecondaryDark,
            fontWeight = FontWeight.Bold,
        )
    }
}

private fun subscriptionBadgeLabel(data: DashboardData): String {
    val plan = data.subscription?.plan?.replace('_', ' ')?.replaceFirstChar { it.uppercase() }
    return plan ?: "No active plan"
}

// ────────── 2. AI RECEPTIONIST CARD ──────────

@Composable
private fun AiReceptionistCard(data: DashboardData) {
    val aiEnabled = data.securityRules?.autoReplyEnabled == true
    val lastInteraction = data.recentVisitorVisits.firstOrNull { it.purpose != null }

    SDCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AiActivityDot(active = aiEnabled)
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
                    Text(text = "AI Receptionist", style = MaterialTheme.typography.titleMedium)
                }
                SDBadge(
                    text = if (aiEnabled) "On" else "Off",
                    status = if (aiEnabled) SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                )
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
            Text(
                text = if (lastInteraction != null) {
                    "Last handled: ${lastInteraction.purpose} · ${formatRelativeTime(lastInteraction.createdAt)}"
                } else {
                    "No AI-handled visitor interactions yet."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Small pulsing dot — the AI activity indicator, only animates while [active]. */
@Composable
private fun AiActivityDot(active: Boolean) {
    if (!active) {
        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.outline))
        return
    }
    val transition = rememberInfiniteTransition(label = "ai_activity")
    val alpha by transition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = SmartDoorMotion.durationLong),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ai_activity_alpha",
    )
    Box(
        modifier = Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(SmartDoorSuccess.copy(alpha = alpha)),
    )
}

// ────────── 3. SMART STATISTICS ──────────

/** Below this measured width (covers small devices like the Samsung M05), the stat grid drops to 2 columns instead of 3. */
private val StatGridNarrowBreakpoint = 380.dp

private data class StatEntry(val label: String, val value: Int)

/**
 * UI Stabilization pass: this used to be a hardcoded 2-card row followed by
 * a 3-card row, so the 3-across row was always the narrowest/most cramped
 * on small-width devices (Samsung M05, small Pixels) regardless of what
 * actually fit. [BoxWithConstraints] measures the real available width and
 * picks 2 or 3 columns per row from that — same [CountUpStatCard]/
 * [SDStatCard], same spacing tokens, same colors/typography/animation,
 * just a width-aware row grouping instead of a fixed split.
 */
@Composable
private fun SmartStatisticsSection(data: DashboardData) {
    val stats = listOf(
        StatEntry("Today's Visitors", data.todayVisitorCount),
        StatEntry("Unread Messages", data.unreadMessageCount),
        StatEntry("AI Handled", data.aiHandledCount),
        StatEntry("Missed Visitors", data.missedVisitorCount),
        StatEntry("Notifications", data.unreadNotificationCount),
    )
    Column {
        SDSectionHeader(title = "Smart Statistics", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val columns = if (maxWidth < StatGridNarrowBreakpoint) 2 else 3
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                stats.chunked(columns).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                        row.forEach { stat ->
                            CountUpStatCard(
                                label = stat.label,
                                value = stat.value,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        repeat(columns - row.size) { Spacer(modifier = Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

/**
 * [SDStatCard] with an animated count-up from 0 to [value] — the "number
 * count-up" animation called for in the brief. Not a real-vs-fake risk:
 * the animation only interpolates the display of an already-real number,
 * it never invents one.
 */
@Composable
private fun CountUpStatCard(label: String, value: Int, modifier: Modifier = Modifier) {
    val animated by animateIntAsState(
        targetValue = value,
        animationSpec = tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.standard),
        label = "count_up_$label",
    )
    SDStatCard(label = label, value = animated.toString(), modifier = modifier)
}

// ────────── 4. QUICK ACTIONS ──────────

private data class QuickAction(val label: String, val glyph: String)

private val quickActions = listOf(
    QuickAction("Visitor History", "🧾"),
    QuickAction("Call History", "📞"),
    QuickAction("Messages", "💬"),
    QuickAction("QR Preview", "▦"),
    QuickAction("Smart Plate", "🔌"),
    QuickAction("AI Receptionist", "🤖"),
    QuickAction("Settings", "⚙"),
    QuickAction("Notifications", "🔔"),
    QuickAction("Account", "👤"),
)

@Composable
private fun QuickActionsSection(onAction: (String) -> Unit) {
    Column {
        SDSectionHeader(title = "Quick Actions", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        quickActions.chunked(3).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
            ) {
                row.forEach { action ->
                    QuickActionTile(
                        action = action,
                        onClick = { onAction(action.label) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(3 - row.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
        }
    }
}

@Composable
private fun QuickActionTile(action: QuickAction, onClick: () -> Unit, modifier: Modifier = Modifier) {
    SDCard(
        modifier = modifier.clickable(onClick = onClick),
        contentPadding = PaddingValues(vertical = SmartDoorSpacing.sm, horizontal = SmartDoorSpacing.xxs),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = action.glyph, style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
            Text(
                text = action.label,
                style = MaterialTheme.typography.labelMedium,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ────────── 5. LIVE ACTIVITY TIMELINE ──────────

/** Which production table a merged [TimelineEntry] came from — drives its [SDBadge] label only. */
private enum class TimelineKind { Visitor, Call, Message, Delivery, AiEvent }

private data class TimelineEntry(
    val kind: TimelineKind,
    val primary: String,
    val secondary: String?,
    val createdAt: String,
)

/**
 * Merges [DashboardData.recentVisitors]/[recentCalls]/[recentMessages] with
 * Delivery/AI-event entries derived from [DashboardData.recentVisitorVisits]
 * into one time-sorted feed, per the brief's "Live Activity Timeline"
 * (Visitor / Calls / Messages / Deliveries / AI events). Notifications are
 * deliberately excluded here — they get their own preview section below,
 * matching the brief's separate "Notifications Preview" (section 6).
 *
 * `visitor_visits` rows are only surfaced when [VisitorVisitDto.purpose] is
 * set (a genuine delivery/AI classification) — rows with no purpose add no
 * information beyond what [recentCalls]/[recentVisitors] already show and
 * would otherwise read as a near-duplicate entry for the same event.
 */
private fun buildTimeline(data: DashboardData): List<TimelineEntry> {
    val visitorEntries = data.recentVisitors.map {
        TimelineEntry(
            kind = TimelineKind.Visitor,
            primary = it.eventType.replace('_', ' ').replaceFirstChar { c -> c.uppercase() },
            secondary = it.aiIntent,
            createdAt = it.createdAt,
        )
    }
    val callEntries = data.recentCalls.map {
        TimelineEntry(
            kind = TimelineKind.Call,
            primary = it.callStatus.replace('_', ' ').replaceFirstChar { c -> c.uppercase() },
            secondary = if (it.duration > 0) "${it.duration}s" else null,
            createdAt = it.startedAt,
        )
    }
    val messageEntries = data.recentMessages.map {
        TimelineEntry(
            kind = TimelineKind.Message,
            primary = it.messageType.replaceFirstChar { c -> c.uppercase() },
            secondary = it.content,
            createdAt = it.createdAt,
        )
    }
    val visitEntries = data.recentVisitorVisits.filter { it.purpose != null }.map {
        val isDelivery = it.purpose.orEmpty().contains("deliver", ignoreCase = true)
        TimelineEntry(
            kind = if (isDelivery) TimelineKind.Delivery else TimelineKind.AiEvent,
            primary = it.purpose.orEmpty(),
            secondary = if (it.accepted == false) "Not accepted" else null,
            createdAt = it.createdAt,
        )
    }
    return (visitorEntries + callEntries + messageEntries + visitEntries)
        .sortedByDescending { runCatching { OffsetDateTime.parse(it.createdAt) }.getOrNull() }
        .take(12)
}

@Composable
private fun LiveActivityTimelineSection(data: DashboardData) {
    val entries = remember(data) { buildTimeline(data) }
    Column {
        SDSectionHeader(title = "Live Activity", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            if (entries.isEmpty()) {
                EmptySectionText("No activity yet. Visitor scans, calls, messages, and AI events will show up here.")
            } else {
                entries.forEachIndexed { index, entry ->
                    TimelineRow(entry)
                    if (index != entries.lastIndex) HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun TimelineRow(entry: TimelineEntry) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SDBadge(text = timelineKindLabel(entry.kind), status = timelineKindStatus(entry.kind))
        Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = entry.primary,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!entry.secondary.isNullOrBlank()) {
                Text(
                    text = entry.secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = formatRelativeTime(entry.createdAt),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun timelineKindLabel(kind: TimelineKind): String = when (kind) {
    TimelineKind.Visitor -> "Visitor"
    TimelineKind.Call -> "Call"
    TimelineKind.Message -> "Message"
    TimelineKind.Delivery -> "Delivery"
    TimelineKind.AiEvent -> "AI"
}

private fun timelineKindStatus(kind: TimelineKind): SDBadgeStatus = when (kind) {
    TimelineKind.Visitor -> SDBadgeStatus.Info
    TimelineKind.Call -> SDBadgeStatus.Warning
    TimelineKind.Message -> SDBadgeStatus.Neutral
    TimelineKind.Delivery -> SDBadgeStatus.Success
    TimelineKind.AiEvent -> SDBadgeStatus.Info
}

// ────────── 6. NOTIFICATIONS PREVIEW ──────────

@Composable
private fun NotificationsPreviewSection(data: DashboardData) {
    Column {
        SDSectionHeader(
            title = if (data.unreadNotificationCount > 0) {
                "Notifications (${data.unreadNotificationCount} unread)"
            } else {
                "Notifications"
            },
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
        )
        SDCard(modifier = Modifier.fillMaxWidth()) {
            if (data.recentNotifications.isEmpty()) {
                EmptySectionText("You're all caught up.")
            } else {
                data.recentNotifications.take(3).forEachIndexed { index, notification ->
                    NotificationRow(notification)
                    if (index != data.recentNotifications.take(3).lastIndex) HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(notification: NotificationDto) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = notification.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (!notification.isRead) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!notification.body.isNullOrBlank()) {
                Text(
                    text = notification.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = formatRelativeTime(notification.createdAt),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ────────── 7. SMART DOOR STATUS (formerly "Device Health") ──────────

/**
 * Renamed from the brief's "Device Health" per CTO direction: SmartDoor's
 * "device" is a static printed QR nameplate, not a networked sensor — there
 * is no battery/signal/uptime telemetry anywhere in the schema. Rather than
 * fabricate hardware status, this card shows the five real, already-fetched
 * configuration signals the CTO approved: Plate Registered, QR Active, AI
 * Receptionist, Masked Calling, Subscription Status. No online/offline
 * hardware claim is made anywhere in this card.
 */
@Composable
private fun SmartDoorStatusSection(data: DashboardData) {
    Column {
        SDSectionHeader(title = "Smart Door Status", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.sm)) {
                StatusLine(label = "Plate Registered", active = data.plate != null)
                StatusLine(label = "QR Active", active = data.plate?.status == "active")
                StatusLine(label = "AI Receptionist", active = data.securityRules?.autoReplyEnabled == true)
                StatusLine(label = "Masked Calling", active = data.securityRules?.callForwarding == true)
                StatusLine(label = "Subscription Status", active = data.subscription?.status == "active")
            }
        }
    }
}

@Composable
private fun StatusLine(label: String, active: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        SDBadge(
            text = if (active) "Active" else "Inactive",
            status = if (active) SDBadgeStatus.Success else SDBadgeStatus.Neutral,
        )
    }
}

// ────────── 8. SUBSCRIPTION SUMMARY ──────────

@Composable
private fun SubscriptionSummaryCard(data: DashboardData) {
    Column {
        SDSectionHeader(title = "Subscription", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth()) {
            if (data.subscription == null) {
                EmptySectionText("No active subscription plan.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xxs)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = data.subscription.plan.replace('_', ' ').replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.titleMedium,
                        )
                        SDBadge(
                            text = data.subscription.status.replaceFirstChar { it.uppercase() },
                            status = if (data.subscription.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Warning,
                        )
                    }
                    Text(
                        text = "Renews / expires ${formatDate(data.subscription.expiryDate)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

// ────────── SHARED PIECES ──────────

@Composable
private fun EmptySectionText(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = SmartDoorSpacing.sm),
    )
}

@Composable
private fun LastSyncFooter(data: DashboardData) {
    val lastSync = data.plate?.updatedAt
    Text(
        text = "Last synced ${formatRelativeTime(lastSync)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun RefreshGlyph() {
    // Intentionally not androidx.compose.material.icons.Icons.Filled.Refresh:
    // material-icons-core isn't a dependency anywhere in this app yet (grep
    // confirms zero existing Icons.* usage), and adding a new Gradle
    // dependency in this phase without being able to run a build to verify
    // resolution is riskier than a plain glyph. Swap in a real vector icon
    // in a later phase alongside a proper icon-set decision.
    Text(text = "⟳", style = MaterialTheme.typography.titleLarge, color = SmartDoorSecondaryDark)
}

// ────────── SKELETON / LOADING ──────────

@Composable
private fun DashboardSkeleton() {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.md),
    ) {
        item { SDSkeletonLoader(height = 96.dp, shape = RoundedCornerShape(20.dp)) }
        item { SDSkeletonLoader(height = 72.dp) }
        item { SDSkeletonLoaderGroup(lineCount = 2, lineHeight = 64.dp) }
        item { SDSkeletonLoader(height = 180.dp) }
        item { SDSkeletonLoader(height = 220.dp) }
        item { SDSkeletonLoader(height = 140.dp) }
        item { SDSkeletonLoader(height = 160.dp) }
    }
}

// ────────── FORMATTING HELPERS ──────────

private fun formatRelativeTime(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return try {
        val then = OffsetDateTime.parse(iso).toInstant()
        val minutes = Duration.between(then, Instant.now()).toMinutes()
        when {
            minutes < 1 -> "Just now"
            minutes < 60 -> "${minutes}m ago"
            minutes < 60 * 24 -> "${minutes / 60}h ago"
            else -> "${minutes / (60 * 24)}d ago"
        }
    } catch (e: Exception) {
        "—"
    }
}

private fun formatDate(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return try {
        val date = OffsetDateTime.parse(iso)
        "${date.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${date.year}"
    } catch (e: Exception) {
        "—"
    }
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
private fun DashboardSkeletonPreview() {
    SmartDoorTheme {
        DashboardSkeleton()
    }
}
