package `in`.mysmartdoor.app.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Postgrest row DTOs for the Owner Dashboard (Phase: Owner Dashboard V1).
 *
 * Every table/column here already exists in production — see
 * `sql/01_schema.sql` (users, plates, subscriptions, security_rules,
 * visitor_logs, notifications) and `sql/04_communication_schema.sql`
 * (call_logs, message_logs). Field names/nullability mirror exactly what
 * `services/` *.js on the website selects from these same tables
 * (`services/auth.js#getCurrentOwner`, `services/plates.js#getMyPlate`,
 * `services/subscriptions.js#getSubscription`, `services/security.js`,
 * `services/logs.js`). No new columns, no new tables.
 *
 * `@Serializable` classes only decode the columns actually `.select()`ed by
 * [in.mysmartdoor.app.core.data.DashboardRepository] — not every column on
 * the table — so partial selects stay valid without extra optional fields.
 */

@Serializable
data class OwnerProfileDto(
    val id: String,
    @SerialName("full_name") val fullName: String,
    val phone: String,
    val email: String? = null,
    @SerialName("plate_id") val plateId: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class PlateDto(
    @SerialName("plate_id") val plateId: String,
    @SerialName("qr_slug") val qrSlug: String,
    @SerialName("product_type") val productType: String? = null,
    val status: String,
    @SerialName("expiry_date") val expiryDate: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class SubscriptionDto(
    val plan: String,
    val status: String,
    @SerialName("expiry_date") val expiryDate: String,
)

/**
 * `security_rules` doubles as "owner settings" in production (see
 * `sql/29_ai_receptionist_production.sql` comment: "Reusing security_rules
 * as the single owner settings row"). [autoReplyEnabled] is the AI
 * Receptionist toggle; [callForwarding] is the Masked Calling toggle.
 */
@Serializable
data class SecurityRulesDto(
    @SerialName("current_status") val currentStatus: String? = null,
    @SerialName("custom_message") val customMessage: String? = null,
    @SerialName("call_forwarding") val callForwarding: Boolean = true,
    @SerialName("auto_reply_enabled") val autoReplyEnabled: Boolean = true,
    @SerialName("night_mode_on") val nightModeOn: Boolean = false,
)

@Serializable
data class VisitorLogDto(
    val id: String,
    @SerialName("event_type") val eventType: String,
    @SerialName("ai_intent") val aiIntent: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class CallLogDto(
    val id: String,
    @SerialName("call_status") val callStatus: String,
    val duration: Int = 0,
    @SerialName("started_at") val startedAt: String,
)

@Serializable
data class MessageLogDto(
    val id: String,
    @SerialName("message_type") val messageType: String,
    val content: String? = null,
    val priority: String = "normal",
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val body: String? = null,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String,
)

/**
 * Row DTO for `visitor_visits` (see `sql/41_visitor_memory.sql`). Owner
 * Dashboard Phase 2 — backs the "AI Handled" / "Missed Visitor" Smart
 * Statistics and the AI Receptionist card's last-interaction line. No new
 * columns/tables involved; [purpose] is the AI receptionist's detected
 * visitor intent (e.g. "Delivery" / "Guest" / "Maid" — see
 * `services/aiReceptionist.js`); [accepted] is null for non-call
 * interactions (bell, message) and true/false once a call is resolved.
 *
 * Per CTO-approved production definitions:
 * - Missed Visitor = accepted == false
 * - AI Handled      = accepted == false AND purpose != null
 *
 * Every AI-Handled visit is therefore also a Missed visit by definition —
 * "missed" describes the owner never answering, "AI handled" describes what
 * happened as a *result* of that non-answer. Expected, not a bug.
 */
@Serializable
data class VisitorVisitDto(
    val id: String,
    val purpose: String? = null,
    @SerialName("call_type") val callType: String? = null,
    val accepted: Boolean? = null,
    val duration: Int = 0,
    @SerialName("created_at") val createdAt: String,
)
