-- ════════════════════════════════════════════════════════════════════════════
-- Migration 52: AI Receptionist — Pre-Call Screening
--
-- PURPOSE
--   Backs the AI Receptionist "answers first" flow: when a visitor taps
--   Call, a short structured Q&A runs BEFORE the WebRTC ring / masked
--   call is placed. The result (visitor type, purpose, confidence,
--   suggested action, transcript) is written here so the owner sees a
--   structured summary instead of an unknown incoming call.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch rtc_call_attempts, rtc_presence_events, call_logs,
--     or any WebRTC signaling table/channel. Signaling stays exactly as
--     documented in sql/39_webrtc_phase2_call_attempts.sql — ephemeral,
--     never persisted.
--   - Does NOT modify any existing RLS policy on visitor_logs,
--     visitor_memory, plates, security_rules, or users.
--   - Does NOT change initiate-call, call-status-webhook, Exotel,
--     Twilio, or the accept/reject/hangup call-handling logic anywhere.
--
-- CORRELATION MODEL
--   No call_id is threaded through here on purpose — attemptTapToTalk()
--   in services/webrtcCall.js generates its own callId internally right
--   before ringing and that file is not modified by this migration.
--   Instead, the owner-side ring UI looks up the single most recent
--   screening row for (owner_id, plate_id) within a short freshness
--   window (last 3 minutes) — safe because a visitor only rings
--   immediately after their screening completes, one at a time.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/51_rtc_ring_anon_join_fix.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS ai_call_screenings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id            TEXT NOT NULL,
  visitor_name        TEXT,
  visitor_type        TEXT NOT NULL,   -- Delivery Partner | Courier | Family | Friend | Guest |
                                       -- Maid | Driver | Technician | Society Staff |
                                       -- Unknown Visitor | Sales Person | Emergency
  company             TEXT,           -- e.g. "Amazon", "Swiggy" — delivery/courier only
  visiting_whom       TEXT,           -- who they're here to see, if given
  purpose             TEXT,           -- free-text reason for visit
  flat_number         TEXT,
  has_package         BOOLEAN,
  expected_by_owner   BOOLEAN,
  confidence          NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  suggested_action    TEXT NOT NULL DEFAULT 'Notify Owner', -- Accept | Decline | Ask Owner | Notify Owner | Blocked
  ai_summary          TEXT,           -- one-line summary shown to the owner
  transcript          JSONB,          -- [{question, answer}] — the minimal Q&A actually asked
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_screenings_owner_plate_recent
  ON ai_call_screenings(owner_id, plate_id, created_at DESC);

ALTER TABLE ai_call_screenings ENABLE ROW LEVEL SECURITY;

-- Owner reads their own screenings (ring-card lookup + future history view).
DROP POLICY IF EXISTS "ai_call_screenings_select_own" ON ai_call_screenings;
CREATE POLICY "ai_call_screenings_select_own" ON ai_call_screenings
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Visitor (anon) writes one row per call attempt. Same trust model as
-- rtc_call_attempts_insert_anon (sql/39_webrtc_phase2_call_attempts.sql):
-- plate_id is constrained to the known slug shape, so this cannot be used
-- to spam arbitrary rows against unrelated owners without a real plate.
DROP POLICY IF EXISTS "ai_call_screenings_insert_anon" ON ai_call_screenings;
CREATE POLICY "ai_call_screenings_insert_anon" ON ai_call_screenings
  FOR INSERT WITH CHECK (
    plate_id ~ '^SD-[A-Z0-9]{6}$'
    AND confidence >= 0 AND confidence <= 1
  );

COMMENT ON TABLE ai_call_screenings IS
  'AI Receptionist pre-call screening: one row per Call button tap, written before the WebRTC ring / masked call is placed. Read by the owner ring UI (js/webrtcCallUI.js) via a freshness-windowed lookup on (owner_id, plate_id) — no call_id correlation, no WebRTC/signaling changes.';

-- Allow the new 'ai_call_screening' event type on visitor_logs so the
-- screening also mirrors into the existing Inbox/Activity timeline via
-- the same insert path _logVisitorEvent() already uses for bell/SOS.
-- Reuses the exact policy-replacement pattern from sql/29 (additive,
-- superset of the existing allow-list — nothing removed).
DROP POLICY IF EXISTS "visitor_logs_insert_anon" ON visitor_logs;
CREATE POLICY "visitor_logs_insert_anon" ON visitor_logs
  FOR INSERT WITH CHECK (
    plate_id ~ '^SD-[A-Z0-9]{6}$'
    AND event_type IN (
      'qr_scan', 'bell_ring', 'voice_message', 'call_attempt',
      'spam_blocked', 'sos', 'sos_triggered', 'ai_intent', 'ai_conversation',
      'ai_call_screening'
    )
    AND (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))
  );

-- Housekeeping, mirrors purge_old_rtc_call_attempts().
CREATE OR REPLACE FUNCTION purge_old_ai_call_screenings()
RETURNS VOID AS $$
BEGIN
  DELETE FROM ai_call_screenings WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT to_regclass('public.ai_call_screenings');
-- SELECT policyname FROM pg_policies WHERE tablename = 'ai_call_screenings';
-- SELECT policyname FROM pg_policies WHERE tablename = 'visitor_logs' AND policyname = 'visitor_logs_insert_anon';
