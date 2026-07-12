-- ════════════════════════════════════════════════════════════════════════════
-- Migration 44: Visitor Management Upgrade (Owner Dashboard Phase 9)
--
-- PURPOSE
--   Turns the existing visitor_profiles / visitor_visits / Activity Center
--   (sql/41, 42, 43) into a full visitor-management surface for the owner:
--     - `is_favorite` — owner can star a visitor for quick access
--     - `photo_url`   — owner-uploaded visitor profile photo (new
--                       'visitor-photos' storage bucket, public read,
--                       owner-scoped write via get_my_owner_id())
--     - completes the already-existing `blocked` column (sql/41) with an
--       owner-facing RPC to set it — the column existed but nothing could
--       write it from the dashboard until now
--     - `get_owner_activity_feed` / `get_visitor_profile_summary` now also
--       return is_favorite, photo_url, blocked, visit_count so the feed can
--       render avatars, star state, and a "Regular" / "New" badge without
--       an extra round trip per row
--     - new optional `p_label` filter on the activity feed: 'all' | a label
--       string | 'favorites' | 'blocked' — powers the new Type filter chips
--     - new RPC `get_owner_visitor_insights` — peak visiting hours, top
--       frequent visitors, repeat-vs-new ratio, for the dashboard's new
--       "Visitor Insights" card
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch call_logs, rtc_call_attempts, signaling, WebRTC, or
--     any calling/ringing logic. `blocked` remains a management tag the
--     owner can set; it is not wired into automated call rejection here.
--   - Does NOT change the meaning of any existing column/return field —
--     only adds new ones alongside what get_owner_activity_feed and
--     get_visitor_profile_summary already returned.
--
-- SAFE / IDEMPOTENT — additive columns + CREATE OR REPLACE + IF NOT EXISTS
-- throughout. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/43_owner_activity_center.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. NEW COLUMNS ──────────
ALTER TABLE visitor_profiles ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE visitor_profiles ADD COLUMN IF NOT EXISTS photo_url   TEXT;

COMMENT ON COLUMN visitor_profiles.is_favorite IS
  'Owner-starred visitor for quick recognition/filtering. Set only via toggle_visitor_favorite().';
COMMENT ON COLUMN visitor_profiles.photo_url IS
  'Public URL of an owner-uploaded photo in the visitor-photos storage bucket. NULL falls back to an initials avatar client-side.';

CREATE INDEX IF NOT EXISTS idx_visitor_profiles_favorite
  ON visitor_profiles(owner_id, is_favorite) WHERE is_favorite = TRUE;

COMMIT;

-- ────────── 2. STORAGE BUCKET — visitor-photos ──────────
-- Public read (owner's own dashboard displays these; not sensitive PII
-- beyond what a doorbell camera already sees), owner-scoped write.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visitor-photos',
  'visitor-photos',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'visitor_photos_public_read'
  ) THEN
    CREATE POLICY visitor_photos_public_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'visitor-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'visitor_photos_owner_write'
  ) THEN
    CREATE POLICY visitor_photos_owner_write ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'visitor-photos' AND (storage.foldername(name))[1] = get_my_owner_id()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'visitor_photos_owner_update'
  ) THEN
    CREATE POLICY visitor_photos_owner_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'visitor-photos' AND (storage.foldername(name))[1] = get_my_owner_id()::text);
  END IF;
END $$;

COMMIT;

-- ────────── 3. EXTEND update_visitor_notes_and_label (additive photo_url param) ──────────
BEGIN;

