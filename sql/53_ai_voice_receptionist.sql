-- ════════════════════════════════════════════════════════════════════════════
-- Migration 53: AI Voice Receptionist — Owner Rules Engine
--
-- PURPOSE
--   Backs the production AI Voice Receptionist (services/aiVoiceReceptionist.js,
--   js/aiVoiceReceptionistUI.js). Builds on top of sql/52_ai_call_screening.sql
--   — does not replace it. Adds:
--     1. ai_receptionist_rules — owner-configurable rules ("Amazon → Auto
--        Allow", "Known Family → Auto Connect", "Sales Person → Recommend
--        Reject", etc.), evaluated client-side by
--        services/aiReceptionistRules.js#evaluateRules() against the AI's
--        classification of a visitor.
--     2. get_ai_receptionist_rules_for_plate — a SECURITY DEFINER RPC that
--        lets the anon visitor page read the *active* rules for the owner
--        behind a plate, mirroring the existing get_owner_display_for_plate
--        pattern (sql/21_production_recovery.sql) — no enumeration, only
--        active-plate-scoped reads.
--     3. Two additive columns on ai_call_screenings (conversation_mode,
--        duration_seconds) so the owner's ring card / activity log can show
--        whether the visitor talked to the voice AI or used the chip
--        fallback, and how long the exchange took. Both nullable with safe
--        defaults — existing rows and the existing INSERT from
--        services/aiReceptionist.js#saveCallScreening keep working unchanged.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch rtc_call_attempts, rtc_presence_events, call_logs, or
--     any WebRTC signaling table/channel/RLS policy.
--   - Does NOT change accept/reject/hangup call-handling logic anywhere.
--   - Does NOT remove or narrow any existing ai_call_screenings column,
--     policy, or index from migration 52.
--   - A rule can only ever short-circuit the (already additive) AI
--     screening step that runs BEFORE the existing WebRTC ring / masked
--     call — it never bypasses the owner's own accept/reject step for a
--     call that does reach ringing.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/52_ai_call_screening.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. Owner Rules Engine ──────────

CREATE TABLE IF NOT EXISTS ai_receptionist_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL,   -- 'visitor_type' | 'company' | 'keyword'
  match_value   TEXT NOT NULL,   -- e.g. 'Amazon', 'Sales Person', 'plumber'
  action        TEXT NOT NULL,   -- 'auto_allow' | 'auto_connect' | 'auto_decline' | 'ask_more' | 'ring_owner'
  label         TEXT,            -- owner-facing name for the rule, e.g. "Amazon deliveries"
  priority      INTEGER NOT NULL DEFAULT 100, -- lower number = evaluated first
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_receptionist_rules_type_chk CHECK (rule_type IN ('visitor_type', 'company', 'keyword')),
  CONSTRAINT ai_receptionist_rules_action_chk CHECK (action IN ('auto_allow', 'auto_connect', 'auto_decline', 'ask_more', 'ring_owner'))
);

CREATE INDEX IF NOT EXISTS idx_ai_receptionist_rules_owner
  ON ai_receptionist_rules(owner_id, is_active, priority);

ALTER TABLE ai_receptionist_rules ENABLE ROW LEVEL SECURITY;

-- Owner manages their own rules from the dashboard (js/aiReceptionistRulesUI.js).
DROP POLICY IF EXISTS "ai_receptionist_rules_select_own" ON ai_receptionist_rules;
CREATE POLICY "ai_receptionist_rules_select_own" ON ai_receptionist_rules
  FOR SELECT USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "ai_receptionist_rules_insert_own" ON ai_receptionist_rules;
CREATE POLICY "ai_receptionist_rules_insert_own" ON ai_receptionist_rules
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "ai_receptionist_rules_update_own" ON ai_receptionist_rules;
CREATE POLICY "ai_receptionist_rules_update_own" ON ai_receptionist_rules
  FOR UPDATE USING (owner_id = get_my_owner_id()) WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "ai_receptionist_rules_delete_own" ON ai_receptionist_rules;
CREATE POLICY "ai_receptionist_rules_delete_own" ON ai_receptionist_rules
  FOR DELETE USING (owner_id = get_my_owner_id());

COMMENT ON TABLE ai_receptionist_rules IS
  'Owner-configurable AI Voice Receptionist rules (e.g. Amazon -> Auto Allow, Known Family -> Auto Connect). Evaluated client-side by services/aiReceptionistRules.js#evaluateRules() against the visitor classification produced by services/aiVoiceReceptionist.js before the existing WebRTC ring / masked call is placed. Read anonymously (active-plate-scoped only) via get_ai_receptionist_rules_for_plate().';

-- Anon (visitor-side) read, scoped to one active plate's owner — same
-- trust model as get_owner_display_for_plate (sql/21_production_recovery.sql):
-- no enumeration, requires a real active plate slug.
CREATE OR REPLACE FUNCTION get_ai_receptionist_rules_for_plate(p_plate_id TEXT)
RETURNS TABLE(id UUID, rule_type TEXT, match_value TEXT, action TEXT, priority INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT r.id, r.rule_type, r.match_value, r.action, r.priority
    FROM ai_receptionist_rules r
    JOIN plates p ON p.owner_id = r.owner_id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id)
      AND p.status = 'active'
      AND r.is_active = TRUE
    ORDER BY r.priority ASC, r.created_at ASC;
END; $$;
GRANT EXECUTE ON FUNCTION get_ai_receptionist_rules_for_plate TO anon, authenticated, service_role;

-- ────────── 2. ai_call_screenings enrichment (additive columns only) ──────────

ALTER TABLE ai_call_screenings ADD COLUMN IF NOT EXISTS conversation_mode TEXT DEFAULT 'chip';
ALTER TABLE ai_call_screenings ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,1);
ALTER TABLE ai_call_screenings ADD COLUMN IF NOT EXISTS rule_matched TEXT;

COMMENT ON COLUMN ai_call_screenings.conversation_mode IS
  '''voice'' when the visitor talked to the AI Voice Receptionist (STT/TTS), ''chip'' for the original tap-to-select screening, ''voice_fallback'' when voice was attempted but fell back to chips mid-flow.';
COMMENT ON COLUMN ai_call_screenings.rule_matched IS
  'Label of the owner rule (ai_receptionist_rules.label) that decided the outcome, if any — null when the AI''s own classification decided the suggested_action.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT to_regclass('public.ai_receptionist_rules');
-- SELECT policyname FROM pg_policies WHERE tablename = 'ai_receptionist_rules';
-- SELECT proname FROM pg_proc WHERE proname = 'get_ai_receptionist_rules_for_plate';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_call_screenings' AND column_name IN ('conversation_mode','duration_seconds','rule_matched');
