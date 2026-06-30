/**
 * Smart Door — Logs Service
 * services/logs.js
 *
 * Handles: Logging all visitor events + realtime dashboard feed
 */

import { supabase } from './supabase.js';

// ────────── LOG A VISITOR EVENT ──────────
/**
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {string} params.eventType  'qr_scan' | 'bell_ring' | 'voice_message' | 'call_attempt' | 'spam_blocked' | 'sos' | 'ai_intent'
 * @param {object} [params.eventData]  Any extra payload
 * @param {string} [params.aiIntent]
 * @param {number} [params.aiConfidence]
 */
export async function logEvent({ ownerId, plateId, eventType, eventData = {}, aiIntent = null, aiConfidence = null }) {
  try {
    const { data, error } = await supabase
      .from('visitor_logs')
      .insert({
        owner_id:      ownerId,
        plate_id:      plateId,
        event_type:    eventType,
        event_data:    eventData,
        ai_intent:     aiIntent,
        ai_confidence: aiConfidence,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, log: data };
  } catch (err) {
    console.error('[Logs] logEvent error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── GET LOGS FOR DASHBOARD ──────────
/**
 * @param {string} ownerId
 * @param {object} [options]
 * @param {number} [options.limit]   default 50
 * @param {string} [options.type]    filter by event_type
 * @param {string} [options.from]    ISO date string
 */
export async function getLogs(ownerId, { limit = 50, type = null, from = null } = {}) {
  try {
    let query = supabase
      .from('visitor_logs')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) query = query.eq('event_type', type);
    if (from) query = query.gte('created_at', from);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, logs: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── TODAY'S STATS ──────────
export async function getTodayStats(ownerId) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [logsRes, callsRes, messagesRes] = await Promise.allSettled([
      supabase
        .from('visitor_logs')
        .select('event_type, ai_intent')
        .eq('owner_id', ownerId)
        .gte('created_at', todayStart.toISOString()),
      // Phase 5 — calls now live in call_logs, counted here instead of visitor_logs
      supabase
        .from('call_logs')
        .select('call_status')
        .eq('owner_id', ownerId)
        .gte('created_at', todayStart.toISOString()),
      // Phase 5 — voice/text/emergency messages now live in message_logs
      supabase
        .from('message_logs')
        .select('message_type')
        .eq('owner_id', ownerId)
        .gte('created_at', todayStart.toISOString()),
    ]);

    if (logsRes.status === 'rejected' || logsRes.value.error) throw (logsRes.value?.error || logsRes.reason);
    const data = logsRes.value.data;

    const stats = {
      todayScans:    0,
      callsRouted:   0,
      voiceMessages: 0,
      bellRings:     0,
      blockedSpam:   0,
      sosEvents:     0,
    };

    data.forEach(log => {
      switch (log.event_type) {
        case 'qr_scan':       stats.todayScans++;    break;
        case 'bell_ring':     stats.bellRings++;     break;
        case 'spam_blocked':  stats.blockedSpam++;   break;
        // call_attempt / voice_message / sos are intentionally NOT counted
        // here anymore — Phase 5 moved them to call_logs / message_logs below.
      }
    });

    if (callsRes.status === 'fulfilled' && !callsRes.value.error) {
      stats.callsRouted += callsRes.value.data.filter(c => c.call_status === 'completed').length;
    }

    if (messagesRes.status === 'fulfilled' && !messagesRes.value.error) {
      messagesRes.value.data.forEach(m => {
        if (m.message_type === 'voice') stats.voiceMessages++;
        else if (m.message_type === 'emergency') stats.sosEvents++;
      });
    }

    // Intent breakdown
    const intentBreakdown = {};
    data.filter(l => l.ai_intent).forEach(l => {
      intentBreakdown[l.ai_intent] = (intentBreakdown[l.ai_intent] || 0) + 1;
    });

    return { success: true, stats, intentBreakdown };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── WEEKLY DATA (for chart) ──────────
export async function getWeeklyData(ownerId) {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }

    const { data, error } = await supabase
      .from('visitor_logs')
      .select('created_at, event_type')
      .eq('owner_id', ownerId)
      .gte('created_at', days[0].toISOString())
      .eq('event_type', 'qr_scan');

    if (error) throw error;

    const counts = new Array(7).fill(0);
    data.forEach(log => {
      const logDate = new Date(log.created_at);
      logDate.setHours(0, 0, 0, 0);
      const idx = days.findIndex(d => d.getTime() === logDate.getTime());
      if (idx !== -1) counts[idx]++;
    });

    return { success: true, weeklyData: counts };
  } catch (err) {
    return { success: false, error: err.message, weeklyData: [0,0,0,0,0,0,0] };
  }
}

// ────────── MONTHLY DATA (for chart) ──────────
/**
 * Real qr_scan counts for the last 12 calendar months (oldest → newest).
 * @param {string} ownerId
 */
export async function getMonthlyData(ownerId) {
  try {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d);
    }
    const rangeStart = months[0];

    const { data, error } = await supabase
      .from('visitor_logs')
      .select('created_at')
      .eq('owner_id', ownerId)
      .eq('event_type', 'qr_scan')
      .gte('created_at', rangeStart.toISOString());

    if (error) throw error;

    const counts = new Array(12).fill(0);
    data.forEach(log => {
      const d = new Date(log.created_at);
      const idx = months.findIndex(m => m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth());
      if (idx !== -1) counts[idx]++;
    });

    return { success: true, monthlyData: counts };
  } catch (err) {
    return { success: false, error: err.message, monthlyData: new Array(12).fill(0) };
  }
}

// ────────── WEEKLY GROWTH (this 7 days vs prior 7 days) ──────────
export async function getWeeklyGrowth(ownerId) {
  try {
    const now = new Date();
    const start14 = new Date(now); start14.setDate(start14.getDate() - 14); start14.setHours(0, 0, 0, 0);
    const start7  = new Date(now); start7.setDate(start7.getDate() - 7);   start7.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('visitor_logs')
      .select('created_at')
      .eq('owner_id', ownerId)
      .eq('event_type', 'qr_scan')
      .gte('created_at', start14.toISOString());

    if (error) throw error;

    let prevWeek = 0, thisWeek = 0;
    data.forEach(log => {
      const t = new Date(log.created_at);
      if (t >= start7) thisWeek++;
      else if (t >= start14) prevWeek++;
    });

    const growth = prevWeek === 0
      ? (thisWeek > 0 ? 100 : 0)
      : Math.round(((thisWeek - prevWeek) / prevWeek) * 100);

    return { success: true, weeklyGrowth: growth };
  } catch (err) {
    return { success: false, error: err.message, weeklyGrowth: 0 };
  }
}

// ────────── QR SCAN HEATMAP (real scan density, last 12 weeks × 7 days) ──────────
/**
 * Returns an 84-length array (7 rows × 12 cols, row-major: i = dayOfWeek*12 + weekIndex)
 * of normalized intensities 0..1, matching the heatmap-grid's repeat(12, 1fr) layout.
 * @param {string} ownerId
 */
export async function getScanHeatmapData(ownerId) {
  try {
    const WEEKS = 12;
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - WEEKS * 7);
    rangeStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('visitor_logs')
      .select('created_at')
      .eq('owner_id', ownerId)
      .eq('event_type', 'qr_scan')
      .gte('created_at', rangeStart.toISOString());

    if (error) throw error;

    // counts[dayOfWeek][weekIndex] — weekIndex 0 = oldest of the 12 weeks
    const counts = Array.from({ length: 7 }, () => new Array(WEEKS).fill(0));
    data.forEach(log => {
      const d = new Date(log.created_at);
      const daysAgo = Math.floor((now - d) / 86400000);
      const weekIndex = WEEKS - 1 - Math.floor(daysAgo / 7);
      if (weekIndex < 0 || weekIndex >= WEEKS) return;
      const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
      counts[dayOfWeek][weekIndex]++;
    });

    const max = Math.max(...counts.flat(), 1);
    const intensities = [];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < WEEKS; col++) {
        intensities.push(counts[row][col] / max);
      }
    }

    return { success: true, intensities };
  } catch (err) {
    return { success: false, error: err.message, intensities: new Array(84).fill(0) };
  }
}

