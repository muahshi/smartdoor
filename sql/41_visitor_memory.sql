-- ════════════════════════════════════════════════════════════════════════════
-- Migration 41: Visitor Memory System
--
-- PURPOSE
--   Additive feature: when a visitor enters their phone number (today,
--   only visitor.html's Tap-to-Talk/masked-call "CALL" button prompts for
--   this — see bindActions() → window.prompt), record who they are and
--   how many times they've visited, so the owner dashboard can recognize
--   a returning visitor and show their history.
--
-- DESIGN NOTE — scoped per-owner, not a global cross-tenant visitor DB
--   The task description's table shape (visitor_profiles: phone, name,
--   first_seen, last_seen, visit_count, blocked, notes) does not mention
--   owner_id, which would make it a single global visitor identity shared
--   across every SmartDoor customer. That's a deliberate deviation, not
--   an oversight: a `blocked` flag only makes sense as one owner's own
--   decision about their own door, and merging visit history for the same
--   phone number across unrelated owners' properties would leak one
--   owner's visitor traffic pattern to another — a privacy/multi-tenancy
--   problem this migration avoids by scoping both tables to owner_id,
--   UNIQUE (owner_id, phone). This mirrors every other visitor-facing
--   table in the schema (call_logs, message_logs, rtc_call_attempts —
--   all owner_id-scoped).
--
-- ACCESS MODEL — RPCs, not direct anon table policies
--   Anonymous visitors never read/write these tables directly. All access
--   goes through two SECURITY DEFINER RPCs (same pattern as the existing
--   check_rate_limit / log_rate_limit_event in sql/04_communication_schema.sql):
--     - record_visitor_visit(...)     — anon-callable, upserts the profile
--       and inserts one visit row; returns just enough for the visitor-
--       facing "Welcome back" greeting (no other visitors' data exposed).
--     - get_visitor_recognition(...)  — anon-callable, but requires the
--       caller to already know BOTH owner_id and the exact phone number
--       (no enumeration possible), and returns only that one visitor's
--       summary — never a list.
--   The owner dashboard reads visitor_profiles/visitor_visits directly
--   via normal RLS (owner_id = get_my_owner_id()), same as every other
--   owner-facing table in this schema.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch call_logs, message_logs, rate_limit_events, or any
--     existing table, column, policy, or function.
--   - Does NOT change visitor.html's existing phone-prompt UX — wiring
--     this in is additive (services/visitorMemory.js), not a redesign.
--   - Does NOT auto-block anyone. `blocked` defaults FALSE and is only
--     ever set by the owner (via their own authenticated session /
--     future dashboard control), never by the anon-callable RPCs.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE throughout. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/04_communication_schema.sql (get_my_owner_id, users table)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. VISITOR PROFILES ──────────
CREATE TABLE IF NOT EXISTS visitor_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone        TEXT NOT NULL,                 -- normalized 10-digit, same normalization visitor.html already applies (raw.replace(/\D/g,'').slice(-10))
  name         TEXT,                          -- optional, settable later by owner (not collected from visitor today)
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visit_count  INTEGER NOT NULL DEFAULT 0,
  blocked      BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_visitor_profiles_owner
  ON visitor_profiles(owner_id, last_seen DESC);

-- ────────── 2. VISITOR VISITS ──────────
CREATE TABLE IF NOT EXISTS visitor_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_profile_id  UUID NOT NULL REFERENCES visitor_profiles(id) ON DELETE CASCADE,
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id            TEXT NOT NULL,
  purpose              TEXT,                   -- e.g. the AI receptionist's detected intent (Delivery / Guest / Maid …)
  call_type            TEXT,                   -- 'webrtc' | 'masked_call' | 'bell' | 'message'
  accepted              BOOLEAN,                -- NULL = n/a (e.g. a bell ring / message, not a call)
  duration              INTEGER DEFAULT 0,      -- seconds, calls only
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_visits_profile
  ON visitor_visits(visitor_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_owner
  ON visitor_visits(owner_id, created_at DESC);

ALTER TABLE visitor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_visits   ENABLE ROW LEVEL SECURITY;

-- Owner reads their own visitors/visits directly — same trust model as
-- rtc_call_attempts_select_own. No anon SELECT policy on either table:
-- all anon access goes through the two RPCs below instead.
DROP POLICY IF EXISTS "visitor_profiles_select_own" ON visitor_profiles;
CREATE POLICY "visitor_profiles_select_own" ON visitor_profiles
  FOR SELECT USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "visitor_profiles_update_own" ON visitor_profiles;
CREATE POLICY "visitor_profiles_update_own" ON visitor_profiles
  FOR UPDATE USING (owner_id = get_my_owner_id())
  WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "visitor_visits_select_own" ON visitor_visits;
CREATE POLICY "visitor_visits_select_own" ON visitor_visits
  FOR SELECT USING (owner_id = get_my_owner_id());

-- ────────── 3. RPC — record_visitor_visit ──────────
-- Anon-callable. Upserts the visitor's profile (increments visit_count,
-- bumps last_seen) and inserts one visit row, in a single round trip.
-- plate_id is validated against the known slug shape (same guard as
-- rtc_call_attempts_insert_anon) so this can't be used to spam arbitrary
-- rows without also knowing a real plate slug.
CREATE OR REPLACE FUNCTION record_visitor_visit(
  p_owner_id  UUID,
  p_plate_id  TEXT,
  p_phone     TEXT,
  p_purpose   TEXT DEFAULT NULL,
  p_call_type TEXT DEFAULT NULL,
  p_accepted  BOOLEAN DEFAULT NULL,
  p_duration  INTEGER DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_profile_id  UUID;
  v_visit_count INTEGER;
  v_first_seen  TIMESTAMPTZ;
  v_is_new      BOOLEAN;
  v_phone       TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF p_plate_id !~ '^SD-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid plate_id';
  END IF;
  v_phone := RIGHT(v_phone, 10);
  IF LENGTH(v_phone) != 10 THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;

  INSERT INTO visitor_profiles (owner_id, phone, visit_count, first_seen, last_seen)
  VALUES (p_owner_id, v_phone, 1, NOW(), NOW())
  ON CONFLICT (owner_id, phone) DO UPDATE
    SET visit_count = visitor_profiles.visit_count + 1,
        last_seen    = NOW()
  RETURNING id, visit_count, first_seen, (visit_count = 1) INTO v_profile_id, v_visit_count, v_first_seen, v_is_new;

  INSERT INTO visitor_visits (visitor_profile_id, owner_id, plate_id, purpose, call_type, accepted, duration)
  VALUES (v_profile_id, p_owner_id, p_plate_id, p_purpose, p_call_type, p_accepted, COALESCE(p_duration, 0));

  RETURN json_build_object(
    'is_returning', NOT v_is_new,
    'visit_count',  v_visit_count,
    'first_seen',   v_first_seen
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 4. RPC — get_visitor_recognition ──────────
-- Anon-callable, but the caller must already know BOTH owner_id and the
-- exact phone number — no listing/enumeration is possible through this
-- function. Returns a compact summary for the "Welcome back" greeting and
-- the owner's incoming-call popup, including up to the 5 most recent
-- visit purposes.
CREATE OR REPLACE FUNCTION get_visitor_recognition(
  p_owner_id UUID,
  p_phone    TEXT
)
RETURNS JSON AS $$
DECLARE
  v_phone   TEXT := RIGHT(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
  v_profile RECORD;
  v_purposes JSON;
BEGIN
  IF LENGTH(v_phone) != 10 THEN
    RETURN json_build_object('known', false);
  END IF;

  SELECT id, name, visit_count, first_seen, last_seen, blocked
    INTO v_profile
    FROM visitor_profiles
   WHERE owner_id = p_owner_id AND phone = v_phone;

  IF NOT FOUND THEN
    RETURN json_build_object('known', false);
  END IF;

  SELECT json_agg(p) INTO v_purposes FROM (
    SELECT purpose FROM visitor_visits
     WHERE visitor_profile_id = v_profile.id AND purpose IS NOT NULL
     ORDER BY created_at DESC LIMIT 5
  ) p;

  RETURN json_build_object(
    'known',        true,
    'name',         v_profile.name,
    'visit_count',  v_profile.visit_count,
    'first_seen',   v_profile.first_seen,
    'last_seen',    v_profile.last_seen,
    'blocked',      v_profile.blocked,
    'recent_purposes', COALESCE(v_purposes, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON TABLE visitor_profiles IS
  'One row per (owner, visitor phone). Populated via record_visitor_visit() RPC whenever a visitor enters their phone number (currently: the Tap to Talk / masked-call CALL button flow in visitor.html). blocked/notes/name are owner-editable only, never set by the anon RPC.';
COMMENT ON TABLE visitor_visits IS
  'One row per visit event tied to a visitor_profiles row. call_type distinguishes webrtc / masked_call / bell / message; accepted/duration apply to calls only.';

-- Housekeeping, mirrors purge_old_rtc_call_attempts().
CREATE OR REPLACE FUNCTION purge_old_visitor_visits()
RETURNS VOID AS $$
BEGIN
  DELETE FROM visitor_visits WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--   SELECT * FROM visitor_profiles LIMIT 1;
--   SELECT * FROM visitor_visits LIMIT 1;
--   SELECT record_visitor_visit('00000000-0000-0000-0000-000000000000'::uuid, 'SD-ABC123', '9876543210', 'Delivery', 'masked_call', true, 42);
--   SELECT get_visitor_recognition('00000000-0000-0000-0000-000000000000'::uuid, '9876543210');
-- ════════════════════════════════════════════════════════════════════════════
