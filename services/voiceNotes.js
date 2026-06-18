/**
 * Smart Door — Voice Notes Service
 * services/voiceNotes.js
 *
 * Handles: in-browser recording (MediaRecorder), upload to Supabase Storage
 * bucket "voice-notes", DB row creation, and owner notification.
 *
 * Storage layout: voice-notes/{owner_id}/{plate_id}/{timestamp}.webm
 * (foldering by owner_id lets the storage RLS policy in
 *  sql/05_communication_rls.sql restrict reads to that owner only.)
 */

import { supabase } from './supabase.js';
import { gate } from './rateLimiter.js';
import { notifyVoiceNote } from './notifications.js';

const BUCKET = 'voice-notes';
const MAX_DURATION_SECS = 10;

// ────────── RECORDER (browser-side) ──────────
/**
 * Wraps MediaRecorder so app.js doesn't need to know the codec details.
 * Usage:
 *   const recorder = await VoiceRecorder.start();
 *   ... (later) ...
 *   const blob = await recorder.stop();
 */
export class VoiceRecorder {
  static async start({ maxDurationSecs = MAX_DURATION_SECS, onTick = null } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported on this device/browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    let seconds = 0;
    let tickInterval = null;
    let autoStopTimeout = null;

    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.start();

    if (onTick) {
      tickInterval = setInterval(() => {
        seconds++;
        onTick(seconds);
      }, 1000);
    }

    const stopAll = () => {
      clearInterval(tickInterval);
      clearTimeout(autoStopTimeout);
      stream.getTracks().forEach((t) => t.stop());
    };

    const instance = {
      seconds: () => seconds,
      stop: () =>
        new Promise((resolve) => {
          recorder.onstop = () => {
            stopAll();
            const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
            resolve({ blob, durationSecs: seconds, mimeType: blob.type });
          };
          recorder.stop();
        }),
      cancel: () => {
        try { recorder.stop(); } catch {}
        stopAll();
      },
    };

    // Hard cap at maxDurationSecs regardless of caller behavior
    autoStopTimeout = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, maxDurationSecs * 1000);

    return instance;
  }
}

// ────────── UPLOAD + LOG + NOTIFY ──────────
/**
 * @param {object} params
 * @param {Blob} params.blob
 * @param {number} params.durationSecs
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {string} [params.mimeType]
 * @returns {Promise<{ success: boolean, voiceNote?: object, error?: string }>}
 */
export async function uploadVoiceNote({ blob, durationSecs, ownerId, plateId, mimeType = 'audio/webm' }) {
  try {
    // Server-side rate limit gate (per plate)
    const gateResult = await gate(plateId, 'voice_message');
    if (!gateResult.allowed) {
      return { success: false, error: 'Too many voice notes sent recently. Please try again shortly.', rateLimited: true };
    }

    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const storagePath = `${ownerId}/${plateId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: mimeType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: row, error: insertError } = await supabase
      .from('voice_notes')
      .insert({
        owner_id: ownerId,
        plate_id: plateId,
        storage_path: storagePath,
        duration_secs: Math.round(durationSecs),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Mirror into message_logs so this voice note appears in the unified
    // "Communication Logs" feed alongside calls/text/emergency messages
    // (see services/communication.js#getCommunicationLogs).
    supabase
      .from('message_logs')
      .insert({
        owner_id: ownerId,
        plate_id: plateId,
        message_type: 'voice',
        voice_note_id: row.id,
        priority: 'normal',
      })
      .then(() => {})
      .catch((err) => console.error('[VoiceNotes] message_logs mirror failed:', err));

    // Fire owner notification (best-effort, doesn't block success response)
    notifyVoiceNote(ownerId, plateId, row.id, Math.round(durationSecs)).catch((err) =>
      console.error('[VoiceNotes] notification failed:', err)
    );

    // Audit trail (fail-silent, mirrors services/auth.js pattern)
    supabase.from('audit_logs').insert({
      owner_id: ownerId,
      action: 'voice_note_uploaded',
      details: { plateId, voiceNoteId: row.id, durationSecs: Math.round(durationSecs) },
    }).then(() => {}).catch(() => {});

    return { success: true, voiceNote: row };
  } catch (err) {
    console.error('[VoiceNotes] uploadVoiceNote error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── GET A PLAYABLE URL ──────────
/**
 * Owner dashboard playback — generates a short-lived signed URL since the
 * bucket is private.
 */
export async function getVoiceNoteUrl(storagePath, expiresInSecs = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSecs);

  if (error) return { success: false, error: error.message };
  return { success: true, url: data.signedUrl };
}

// ────────── LIST FOR OWNER ──────────
export async function getVoiceNotes(ownerId, { limit = 30 } = {}) {
  const { data, error } = await supabase
    .from('voice_notes')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, voiceNotes: data };
}

export async function markVoiceNoteHeard(voiceNoteId, ownerId) {
  const { error } = await supabase
    .from('voice_notes')
    .update({ is_heard: true })
    .eq('id', voiceNoteId)
    .eq('owner_id', ownerId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ────────── REALTIME ──────────
export function subscribeToVoiceNotes(ownerId, callback) {
  const channel = supabase
    .channel(`voice_notes:${ownerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'voice_notes', filter: `owner_id=eq.${ownerId}` },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export default {
  VoiceRecorder,
  uploadVoiceNote,
  getVoiceNoteUrl,
  getVoiceNotes,
  markVoiceNoteHeard,
  subscribeToVoiceNotes,
};