// ────────── REALTIME: SUBSCRIBE TO NEW LOGS ──────────
/**
 * Live feed of visitor events for dashboard
 * @param {string} ownerId
 * @param {Function} callback  (newLog) => void
 */
export function subscribeToLogs(ownerId, callback) {
  const channel = supabase
    .channel(`logs:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'visitor_logs',
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ────────── REALTIME: SUBSCRIBE TO SOS EVENTS ONLY ──────────
export function subscribeToSOS(ownerId, callback) {
  const channel = supabase
    .channel(`sos:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'visitor_logs',
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => {
        if (payload.new.event_type === 'sos') {
          callback(payload.new);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ────────── FORMAT LOG FOR DISPLAY ──────────
export function formatLogForDisplay(log) {
  const typeMap = {
    qr_scan:        { label: 'QR Code Scanned',        color: '#00A2E8', icon: '📲' },
    bell_ring:      { label: 'Digital Bell Rung',       color: '#F59E0B', icon: '🔔' },
    voice_message:  { label: 'Voice Message Left',      color: '#22C55E', icon: '🎤' },
    call_attempt:   { label: 'Masked Call Routed',      color: '#00A2E8', icon: '📞' },
    spam_blocked:   { label: 'Spam Blocked by AI',      color: '#EF4444', icon: '🚫' },
    sos:            { label: '🚨 SOS Emergency Alert',  color: '#EF4444', icon: '🚨' },
    sos_triggered:  { label: '🚨 SOS Emergency Alert',  color: '#EF4444', icon: '🚨' },
    ai_intent:      { label: `AI: ${log.ai_intent || 'Intent Detected'}`, color: '#9333EA', icon: '🤖' },
    ai_conversation:{ label: `AI Chat: ${log.ai_intent || 'Visitor message'}`, color: '#9333EA', icon: '🤖' },
  };

  const meta = typeMap[log.event_type] || { label: log.event_type, color: '#00A2E8', icon: '📋' };
  const time = new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return {
    time,
    event: meta.label,
    type: log.event_type,
    color: meta.color,
    icon: meta.icon,
    intent: log.ai_intent || null,
    priority: log.ai_priority || null,
    raw: log,
  };
}
