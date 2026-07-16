/**
 * Smart Door — Unified Messaging Service (Phase 4)
 * services/messaging.js
 *
 * Single conversation thread per visitor session per plate. Merges what
 * used to be three separate flows (Leave Text Message / Leave Voice
 * Message / AI Chat) into ONE thread, stored in `conversations` + `messages`
 * (sql/31_unified_messaging.sql).
 *
 * This is ADDITIVE alongside the existing services/communication.js
 * (call masking, sendTextMessage → message_logs) and services/voiceNotes.js
 * (voice_notes + message_logs mirror) — those keep working unchanged for
 * anything not touched by this file. Nothing here deletes or reads from
 * message_logs/voice_notes.
 *
 * VISITOR SIDE (anon): getOrCreateConversation, sendMessage, subscribeToConversation
 * OWNER SIDE (authenticated): listConversations, subscribeToInbox, sendOwnerReply,
 *   pin/archive/resolve/delete/tag, markConversationSeen, generateAISummary,
 *   getQuickReplies, getInboxAnalytics, typing indicator broadcast helpers.
 */

import { supabase } from './supabase.js';
import { gate } from './rateLimiter.js';
import { notifyNewConversationMessage } from './notifications.js';
import { fetchWithTimeout } from './httpClient.js';

const VOICE_BUCKET = 'voice-notes';

// ────────── VISITOR SESSION ID ──────────
// Identity anchor for "is this the same visitor?" across QR rescans.
//
// FIX (Phase 4b / migration 32): this used to be a sessionStorage id that
// reset on every new browser tab — so scanning the same QR twice within a
// minute, in two tabs, created two separate conversations. Requirement:
// "if a visitor scans the QR again within 24h, reuse the same
// conversation." That needs an identity that survives across tabs/visits,
// not one scoped to a single tab session.
//
// Reuses the SAME persistent localStorage fingerprint ('sd_visitor_fp')
// that visitor.html already generates for remember_visitor() (returning
// visitor recognition) — one source of visitor identity, not a second,
// duplicate mechanism. The actual 24h-window / resolved-conversation
// reuse logic lives in the get_or_create_conversation() SQL RPC
// (sql/32_conversation_unification_v2.sql), which is the correct place
// for it (avoids a client/server race on "is this still valid").
export function getVisitorSessionId(_plateId) {
  const key = 'sd_visitor_fp';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'v_' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(key, id);
    }
    return id;
  } catch (_) {
    // Private browsing / storage blocked — fall back to a per-call id.
    // Conversation reuse degrades gracefully to "new thread every visit"
    // rather than throwing.
    return 'v_anon_' + Date.now();
  }
}

