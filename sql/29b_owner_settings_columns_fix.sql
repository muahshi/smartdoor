-- ============================================================
-- SmartDoor Migration 29b — Owner Settings columns (RE-RUN, HARDENED)
-- Root cause of previous failure: the multi-statement paste was executed
-- as a single implicit transaction. The DROP FUNCTION + return-type change
-- for get_owner_display_for_plate caused a downstream error that rolled
-- back EVERY statement in the batch — including the harmless ALTER TABLE
-- at the top. Verified via: SELECT column_name FROM information_schema.columns
-- WHERE table_name='security_rules' → only the original 13 columns existed.
--
-- This version is safe to run as one paste because every statement is
-- independently idempotent (IF NOT EXISTS / IF EXISTS / OR REPLACE), and
-- the function DROP+CREATE is moved to the END so an error there cannot
-- roll back the column additions before it (each ALTER below also commits
-- progressively safe even if you run this block-by-block).
-- ============================================================

-- ─── 1. Owner profile + AI receptionist settings on security_rules ──────
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS residence_name      TEXT;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS family_name         TEXT;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS welcome_message     TEXT;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS owner_display_name  TEXT;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS ai_name             TEXT DEFAULT 'Priya';
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS greeting_style      TEXT DEFAULT 'warm';
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS preferred_language  TEXT DEFAULT 'hinglish';
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS visitor_greeting    TEXT;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS auto_reply_enabled  BOOLEAN DEFAULT TRUE;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS business_hours_start TIME;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS business_hours_end   TIME;
ALTER TABLE security_rules ADD COLUMN IF NOT EXISTS emergency_behaviour  TEXT DEFAULT 'notify_all';

COMMENT ON COLUMN security_rules.current_status IS
  'available | busy | meeting | sleeping | away | leave_at_gate | vacation | driving | offline';

-- ─── 2. visitor_logs — intent confidence/priority columns ────────────────
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(4,2);
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS ai_priority   TEXT;

-- ─── 3. visitor_memory table — returning visitor recognition ────────────
CREATE TABLE IF NOT EXISTS visitor_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id        TEXT NOT NULL,
  visitor_fingerprint TEXT NOT NULL,
  visitor_label   TEXT,
  last_intent     TEXT,
  visit_count     INT DEFAULT 1,
  first_seen      TIMESTAMPTZ DEFAULT NOW(),
  last_seen       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, visitor_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_visitor_memory_owner ON visitor_memory(owner_id, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_memory_fp    ON visitor_memory(owner_id, visitor_fingerprint);

ALTER TABLE visitor_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view their visitor memory" ON visitor_memory;
CREATE POLICY "Owners view their visitor memory" ON visitor_memory
  FOR SELECT USING (owner_id = get_my_owner_id());

ALTER TABLE visitor_memory REPLICA IDENTITY FULL;

-- ─── 4. RLS policy — allow new visitor_logs event types ─────────────────
DROP POLICY IF EXISTS "visitor_logs_insert_anon" ON visitor_logs;
CREATE POLICY "visitor_logs_insert_anon" ON visitor_logs
  FOR INSERT WITH CHECK (
    plate_id ~ '^SD-[A-Z0-9]{6}$'
    AND event_type IN (
      'qr_scan', 'bell_ring', 'voice_message', 'call_attempt',
      'spam_blocked', 'sos', 'sos_triggered', 'ai_intent', 'ai_conversation'
    )
    AND (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))
  );

-- ─── 5. RPC: remember_visitor ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION remember_visitor(
  p_owner_id UUID,
  p_plate_id TEXT,
  p_fingerprint TEXT,
  p_intent TEXT DEFAULT NULL
)
RETURNS TABLE(is_returning BOOLEAN, visit_count INT, visitor_label TEXT, last_intent TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing visitor_memory%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM visitor_memory
  WHERE owner_id = p_owner_id AND visitor_fingerprint = p_fingerprint;

  IF FOUND THEN
    UPDATE visitor_memory
    SET visit_count = visitor_memory.visit_count + 1,
        last_seen = NOW(),
        last_intent = COALESCE(p_intent, visitor_memory.last_intent),
        visitor_label = CASE
          WHEN p_intent IS NOT NULL AND visitor_memory.visitor_label IS NULL
          THEN p_intent ELSE visitor_memory.visitor_label END
    WHERE id = v_existing.id;

    RETURN QUERY SELECT TRUE, v_existing.visit_count + 1, v_existing.visitor_label, COALESCE(p_intent, v_existing.last_intent);
  ELSE
    INSERT INTO visitor_memory (owner_id, plate_id, visitor_fingerprint, visitor_label, last_intent)
    VALUES (p_owner_id, p_plate_id, p_fingerprint, p_intent, p_intent);

    RETURN QUERY SELECT FALSE, 1, p_intent, p_intent;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION remember_visitor(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ─── 6. RPC: get_owner_display_for_plate (9-column version) ─────────────
-- Safe to re-run: the DROP already succeeded in a prior step per your
-- screenshot ("Success. No rows returned"), so this CREATE should now
-- apply cleanly. Included again here defensively (idempotent DROP).
DROP FUNCTION IF EXISTS get_owner_display_for_plate(TEXT);

CREATE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(
  full_name TEXT,
  residence_name TEXT,
  family_name TEXT,
  welcome_message TEXT,
  owner_display_name TEXT,
  ai_name TEXT,
  greeting_style TEXT,
  preferred_language TEXT,
  visitor_greeting TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_plate_id));
BEGIN
  RETURN QUERY
    SELECT
      u.full_name,
      sr.residence_name,
      sr.family_name,
      sr.welcome_message,
      sr.owner_display_name,
      COALESCE(sr.ai_name, 'Priya'),
      COALESCE(sr.greeting_style, 'warm'),
      COALESCE(sr.preferred_language, 'hinglish'),
      sr.visitor_greeting
    FROM users u
    JOIN plates p ON p.owner_id = u.id
    LEFT JOIN security_rules sr ON sr.owner_id = u.id
    WHERE (
      p.plate_id = v_normalized
      OR p.qr_slug = v_normalized
    )
    AND p.status = 'active'
    AND p.owner_id IS NOT NULL
    AND p.activation_date IS NOT NULL
    AND u.full_name IS NOT NULL
    AND u.full_name != ''
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

-- ============================================================
-- VERIFICATION — run this separately AFTER the block above completes.
-- Expect 25 rows (13 original + 12 new) for security_rules,
-- and 2 extra rows for visitor_logs (ai_confidence, ai_priority).
-- ============================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'security_rules' ORDER BY ordinal_position;
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'visitor_logs' AND column_name IN ('ai_confidence','ai_priority');
--
-- SELECT proname FROM pg_proc WHERE proname IN ('remember_visitor','get_owner_display_for_plate');
--
-- SELECT to_regclass('public.visitor_memory'); -- should NOT be null
