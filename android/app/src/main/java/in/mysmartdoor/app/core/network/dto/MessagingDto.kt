package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Row DTOs for the Messages Inbox (Phase 6 — MESSAGES V2).
 *
 * Backed entirely by the existing production `conversations` / `messages`
 * tables (see `sql/31_unified_messaging.sql`, `sql/32_conversation_unification_v2.sql`),
 * the exact same backend the website's Inbox tab already reads via
 * `services/messaging.js#listConversations()` /
 * `#_getUnreadCountsByConversation()`. No new table, column, or RPC. Field
 * names/nullability mirror exactly what those tables already contain.
 *
 * There is no visitor name or phone number anywhere in this system — see
 * `services/communicationCenter.js`'s identity-model note (the only
 * "identity" is an owner-authored tag, never visitor-supplied). Because of
 * that, [ConversationDto] intentionally has no name/phone field to fake;
 * the UI layer falls back to [tags] / [handledBy] / [plateId] instead.
 */

/**
 * One row of `conversations`, as read by an owner's inbox list.
 *
 * [unreadCount] is NOT a database column — it is computed client-side in
 * [in.mysmartdoor.app.core.data.MessagesRepository] from an unseen
 * visitor-message count, the same two-query approach
 * `listConversations()` + `_getUnreadCountsByConversation()` uses on the
 * website. It defaults to 0 here only so [ConversationDto] can be decoded
 * directly from the `conversations` select before that second read is
 * merged in via `copy(unreadCount = ...)`.
 */
@Serializable
data class ConversationDto(
    val id: String,
    @SerialName("plate_id") val plateId: String,
    val status: String,
    val pinned: Boolean = false,
    val tags: List<String> = emptyList(),
    @SerialName("last_intent") val lastIntent: String? = null,
    @SerialName("ai_summary") val aiSummary: String? = null,
    @SerialName("last_message_at") val lastMessageAt: String,
    @SerialName("last_message_preview") val lastMessagePreview: String? = null,
    @SerialName("handled_by") val handledBy: String = "ai",
    @SerialName("created_at") val createdAt: String,
    val unreadCount: Int = 0,
)

/**
 * Minimal projection of `messages`, selected only to compute
 * per-conversation unread counts client-side (mirrors
 * `_getUnreadCountsByConversation()`: unseen messages sent by the
 * visitor). Not used to render a thread/message list — that is future
 * scope (see [in.mysmartdoor.app.ui.screens.messages.MessagesScreen]'s
 * doc comment).
 */
@Serializable
data class UnreadMessageDto(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("seen_at") val seenAt: String? = null,
)
