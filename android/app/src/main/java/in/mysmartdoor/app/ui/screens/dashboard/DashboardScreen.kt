package `in`.mysmartdoor.app.ui.screens.dashboard

import `in`.mysmartdoor.app.R
import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.navigation.Routes
import `in`.mysmartdoor.app.ui.components.GlassCard
import `in`.mysmartdoor.app.ui.components.SDAvatar
import `in`.mysmartdoor.app.ui.components.SDBadge
import `in`.mysmartdoor.app.ui.components.SDBadgeStatus
import `in`.mysmartdoor.app.ui.components.SDBottomNavigation
import `in`.mysmartdoor.app.ui.components.SDCard
import `in`.mysmartdoor.app.ui.components.SDNavItem
import `in`.mysmartdoor.app.ui.components.SDSectionHeader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoader
import `in`.mysmartdoor.app.ui.components.SDSkeletonLoaderGroup
import `in`.mysmartdoor.app.ui.components.SDTopBar
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorAi
import `in`.mysmartdoor.app.ui.theme.SmartDoorAiDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorDanger
import `in`.mysmartdoor.app.ui.theme.SmartDoorDangerDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorGlassBorder
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfo
import `in`.mysmartdoor.app.ui.theme.SmartDoorInfoDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorMotion
import `in`.mysmartdoor.app.ui.theme.SmartDoorSecondaryDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorSpacing
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccess
import `in`.mysmartdoor.app.ui.theme.SmartDoorSuccessDim
import `in`.mysmartdoor.app.ui.theme.SmartDoorSurfaceVariantDark
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import `in`.mysmartdoor.app.ui.theme.SmartDoorWarningDim
import `in`.mysmartdoor.app.ui.timeline.TimelineEntry
import `in`.mysmartdoor.app.ui.timeline.buildTimeline
import `in`.mysmartdoor.app.ui.timeline.formatRelativeTime
import `in`.mysmartdoor.app.ui.timeline.timelineKindIconRes
import `in`.mysmartdoor.app.ui.timeline.timelineKindLabel
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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import java.time.OffsetDateTime

/**
 * Owner Dashboard — Phase 12A PREMIUM UI REBUILD.
 *
 * All data still comes from [DashboardViewModel] -> [in.mysmartdoor.app.core.data.DashboardRepository]
 * (unchanged data flow from every earlier phase; only the composition
 * layer below changed). No mock data anywhere in this file — every value
 * rendered traces back to a real field on [DashboardData].
 *
 * This phase's brief (CTO Phase 12A handoff) is a visual rebuild only:
 * hero card, stat tiles, quick actions, and the live-activity preview were
 * all restyled to match the premium reference screenshot, and a bottom
 * navigation bar was wired in for the first time (see [SDBottomNavigation]).
 * No repository, ViewModel, SQL, or navigation *business logic* changed —
 * Quick Actions still navigate to exactly the same routes they did before,
 * `buildTimeline` still merges the exact same fields, `DashboardViewModel`
 * is untouched.
 *
 * The former `TimelineKind`/`TimelineEntry`/`buildTimeline` living in this
 * file were moved to [in.mysmartdoor.app.ui.timeline.TimelineModels] this
 * phase so the new full-screen
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen] can reuse
 * the identical merge logic instead of duplicating it.
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
        bottomBar = {
            SDBottomNavigation(
                items = dashboardBottomNavItems,
                selectedRoute = Routes.DASHBOARD,
                onItemSelected = { item ->
                    if (item.route != Routes.DASHBOARD) {
                        navController.navigate(item.route) { launchSingleTop = true }
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
                            "Call History" -> navController.navigate(Routes.CALL_HISTORY)
                            "Messages" -> navController.navigate(Routes.MESSAGES)
                            "QR Preview" -> navController.navigate(Routes.QR_PREVIEW)
                            "Smart Plate" -> navController.navigate(Routes.SMART_PLATE)
                            "AI Receptionist" -> navController.navigate(Routes.AI_RECEPTIONIST)
                            "Settings" -> navController.navigate(Routes.SETTINGS)
                            "Notifications" -> navController.navigate(Routes.NOTIFICATIONS)
                            "Account" -> navController.navigate(Routes.ACCOUNT)
                            else -> showComingSoon(feature)
                        }
                    },
                    onSeeAllActivity = { navController.navigate(Routes.LIVE_ACTIVITY) },
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

/** Shared 4-tab bottom nav config — Phase 12A scope: Home/Visitors/AI/Profile, all pre-existing routes. */
internal val dashboardBottomNavItems = listOf(
    SDNavItem(label = "Home", route = Routes.DASHBOARD, iconRes = R.drawable.ic_home),
    SDNavItem(label = "Visitors", route = Routes.VISITOR_FEED, iconRes = R.drawable.ic_people),
    SDNavItem(label = "AI", route = Routes.AI_RECEPTIONIST, iconRes = R.drawable.ic_bot),
    SDNavItem(label = "Profile", route = Routes.ACCOUNT, iconRes = R.drawable.ic_person),
)

