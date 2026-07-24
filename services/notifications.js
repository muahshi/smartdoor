/**
 * My Smart Door — Notification Engine
 * services/notifications.js
 *
 * Handles: Bell Ring, Voice Note, Call Request, Emergency Alert, Status Change.
 *
 * CHANNEL ARCHITECTURE (future-proofed, not all active today):
 *   in_app  → always on, writes to `notifications` table, owner dashboard
 *             picks it up via realtime subscription.
 *   push    → real for bell/qr/voice/text/sos/ai_escalation/status_reminder,
 *             but sent directly at the write-site (visitor.html,
 *             renewal-engine-cron) via supabase/functions/send-push, NOT
 *             through this file's own CHANNELS.push (see its comment for
 *             why: avoiding a double-notify for inbox_message specifically).
 *   sms     → stub. Wire to Exotel/Twilio SMS API later.
 *   whatsapp→ delegates to services/whatsapp.js (provider-agnostic).
 *   email   → stub. Wire to a transactional email provider later.
 *
 * Every channel function has the same signature so new ones can be added
 * without touching call sites — `dispatch()` is the only thing callers use.
 */

import { supabase } from './supabase.js';
import { sendWhatsApp } from './whatsapp.js';

// ────────── CHANNEL HANDLERS ──────────
const CHANNELS = {
  in_app: async (notification) => {
    // Already persisted by createNotification() — nothing extra to do.
    return { channel: 'in_app', status: 'sent' };
  },
  push: async (notification) => {
    // FIX (FCM production integration audit): this used to claim delivery
    // was "delegated to a DB trigger" (sql/33_push_notifications.sql). That
    // trigger is dormant (its own setup comment says system_config isn't
    // populated) AND, even if enabled, posts a payload shape
    // (`{table, record}`) that supabase/functions/send-push has never
    // accepted — so real push was silently never sent via this path.
    //
    // Real background push today is sent directly, at the write-site, by
    // the two callers that actually need it:
    //   - visitor.html's _triggerPush() for bell/qr/voice/text/sos/
    //     ai_escalation (fires the instant the visitor_logs/messages row
    //     is written — the visitor's browser is guaranteed active then,
    //     even if the owner's isn't)
    //   - supabase/functions/renewal-engine-cron (+ services/renewalEngine.js
    //     for the admin-triggered manual run) for status_reminder
    // both calling supabase/functions/send-push directly.
    //
    // notifyNewConversationMessage() below (the one live caller that
    // reaches this channel today) is intentionally left as a no-op here:
    // every message that creates it is ALSO sent through
    // services/communication.js's sendTextMessage/sendVoiceMessage, which
    // already triggers the real push above — wiring a second send here
    // would double-notify the owner for the same message.
    return { channel: 'push', status: 'no_op_see_comment' };
  },
  sms: async (_notification) => {
    // TODO: integrate Exotel/Twilio SMS API via an Edge Function.
    return { channel: 'sms', status: 'not_configured' };
  },
  whatsapp: async (notification) => {
    if (!notification.toPhone) return { channel: 'whatsapp', status: 'skipped_no_phone' };
    const result = await sendWhatsApp({
      ownerId: notification.ownerId,
      toPhone: notification.toPhone,
      templateName: notification.whatsappTemplate || 'smartdoor_alert',
      templateVars: { title: notification.title, body: notification.body },
      priority: notification.priority,
    });
    return { channel: 'whatsapp', status: result.success ? 'sent' : 'failed' };
  },
  email: async (_notification) => {
    // TODO: integrate transactional email provider. Architecture placeholder only.
    return { channel: 'email', status: 'not_configured' };
  },
};

// ────────── CREATE + PERSIST A NOTIFICATION ──────────
/**
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.type        'bell' | 'voice' | 'call' | 'sos' | 'status_change'
 * @param {string} params.title
 * @param {string} [params.body]
 * @param {object} [params.payload]
 * @param {('normal'|'high'|'critical')} [params.priority]
 * @param {string[]} [params.channels]  e.g. ['in_app','whatsapp']
 */
