/**
 * Smart Door — Notification Engine
 * services/notifications.js
 *
 * Handles: Bell Ring, Voice Note, Call Request, Emergency Alert, Status Change.
 *
 * CHANNEL ARCHITECTURE (future-proofed, not all active today):
 *   in_app  → always on, writes to `notifications` table, owner dashboard
 *             picks it up via realtime subscription.
 *   push    → stub. Wire to a Web Push / FCM Edge Function later.
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
  push: async (_notification) => {
    // TODO: integrate Web Push / FCM. Architecture placeholder only.
    return { channel: 'push', status: 'not_configured' };
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
    channels: ['in_app'],
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
    channels: ['in_app'],
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
    channels: ['in_app'],
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
    channels: ['in_app'],
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
        channels: ['in_app', 'whatsapp'],
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

// ────────── READ / MARK READ ──────────
export async function getNotifications(ownerId, { limit = 30, unreadOnly = false } = {}) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, notifications: data };
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

export default {
  createNotification,
  dispatch,
  notifyBellRing,
  notifyVoiceNote,
  notifyCallRequest,
  notifyStatusChange,
  triggerEmergencyBroadcast,
  getNotifications,
  markNotificationRead,
  subscribeToNotifications,
};
