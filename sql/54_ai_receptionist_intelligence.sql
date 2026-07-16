-- ════════════════════════════════════════════════════════════════════════════
-- Migration 54: AI Receptionist Intelligence — Phase 4
--
-- PURPOSE
--   Backs the privacy-first AI Receptionist intelligence upgrade
--   (services/aiReceptionist.js, services/aiVoiceReceptionist.js,
--   services/aiReceptionistAnalytics.js). Builds on sql/52 and sql/53 —
--   does not replace or narrow either. Two things, both additive:
--
--   1. Two columns on ai_call_screenings that close a real gap: the AI
--      has been computing `priority` (Low/Normal/High/Critical — the
--      "Urgency" the owner sees) and a spoken-language hint on every
--      single screening since migration 52, but neither was ever
--      persisted — classifyCallPurpose()/conductVoiceTurn() compute
--      them, visitor.html reads them for the same-request ring card,
--      and then they were discarded. `priority` and `language_detected`
--      make that data durable so it can be reported on.
--   2. Three read-only, owner-scoped SECURITY DEFINER RPCs that compute
--      visitor-category analytics, week-over-week category trends, and
--      AI quality/duplicate metrics server-side (one round trip each,
--      no raw transcript rows ever leave Postgres for this purpose).
--
-- PRIVACY
--   Nothing here adds a family-member name/phone/relationship store.
--   The new columns and RPCs operate only on the visit-classification
--   fields that already existed (visitor_type, confidence, transcript
--   metadata) — no new identity data is captured.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch rtc_call_attempts, rtc_presence_events, call_logs,
--     or any WebRTC signaling table/channel/RLS policy.
--   - Does NOT change accept/reject/hangup call-handling logic anywhere.
--   - Does NOT remove or narrow any existing column, policy, or index
--     from migrations 52/53.
--   - Does NOT introduce a visitor_type enum — visitor_type stays free
--     TEXT (as designed in migration 52) so the classifier's taxonomy
--     can keep growing without another migration.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / CREATE OR REPLACE throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/53_ai_voice_receptionist.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. Persist urgency + detected language (additive columns) ──────────

ALTER TABLE ai_call_screenings ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Normal';
ALTER TABLE ai_call_screenings ADD COLUMN IF NOT EXISTS language_detected TEXT;

COMMENT ON COLUMN ai_call_screenings.priority IS
  'Urgency computed by classifyCallPurpose()/finalizeVoiceScreening() — Low | Normal | High | Critical. Nullable/defaulted so existing rows and any caller that does not pass it keep working unchanged.';
COMMENT ON COLUMN ai_call_screenings.language_detected IS
  'Best-effort language hint for the screening — e.g. hi-IN, en-IN. Null for chip-only screenings where no speech was involved. Used only for aggregate multilingual-quality reporting, never for identity.';

CREATE INDEX IF NOT EXISTS idx_ai_call_screenings_owner_created
  ON ai_call_screenings(owner_id, created_at DESC);

