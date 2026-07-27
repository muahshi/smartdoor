package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Result
import `in`.mysmartdoor.app.core.network.dto.ConversationDto
import `in`.mysmartdoor.app.core.network.dto.UnreadMessageDto
import `in`.mysmartdoor.app.core.session.SecureSessionManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Messages Inbox (Phase 6 — MESSAGES V2) — reads the exact same production
 * `conversations` / `messages` tables the website's Inbox tab already
 * queries (`services/messaging.js#listConversations`,
 * `#_getUnreadCountsByConversation`). No new table, column, or RPC; RLS on
 * both tables already scopes every row to `owner_id = get_my_owner_id()`
 * server-side — [ownerId] is passed explicitly the same way
 * [VisitorRepository] does, as defense-in-depth, not as the actual
 * authorization boundary.
 *
 * Per CTO direction this phase is initial-load + pull-to-refresh only: no
 * Realtime subscription (the web equivalent's `subscribeToInbox`) and no
 * cursor pagination beyond [PAGE_SIZE] — an owner inbox is not
 * WhatsApp-scale, same assumption `listConversations()`'s own default
 * `limit = 100` already makes.
 *
 * [ownerId] is `users.id`, sourced the same way [VisitorRepository] /
 * [DashboardRepository] do — via [SecureSessionManager].
 */
@Singleton
class MessagesRepository @Inject constructor(
    private val client: SupabaseClient,
    private val sessionManager: SecureSessionManager,
) : BaseRepository() {

    companion object {
        const val PAGE_SIZE = 100L
    }

    /**
     * The full conversation inbox for one owner, with a client-computed
     * [ConversationDto.unreadCount] merged onto each row.
     *
     * @param filter one of 'all' | 'unread' | 'pinned' | 'archived' |
     *   'resolved' | 'active' — the exact same filter values
     *   `listConversations()` accepts on the website.
     * @param search matches against `last_message_preview`, same as the website.
     */
    suspend fun getConversations(
        filter: String = "all",
        search: String? = null,
    ): Result<List<ConversationDto>> {
        val ownerId = sessionManager.userIdFlow.first()
        if (ownerId.isNullOrBlank()) {
            return Result.Error(AppError.Auth(message = "Session expired. Please log in again."))
        }
        return safeApiCall {
            val conversations = client.postgrest
                .from("conversations")
                .select(
                    columns = Columns.raw(
                        "id,plate_id,status,pinned,tags,last_intent,ai_summary," +
                            "last_message_at,last_message_preview,handled_by,created_at",
                    ),
                ) {
                    filter {
                        eq("owner_id", ownerId)
                        when (filter) {
                            "pinned" -> eq("pinned", true)
                            "archived" -> eq("status", "archived")
                            "resolved" -> eq("status", "resolved")
                            "active" -> eq("status", "active")
                            // 'all' / 'unread' = everything except archived, matching
                            // listConversations()'s own "like WhatsApp" default.
                            else -> neq("status", "archived")
                        }
                        if (!search.isNullOrBlank()) {
                            ilike("last_message_preview", "%${search.trim()}%")
                        }
                    }
                    order(column = "pinned", order = Order.DESCENDING)
                    order(column = "last_message_at", order = Order.DESCENDING)
                    limit(count = PAGE_SIZE)
                }
                .decodeList<ConversationDto>()

            val unreadCounts = getUnreadCountsByConversation(ownerId)
            val withUnread = conversations.map { it.copy(unreadCount = unreadCounts[it.id] ?: 0) }

            if (filter == "unread") withUnread.filter { it.unreadCount > 0 } else withUnread
        }
    }

    /**
     * Mirrors `services/messaging.js#_getUnreadCountsByConversation`:
     * messages sent by the visitor that the owner hasn't seen yet,
     * grouped by thread. Same `messages` table the website reads; RLS
     * already scopes it to this owner.
     */
    private suspend fun getUnreadCountsByConversation(ownerId: String): Map<String, Int> {
        val rows = client.postgrest
            .from("messages")
            .select(columns = Columns.raw("conversation_id,seen_at")) {
                filter {
                    eq("owner_id", ownerId)
                    eq("sender_type", "visitor")
                }
            }
            .decodeList<UnreadMessageDto>()

        return rows
            .filter { it.seenAt == null }
            .groupingBy { it.conversationId }
            .eachCount()
    }
}