export async function createNotification({ ownerId, type, title, body = null, payload = {}, priority = 'normal', channels = ['in_app'] }) {
  try {
    // Generate id client-side — dispatch() needs it to update delivery_status
    // without a SELECT readback. No .select().single() after insert because
    // visitor is anon and notifications_select_own only allows authenticated
    // owners. Chaining .select() causes Supabase to re-evaluate the SELECT
    // policy for anon, which returns 0 rows and surfaces as "violates
    // row-level security policy" even though the INSERT succeeded.
    const notificationId = crypto.randomUUID();
    const { error } = await supabase
      .from('notifications')
      .insert({
        id: notificationId,
        owner_id: ownerId,
        type,
        title,
        body,
        payload,
        priority,
        channels,
      });

    if (error) throw error;
    return { success: true, notification: { id: notificationId, owner_id: ownerId, type, title, body, payload, priority, channels } };
  } catch (err) {
    console.error('[Notifications] createNotification error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── DISPATCH ACROSS CHANNELS ──────────
/**
 * Creates the notification row, then fires every requested channel handler.
 * Channel failures never block other channels or the in_app record.
 */
export async function dispatch({ ownerId, type, title, body, payload = {}, priority = 'normal', channels = ['in_app'], toPhone = null, whatsappTemplate = null }) {
  const created = await createNotification({ ownerId, type, title, body, payload, priority, channels });
  if (!created.success) return created;

  const results = await Promise.allSettled(
    channels.map((ch) => (CHANNELS[ch] ? CHANNELS[ch]({ ownerId, title, body, priority, toPhone, whatsappTemplate }) : Promise.resolve({ channel: ch, status: 'unknown_channel' })))
  );

  const deliveryStatus = {};
  results.forEach((r) => {
    if (r.status === 'fulfilled') deliveryStatus[r.value.channel] = r.value.status;
  });

  // Best-effort: record per-channel outcome back on the row (non-blocking)
  supabase
    .from('notifications')
    .update({ delivery_status: deliveryStatus })
    .eq('id', created.notification.id)
    .then(() => {})
    .catch(() => {});

  // Audit trail — only authenticated owners can write audit_logs (RLS enforced)
  // Visitor (anon) calls skip this silently to avoid 400 errors
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return; // anon visitor — skip
    supabase.from('audit_logs').insert({
      owner_id: ownerId,
      action: 'notification_sent',
      details: { type, channels, deliveryStatus },
    }).then(() => {}).catch(() => {});
  });

  return { success: true, notification: created.notification, deliveryStatus };
}

// ────────── CONVENIENCE WRAPPERS FOR EACH EVENT TYPE ──────────
export async function notifyBellRing(ownerId, plateId) {
  return dispatch({
    ownerId,
    type: 'bell',
    title: '🔔 Someone is at your door',
    body: 'A visitor rang the digital bell.',
    payload: { plateId },
    priority: 'normal',
    channels: ['in_app', 'push'],
  });
}

export async function notifyVoiceNote(ownerId, plateId, voiceNoteId, durationSecs) {
  return dispatch({
    ownerId,
    type: 'voice',
    title: '🎤 New voice note from a visitor',
    body: `${durationSecs}s message waiting`,
    payload: { plateId, voiceNoteId },
    priority: 'normal',
    channels: ['in_app', 'push'],
  });
}

export async function notifyCallRequest(ownerId, plateId, callId) {
  return dispatch({
    ownerId,
    type: 'call',
    title: '📞 Masked call request',
    body: 'A visitor is requesting a secure call.',
    payload: { plateId, callId },
    priority: 'high',
    channels: ['in_app', 'push'],
  });
}

// Unified Inbox (Phase 4) — fired once per visitor conversation turn, not
// per legacy message_logs row, so the owner gets a single notification per
// exchange instead of duplicate pings from the old + new pipelines.
export async function notifyNewConversationMessage(ownerId, plateId, conversationId, { messageType = 'text', preview = '' } = {}) {
  return dispatch({
    ownerId,
    type: 'inbox_message',
    title: messageType === 'voice' ? '🎤 New voice message' : '💬 New message',
    body: preview || 'A visitor sent a new message.',
    payload: { plateId, conversationId },
    priority: 'normal',
    channels: ['in_app', 'push'],
  });
}

export async function notifyStatusChange(ownerId, newStatus) {
  return dispatch({
    ownerId,
    type: 'status_change',
    title: 'Status updated',
    body: `Your visible status is now: ${newStatus}`,
    payload: { status: newStatus },
    priority: 'normal',
    channels: ['in_app'],
  });
}

// ────────── EMERGENCY / SOS BROADCAST ──────────
/**
 * Bypasses DND and Night Mode (by design — emergencies always get through).
 * Notifies all active family members in priority order, with automatic
 * fallback already represented by "notify everyone at once" rather than
 * waiting for tier 1 to fail (emergencies don't wait for timeouts).
 * @param {string} ownerId
 * @param {string} plateId
 * @param {Array<{id:string,name:string,phone:string,priority:number}>} familyMembers
 */
export async function triggerEmergencyBroadcast(ownerId, plateId, familyMembers = []) {
  // Owner-facing in-app alert (always)
  const ownerAlert = await dispatch({
    ownerId,
    type: 'sos',
    title: '🚨 EMERGENCY — SOS Triggered',
    body: 'A visitor pressed the SOS button at your door.',
    payload: { plateId, bypassDND: true, bypassNightMode: true },
    priority: 'critical',
    channels: ['in_app', 'push'],
  });

  // Fan out to every active family member, highest priority first, but
  // don't block on tier order — emergencies notify everyone immediately.
  const sorted = [...familyMembers]
    .filter((m) => m.is_active !== false)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const memberResults = await Promise.allSettled(
    sorted.map((member) =>
      dispatch({
        ownerId,
        type: 'sos',
        title: `🚨 EMERGENCY at the door (${member.name})`,
        body: 'SOS triggered — please respond immediately.',
        payload: { plateId, memberId: member.id, priority: member.priority },
        priority: 'critical',
        channels: ['in_app', 'whatsapp', 'push'],
        toPhone: member.phone,
        whatsappTemplate: 'smartdoor_emergency',
      })
    )
  );

  return {
    success: true,
    ownerNotified: ownerAlert.success,
    membersNotified: memberResults.filter((r) => r.status === 'fulfilled').length,
    totalMembers: sorted.length,
  };
}

// ────────── NOTIFICATION CENTER — CATEGORIES ──────────
// Mirrors sql/48_notification_center.sql's sd_notification_category()
// mapping — kept in sync manually since the source of truth for what gets
// WRITTEN is the DB trigger (covers rows this client never sees, e.g. the
// missed-visitor/payment/admin observer triggers), but the UI needs the
// same vocabulary client-side for labels/icons.
export const NOTIFICATION_CATEGORIES = [
  { id: 'visitor_calls',    label: 'Visitor Calls',    icon: '📞' },
  { id: 'missed_visitors',  label: 'Missed Visitors',  icon: '📵' },
  { id: 'visitor_activity', label: 'Visitor Activity', icon: '🔔' },
  { id: 'subscription',     label: 'Subscription',     icon: '⏳' },
  { id: 'payments',         label: 'Payments',         icon: '💳' },
  { id: 'admin',            label: 'Admin',            icon: '🛠️' },
  { id: 'security',         label: 'Security',         icon: '🛡️' },
];

const CATEGORY_IDS = NOTIFICATION_CATEGORIES.map((c) => c.id);

export function categoryLabel(categoryId) {
  return NOTIFICATION_CATEGORIES.find((c) => c.id === categoryId)?.label || 'Notification';
}

export function categoryIcon(categoryId) {
  return NOTIFICATION_CATEGORIES.find((c) => c.id === categoryId)?.icon || '🔔';
}

// ────────── READ / MARK READ / DELETE / PAGINATION ──────────
/**
 * @param {string} ownerId
 * @param {object} [opts]
 * @param {number} [opts.limit]      page size (default 20)
 * @param {number} [opts.offset]     for pagination (default 0)
 * @param {boolean} [opts.unreadOnly]
 * @param {string} [opts.category]   one of NOTIFICATION_CATEGORIES ids, or 'all'
 */
export async function getNotifications(ownerId, { limit = 20, offset = 0, unreadOnly = false, category = 'all' } = {}) {
  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) query = query.eq('is_read', false);
  if (category && category !== 'all' && CATEGORY_IDS.includes(category)) {
    query = query.eq('category', category);
  }

  const { data, error, count } = await query;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    notifications: data || [],
    total: count ?? (data ? data.length : 0),
    hasMore: typeof count === 'number' ? offset + (data ? data.length : 0) < count : false,
  };
}

