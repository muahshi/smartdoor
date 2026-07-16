-- ════════════════════════════════════════════════════════════════════════════
-- Migration 55: AI Owner Assistant — Owner Feedback Learning columns
--
-- PURPOSE
--   Backs services/aiOwnerAssistant.js (Phase 5). Lets an owner mark a past
--   AI call-screening decision as "correct" or "incorrect" so the dashboard
--   can show the AI's real-world accuracy per visitor type and surface it
--   as an explainable confidence adjustment. This is a DISPLAY-LAYER signal
--   only — it never rewrites the AI receptionist's prompt, classification
--   logic, or stored confidence value.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch WebRTC, visitor_logs, visitor_memory, visitor_profiles,
--     visitor_visits, security_rules, ai_receptionist_rules, or any existing
--     RLS policy other than adding one new UPDATE policy below.
--   - Does NOT add any column capable of storing a family name, phone
--     number, contact list, or personal relationship. owner_feedback is a
--     constrained enum; owner_feedback_note is free text the OWNER writes
--     about the AI's call, not visitor PII.
--   - Does NOT create a new table — this is a pure additive ALTER on the
--     existing ai_call_screenings table from sql/52.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/54_ai_receptionist_intelligence.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE ai_call_screenings
  ADD COLUMN IF NOT EXISTS owner_feedback      TEXT,       -- 'correct' | 'incorrect' | NULL (not yet reviewed)
  ADD COLUMN IF NOT EXISTS owner_feedback_note  TEXT,       -- optional short owner note, e.g. "actually the plumber"
  ADD COLUMN IF NOT EXISTS owner_feedback_at    TIMESTAMPTZ;

ALTER TABLE ai_call_screenings
  DROP CONSTRAINT IF EXISTS ai_call_screenings_owner_feedback_check;
ALTER TABLE ai_call_screenings
  ADD CONSTRAINT ai_call_screenings_owner_feedback_check
  CHECK (owner_feedback IS NULL OR owner_feedback IN ('correct', 'incorrect'));

-- Owner corrects/confirms a past screening of their own. No anon UPDATE
-- policy is added — only the existing anon INSERT policy from sql/52
-- remains for visitor-side writes.
DROP POLICY IF EXISTS "ai_call_screenings_update_own" ON ai_call_screenings;
CREATE POLICY "ai_call_screenings_update_own" ON ai_call_screenings
  FOR UPDATE USING (owner_id = get_my_owner_id())
  WITH CHECK (owner_id = get_my_owner_id());

-- Feedback-learning aggregate query (accuracy per visitor_type) groups by
-- visitor_type + owner_feedback. (owner_id + created_at is already indexed
-- as idx_ai_call_screenings_owner_created by sql/54.)
CREATE INDEX IF NOT EXISTS idx_ai_call_screenings_owner_type_feedback
  ON ai_call_screenings(owner_id, visitor_type, owner_feedback);

COMMENT ON COLUMN ai_call_screenings.owner_feedback IS
  'Phase 5 AI Owner Assistant: owner-supplied correctness label for this AI screening decision. Display/analytics only — never fed back into the live classification prompt.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_call_screenings' AND column_name LIKE 'owner_feedback%';
-- SELECT policyname FROM pg_policies WHERE tablename = 'ai_call_screenings';
