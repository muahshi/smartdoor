/**
 * My Smart Door — Visitor Memory System
 * services/visitorMemory.js
 *
 * Client for sql/41_visitor_memory.sql. Records a visit whenever a
 * visitor's phone number is known (today: visitor.html's CALL button
 * flow, which already prompts for a 10-digit number before dialing —
 * see bindActions() → window.prompt) and lets the owner dashboard show
 * recognition/history for a returning visitor.
 *
 * All anon (visitor-side) access goes through two SECURITY DEFINER RPCs
 * (record_visitor_visit, get_visitor_recognition) — this module never
 * queries visitor_profiles/visitor_visits directly from the visitor side,
 * matching the RLS design in the migration. The owner-side history read
 * (getVisitorHistoryForOwner) uses a normal authenticated table SELECT,
 * protected by the owner_id = get_my_owner_id() RLS policy.
 *
 * Fail-silent by design (same trust model as services/webrtcCall.js's
 * _logAttempt and services/presence.js) — a failure here must never
 * block or degrade the call/bell/message flow it's attached to.
 */

import { supabase } from './supabase.js';

/**
 * Records one visit for a visitor whose phone number is known, and
 * returns a recognition summary for an immediate "Welcome back" style
 * greeting. Safe to call fire-and-forget; never throws.
 *
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.plateId
 * @param {string} params.phone        10-digit visitor phone (any formatting; normalized server-side too)
 * @param {string} [params.purpose]    e.g. AI receptionist's detected intent
 * @param {string} [params.callType]   'webrtc' | 'masked_call' | 'bell' | 'message'
 * @param {boolean} [params.accepted]
 * @param {number} [params.duration]   seconds
 * @param {string} [params.name]        optional visitor-entered name (Feature 1: Visitor Call History)
 * @param {string} [params.callStatus]  'incoming' | 'connected' | 'missed' | 'rejected' | 'cancelled' | 'failed'
 * @param {string} [params.networkType] best-effort navigator.connection.effectiveType/type snapshot
 * @returns {Promise<{ known: boolean, isReturning?: boolean, visitCount?: number, firstSeen?: string }>}
 */
export async function recordVisitorVisit({ ownerId, plateId, phone, purpose = null, callType = null, accepted = null, duration = 0, name = null, callStatus = null, networkType = null }) {
  if (!ownerId || !plateId || !phone) return { known: false };
  try {
    const { data, error } = await supabase.rpc('record_visitor_visit', {
      p_owner_id: ownerId,
      p_plate_id: plateId,
      p_phone: phone,
      p_purpose: purpose,
      p_call_type: callType,
      p_accepted: accepted,
      p_duration: duration,
      p_name: name,
      p_call_status: callStatus,
      p_network_type: networkType,
    });
    if (error || !data) {
      console.error('[VisitorMemory] record_visitor_visit failed:', error);
      return { known: false };
    }
    return {
      known: true,
      isReturning: !!data.is_returning,
      visitCount: data.visit_count,
      firstSeen: data.first_seen,
    };
  } catch (err) {
    console.error('[VisitorMemory] record_visitor_visit threw:', err);
    return { known: false };
  }
}

/**
 * Looks up a visitor's recognition summary for one owner + phone pair.
 * Requires the caller to already know both — no enumeration is possible.
 * Useful for greeting a returning visitor before/without logging a new
 * visit (e.g. as soon as a cached phone number is available).
 *
 * @returns {Promise<{known:boolean, name?:string, visitCount?:number, firstSeen?:string, lastSeen?:string, blocked?:boolean, recentPurposes?:string[]}>}
 */
export async function getVisitorRecognition(ownerId, phone) {
  if (!ownerId || !phone) return { known: false };
  try {
    const { data, error } = await supabase.rpc('get_visitor_recognition', {
      p_owner_id: ownerId,
      p_phone: phone,
    });
    if (error || !data) return { known: false };
    if (!data.known) return { known: false };
    return {
      known: true,
      name: data.name || null,
      visitCount: data.visit_count,
      firstSeen: data.first_seen,
      lastSeen: data.last_seen,
      blocked: !!data.blocked,
      recentPurposes: data.recent_purposes || [],
    };
  } catch (err) {
    console.error('[VisitorMemory] get_visitor_recognition threw:', err);
    return { known: false };
  }
}

/**
 * Owner-dashboard read: this owner's visitors, most recently seen first.
 * Protected by RLS (owner_id = get_my_owner_id()) — requires an
 * authenticated owner session, same as any other owner dashboard query.
 *
 * @param {number} [limit]
 * @returns {Promise<Array<{id, phone, name, firstSeen, lastSeen, visitCount, blocked, notes}>>}
 */
export async function getVisitorHistoryForOwner(limit = 100) {
  try {
    const { data, error } = await supabase
      .from('visitor_profiles')
      .select('id, phone, name, first_seen, last_seen, visit_count, blocked, notes')
      .order('last_seen', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[VisitorMemory] getVisitorHistoryForOwner failed:', error);
      return [];
    }
    return (data || []).map((r) => ({
      id: r.id,
      phone: r.phone,
      name: r.name,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      visitCount: r.visit_count,
      blocked: r.blocked,
      notes: r.notes,
    }));
  } catch (err) {
    console.error('[VisitorMemory] getVisitorHistoryForOwner threw:', err);
    return [];
  }
}

/**
 * Owner-dashboard read: the individual visit log for one visitor profile
 * (previous purposes, call types, accepted/rejected, duration). Also RLS-
 * protected, same session requirement as getVisitorHistoryForOwner.
 */
export async function getVisitsForProfile(visitorProfileId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('visitor_visits')
      .select('id, plate_id, purpose, call_type, accepted, duration, visitor_name, call_status, network_type, created_at')
      .eq('visitor_profile_id', visitorProfileId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[VisitorMemory] getVisitsForProfile failed:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[VisitorMemory] getVisitsForProfile threw:', err);
    return [];
  }
}

export default { recordVisitorVisit, getVisitorRecognition, getVisitorHistoryForOwner, getVisitsForProfile };
