/**
 * Smart Door — Communication Engine (Orchestrator)
 * services/communication.js
 *
 * This is the single entry point the UI (app.js / dashboard.js) talks to.
 * It never calls a telephony provider directly — that always happens inside
 * the `initiate-call` Edge Function, which holds the real secrets. This file
 * is responsible for: rate limiting, provider selection + fallback ordering,
 * visitor-facing logging, owner notification, audit logging, and giving the
 * dashboard one place to pull "Call History / Messages / Emergency" from.
 *
 * ARCHITECTURE
 *   Visitor → Smart Door (this module) → Virtual Number (Edge Function + provider) → Owner
 *   Owner number and visitor number are never exposed to each other or to the browser.
 */

import { supabase } from './supabase.js';
import { gate } from './rateLimiter.js';
import { notifyCallRequest, triggerEmergencyBroadcast } from './notifications.js';
import * as exotel from './exotel.js';
import * as twilio from './twilio.js';

// Provider order: primary first, fallback after. Future providers just get
// appended here — nothing else in this file needs to change.
const PROVIDERS = [exotel, twilio];

// ────────── AUDIT LOGGING (fail-silent, mirrors services/auth.js pattern) ──────────
async function _audit(ownerId, action, details = {}) {
  try {
    await supabase.from('audit_logs').insert({
      owner_id: ownerId,
      action,
      details,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch {
    // Audit logging is non-critical — never block the user flow on it.
  }
}

// ────────── CALL MASKING FLOW ──────────
/**
 * "Call Owner Securely" — visitor taps the button.
 * Flow: rate-limit gate → try primary provider → fall back to secondary →
 * log call_logs row (done server-side by the Edge Function) → notify owner.
 *
 * @param {object} params
 * @param {string} params.plateId
 * @param {string} params.ownerId
 * @param {string} [params.visitorPhone]    captured visitor number, if available
 * @returns {Promise<{ success: boolean, callId?: string, status?: string, error?: string, rateLimited?: boolean }>}
 */
export async function initiateMaskedCall({ plateId, ownerId, visitorPhone = null }) {
  const gateResult = await gate(plateId, 'call_attempt');
  if (!gateResult.allowed) {
    return {
      success: false,
      rateLimited: true,
      error: `Too many call attempts. Please try again in ${gateResult.retryAfterSecs}s.`,
    };
  }

  const visitorIdentifier = _getVisitorIdentifier();
  let lastError = null;

  for (const provider of PROVIDERS) {
    const result = await provider.call({ plateId, ownerId, visitorPhone, visitorIdentifier });
    if (result.success) {
      await _audit(ownerId, 'call_started', { plateId, provider: provider.PROVIDER_NAME, callId: result.callId });
      notifyCallRequest(ownerId, plateId, result.callId).catch(() => {});
      return { success: true, callId: result.callId, status: result.status, provider: provider.PROVIDER_NAME };
    }
    lastError = result.error;
    console.warn(`[Communication] Provider ${provider.PROVIDER_NAME} failed, trying next:`, result.error);
  }

  return { success: false, error: lastError || 'All call providers are currently unavailable.' };
}

/**
 * Called when the visitor closes the call UI / hangs up the client side.
 * The authoritative end-of-call status/duration comes from the provider
 * webhook (see supabase/functions/call-status-webhook), but we record the
 * client-observed end as well so the dashboard updates immediately.
 */
export async function endMaskedCall(callId, ownerId, clientDurationSecs = 0) {
  try {
    const { error } = await supabase
      .from('call_logs')
      .update({
        call_status: 'completed',
        duration: clientDurationSecs,
        ended_at: new Date().toISOString(),
      })
      .eq('id', callId);

    if (error) throw error;
    await _audit(ownerId, 'call_ended', { callId, durationSecs: clientDurationSecs });
    return { success: true };
  } catch (err) {
    console.error('[Communication] endMaskedCall error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── TEXT / EMERGENCY MESSAGES ──────────
/**
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {string} params.content
 * @param {('text'|'emergency')} [params.messageType]
 */
export async function sendTextMessage({ ownerId, plateId, content, messageType = 'text' }) {
  const actionType = messageType === 'emergency' ? 'sos' : 'text_message';
  const gateResult = await gate(plateId, actionType);
  if (!gateResult.allowed) {
    return { success: false, rateLimited: true, error: `Please wait ${gateResult.retryAfterSecs}s before sending again.` };
  }

  try {
    // No .select().single() — visitor is anon; message_logs_select_own only
    // permits authenticated owners to read rows. Supabase re-evaluates the
    // SELECT policy when .select() is chained after insert; anon gets 0 rows
    // back which surfaces as "violates row-level security policy" even though
    // the INSERT itself succeeded. visitor.html never uses the returned row.
    const { error } = await supabase
      .from('message_logs')
      .insert({
        owner_id: ownerId,
        plate_id: plateId,
        visitor_identifier: _getVisitorIdentifier(),
        message_type: messageType,
        content,
        priority: messageType === 'emergency' ? 'critical' : 'normal',
      });

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[Communication] sendTextMessage error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * SOS flow: visitor presses & holds the emergency button.
 * Priority notification → bypass DND → bypass Night Mode → notify all family members.
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {Array} params.familyMembers  from services/security.js#getFamilyMembers()
 */
export async function triggerEmergency({ ownerId, plateId, familyMembers = [] }) {
  const gateResult = await gate(plateId, 'sos');
  if (!gateResult.allowed) {
    return { success: false, rateLimited: true, error: 'Emergency alert already sent. Help is on the way.' };
  }

  // Log the emergency as a message_logs entry too, so it shows in the
  // unified communication feed alongside calls/voice notes/text messages.
  await sendTextMessage({ ownerId, plateId, content: 'SOS — emergency triggered at the door.', messageType: 'emergency' });

  const broadcast = await triggerEmergencyBroadcast(ownerId, plateId, familyMembers);
  await _audit(ownerId, 'emergency_triggered', { plateId, membersNotified: broadcast.membersNotified });

  return { success: true, ...broadcast };
}

// ────────── VISITOR IDENTIFIER (non-PII fingerprint) ──────────
function _getVisitorIdentifier() {
  const KEY = 'sd_visitor_fp';
  try {
    let fp = localStorage.getItem(KEY);
    if (!fp) {
      fp = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, fp);
    }
    return fp;
  } catch {
    return 'anonymous';
  }
}

// ────────── UNIFIED COMMUNICATION LOGS (for owner dashboard) ──────────
/**
 * Pulls call history, voice notes, and messages (text/emergency) for the
 * owner and merges them into one timeline, newest first. Used by
 * dashboard.js to render "Call History / Voice Notes / Messages / Emergency
 * Alerts" without the UI needing to know about three separate tables.
 */
export async function getCommunicationLogs(ownerId, { limit = 30 } = {}) {
  try {
    const [callsRes, messagesRes] = await Promise.allSettled([
      supabase.from('call_logs').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('message_logs').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(limit),
    ]);

    const calls = callsRes.status === 'fulfilled' && !callsRes.value.error ? callsRes.value.data : [];
    const messages = messagesRes.status === 'fulfilled' && !messagesRes.value.error ? messagesRes.value.data : [];

    const merged = [
      ...calls.map((c) => _formatCallLog(c)),
      ...messages.map((m) => _formatMessageLog(m)),
    ].sort((a, b) => new Date(b.raw.created_at) - new Date(a.raw.created_at));

    return { success: true, logs: merged.slice(0, limit) };
  } catch (err) {
    console.error('[Communication] getCommunicationLogs error:', err);
    return { success: false, error: err.message, logs: [] };
  }
}

function _formatCallLog(c) {
  const statusIcon = { completed: '✅', no_answer: '📵', busy: '🔁', failed: '⚠️', in_progress: '📞' }[c.call_status] || '📞';
  return {
    time: new Date(c.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    event: `${statusIcon} Masked Call — ${c.call_status.replace('_', ' ')}${c.duration ? ` (${c.duration}s)` : ''}`,
    type: 'call_attempt',
    color: c.call_status === 'completed' ? '#22C55E' : '#F59E0B',
    icon: '📞',
    raw: c,
  };
}

function _formatMessageLog(m) {
  const isEmergency = m.message_type === 'emergency';
  return {
    time: new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    event: isEmergency ? '🚨 Emergency Message' : (m.message_type === 'voice' ? '🎤 Voice Message' : '💬 Text Message'),
    type: isEmergency ? 'sos' : 'voice_message',
    color: isEmergency ? '#EF4444' : '#22C55E',
    icon: isEmergency ? '🚨' : '💬',
    raw: m,
  };
}

// ────────── REALTIME ──────────
export function subscribeToCommunicationLogs(ownerId, callback) {
  const callChannel = supabase
    .channel(`call_logs:${ownerId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs', filter: `owner_id=eq.${ownerId}` }, (payload) => {
      callback(_formatCallLog(payload.new), 'call');
    })
    .subscribe();

  const messageChannel = supabase
    .channel(`message_logs:${ownerId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_logs', filter: `owner_id=eq.${ownerId}` }, (payload) => {
      callback(_formatMessageLog(payload.new), 'message');
    })
    .subscribe();

  return () => {
    supabase.removeChannel(callChannel);
    supabase.removeChannel(messageChannel);
  };
}

export default {
  initiateMaskedCall,
  endMaskedCall,
  sendTextMessage,
  triggerEmergency,
  getCommunicationLogs,
  subscribeToCommunicationLogs,
};