/** Unread count, optionally scoped to one category — drives the bell badge + per-tab counts. */
export async function getUnreadCount(ownerId, category = 'all') {
  let query = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('is_read', false);

  if (category && category !== 'all' && CATEGORY_IDS.includes(category)) {
    query = query.eq('category', category);
  }

  const { count, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, count: count || 0 };
}

/** Unread count broken down per category in one round trip — used to badge each drawer tab. */
export async function getUnreadCountsByCategory(ownerId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('category')
    .eq('owner_id', ownerId)
    .eq('is_read', false);

  if (error) return { success: false, error: error.message };
  const counts = {};
  CATEGORY_IDS.forEach((c) => { counts[c] = 0; });
  (data || []).forEach((row) => {
    const c = row.category && CATEGORY_IDS.includes(row.category) ? row.category : 'admin';
    counts[c] = (counts[c] || 0) + 1;
  });
  return { success: true, counts, total: (data || []).length };
}

export async function markNotificationRead(notificationId, ownerId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('owner_id', ownerId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Marks every (optionally category-scoped) unread notification as read in one call. */
export async function markAllNotificationsRead(ownerId, category = 'all') {
  let query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('owner_id', ownerId)
    .eq('is_read', false);

  if (category && category !== 'all' && CATEGORY_IDS.includes(category)) {
    query = query.eq('category', category);
  }

  const { error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteNotification(notificationId, ownerId) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('owner_id', ownerId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ────────── REALTIME ──────────
export function subscribeToNotifications(ownerId, callback) {
  const channel = supabase
    .channel(`notifications:${ownerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `owner_id=eq.${ownerId}` },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Full Notification Center realtime feed — INSERT (new item), UPDATE (read/
 * unread toggled from another tab/device), DELETE (removed elsewhere).
 * Kept as a separate subscription from subscribeToNotifications() above so
 * that existing callers (dashboard.js doorbell sound, etc.) are unaffected.
 * @param {string} ownerId
 * @param {{onInsert?:Function,onUpdate?:Function,onDelete?:Function}} handlers
 */
export function subscribeToNotificationCenter(ownerId, { onInsert, onUpdate, onDelete } = {}) {
  const channel = supabase
    .channel(`notification-center:${ownerId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `owner_id=eq.${ownerId}` },
      (payload) => onInsert && onInsert(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `owner_id=eq.${ownerId}` },
      (payload) => onUpdate && onUpdate(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `owner_id=eq.${ownerId}` },
      (payload) => onDelete && onDelete(payload.old))
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ────────── NOTIFICATION PREFERENCES (quiet hours, sound, per-category) ──────
export const DEFAULT_CATEGORY_PREFS = Object.freeze(
  CATEGORY_IDS.reduce((acc, id) => {
    acc[id] = { in_app: true, push: true };
    return acc;
  }, {})
);

const DEFAULT_PREFERENCES = Object.freeze({
  sound_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  category_prefs: DEFAULT_CATEGORY_PREFS,
});

export async function getNotificationPreferences(ownerId) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) {
    return { success: true, preferences: { owner_id: ownerId, ...DEFAULT_PREFERENCES } };
  }
  return {
    success: true,
    preferences: {
      ...data,
      category_prefs: { ...DEFAULT_CATEGORY_PREFS, ...(data.category_prefs || {}) },
    },
  };
}

/** Upserts whichever fields are passed — callers only send the field(s) that changed. */
export async function saveNotificationPreferences(ownerId, updates = {}) {
  const payload = { owner_id: ownerId, ...updates };
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'owner_id' })
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, preferences: data };
}

/**
 * True if `atDate` (default: now) falls within the owner's configured quiet
 * hours window. Handles overnight windows (e.g. 22:00 → 07:00) correctly.
 * Client-side only — used to silence in-tab sound/toast. Server-side push
 * respects the same window for the non-urgent 'status_reminder' event only
 * (supabase/functions/send-push) — visitor-at-the-door alerts (bell/SOS/
 * voice/text) intentionally always ring through, matching this codebase's
 * existing "emergencies bypass DND" convention (see triggerEmergencyBroadcast).
 */
export function isWithinQuietHours(preferences, atDate = new Date()) {
  if (!preferences || !preferences.quiet_hours_enabled) return false;
  const [startH, startM] = (preferences.quiet_hours_start || '22:00').split(':').map(Number);
  const [endH, endM] = (preferences.quiet_hours_end || '07:00').split(':').map(Number);
  const nowMins = atDate.getHours() * 60 + atDate.getMinutes();
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  if (startMins === endMins) return false; // zero-width window = disabled
  if (startMins < endMins) {
    // Same-day window, e.g. 13:00 → 18:00
    return nowMins >= startMins && nowMins < endMins;
  }
  // Overnight window, e.g. 22:00 → 07:00
  return nowMins >= startMins || nowMins < endMins;
}

/** Whether a given category should show/sound in-app right now, per preferences. */
export function isCategoryEnabled(preferences, categoryId, channel = 'in_app') {
  const prefs = preferences?.category_prefs?.[categoryId];
  if (!prefs) return true;
  return prefs[channel] !== false;
}

// ────────── LIFECYCLE NOTIFICATIONS ──────────
// Called by Edge Functions / admin actions at each stage of the workflow.
// All write to `notifications` table (in_app channel) — visible on owner dashboard.

export async function notifyOrderCreated(ownerId, plateId, orderNumber) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '🛒 Order Confirmed',
    body: `Order ${orderNumber} received. Plate ${plateId} is being prepared.`,
    payload: { plateId, orderNumber }, priority: 'normal', channels: ['in_app'],
  });
}