@Composable
private fun DashboardContent(
    data: DashboardData,
    onQuickAction: (String) -> Unit,
    onSeeAllActivity: () -> Unit,
) {
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
            verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.lg),
        ) {
            item { GreetingHeader(data) }
            item { HeroSmartDoorCard(data) }
            item { LiveScanPillCard(data, onClick = onSeeAllActivity) }
            item { SmartStatisticsSection(data) }
            item { QuickActionsSection(onQuickAction) }
            item { AiReceptionistCard(data) }
            item { LiveActivityPreviewSection(data, onSeeAll = onSeeAllActivity) }
            item { NotificationsPreviewSection(data) }
            item { SmartDoorStatusSection(data) }
            item { SubscriptionSummaryCard(data) }
            item { LastSyncFooter(data) }
        }
    }
}

// ────────── 0. GREETING HEADER ──────────

private fun timeOfDayGreeting(): String {
    val hour = OffsetDateTime.now().hour
    return when {
        hour < 12 -> "Good Morning"
        hour < 17 -> "Good Afternoon"
        else -> "Good Evening"
    }
}

@Composable
private fun GreetingHeader(data: DashboardData) {
    val firstName = data.owner.fullName.trim().substringBefore(' ')
    Column {
        Text(
            text = "${timeOfDayGreeting()}, $firstName",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
        Text(
            text = "Your home is protected and connected.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ────────── 1. HERO SMART DOOR CARD ──────────

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun HeroSmartDoorCard(data: DashboardData) {
    GlassCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(SmartDoorSpacing.lg),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val isNarrow = maxWidth < StatGridNarrowBreakpoint
            val plateSize = if (isNarrow) 96.dp else 116.dp
            val nameStyle = if (isNarrow) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineSmall

            Column(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlatePreview(plateId = data.owner.plateId, modifier = Modifier.size(plateSize))
                    Spacer(modifier = Modifier.width(SmartDoorSpacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "SMART DOOR",
                            style = MaterialTheme.typography.labelMedium,
                            color = SmartDoorSecondaryDark,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 2.sp,
                        )
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                        Text(
                            text = data.owner.plateId,
                            style = nameStyle,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SDAvatar(name = data.owner.fullName, size = 20.dp)
                            Spacer(modifier = Modifier.width(SmartDoorSpacing.xxs))
                            Text(
                                text = data.owner.fullName,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
                HorizontalDivider(color = SmartDoorGlassBorder, thickness = 1.dp)
                Spacer(modifier = Modifier.height(SmartDoorSpacing.md))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
                    verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs),
                ) {
                    SDBadge(
                        text = if (data.plate?.status == "active") "Online" else (data.plate?.status?.replaceFirstChar { it.uppercase() } ?: "Not linked"),
                        status = if (data.plate?.status == "active") SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                    )
                    SDBadge(
                        text = subscriptionBadgeLabel(data),
                        status = if (data.subscription?.status == "active") SDBadgeStatus.Info else SDBadgeStatus.Neutral,
                    )
                    SDBadge(
                        text = if (data.securityRules?.autoReplyEnabled == true) "AI Online" else "AI Offline",
                        status = if (data.securityRules?.autoReplyEnabled == true) SDBadgeStatus.Success else SDBadgeStatus.Neutral,
                    )
                }
            }
        }
    }
}

/**
 * Stylized plate mockup drawn entirely in Compose — a gold-ringed dark tile
 * with a QR glyph ([R.drawable.ic_qr], now available) and the house
 * monogram, matching the reference's nameplate hero visual. Still no
 * image-loading library and no QR-generation dependency (unchanged
 * constraint from the original Owner Dashboard V1 phase) — this is a
 * premium placeholder, not a rendered photo/real QR payload.
 */
@Composable
private fun PlatePreview(plateId: String, modifier: Modifier = Modifier) {
    val plateShape = RoundedCornerShape(20.dp)
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .shadow(elevation = 6.dp, shape = plateShape, clip = false)
            .clip(plateShape)
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(SmartDoorSurfaceVariantDark, MaterialTheme.colorScheme.background),
                ),
            )
            .border(width = 1.5.dp, color = SmartDoorSecondaryDark.copy(alpha = 0.7f), shape = plateShape)
            .padding(6.dp)
            .border(width = 1.dp, color = SmartDoorSecondaryDark.copy(alpha = 0.35f), shape = RoundedCornerShape(15.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(id = R.drawable.ic_qr),
            contentDescription = "Smart Door QR for $plateId",
            tint = SmartDoorSecondaryDark,
            modifier = Modifier.size(40.dp),
        )
    }
}

private fun subscriptionBadgeLabel(data: DashboardData): String {
    val plan = data.subscription?.plan?.replace('_', ' ')?.replaceFirstChar { it.uppercase() }
    return plan ?: "No active plan"
}

// ────────── 1B. LIVE SCAN PILL ──────────

/**
 * The reference's "Someone scanned your QR ... 2 min ago" live pill,
 * sitting directly under the hero card. Sourced from
 * [DashboardData.recentVisitors]'s most recent entry — no new data source.
 * Tapping it opens the same full [Routes.LIVE_ACTIVITY] feed the
 * Dashboard's "Live Activity" section's "See all" action opens.
 */
@Composable
private fun LiveScanPillCard(data: DashboardData, onClick: () -> Unit) {
    val latest = data.recentVisitors.firstOrNull()
    SDCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            PulsingLiveDot()
            Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (latest != null) {
                        "Someone ${latest.eventType.replace('_', ' ')}"
                    } else {
                        "No recent activity yet"
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = formatRelativeTime(latest?.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PulsingLiveDot() {
    val transition = rememberInfiniteTransition(label = "live_dot")
    val alpha by transition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = SmartDoorMotion.durationLong),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "live_dot_alpha",
    )
    Box(
        modifier = Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(SmartDoorDanger.copy(alpha = alpha)),
    )
}

// ────────── 2. AI RECEPTIONIST CARD ──────────

@Composable
private fun AiReceptionistCard(data: DashboardData) {
    val aiEnabled = data.securityRules?.autoReplyEnabled == true
    val lastInteraction = data.recentVisitorVisits.firstOrNull { it.purpose != null }

    SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconCircle(iconRes = R.drawable.ic_bot, tint = SmartDoorAi, tintDim = SmartDoorAiDim, size = 32.dp)
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

// ────────── 3. SMART STATISTICS ──────────

private val StatGridNarrowBreakpoint = 380.dp

private data class StatEntry(val label: String, val value: Int, val iconRes: Int, val tint: Color, val tintDim: Color)

@Composable
private fun SmartStatisticsSection(data: DashboardData) {
    val stats = listOf(
        StatEntry("Today's Visitors", data.todayVisitorCount, R.drawable.ic_qr, SmartDoorSecondaryDark, SmartDoorWarningDim),
        StatEntry("Unread Messages", data.unreadMessageCount, R.drawable.ic_chat, SmartDoorInfo, SmartDoorInfoDim),
        StatEntry("AI Handled", data.aiHandledCount, R.drawable.ic_bot, SmartDoorAi, SmartDoorAiDim),
        StatEntry("Missed Visitors", data.missedVisitorCount, R.drawable.ic_call, SmartDoorDanger, SmartDoorDangerDim),
        StatEntry("Notifications", data.unreadNotificationCount, R.drawable.ic_bell, SmartDoorSuccess, SmartDoorSuccessDim),
    )
    Column {
        SDSectionHeader(title = "Smart Statistics", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val columns = if (maxWidth < StatGridNarrowBreakpoint) 2 else 3
            Column(verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                stats.chunked(columns).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(SmartDoorSpacing.xs)) {
                        row.forEach { stat ->
                            IconStatTile(stat = stat, modifier = Modifier.weight(1f))
                        }
                        repeat(columns - row.size) { Spacer(modifier = Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun IconStatTile(stat: StatEntry, modifier: Modifier = Modifier) {
    val animated by animateIntAsState(
        targetValue = stat.value,
        animationSpec = tween(SmartDoorMotion.durationLong, easing = SmartDoorMotion.standard),
        label = "count_up_${stat.label}",
    )
    SDCard(modifier = modifier, shape = RoundedCornerShape(16.dp)) {
        Column {
            IconCircle(iconRes = stat.iconRes, tint = stat.tint, tintDim = stat.tintDim, size = 32.dp)
            Spacer(modifier = Modifier.height(SmartDoorSpacing.xs))
            Text(
                text = animated.toString(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stat.label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Small circular icon badge — the "icon in a tinted circle" motif the premium reference uses everywhere. */
@Composable
private fun IconCircle(iconRes: Int, tint: Color, tintDim: Color, size: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(tintDim),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(size * 0.55f),
        )
    }
}

// ────────── 4. QUICK ACTIONS ──────────

private data class QuickAction(val label: String, val iconRes: Int)

private val quickActions = listOf(
    QuickAction("Visitor History", R.drawable.ic_receipt),
    QuickAction("Call History", R.drawable.ic_call),
    QuickAction("Messages", R.drawable.ic_chat),
    QuickAction("QR Preview", R.drawable.ic_qr),
    QuickAction("Smart Plate", R.drawable.ic_plug),
    QuickAction("AI Receptionist", R.drawable.ic_bot),
    QuickAction("Settings", R.drawable.ic_settings),
    QuickAction("Notifications", R.drawable.ic_bell),
    QuickAction("Account", R.drawable.ic_person),
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
        shape = RoundedCornerShape(16.dp),
        contentPadding = PaddingValues(vertical = SmartDoorSpacing.sm, horizontal = SmartDoorSpacing.xxs),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            IconCircle(iconRes = action.iconRes, tint = SmartDoorSecondaryDark, tintDim = SmartDoorWarningDim, size = 40.dp)
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

// ────────── 5. LIVE ACTIVITY PREVIEW ──────────

/**
 * Dashboard's compact preview of the same feed
 * [in.mysmartdoor.app.ui.screens.liveactivity.LiveActivityScreen] shows in
 * full. Both call [buildTimeline] on the same [DashboardData] — this is
 * the only place that data is fetched; the full-screen version below reads
 * it from [DashboardViewModel] again via `hiltViewModel()`, not a second
 * network round trip triggered from here.
 */
@Composable
private fun LiveActivityPreviewSection(data: DashboardData, onSeeAll: () -> Unit) {
    val entries = remember(data) { buildTimeline(data, limit = 5) }
    Column {
        SDSectionHeader(
            title = "Live Activity",
            actionLabel = "See all",
            onActionClick = onSeeAll,
            modifier = Modifier.padding(bottom = SmartDoorSpacing.xs),
        )
        SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
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
internal fun TimelineRow(entry: TimelineEntry) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = SmartDoorSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconCircle(
            iconRes = timelineKindIconRes(entry.kind),
            tint = if (entry.isAlert) SmartDoorDanger else SmartDoorSecondaryDark,
            tintDim = if (entry.isAlert) SmartDoorDangerDim else SmartDoorWarningDim,
            size = 40.dp,
        )
        Spacer(modifier = Modifier.width(SmartDoorSpacing.sm))
        Column(modifier = Modifier.weight(1f, fill = true)) {
            Text(
                text = entry.primary,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = entry.secondary?.takeIf { it.isNotBlank() } ?: timelineKindLabel(entry.kind),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
        Text(
            text = formatRelativeTime(entry.createdAt),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            softWrap = false,
            modifier = Modifier.widthIn(max = 72.dp),
        )
    }
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
        SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
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
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = SmartDoorSpacing.sm),
        // Top-aligned, not centered: a 2-line title + body stack is taller
        // than the single-line timestamp, and center-aligning them let the
        // timestamp drift into the body line on longer notifications.
        verticalAlignment = Alignment.Top,
    ) {
        if (!notification.isRead) {
            Box(
                modifier = Modifier
                    .padding(top = SmartDoorSpacing.xxs)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(SmartDoorSecondaryDark),
            )
            Spacer(modifier = Modifier.width(SmartDoorSpacing.xs))
        }
        Column(
            modifier = Modifier
                .weight(1f, fill = true)
                .padding(end = SmartDoorSpacing.sm),
        ) {
            Text(
                text = notification.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (!notification.isRead) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            if (!notification.body.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(SmartDoorSpacing.xxs))
                Text(
                    text = notification.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Text(
            text = formatRelativeTime(notification.createdAt),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            softWrap = false,
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(max = 72.dp),
        )
    }
}

// ────────── 7. SMART DOOR STATUS ──────────

@Composable
private fun SmartDoorStatusSection(data: DashboardData) {
    Column {
        SDSectionHeader(title = "Smart Door Status", modifier = Modifier.padding(bottom = SmartDoorSpacing.xs))
        SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
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
        SDCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
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
    Icon(
        painter = painterResource(id = R.drawable.ic_refresh),
        contentDescription = "Refresh",
        modifier = Modifier.size(20.dp),
        tint = SmartDoorSecondaryDark,
    )
}

// ────────── SKELETON / LOADING ──────────

@Composable
private fun DashboardSkeleton() {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SmartDoorSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SmartDoorSpacing.md),
    ) {
        item { SDSkeletonLoader(height = 24.dp, shape = RoundedCornerShape(6.dp)) }
        item { SDSkeletonLoader(height = 160.dp, shape = RoundedCornerShape(24.dp)) }
        item { SDSkeletonLoader(height = 56.dp, shape = RoundedCornerShape(16.dp)) }
        item { SDSkeletonLoaderGroup(lineCount = 2, lineHeight = 64.dp) }
        item { SDSkeletonLoader(height = 180.dp) }
        item { SDSkeletonLoader(height = 220.dp) }
        item { SDSkeletonLoader(height = 140.dp) }
        item { SDSkeletonLoader(height = 160.dp) }
    }
}

// ────────── FORMATTING HELPERS ──────────

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
