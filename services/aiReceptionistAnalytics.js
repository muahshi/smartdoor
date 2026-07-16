/**
 * Smart Door — AI Receptionist Analytics
 * services/aiReceptionistAnalytics.js
 *
 * PHASE 4 — ADDITIVE ONLY. Client for the get_ai_receptionist_insights RPC
 * (sql/54_ai_receptionist_intelligence.sql). This is a pure read layer on
 * top of data already produced by the existing AI Call Screening
 * (services/aiReceptionist.js) and AI Voice Receptionist
 * (services/aiVoiceReceptionist.js) — it does not classify anything
 * itself, does not call groq-proxy, and does not add a new AI backend.
 *
 * Covers the three analytics/quality requirements from the Phase 4 spec
 * that had no existing surface:
 *   - Analytics for visitor categories (category_breakdown)
 *   - Weekly category insights (weekly_trend)
 *   - AI quality metrics (quality: confidence distribution, voice/chip
 *     split, rule-override rate, spam-flagged count, duplicate-
 *     conversation count)
 *
 * Fail-soft by design (matches services/activityCenter.js): a failed
 * read returns an empty/zeroed shape rather than throwing.
 */

import { supabase } from './supabase.js';

const EMPTY = {
  success: false,
  categoryBreakdown: [],
  weeklyTrend: [],
  urgencyBreakdown: [],
  quality: {
    totalScreenings: 0, avgConfidence: 0, highConfidenceCount: 0, lowConfidenceCount: 0,
    voiceCount: 0, chipCount: 0, ruleMatchedCount: 0, spamFlaggedCount: 0, duplicateCount: 0,
  },
  windowDays: 30,
  generatedAt: null,
};

/**
 * @param {string} ownerId
 * @param {number} [days] lookback window, default 30
 * @returns {Promise<object>} see EMPTY shape above
 */
export async function getAIReceptionistInsights(ownerId, days = 30) {
  if (!ownerId) return { ...EMPTY };
  try {
    const { data, error } = await supabase.rpc('get_ai_receptionist_insights', {
      p_owner_id: ownerId,
      p_days: days,
    });
    if (error || !data) {
      console.error('[AIReceptionistAnalytics] getAIReceptionistInsights failed:', error);
      return { ...EMPTY };
    }
    const q = data.quality || {};
    return {
      success: true,
      categoryBreakdown: (data.category_breakdown || []).map((c) => ({
        visitorType: c.visitor_type,
        count: Number(c.count) || 0,
        pct: Number(c.pct) || 0,
        avgConfidence: Number(c.avg_confidence) || 0,
      })),
      weeklyTrend: (data.weekly_trend || []).map((t) => ({
        visitorType: t.visitor_type,
        thisWeek: Number(t.this_week) || 0,
        lastWeek: Number(t.last_week) || 0,
        changePct: _pct(Number(t.this_week) || 0, Number(t.last_week) || 0),
      })),
      urgencyBreakdown: (data.urgency_breakdown || []).map((u) => ({
        priority: u.priority,
        count: Number(u.count) || 0,
      })),
      quality: {
        totalScreenings: Number(q.total_screenings) || 0,
        avgConfidence: Number(q.avg_confidence) || 0,
        highConfidenceCount: Number(q.high_confidence_count) || 0,
        lowConfidenceCount: Number(q.low_confidence_count) || 0,
        voiceCount: Number(q.voice_count) || 0,
        chipCount: Number(q.chip_count) || 0,
        ruleMatchedCount: Number(q.rule_matched_count) || 0,
        spamFlaggedCount: Number(q.spam_flagged_count) || 0,
        duplicateCount: Number(q.duplicate_count) || 0,
      },
      windowDays: Number(data.window_days) || days,
      generatedAt: data.generated_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[AIReceptionistAnalytics] getAIReceptionistInsights threw:', err);
    return { ...EMPTY };
  }
}

function _pct(curr, prev) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

export default { getAIReceptionistInsights };