export async function notifyQRGenerated(ownerId, plateId) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '📱 QR Code Generated',
    body: `Your My Smart Door QR code for ${plateId} is ready.`,
    payload: { plateId }, priority: 'normal', channels: ['in_app'],
  });
}

export async function notifyManufacturingStarted(ownerId, plateId) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '🏭 In Production',
    body: 'Your My Smart Door nameplate is being manufactured.',
    payload: { plateId }, priority: 'normal', channels: ['in_app'],
  });
}

export async function notifyPacked(ownerId, plateId) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '📦 Packed & Ready',
    body: 'Your package is packed and ready for dispatch.',
    payload: { plateId }, priority: 'normal', channels: ['in_app'],
  });
}

export async function notifyShipped(ownerId, plateId, trackingNumber) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '🚚 Shipped!',
    body: trackingNumber ? `Tracking: ${trackingNumber}` : 'Your My Smart Door is on the way.',
    payload: { plateId, trackingNumber: trackingNumber || null }, priority: 'high', channels: ['in_app'],
  });
}

export async function notifyDelivered(ownerId, plateId) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '🏠 Delivered!',
    body: `Your My Smart Door plate ${plateId} has been delivered. Scan the QR to activate.`,
    payload: { plateId }, priority: 'high', channels: ['in_app'],
  });
}

