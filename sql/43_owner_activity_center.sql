-- ════════════════════════════════════════════════════════════════════════════
-- Migration 43: Owner Activity Center — Feature 2 (Owner Dashboard Phase 2)
--
-- PURPOSE
--   Turns the visitor_visits / visitor_profiles tables (sql/41, sql/42) into
--   a searchable, filterable, paginated "Activity Center" for the owner:
--     - denormalizes `phone` onto visitor_visits so the feed query never
--       needs a join to search by phone
--     - adds owner-settable `label` / `label_color` to visitor_profiles
--       (Family / Delivery / Courier / Guest / Office / Unknown / Custom)
--     - adds two SECURITY DEFINER RPCs used by services/activityCenter.js:
--         get_owner_activity_feed(...)   — search + filter + pagination,
--                                           one round trip, total_count included
--         get_owner_activity_stats(...)  — today's 4 stat-card numbers
--     - adds visitor_visits to the realtime publication so new calls/bells
--       appear in the Activity Center live, and pg_trgm indexes so ILIKE
--       search on name/phone/plate stays fast as history grows.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch call_logs, message_logs, rtc_call_attempts,
--     rtc_presence_events, conversations/messages, or any WebRTC signaling
--     table/logic, or owner_private_settings.
--   - Does NOT change the meaning of any existing column or the behavior
--     of record_visitor_visit() for existing callers — only adds a new
--     denormalized write (phone) inside the same function body.
--
-- SAFE / IDEMPOTENT — additive columns + CREATE OR REPLACE + IF NOT EXISTS
-- throughout. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/42_visitor_call_history.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 0. pg_trgm for fast ILIKE search on name/phone/plate ──────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────── 1. NEW COLUMNS ──────────

-- Denormalized onto visitor_visits so the activity feed can search/filter
-- by phone without joining visitor_profiles on every row.
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS phone TEXT;

-- Owner-settable colored label per visitor profile (not per visit — a
-- visitor is "Family" or "Delivery" regardless of which visit you're
-- looking at). Free-text `label` supports the 6 presets and custom labels;
-- `label_color` is a hex string chosen by the owner (defaults applied
-- client-side for the presets).
ALTER TABLE visitor_profiles ADD COLUMN IF NOT EXISTS label       TEXT;
ALTER TABLE visitor_profiles ADD COLUMN IF NOT EXISTS label_color TEXT;

COMMENT ON COLUMN visitor_visits.phone IS
  'Denormalized 10-digit visitor phone, copied from visitor_profiles at write time. Lets the Activity Center search/filter visits by phone without a join.';
COMMENT ON COLUMN visitor_profiles.label IS
  'Owner-assigned label: Family | Delivery | Courier | Guest | Office | Unknown | or a custom string.';
COMMENT ON COLUMN visitor_profiles.label_color IS
  'Hex color (e.g. #22C55E) shown with the label chip. NULL uses the Activity Center''s default preset color for known labels.';