-- ────────── 2. RPC — get_ai_receptionist_insights ──────────
-- One round trip: category breakdown (with % share + avg confidence),
-- week-over-week trend per category, urgency breakdown, and AI quality
-- metrics (confidence distribution, voice vs chip split, rule-override
-- rate, spam-flagged count, duplicate-conversation count). Owner-scoped
-- the same way as get_owner_activity_stats (sql/43).
CREATE OR REPLACE FUNCTION get_ai_receptionist_insights(
  p_owner_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  v_since           TIMESTAMPTZ := NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL;
  v_week_since       TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  v_prev_week_since  TIMESTAMPTZ := NOW() - INTERVAL '14 days';
  v_total            INTEGER;
  v_category         JSON;
  v_weekly_trend     JSON;
  v_urgency          JSON;
  v_quality          JSON;
  v_duplicate_count  INTEGER;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM ai_call_screenings
   WHERE owner_id = p_owner_id AND created_at >= v_since;

  -- Category breakdown (visitor type, share of total, avg confidence)
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_category FROM (
    SELECT visitor_type,
           COUNT(*) AS count,
           ROUND(100.0 * COUNT(*) / GREATEST(v_total, 1), 1) AS pct,
           ROUND(AVG(confidence)::numeric, 2) AS avg_confidence
      FROM ai_call_screenings
     WHERE owner_id = p_owner_id AND created_at >= v_since
     GROUP BY visitor_type
     ORDER BY count DESC
  ) t;

  -- Week-over-week trend per category (only categories active in either window)
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_weekly_trend FROM (
    SELECT visitor_type,
           COUNT(*) FILTER (WHERE created_at >= v_week_since) AS this_week,
           COUNT(*) FILTER (WHERE created_at >= v_prev_week_since AND created_at < v_week_since) AS last_week
      FROM ai_call_screenings
     WHERE owner_id = p_owner_id AND created_at >= v_prev_week_since
     GROUP BY visitor_type
    HAVING COUNT(*) FILTER (WHERE created_at >= v_week_since) > 0
        OR COUNT(*) FILTER (WHERE created_at >= v_prev_week_since AND created_at < v_week_since) > 0
     ORDER BY this_week DESC
  ) t;

  -- Urgency (priority) breakdown
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_urgency FROM (
    SELECT COALESCE(priority, 'Normal') AS priority, COUNT(*) AS count
      FROM ai_call_screenings
     WHERE owner_id = p_owner_id AND created_at >= v_since
     GROUP BY COALESCE(priority, 'Normal')
     ORDER BY count DESC
  ) t;

  -- Duplicate-conversation detection: consecutive screenings for the same
  -- plate + visitor_type + company within a 15-minute window — flags
  -- repeated/rapid-fire attempts (retries, possible harassment/spam)
  -- without storing any new identity data.
  SELECT COUNT(*) INTO v_duplicate_count FROM (
    SELECT created_at,
           LAG(created_at) OVER (
             PARTITION BY plate_id, visitor_type, COALESCE(company, '')
             ORDER BY created_at
           ) AS prev_at
      FROM ai_call_screenings
     WHERE owner_id = p_owner_id AND created_at >= v_since
  ) x
  WHERE prev_at IS NOT NULL AND (created_at - prev_at) <= INTERVAL '15 minutes';

  SELECT json_build_object(
    'total_screenings',      v_total,
    'avg_confidence',        COALESCE((SELECT ROUND(AVG(confidence)::numeric, 2) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since), 0),
    'high_confidence_count', COALESCE((SELECT COUNT(*) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since AND confidence >= 0.8), 0),
    'low_confidence_count',  COALESCE((SELECT COUNT(*) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since AND confidence < 0.6), 0),
    'voice_count',           COALESCE((SELECT COUNT(*) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since AND conversation_mode IN ('voice', 'voice_manual_fallback')), 0),
    'chip_count',            COALESCE((SELECT COUNT(*) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since AND conversation_mode = 'chip'), 0),
    'rule_matched_count',    COALESCE((SELECT COUNT(*) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since AND rule_matched IS NOT NULL), 0),
    'spam_flagged_count',    COALESCE((SELECT COUNT(*) FROM ai_call_screenings WHERE owner_id = p_owner_id AND created_at >= v_since AND suggested_action IN ('Blocked', 'Decline')), 0),
    'duplicate_count',       COALESCE(v_duplicate_count, 0)
  ) INTO v_quality;

  RETURN json_build_object(
    'category_breakdown', v_category,
    'weekly_trend',       v_weekly_trend,
    'urgency_breakdown',  v_urgency,
    'quality',            v_quality,
    'window_days',        GREATEST(COALESCE(p_days, 30), 1),
    'generated_at',       NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_ai_receptionist_insights TO authenticated;

COMMENT ON FUNCTION get_ai_receptionist_insights IS
  'Owner-scoped AI Receptionist analytics (Phase 4): visitor-category breakdown, week-over-week category trend, urgency breakdown, and AI quality metrics (confidence distribution, voice/chip split, rule-override rate, spam-flagged count, duplicate-conversation count). Reads only ai_call_screenings; no new identity data. Self-checks p_owner_id = get_my_owner_id(), same pattern as get_owner_activity_stats (sql/43).';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_call_screenings' AND column_name IN ('priority','language_detected');
-- SELECT proname FROM pg_proc WHERE proname = 'get_ai_receptionist_insights';