CREATE OR REPLACE FUNCTION update_visitor_notes_and_label(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_notes              TEXT DEFAULT NULL,
  p_label              TEXT DEFAULT NULL,
  p_label_color        TEXT DEFAULT NULL,
  p_clear_label        BOOLEAN DEFAULT FALSE,
  p_photo_url          TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE visitor_profiles
     SET notes       = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
         label        = CASE WHEN p_clear_label THEN NULL ELSE COALESCE(NULLIF(TRIM(p_label), ''), label) END,
         label_color  = CASE WHEN p_clear_label THEN NULL ELSE COALESCE(NULLIF(TRIM(p_label_color), ''), label_color) END,
         photo_url    = COALESCE(NULLIF(TRIM(p_photo_url), ''), photo_url)
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 4. RPC — toggle_visitor_favorite ──────────
CREATE OR REPLACE FUNCTION toggle_visitor_favorite(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_favorite           BOOLEAN
)
RETURNS JSON AS $$
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE visitor_profiles
     SET is_favorite = p_favorite
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  RETURN json_build_object('success', true, 'is_favorite', p_favorite);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 5. RPC — set_visitor_blocked ──────────
-- Completes the `blocked` column added in sql/41 — this is the first
-- owner-facing write path for it. Purely a management/visibility tag;
-- does not alter call routing or signaling.
CREATE OR REPLACE FUNCTION set_visitor_blocked(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_blocked            BOOLEAN
)
RETURNS JSON AS $$
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE visitor_profiles
     SET blocked = p_blocked
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  RETURN json_build_object('success', true, 'blocked', p_blocked);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 6. EXTEND get_owner_activity_feed (adds is_favorite, photo_url, blocked, visit_count, p_label filter) ──────────
DROP FUNCTION IF EXISTS get_owner_activity_feed(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_owner_activity_feed(
  p_owner_id     UUID,
  p_search       TEXT    DEFAULT NULL,
  p_date_range   TEXT    DEFAULT 'all',    -- all | today | yesterday | last7 | last30
  p_status       TEXT    DEFAULT 'all',    -- all | connected | missed | rejected | cancelled
  p_limit        INTEGER DEFAULT 20,
  p_offset       INTEGER DEFAULT 0,
  p_label        TEXT    DEFAULT 'all'     -- all | favorites | blocked | <exact label text>
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
  is_favorite         BOOLEAN,
  photo_url           TEXT,
  blocked             BOOLEAN,
  visit_count         INTEGER,
  total_count         BIGINT
) AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to   TIMESTAMPTZ;
  v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_label  TEXT := NULLIF(TRIM(COALESCE(p_label, 'all')), '');
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
    COALESCE(p.is_favorite, FALSE), p.photo_url, COALESCE(p.blocked, FALSE), COALESCE(p.visit_count, 1),
    COUNT(*) OVER() AS total_count
  FROM visitor_visits v
  LEFT JOIN visitor_profiles p ON p.id = v.visitor_profile_id
  WHERE v.owner_id = p_owner_id
    AND (v_from IS NULL OR v.created_at >= v_from)
    AND (v_to   IS NULL OR v.created_at <  v_to)
    AND (p_status = 'all' OR v.call_status = p_status)
    AND (
      v_label IS NULL OR v_label = 'all'
      OR (v_label = 'favorites' AND p.is_favorite = TRUE)
      OR (v_label = 'blocked'   AND p.blocked = TRUE)
      OR (v_label NOT IN ('favorites','blocked') AND p.label = v_label)
    )
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

-- ────────── 7. EXTEND get_visitor_profile_summary (adds is_favorite, photo_url) ──────────
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

  SELECT id, name, phone, first_seen, last_seen, visit_count, blocked, notes,
         label, label_color, is_favorite, photo_url
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
    'is_favorite',       v_profile.is_favorite,
    'photo_url',         v_profile.photo_url,
    'connected_count',   COALESCE(v_connected_count, 0),
    'avg_duration',      COALESCE(v_avg_duration, 0),
    'visits',            COALESCE(v_visits, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────── 8. RPC — get_owner_visitor_insights ──────────
-- Powers the dashboard's "Visitor Insights" card: peak visiting hours
-- (24-bucket histogram, last 30 days), top 5 most frequent visitors,
-- and a repeat-vs-new visitor ratio for the same window.
CREATE OR REPLACE FUNCTION get_owner_visitor_insights(
  p_owner_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_since       TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_hourly      JSON;
  v_top         JSON;
  v_total_unique   INTEGER;
  v_repeat_unique  INTEGER;
  v_new_this_week  INTEGER;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_agg(cnt ORDER BY hr) INTO v_hourly FROM (
    SELECT h.hr, COALESCE(COUNT(v.id), 0) AS cnt
      FROM generate_series(0, 23) AS h(hr)
      LEFT JOIN visitor_visits v
        ON v.owner_id = p_owner_id
       AND v.created_at >= v_since
       AND EXTRACT(HOUR FROM v.created_at) = h.hr
     GROUP BY h.hr
  ) t;

  SELECT json_agg(row_to_json(t)) INTO v_top FROM (
    SELECT p.id AS visitor_profile_id, COALESCE(p.name, 'Unknown Visitor') AS name,
           p.phone, p.label, p.label_color, p.is_favorite, p.photo_url, p.visit_count
      FROM visitor_profiles p
     WHERE p.owner_id = p_owner_id AND p.visit_count > 1
     ORDER BY p.visit_count DESC, p.last_seen DESC
     LIMIT 5
  ) t;

  SELECT COUNT(*) INTO v_total_unique FROM visitor_profiles WHERE owner_id = p_owner_id;
  SELECT COUNT(*) INTO v_repeat_unique FROM visitor_profiles WHERE owner_id = p_owner_id AND visit_count > 1;
  SELECT COUNT(*) INTO v_new_this_week FROM visitor_profiles
   WHERE owner_id = p_owner_id AND first_seen >= NOW() - INTERVAL '7 days';

  RETURN json_build_object(
    'hourly_histogram',   COALESCE(v_hourly, '[]'::json),
    'top_visitors',       COALESCE(v_top, '[]'::json),
    'total_unique',       COALESCE(v_total_unique, 0),
    'repeat_unique',      COALESCE(v_repeat_unique, 0),
    'repeat_pct',         CASE WHEN COALESCE(v_total_unique, 0) = 0 THEN 0
                               ELSE ROUND((v_repeat_unique::NUMERIC / v_total_unique) * 100) END,
    'new_this_week',      COALESCE(v_new_this_week, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--   SELECT * FROM get_owner_activity_feed('<owner-uuid>'::uuid, NULL, 'all', 'all', 20, 0, 'favorites');
--   SELECT toggle_visitor_favorite('<owner-uuid>'::uuid, '<profile-uuid>'::uuid, true);
--   SELECT set_visitor_blocked('<owner-uuid>'::uuid, '<profile-uuid>'::uuid, true);
--   SELECT get_owner_visitor_insights('<owner-uuid>'::uuid);
-- ════════════════════════════════════════════════════════════════════════════