-- ────────── 2. INDEXES ──────────
CREATE INDEX IF NOT EXISTS idx_visitor_visits_owner_created
  ON visitor_visits(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_visits_name_trgm
  ON visitor_visits USING GIN (visitor_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_visitor_visits_phone_trgm
  ON visitor_visits USING GIN (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_visitor_visits_plate_trgm
  ON visitor_visits USING GIN (plate_id gin_trgm_ops);

-- ────────── 3. Backfill phone onto existing visitor_visits rows ──────────
UPDATE visitor_visits v
   SET phone = p.phone
  FROM visitor_profiles p
 WHERE v.visitor_profile_id = p.id
   AND v.phone IS NULL;

-- ────────── 4. EXTEND record_visitor_visit RPC (additive — writes phone too) ──────────
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
    v_call_status := NULL;
  END IF;

  INSERT INTO visitor_profiles (owner_id, phone, name, visit_count, first_seen, last_seen)
  VALUES (p_owner_id, v_phone, v_name, 1, NOW(), NOW())
  ON CONFLICT (owner_id, phone) DO UPDATE
    SET visit_count = visitor_profiles.visit_count + 1,
        last_seen    = NOW(),
        name         = COALESCE(visitor_profiles.name, v_name)
  RETURNING id, visit_count, first_seen, (visit_count = 1) INTO v_profile_id, v_visit_count, v_first_seen, v_is_new;

  INSERT INTO visitor_visits
    (visitor_profile_id, owner_id, plate_id, purpose, call_type, accepted, duration, visitor_name, call_status, network_type, phone)
  VALUES
    (v_profile_id, p_owner_id, p_plate_id, p_purpose, p_call_type, p_accepted, COALESCE(p_duration, 0), v_name, v_call_status, NULLIF(TRIM(COALESCE(p_network_type, '')), ''), v_phone);

  RETURN json_build_object(
    'is_returning', NOT v_is_new,
    'visit_count',  v_visit_count,
    'first_seen',   v_first_seen
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 5. RPC — get_owner_activity_feed ──────────
-- Owner-only (SECURITY DEFINER but self-checks p_owner_id against the
-- calling session, same guard style as admin RPCs elsewhere in this
-- schema) search + filter + pagination in one round trip. Returns rows
-- plus a `total_count` column (window function) so the client can render
-- pagination without a second COUNT query.
CREATE OR REPLACE FUNCTION get_owner_activity_feed(
  p_owner_id     UUID,
  p_search       TEXT    DEFAULT NULL,
  p_date_range   TEXT    DEFAULT 'all',    -- all | today | yesterday | last7 | last30
  p_status       TEXT    DEFAULT 'all',    -- all | connected | missed | rejected | cancelled
  p_limit        INTEGER DEFAULT 20,
  p_offset       INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                  UUID,
  visitor_profile_id  UUID,
  visitor_name        TEXT,
  phone               TEXT,
  plate_id            TEXT,
  call_status         TEXT,
  duration            INTEGER,
  network_type        TEXT,
  created_at          TIMESTAMPTZ,
  label               TEXT,
  label_color         TEXT,
  total_count         BIGINT
) AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to   TIMESTAMPTZ;
  v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_date_range = 'today' THEN
    v_from := date_trunc('day', NOW());
  ELSIF p_date_range = 'yesterday' THEN
    v_from := date_trunc('day', NOW()) - INTERVAL '1 day';
    v_to   := date_trunc('day', NOW());
  ELSIF p_date_range = 'last7' THEN
    v_from := NOW() - INTERVAL '7 days';
  ELSIF p_date_range = 'last30' THEN
    v_from := NOW() - INTERVAL '30 days';
  END IF;

  RETURN QUERY
  SELECT
    v.id, v.visitor_profile_id,
    COALESCE(v.visitor_name, p.name) AS visitor_name,
    v.phone, v.plate_id, v.call_status, v.duration, v.network_type, v.created_at,
    p.label, p.label_color,
    COUNT(*) OVER() AS total_count
  FROM visitor_visits v
  LEFT JOIN visitor_profiles p ON p.id = v.visitor_profile_id
  WHERE v.owner_id = p_owner_id
    AND (v_from IS NULL OR v.created_at >= v_from)
    AND (v_to   IS NULL OR v.created_at <  v_to)
    AND (p_status = 'all' OR v.call_status = p_status)
    AND (
      v_search IS NULL
      OR v.visitor_name ILIKE '%' || v_search || '%'
      OR p.name          ILIKE '%' || v_search || '%'
      OR v.phone          ILIKE '%' || v_search || '%'
      OR v.plate_id       ILIKE '%' || v_search || '%'
    )
  ORDER BY v.created_at DESC
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────── 6. RPC — get_owner_activity_stats ──────────
-- The 4 stat cards: today's visitors, today's connected calls, today's
-- missed calls, and today's average connected-call duration.
CREATE OR REPLACE FUNCTION get_owner_activity_stats(
  p_owner_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_today TIMESTAMPTZ := date_trunc('day', NOW());
  v_visitors  INTEGER;
  v_connected INTEGER;
  v_missed    INTEGER;
  v_avg_dur   NUMERIC;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_visitors
    FROM visitor_visits
   WHERE owner_id = p_owner_id AND created_at >= v_today;

  SELECT COUNT(*) INTO v_connected
    FROM visitor_visits
   WHERE owner_id = p_owner_id AND created_at >= v_today AND call_status = 'connected';

  SELECT COUNT(*) INTO v_missed
    FROM visitor_visits
   WHERE owner_id = p_owner_id AND created_at >= v_today AND call_status = 'missed';

  SELECT ROUND(AVG(duration)) INTO v_avg_dur
    FROM visitor_visits
   WHERE owner_id = p_owner_id AND created_at >= v_today
     AND call_status = 'connected' AND duration > 0;

  RETURN json_build_object(
    'today_visitors',  v_visitors,
    'today_connected', v_connected,
    'today_missed',    v_missed,
    'avg_duration',    COALESCE(v_avg_dur, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────── 7. RPC — get_visitor_profile_summary ──────────
-- Powers the Visitor Details Drawer: aggregate stats for one profile plus
-- its full visit timeline (paginated), in one round trip.
CREATE OR REPLACE FUNCTION get_visitor_profile_summary(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_limit              INTEGER DEFAULT 50,
  p_offset              INTEGER DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_profile RECORD;
  v_connected_count INTEGER;
  v_avg_duration    NUMERIC;
  v_visits          JSON;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id, name, phone, first_seen, last_seen, visit_count, blocked, notes, label, label_color
    INTO v_profile
    FROM visitor_profiles
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  SELECT COUNT(*), ROUND(AVG(NULLIF(duration, 0)))
    INTO v_connected_count, v_avg_duration
    FROM visitor_visits
   WHERE visitor_profile_id = p_visitor_profile_id AND call_status = 'connected';

  SELECT json_agg(t) INTO v_visits FROM (
    SELECT id, plate_id, call_type, call_status, duration, network_type, created_at
      FROM visitor_visits
     WHERE visitor_profile_id = p_visitor_profile_id
     ORDER BY created_at DESC
     LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0)
  ) t;

  RETURN json_build_object(
    'found',            true,
    'id',                v_profile.id,
    'name',              v_profile.name,
    'phone',             v_profile.phone,
    'first_seen',        v_profile.first_seen,
    'last_seen',         v_profile.last_seen,
    'visit_count',       v_profile.visit_count,
    'blocked',           v_profile.blocked,
    'notes',             v_profile.notes,
    'label',             v_profile.label,
    'label_color',       v_profile.label_color,
    'connected_count',   COALESCE(v_connected_count, 0),
    'avg_duration',      COALESCE(v_avg_duration, 0),
    'visits',            COALESCE(v_visits, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────── 8. RPC — update_visitor_notes_and_label ──────────
-- Owner-only write. RLS already allows the owner to UPDATE their own
-- visitor_profiles rows directly, but this RPC is provided so the client
-- can do one guarded call (validates ownership + trims input) instead of
-- a raw .update() and keeps write validation server-side.
CREATE OR REPLACE FUNCTION update_visitor_notes_and_label(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_notes              TEXT DEFAULT NULL,
  p_label              TEXT DEFAULT NULL,
  p_label_color        TEXT DEFAULT NULL,
  p_clear_label        BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE visitor_profiles
     SET notes       = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
         label        = CASE WHEN p_clear_label THEN NULL ELSE COALESCE(NULLIF(TRIM(p_label), ''), label) END,
         label_color  = CASE WHEN p_clear_label THEN NULL ELSE COALESCE(NULLIF(TRIM(p_label_color), ''), label_color) END
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 9. REALTIME ──────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'visitor_visits') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE visitor_visits;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--   SELECT * FROM get_owner_activity_feed('<owner-uuid>'::uuid, NULL, 'all', 'all', 20, 0);
--   SELECT get_owner_activity_stats('<owner-uuid>'::uuid);
--   SELECT get_visitor_profile_summary('<owner-uuid>'::uuid, '<profile-uuid>'::uuid, 50, 0);
--   SELECT update_visitor_notes_and_label('<owner-uuid>'::uuid, '<profile-uuid>'::uuid, 'Amazon delivery', 'Delivery', '#00A2E8', false);
-- ════════════════════════════════════════════════════════════════════════════