export async function notifyActivated(ownerId, plateId) {
  return dispatch({
    ownerId, type: 'status_change',
    title: '✅ My Smart Door Activated!',
    body: `Your My Smart Door ${plateId} is live. Visitors can now reach you.`,
    payload: { plateId }, priority: 'high', channels: ['in_app'],
  });
}

export async function notifyVisitorScan(ownerId, plateId) {
  return dispatch({
    ownerId, type: 'bell',
    title: '👁️ Someone scanned your QR',
    body: 'A visitor viewed your My Smart Door page.',
    payload: { plateId }, priority: 'normal', channels: ['in_app'],
  });
}

export async function notifySubscriptionExpiry(ownerId, plateId, daysLeft) {
  const expired = daysLeft <= 0;
  return dispatch({
    ownerId, type: 'status_change',
    title: expired ? '⚠️ Subscription Expired' : `⏳ Subscription expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    body: expired
      ? 'Renew your SmartDoor Care plan to keep full features active.'
      : 'Renew now to avoid any interruption to your My Smart Door.',
    payload: { plateId, daysLeft }, priority: daysLeft <= 7 ? 'high' : 'normal', channels: ['in_app'],
  });
}

// ────────── MANUAL WRAPPERS — Payments / Admin / Security ──────────
// The SQL triggers in sql/48_notification_center.sql already populate these
// three categories automatically from payments/activation_events/
// rtc_call_attempts rows. These wrappers exist for any future client-side
// caller (e.g. an admin console action) that wants to raise the same kind
// of notification without waiting on a DB row write.
export async function notifyPaymentEvent(ownerId, { status, amount, currency = 'INR', orderId } = {}) {
  const titles = {
    captured: '✅ Payment received',
    failed: '❌ Payment failed',
    refunded: '↩️ Payment refunded',
  };
  return dispatch({
    ownerId, type: 'payment',
    title: titles[status] || 'Payment update',
    body: `${currency} ${amount ?? ''}`.trim(),
    payload: { orderId, status, amount, currency }, priority: status === 'failed' ? 'high' : 'normal',
    channels: ['in_app'],
  });
}

export async function notifyAdminAction(ownerId, title, body, payload = {}) {
  return dispatch({
    ownerId, type: 'admin_action', title, body, payload, priority: 'normal', channels: ['in_app'],
  });
}

export async function notifySecurityAlert(ownerId, title, body, payload = {}) {
  return dispatch({
    ownerId, type: 'security_alert', title, body, payload, priority: 'high', channels: ['in_app'],
  });
}

export default {
  createNotification,
  dispatch,
  notifyBellRing,
  notifyVoiceNote,
  notifyCallRequest,
  notifyNewConversationMessage,
  notifyStatusChange,
  triggerEmergencyBroadcast,
  NOTIFICATION_CATEGORIES,
  categoryLabel,
  categoryIcon,
  getNotifications,
  getUnreadCount,
  getUnreadCountsByCategory,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  subscribeToNotifications,
  subscribeToNotificationCenter,
  getNotificationPreferences,
  saveNotificationPreferences,
  isWithinQuietHours,
  isCategoryEnabled,
  DEFAULT_CATEGORY_PREFS,
  notifyPaymentEvent,
  notifyAdminAction,
  notifySecurityAlert,
  notifyOrderCreated,
  notifyQRGenerated,
  notifyManufacturingStarted,
  notifyPacked,
  notifyShipped,
  notifyDelivered,
  notifyActivated,
  notifyVisitorScan,
  notifySubscriptionExpiry,
};
