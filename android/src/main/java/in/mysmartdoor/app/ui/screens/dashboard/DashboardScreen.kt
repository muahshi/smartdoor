package `in`.mysmartdoor.app.ui.screens.dashboard

import `in`.mysmartdoor.app.core.data.model.DashboardData
import `in`.mysmartdoor.app.core.network.dto.CallLogDto
import `in`.mysmartdoor.app.core.network.dto.MessageLogDto
import `in`.mysmartdoor.app.core.network.dto.NotificationDto
import `in`.mysmartdoor.app.core.network.dto.VisitorLogDto
import `in`.mysmartdoor.app.ui.screens.common.ErrorScreen
import `in`.mysmartdoor.app.ui.theme.SmartDoorTheme
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Owner Dashboard V1 — replaces the `Routes.DASHBOARD` placeholder that
 * previously rendered `EmptyStateScreen` in [in.mysmartdoor.app.navigation.SmartDoorNavHost]
 * (see that file's history: "You're in! Dashboard is coming in a later phase.").
 *
 * All data comes from [DashboardViewModel] → [in.mysmartdoor.app.core.data.DashboardRepository],
 * which reads the same production tables `js/dashboard.js` reads on the
 * website. No mock data anywhere in this file.
 *
 * Quick Actions (Visitor History, Call History, Messages, QR Preview,
 * Smart Plate, AI Receptionist, Settings, Notifications, Account) are real
 * Material buttons, but none of their destination screens exist yet in
 * [in.mysmartdoor.app.navigation.SmartDoorNavHost] — building them is
 * explicitly out of scope for this phase (future roadmap). Tapping one
 * shows a "coming soon" snackbar instead of navigating to an unregistered
 * route and crashing, the same pattern [in.mysmartdoor.app.navigation.Routes]
 * already documents for `VISITOR_FEED`. The new route constants added there
 * exist purely as the contract for those later phases.
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
            TopAppBar(
                title = { Text("Dashboard", style = MaterialTheme.typography.titleMedium) },
                actions = {
                    IconButton(onClick = { if (!uiState.isRefreshing) viewModel.refresh() }) {
                        if (uiState.isRefreshing) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
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
                    onQuickAction = ::showComingSoon,
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
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { OwnerHeaderCard(data) }
        item { StatusRow(data) }
        item { StatsRow(data) }
        item { QuickActionsGrid(onQuickAction) }
        item { RecentVisitorsSection(data.recentVisitors) }
        item { RecentCallsSection(data.recentCalls) }
        item { RecentMessagesSection(data.recentMessages) }
        item { RecentNotificationsSection(data.recentNotifications, data.unreadNotificationCount) }
        item { LastSyncFooter(data) }
    }
}

// ────────── HEADER ──────────

@Composable
private fun OwnerHeaderCard(data: DashboardData) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.secondary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = data.owner.fullName.trim().firstOrNull()?.uppercase() ?: "?",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSecondary,
                )
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = data.owner.fullName,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = data.owner.plateId,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary,
                )
                Text(
                    text = "Member since ${formatDate(data.owner.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ────────── STATUS CHIPS ──────────

@Composable
private fun StatusRow(data: DashboardData) {
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusChip(
                label = "Plate",
                value = data.plate?.status?.replaceFirstChar { it.uppercase() } ?: "Not linked",
                active = data.plate?.status == "active",
                modifier = Modifier.weight(1f),
            )
            StatusChip(
                label = "Subscription",
                value = data.subscription?.plan?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: "None",
                active = data.subscription?.status == "active",
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusChip(
                label = "AI Receptionist",
                value = if (data.securityRules?.autoReplyEnabled == true) "On" else "Off",
                active = data.securityRules?.autoReplyEnabled == true,
                modifier = Modifier.weight(1f),
            )
            StatusChip(
                label = "Masked Calling",
                value = if (data.securityRules?.callForwarding == true) "On" else "Off",
                active = data.securityRules?.callForwarding == true,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun StatusChip(label: String, value: String, active: Boolean, modifier: Modifier = Modifier) {
    val dotColor = if (active) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outline
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(dotColor),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(text = label, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ────────── STATS ──────────

@Composable
private fun StatsRow(data: DashboardData) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StatTile(label = "Today's Visitors", value = data.todayVisitorCount.toString(), modifier = Modifier.weight(1f))
        StatTile(label = "Unread Messages", value = data.unreadMessageCount.toString(), modifier = Modifier.weight(1f))
        StatTile(label = "Notifications", value = data.unreadNotificationCount.toString(), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.secondary,
            )
            Text(text = label, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
        }
    }
}

// ────────── QUICK ACTIONS ──────────

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
private fun QuickActionsGrid(onAction: (String) -> Unit) {
    Column {
        Text(
            text = "Quick Actions",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        quickActions.chunked(3).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { action ->
                    QuickActionButton(
                        action = action,
                        onClick = { onAction(action.label) },
                        modifier = Modifier.weight(1f),
                    )
                }
                // Pad the last, possibly-shorter row so buttons keep equal width.
                repeat(3 - row.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun QuickActionButton(action: QuickAction, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = action.glyph, style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(4.dp))
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

// ────────── RECENT SECTIONS ──────────

@Composable
private fun RecentVisitorsSection(visitors: List<VisitorLogDto>) {
    SectionCard(title = "Recent Visitors") {
        if (visitors.isEmpty()) {
            EmptySectionText("No visitors yet. They'll show up here once someone scans your QR code.")
        } else {
            visitors.forEachIndexed { index, log ->
                RowItem(
                    primary = log.eventType.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    secondary = log.aiIntent,
                    trailing = formatRelativeTime(log.createdAt),
                )
                if (index != visitors.lastIndex) HorizontalDivider()
            }
        }
    }
}

@Composable
private fun RecentCallsSection(calls: List<CallLogDto>) {
    SectionCard(title = "Recent Calls") {
        if (calls.isEmpty()) {
            EmptySectionText("No calls yet.")
        } else {
            calls.forEachIndexed { index, call ->
                RowItem(
                    primary = call.callStatus.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    secondary = if (call.duration > 0) "${call.duration}s" else null,
                    trailing = formatRelativeTime(call.startedAt),
                )
                if (index != calls.lastIndex) HorizontalDivider()
            }
        }
    }
}

@Composable
private fun RecentMessagesSection(messages: List<MessageLogDto>) {
    SectionCard(title = "Recent Messages") {
        if (messages.isEmpty()) {
            EmptySectionText("No messages yet.")
        } else {
            messages.forEachIndexed { index, message ->
                RowItem(
                    primary = message.messageType.replaceFirstChar { it.uppercase() },
                    secondary = message.content,
                    trailing = formatRelativeTime(message.createdAt),
                    emphasized = !message.isRead,
                )
                if (index != messages.lastIndex) HorizontalDivider()
            }
        }
    }
}

@Composable
private fun RecentNotificationsSection(notifications: List<NotificationDto>, unreadCount: Int) {
    SectionCard(title = if (unreadCount > 0) "Notifications ($unreadCount unread)" else "Notifications") {
        if (notifications.isEmpty()) {
            EmptySectionText("You're all caught up.")
        } else {
            notifications.forEachIndexed { index, notification ->
                RowItem(
                    primary = notification.title,
                    secondary = notification.body,
                    trailing = formatRelativeTime(notification.createdAt),
                    emphasized = !notification.isRead,
                )
                if (index != notifications.lastIndex) HorizontalDivider()
            }
        }
    }
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

// ────────── SHARED PIECES ──────────

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun RowItem(primary: String, secondary: String?, trailing: String, emphasized: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = primary,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (emphasized) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!secondary.isNullOrBlank()) {
                Text(
                    text = secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = trailing,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptySectionText(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 12.dp),
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
    Text(text = "⟳", style = MaterialTheme.typography.titleLarge)
}

// ────────── SKELETON / LOADING ──────────

@Composable
private fun DashboardSkeleton() {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { SkeletonBlock(height = 84.dp) }
        item { SkeletonBlock(height = 64.dp) }
        item { SkeletonBlock(height = 64.dp) }
        item { SkeletonBlock(height = 96.dp) }
        item { SkeletonBlock(height = 220.dp) }
        item { SkeletonBlock(height = 160.dp) }
        item { SkeletonBlock(height = 160.dp) }
    }
}

@Composable
private fun SkeletonBlock(height: Dp) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.85f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 700),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "skeletonAlpha",
    )
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(12.dp))
            .alpha(alpha),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {}
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