// ────────── VISITOR: GET OR CREATE CONVERSATION ──────────
export async function getOrCreateConversation({ ownerId, plateId }) {
  try {
    const sessionId = getVisitorSessionId(plateId);
    const { data, error } = await supabase.rpc('get_or_create_conversation', {
      p_owner_id: ownerId,
      p_plate_id: plateId,
      p_visitor_session_id: sessionId,
    });
    if (error) throw error;
    return { success: true, conversationId: data, sessionId };
  } catch (err) {
    console.error('[Messaging] getOrCreateConversation error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── SEND MESSAGE (text, used by both visitor + AI + owner) ──────────
/**
 * @param {object} params
 * @param {string} params.conversationId
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {('visitor'|'owner'|'ai'|'system')} params.senderType
 * @param {string} [params.senderName]
 * @param {string} [params.text]
 * @param {boolean} [params.aiGenerated]
 * @param {object} [params.metadata]  { intent, priority, confidence, quick_reply }
 */
export async function sendMessage({ conversationId, ownerId, plateId, senderType, senderName = null, text, aiGenerated = false, metadata = {} }) {
  try {
    // Rate-limit visitor-originated messages only (owner/AI aren't gated).
    if (senderType === 'visitor') {
      const gateResult = await gate(plateId, 'text_message');
      if (!gateResult.allowed) {
        return { success: false, rateLimited: true, error: `Too many messages sent. Please try again in ${gateResult.retryAfterSecs}s.` };
      }
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from('messages').insert({
      id,
      conversation_id: conversationId,
      owner_id: ownerId,
      plate_id: plateId,
      sender_type: senderType,
      sender_name: senderName,
      message_type: 'text',
      text,
      ai_generated: aiGenerated,
      status: 'sent',
      metadata,
    });
    if (error) throw error;

    if (senderType === 'visitor' || senderType === 'ai') {
      notifyNewConversationMessage(ownerId, plateId, conversationId, {
        messageType: 'text',
        preview: text?.slice(0, 120),
      }).catch(() => {});
    }

    return { success: true, id };
  } catch (err) {
    console.error('[Messaging] sendMessage error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── SEND VOICE MESSAGE ──────────
// Reuses the existing 'voice-notes' storage bucket + layout convention from
// services/voiceNotes.js (owner_id/plate_id/timestamp.ext) so storage RLS
// policies already in place keep working unchanged.
export async function sendVoiceMessage({ conversationId, ownerId, plateId, senderType, senderName = null, blob = null, durationSecs, mimeType = 'audio/webm', existingStoragePath = null }) {
  try {
    if (senderType === 'visitor' && !existingStoragePath) {
      const gateResult = await gate(plateId, 'voice_message');
      if (!gateResult.allowed) {
        return { success: false, rateLimited: true, error: 'Too many voice notes sent recently. Please try again shortly.' };
      }
    }

    let storagePath = existingStoragePath;
    if (!storagePath) {
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      storagePath = `${ownerId}/${plateId}/${Date.now()}-conv.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(VOICE_BUCKET)
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from('messages').insert({
      id,
      conversation_id: conversationId,
      owner_id: ownerId,
      plate_id: plateId,
      sender_type: senderType,
      sender_name: senderName,
      message_type: 'voice',
      voice_url: storagePath,
      voice_duration_secs: Math.round(durationSecs),
      status: 'sent',
    });
    if (error) throw error;

    if (senderType === 'visitor') {
      notifyNewConversationMessage(ownerId, plateId, conversationId, {
        messageType: 'voice',
        preview: `${Math.round(durationSecs)}s voice message`,
      }).catch(() => {});
    }

    return { success: true, id, storagePath };
  } catch (err) {
    console.error('[Messaging] sendVoiceMessage error:', err);
    return { success: false, error: err.message };
  }
}

export async function getVoiceMessageUrl(storagePath, expiresInSecs = 3600) {
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(storagePath, expiresInSecs);
  if (error) return { success: false, error: error.message };
  return { success: true, url: data.signedUrl };
}

// ────────── VISITOR: LOAD + SUBSCRIBE TO OWN CONVERSATION ──────────
export async function getConversationMessages(conversationId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return { success: false, error: error.message, messages: [] };
  return { success: true, messages: data || [] };
}

export function subscribeToConversation(conversationId, onMessage) {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      onMessage(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ────────── OWNER: LIST CONVERSATIONS (INBOX) ──────────
/**
 * @param {string} ownerId
 * @param {object} [opts]
 * @param {('all'|'unread'|'pinned'|'archived'|'resolved'|'active')} [opts.filter]
 * @param {string} [opts.tag]        filter by a single tag chip, e.g. "Courier"
 * @param {string} [opts.search]     matches last_message_preview / visitor_session_id
 * @param {number} [opts.limit]
 */
export async function listConversations(ownerId, { filter = 'all', tag = null, search = '', limit = 100 } = {}) {
  try {
    let query = supabase
      .from('conversations')
      .select('*')
      .eq('owner_id', ownerId)
      .order('pinned', { ascending: false })
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (filter === 'unread') {
      // handled client-side after fetch (needs a per-conversation unread count)
    } else if (filter === 'pinned') {
      query = query.eq('pinned', true);
    } else if (filter === 'archived') {
      query = query.eq('status', 'archived');
    } else if (filter === 'resolved') {
      query = query.eq('status', 'resolved');
    } else if (filter === 'active') {
      query = query.eq('status', 'active');
    } else {
      query = query.neq('status', 'archived'); // 'all' = everything except archived, like WhatsApp
    }

    if (tag) query = query.contains('tags', [tag]);
    if (search && search.trim()) query = query.ilike('last_message_preview', `%${search.trim()}%`);

    const { data, error } = await query;
    if (error) throw error;

    let conversations = data || [];

    // Attach unread count per conversation (small N — owner inboxes are not
    // WhatsApp-scale, a per-row query is simpler and safer than a view here).
    const unreadCounts = await _getUnreadCountsByConversation(ownerId);
    conversations = conversations.map((c) => ({ ...c, unread_count: unreadCounts[c.id] || 0 }));

    if (filter === 'unread') conversations = conversations.filter((c) => c.unread_count > 0);

    return { success: true, conversations };
  } catch (err) {
    console.error('[Messaging] listConversations error:', err);
    return { success: false, error: err.message, conversations: [] };
  }
}

async function _getUnreadCountsByConversation(ownerId) {
  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('owner_id', ownerId)
    .eq('sender_type', 'visitor')
    .is('seen_at', null);
  if (error || !data) return {};
  return data.reduce((acc, row) => {
    acc[row.conversation_id] = (acc[row.conversation_id] || 0) + 1;
    return acc;
  }, {});
}

export async function getInboxUnreadCount(ownerId) {
  const { data, error } = await supabase.rpc('get_inbox_unread_count', { p_owner_id: ownerId });
  if (error) return 0;
  return data || 0;
}

// ────────── OWNER: REALTIME INBOX (conversation list updates) ──────────
export function subscribeToInbox(ownerId, onChange) {
  const channel = supabase
    .channel(`inbox:${ownerId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `owner_id=eq.${ownerId}` }, (payload) => {
      onChange(payload);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `owner_id=eq.${ownerId}` }, (payload) => {
      onChange({ eventType: 'NEW_MESSAGE', new: payload.new });
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ────────── OWNER: THREAD ACTIONS ──────────
export async function markConversationSeen(conversationId) {
  const { error } = await supabase.rpc('mark_conversation_seen', { p_conversation_id: conversationId });
  return { success: !error, error: error?.message };
}

export async function pinConversation(conversationId, pinned) {
  const { error } = await supabase.from('conversations').update({ pinned }).eq('id', conversationId);
  return { success: !error, error: error?.message };
}

export async function setConversationStatus(conversationId, status) {
  // status: 'active' | 'resolved' | 'archived'
  const { error } = await supabase.from('conversations').update({ status }).eq('id', conversationId);
  return { success: !error, error: error?.message };
}

export async function deleteConversation(conversationId) {
  // PRODUCTION FIX (storage cleanup): the DB side was already correct —
  // ON DELETE CASCADE on messages.conversation_id removes the thread rows
  // — but that cascade only ever touches Postgres. Every voice message's
  // actual audio blob lives in Storage (VOICE_BUCKET, path stored in
  // messages.voice_url — see sendVoiceMessage above) and Storage objects
  // are NOT part of any DB cascade, so every deleted voice thread was
  // leaving its .webm/.mp4 files behind in the bucket forever. Look up
  // and remove those objects first; best-effort — a storage hiccup here
  // must never block the (higher-priority) conversation delete itself.
  try {
    const { data: voiceMsgs } = await supabase
      .from('messages')
      .select('voice_url')
      .eq('conversation_id', conversationId)
      .not('voice_url', 'is', null);
    const paths = (voiceMsgs || []).map((m) => m.voice_url).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(VOICE_BUCKET).remove(paths);
    }
  } catch (_) {
    // Non-fatal — orphaned storage objects are a cleanup concern, not a
    // reason to block the owner from deleting the conversation.
  }

  // ON DELETE CASCADE on messages.conversation_id removes the thread too.
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
  return { success: !error, error: error?.message };
}

export async function tagConversation(conversationId, tags) {
  const { error } = await supabase.from('conversations').update({ tags }).eq('id', conversationId);
  return { success: !error, error: error?.message };
}

// ────────── OWNER: SEND REPLY (text or voice) ──────────
export async function sendOwnerReply({ conversationId, ownerId, plateId, text, senderName = null }) {
  return sendMessage({ conversationId, ownerId, plateId, senderType: 'owner', senderName, text });
}

export async function sendOwnerVoiceReply({ conversationId, ownerId, plateId, blob, durationSecs, senderName = null }) {
  return sendVoiceMessage({ conversationId, ownerId, plateId, senderType: 'owner', senderName, blob, durationSecs });
}

// ────────── QUICK REPLIES ──────────
export const STATIC_QUICK_REPLIES = ['Coming', 'Please wait', 'Leave at gate', 'Busy right now', 'Call me later', 'On my way'];

/**
 * AI-suggested quick replies based on the conversation's last visitor
 * message + detected intent — via the existing groq-proxy Edge Function
 * (no new Edge Function created, per Phase 4 spec).
 */
export async function getAISuggestedReplies({ lastVisitorText, intent }) {
  try {
    const supabaseUrl = window.__SD_CONFIG__?.supabaseUrl || '';
    const anonKey = window.__SD_CONFIG__?.supabaseAnon || '';
    if (!supabaseUrl || !anonKey || !lastVisitorText) return { success: false, replies: STATIC_QUICK_REPLIES.slice(0, 3) };

    // PRODUCTION HARDENING (API timeout consistency) — see services/httpClient.js.
    // Bounded shorter here (8s) since this feeds a UI suggestion chip and
    // has a static fallback ready — no reason to make the owner wait long.
    const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/groq-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 120,
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content: `You suggest 3 very short (max 6 words) reply options a home owner could tap to reply to a visitor at their door. Visitor intent: ${intent || 'unknown'}. Visitor said: "${lastVisitorText}". Reply ONLY with a JSON array of 3 short strings, no markdown.`,
          },
        ],
      }),
    }, 8000);
    const data = await res.json();
    if (data?.success && data.content) {
      const clean = data.content.replace(/```json|```/g, '').trim();
      const replies = JSON.parse(clean);
      if (Array.isArray(replies) && replies.length) return { success: true, replies: replies.slice(0, 3) };
    }
  } catch (err) {
    console.warn('[Messaging] getAISuggestedReplies fallback:', err.message);
  }
  return { success: false, replies: STATIC_QUICK_REPLIES.slice(0, 3) };
}

// ────────── AI CONVERSATION SUMMARY ──────────
export async function generateAISummary(conversationId, ownerId, plateId) {
  try {
    const { messages } = await getConversationMessages(conversationId);
    if (!messages.length) return { success: false, error: 'No messages to summarize.' };

    const transcript = messages
      .map((m) => `${m.sender_type}: ${m.message_type === 'voice' ? '[voice message]' : (m.text || '')}`)
      .join('\n');

    const supabaseUrl = window.__SD_CONFIG__?.supabaseUrl || '';
    const anonKey = window.__SD_CONFIG__?.supabaseAnon || '';
    let summary = null;

    if (supabaseUrl && anonKey) {
      // PRODUCTION HARDENING (API timeout consistency) — see services/httpClient.js
      const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/groq-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 150,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: 'Summarize this door-visitor conversation in 1-3 short lines for a busy homeowner. Include what the visitor wanted, what happened, and conversation duration if inferable. Plain text, no markdown.',
            },
            { role: 'user', content: transcript },
          ],
        }),
      }, 12000);
      const data = await res.json();
      if (data?.success && data.content) summary = data.content.trim();
    }

    if (!summary) {
      const first = messages[0];
      const last = messages[messages.length - 1];
      const durationSecs = Math.round((new Date(last.created_at) - new Date(first.created_at)) / 1000);
      summary = `${messages.length} messages exchanged. Duration: ${durationSecs}s.`;
    }

    const { error } = await supabase
      .from('conversations')
      .update({ ai_summary: summary, ai_summary_generated_at: new Date().toISOString() })
      .eq('id', conversationId);
    if (error) throw error;

    return { success: true, summary };
  } catch (err) {
    console.error('[Messaging] generateAISummary error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── TYPING INDICATOR (Realtime Broadcast — no schema needed) ──────────
export function sendTypingSignal(conversationId, who /* 'visitor' | 'owner' */) {
  supabase.channel(`typing:${conversationId}`).send({
    type: 'broadcast',
    event: 'typing',
    payload: { who, at: Date.now() },
  }).catch(() => {});
}

export function subscribeToTyping(conversationId, onTyping) {
  const channel = supabase
    .channel(`typing:${conversationId}`)
    .on('broadcast', { event: 'typing' }, (msg) => onTyping(msg.payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ────────── ANALYTICS (Phase 4: messages/voice/AI vs owner/avg response/hours) ──────────
export async function getInboxAnalytics(ownerId, { sinceDays = 30 } = {}) {
  try {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const [{ data: convos }, { data: msgs }] = await Promise.all([
      supabase.from('conversations').select('id, status, handled_by, created_at, last_message_at').eq('owner_id', ownerId).gte('created_at', since),
      supabase.from('messages').select('conversation_id, sender_type, message_type, created_at').eq('owner_id', ownerId).gte('created_at', since),
    ]);

    const conversations = convos || [];
    const messages = msgs || [];

    const totalMessages = messages.length;
    const voiceMessages = messages.filter((m) => m.message_type === 'voice').length;
    const aiHandled = conversations.filter((c) => c.handled_by === 'ai').length;
    const ownerHandled = conversations.filter((c) => c.handled_by === 'owner').length;
    const missed = conversations.filter((c) => c.status === 'active' && !messages.some((m) => m.conversation_id === c.id && m.sender_type !== 'visitor')).length;

    // Avg owner response time: visitor message → next owner message, per conversation
    const byConvo = {};
    messages.forEach((m) => { (byConvo[m.conversation_id] ||= []).push(m); });
    const responseTimes = [];
    Object.values(byConvo).forEach((list) => {
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].sender_type === 'visitor' && list[i + 1].sender_type === 'owner') {
          responseTimes.push((new Date(list[i + 1].created_at) - new Date(list[i].created_at)) / 1000);
        }
      }
    });
    const avgResponseSecs = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

    // Popular visiting hours (0-23) by message volume
    const hourCounts = new Array(24).fill(0);
    messages.forEach((m) => { if (m.sender_type === 'visitor') hourCounts[new Date(m.created_at).getHours()]++; });

    return {
      success: true,
      totalMessages,
      voiceMessages,
      aiHandled,
      ownerHandled,
      missed,
      avgResponseSecs,
      hourCounts,
      totalConversations: conversations.length,
    };
  } catch (err) {
    console.error('[Messaging] getInboxAnalytics error:', err);
    return { success: false, error: err.message };
  }
}

export default {
  getVisitorSessionId,
  getOrCreateConversation,
  sendMessage,
  sendVoiceMessage,
  getVoiceMessageUrl,
  getConversationMessages,
  subscribeToConversation,
  listConversations,
  getInboxUnreadCount,
  subscribeToInbox,
  markConversationSeen,
  pinConversation,
  setConversationStatus,
  deleteConversation,
  tagConversation,
  sendOwnerReply,
  sendOwnerVoiceReply,
  STATIC_QUICK_REPLIES,
  getAISuggestedReplies,
  generateAISummary,
  sendTypingSignal,
  subscribeToTyping,
  getInboxAnalytics,
};
