-- ============================================================
-- SmartDoor Migration 29 — AI Receptionist Production Upgrade
-- Adds: owner profile fields (residence/family/welcome/AI name),
--       AI receptionist settings, visitor memory (returning visitors),
--       intent tracking on visitor_logs, status enum expansion
-- SAFE: additive only — reuses security_rules + visitor_logs,
--       only ONE new table (visitor_memory) since no equivalent exists
-- ============================================================

-- ─── 1. Owner profile + AI receptionist settings ─────────────────────────
-- Reusing security_rules as the single "owner settings" row (1:1 with owner)
ALTER TABLE security_rules
  ADD COLUMN IF NOT EXISTS residence_name      TEXT,
  ADD COLUMN IF NOT EXISTS family_name         TEXT,
  ADD COLUMN IF NOT EXISTS welcome_message     TEXT,
  ADD COLUMN IF NOT EXISTS owner_display_name  TEXT,
  ADD COLUMN IF NOT EXISTS ai_name             TEXT DEFAULT 'Priya',
  ADD COLUMN IF NOT EXISTS greeting_style       TEXT DEFAULT 'warm',     -- warm | formal | brief
  ADD COLUMN IF NOT EXISTS preferred_language   TEXT DEFAULT 'hinglish', -- hindi | english | hinglish
  ADD COLUMN IF NOT EXISTS visitor_greeting     TEXT,
  ADD COLUMN IF NOT EXISTS auto_reply_enabled   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS business_hours_start TIME,
  ADD COLUMN IF NOT EXISTS business_hours_end   TIME,
  ADD COLUMN IF NOT EXISTS emergency_behaviour  TEXT DEFAULT 'notify_all'; -- notify_all | notify_owner_only | silent_log

-- Expand current_status to support the full status set from spec.
-- (current_status is free TEXT already, no enum constraint — just documenting)
COMMENT ON COLUMN security_rules.current_status IS
  'available | busy | meeting | sleeping | away | leave_at_gate | vacation | driving | offline';

-- ─── 2. Visitor memory — recognize returning visitors ────────────────────
CREATE TABLE IF NOT EXISTS visitor_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id        TEXT NOT NULL,
  visitor_fingerprint TEXT NOT NULL,   -- hashed phone OR browser fingerprint
  visitor_label   TEXT,                -- e.g. "Courier (Amazon)", "Friend"
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

CREATE POLICY "Owners view their visitor memory" ON visitor_memory
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Visitor-side (anon) needs INSERT/UPDATE via RPC only (SECURITY DEFINER below),
-- not direct table access, to avoid spoofing.

-- ─── 3. Intent tracking columns on visitor_logs ──────────────────────────
-- NOTE: ai_intent already exists in the original schema (01_schema.sql) and
-- is what getTodayStats()/renderIntentChart() already read from — reusing it
-- rather than creating a duplicate column.
ALTER TABLE visitor_logs
  ADD COLUMN IF NOT EXISTS ai_confidence    NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS ai_priority      TEXT;

-- idx_visitor_logs_ai_intent already exists (sql/09_performance_indexes.sql)

-- ─── 3b. Allow new event types in the visitor_logs RLS insert policy ─────
-- The original policy (sql/10_security_hardening.sql) only allow-listed:
-- qr_scan, bell_ring, voice_message, call_attempt, spam_blocked, sos, ai_intent
-- Production upgrade adds: ai_conversation, sos_triggered, call_attempt (kept)
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

-- ─── 4. RPC: upsert visitor memory (called from visitor page, SECURITY DEFINER) ──
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

-- ─── 5. RPC: get owner display + full profile/settings for visitor page ─────
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
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

-- ─── 6. Realtime for visitor_memory (so dashboard can show "returning visitor") ─
ALTER TABLE visitor_memory REPLICA IDENTITY FULL;
