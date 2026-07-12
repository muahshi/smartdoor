-- ════════════════════════════════════════════════════════════════════════════
-- Migration 42: Visitor Call History — Feature 1 (Owner Dashboard Phase 1)
--
-- PURPOSE
--   Extends the existing visitor_visits table (sql/41_visitor_memory.sql)
--   so every call attempt (WebRTC or masked-call) is captured as a proper
--   permanent call-log row with: visitor name (if given), a real call
--   status enum, and network type (if available) — the fields requested
--   for the Owner Dashboard "Visitor History" feature. visitor_visits.id
--   already serves as the unique call id and created_at as the timestamp,
--   so those are not duplicated.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT create a new table. visitor_visits already is a
--     permanent per-attempt call log (one row per call/bell/message);
--     this migration only adds the missing columns to it, per the
--     "extend existing tables if possible" guideline.
--   - Does NOT touch call_logs, message_logs, rtc_call_attempts,
--     rtc_presence_events, or any WebRTC signaling table/logic.
--   - Does NOT change existing visitor_visits rows' meaning — new
--     columns are nullable and default to NULL/'unknown', so old rows
--     stay valid and old callers of record_visitor_visit() keep working
--     unchanged (new params are optional with defaults).
--
-- SAFE / IDEMPOTENT — additive columns + CREATE OR REPLACE only.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/41_visitor_memory.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. NEW COLUMNS ON visitor_visits ──────────
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS visitor_name TEXT;
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS call_status  TEXT;
  -- 'incoming' | 'connected' | 'missed' | 'rejected' | 'cancelled' | 'failed'
  -- NULL for non-call visits (bell/message), same as the existing `accepted` column.
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS network_type TEXT;
  -- e.g. '4g' / 'wifi' / 'slow-2g' from navigator.connection, when the visitor's
  -- browser exposes it. NULL when unavailable — best-effort only, never blocks a call.

COMMENT ON COLUMN visitor_visits.visitor_name IS
  'Optional name the visitor typed in on visitor.html. Never overwrites an owner-set visitor_profiles.name.';
COMMENT ON COLUMN visitor_visits.call_status IS
  'incoming | connected | missed | rejected | cancelled | failed. NULL for non-call visit rows (bell/message).';
COMMENT ON COLUMN visitor_visits.network_type IS
  'Best-effort navigator.connection.effectiveType/type snapshot at call time. NULL when unavailable.';

CREATE INDEX IF NOT EXISTS idx_visitor_visits_call_status
  ON visitor_visits(owner_id, call_status, created_at DESC);

-- ────────── 2. EXTEND record_visitor_visit RPC (additive params, defaults preserve old behavior) ──────────
CREATE OR REPLACE FUNCTION record_visitor_visit(
  p_owner_id     UUID,
  p_plate_id     TEXT,
  p_phone        TEXT,
  p_purpose      TEXT DEFAULT NULL,
  p_call_type    TEXT DEFAULT NULL,
  p_accepted     BOOLEAN DEFAULT NULL,
  p_duration     INTEGER DEFAULT 0,
  p_name         TEXT DEFAULT NULL,
  p_call_status  TEXT DEFAULT NULL,
  p_network_type TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_profile_id  UUID;
  v_visit_count INTEGER;
  v_first_seen  TIMESTAMPTZ;
  v_is_new      BOOLEAN;
  v_phone       TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_name        TEXT := NULLIF(TRIM(COALESCE(p_name, '')), '');
  v_call_status TEXT := NULLIF(TRIM(COALESCE(p_call_status, '')), '');
BEGIN
  IF p_plate_id !~ '^SD-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid plate_id';
  END IF;
  v_phone := RIGHT(v_phone, 10);
  IF LENGTH(v_phone) != 10 THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;
  IF v_call_status IS NOT NULL AND v_call_status NOT IN
     ('incoming','connected','missed','rejected','cancelled','failed') THEN
    v_call_status := NULL; -- ignore unknown values rather than fail the whole call log
  END IF;

  INSERT INTO visitor_profiles (owner_id, phone, name, visit_count, first_seen, last_seen)
  VALUES (p_owner_id, v_phone, v_name, 1, NOW(), NOW())
  ON CONFLICT (owner_id, phone) DO UPDATE
    SET visit_count = visitor_profiles.visit_count + 1,
        last_seen    = NOW(),
        -- Never overwrite a name the owner (or an earlier visit) already set.
        name         = COALESCE(visitor_profiles.name, v_name)
  RETURNING id, visit_count, first_seen, (visit_count = 1) INTO v_profile_id, v_visit_count, v_first_seen, v_is_new;

  INSERT INTO visitor_visits
    (visitor_profile_id, owner_id, plate_id, purpose, call_type, accepted, duration, visitor_name, call_status, network_type)
  VALUES
    (v_profile_id, p_owner_id, p_plate_id, p_purpose, p_call_type, p_accepted, COALESCE(p_duration, 0), v_name, v_call_status, NULLIF(TRIM(COALESCE(p_network_type, '')), ''));

  RETURN json_build_object(
    'is_returning', NOT v_is_new,
    'visit_count',  v_visit_count,
    'first_seen',   v_first_seen
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--   SELECT visitor_name, call_status, network_type, call_type, duration, created_at
--     FROM visitor_visits ORDER BY created_at DESC LIMIT 5;
--   SELECT record_visitor_visit(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'SD-ABC123', '9876543210',
--     NULL, 'masked_call', true, 42, 'Rahul', 'connected', '4g'
--   );
-- ════════════════════════════════════════════════════════════════════════════
