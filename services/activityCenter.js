/**
 * Smart Door — Owner Activity Center
 * services/activityCenter.js
 *
 * Client for sql/43_owner_activity_center.sql. This is the data layer for
 * the Owner Activity Center (Phase 2 of the Visitor History feature) —
 * search, filter, paginate, and drill into a visitor's full history, plus
 * notes/labels and realtime updates. Does not touch WebRTC, signaling,
 * or any existing service. Fail-soft by design (matches services/visitorMemory.js):
 * a failed read returns an empty/zeroed result rather than throwing, so a
 * blip here never breaks the rest of the owner dashboard.
 */

import { supabase } from './supabase.js';

/**
 * Paginated, searchable, filterable activity feed.
 *
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} [params.search]      free text — matches visitor name, phone, or plate id
 * @param {string} [params.dateRange]   'all' | 'today' | 'yesterday' | 'last7' | 'last30'
 * @param {string} [params.status]      'all' | 'connected' | 'missed' | 'rejected' | 'cancelled'
 * @param {number} [params.page]        1-indexed
 * @param {number} [params.pageSize]
 * @returns {Promise<{success:boolean, rows:Array, totalCount:number, error?:string}>}
 */
export async function getActivityFeed({ ownerId, search = null, dateRange = 'all', status = 'all', page = 1, pageSize = 20 }) {
  if (!ownerId) return { success: false, rows: [], totalCount: 0, error: 'Missing owner id' };
  try {
    const offset = Math.max(0, (page - 1) * pageSize);
    const { data, error } = await supabase.rpc('get_owner_activity_feed', {
      p_owner_id: ownerId,
      p_search: search,
      p_date_range: dateRange,
      p_status: status,
      p_limit: pageSize,
      p_offset: offset,
    });
    if (error) {
      console.error('[ActivityCenter] getActivityFeed failed:', error);
      return { success: false, rows: [], totalCount: 0, error: error.message };
    }
    const rows = data || [];
    return {
      success: true,
      rows,
      totalCount: rows.length ? Number(rows[0].total_count) : 0,
    };
  } catch (err) {
    console.error('[ActivityCenter] getActivityFeed threw:', err);
    return { success: false, rows: [], totalCount: 0, error: String(err) };
  }
}

/**
 * Today's 4 stat-card numbers.
 * @returns {Promise<{todayVisitors:number, todayConnected:number, todayMissed:number, avgDuration:number}>}
 */
export async function getActivityStats(ownerId) {
  const empty = { todayVisitors: 0, todayConnected: 0, todayMissed: 0, avgDuration: 0 };
  if (!ownerId) return empty;
  try {
    const { data, error } = await supabase.rpc('get_owner_activity_stats', { p_owner_id: ownerId });
    if (error || !data) {
      console.error('[ActivityCenter] getActivityStats failed:', error);
      return empty;
    }
    return {
      todayVisitors: data.today_visitors || 0,
      todayConnected: data.today_connected || 0,
      todayMissed: data.today_missed || 0,
      avgDuration: Number(data.avg_duration) || 0,
    };
  } catch (err) {
    console.error('[ActivityCenter] getActivityStats threw:', err);
    return empty;
  }
}

/**
 * Full drawer payload for one visitor profile: aggregate stats + timeline.
 */
export async function getVisitorProfileSummary(ownerId, visitorProfileId, { limit = 50, offset = 0 } = {}) {
  if (!ownerId || !visitorProfileId) return { found: false };
  try {
    const { data, error } = await supabase.rpc('get_visitor_profile_summary', {
      p_owner_id: ownerId,
      p_visitor_profile_id: visitorProfileId,
      p_limit: limit,
      p_offset: offset,
    });
    if (error || !data) {
      console.error('[ActivityCenter] getVisitorProfileSummary failed:', error);
      return { found: false };
    }
    return data;
  } catch (err) {
    console.error('[ActivityCenter] getVisitorProfileSummary threw:', err);
    return { found: false };
  }
}

/**
 * Save a note and/or label against a visitor profile.
 * @param {object} params
 * @param {boolean} [params.clearLabel] pass true to remove an existing label
 */
export async function saveVisitorNoteAndLabel({ ownerId, visitorProfileId, notes = null, label = null, labelColor = null, clearLabel = false }) {
  if (!ownerId || !visitorProfileId) return { success: false, error: 'Missing ids' };
  try {
    const { data, error } = await supabase.rpc('update_visitor_notes_and_label', {
      p_owner_id: ownerId,
      p_visitor_profile_id: visitorProfileId,
      p_notes: notes,
      p_label: label,
      p_label_color: labelColor,
      p_clear_label: clearLabel,
    });
    if (error || !data) {
      console.error('[ActivityCenter] saveVisitorNoteAndLabel failed:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
    return data;
  } catch (err) {
    console.error('[ActivityCenter] saveVisitorNoteAndLabel threw:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Subscribes to new visitor_visits rows for this owner so the Activity
 * Center feed and stat cards can update live. Returns an unsubscribe fn.
 * Same postgres_changes pattern as services/notifications.js.
 */
export function subscribeToActivityFeed(ownerId, callback) {
  if (!ownerId) return () => {};
  const channel = supabase
    .channel(`activity-center:${ownerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'visitor_visits', filter: `owner_id=eq.${ownerId}` },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export default {
  getActivityFeed,
  getActivityStats,
  getVisitorProfileSummary,
  saveVisitorNoteAndLabel,
  subscribeToActivityFeed,
};
