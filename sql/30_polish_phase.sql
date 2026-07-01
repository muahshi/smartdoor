-- ============================================================
-- Migration 30: Product Polish Phase (v2 — correct table names)
-- ============================================================

-- 1. Add column
ALTER TABLE security_rules
  ADD COLUMN IF NOT EXISTS visitor_welcome_title TEXT;

-- 2. DROP old function (return type changed)
DROP FUNCTION IF EXISTS get_owner_display_for_plate(TEXT);
DROP FUNCTION IF EXISTS get_owner_display_for_plate;

-- 3. Recreate with correct table names (users + plates, NOT smart_plates)
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE (
  full_name             TEXT,
  residence_name        TEXT,
  family_name           TEXT,
  welcome_message       TEXT,
  owner_display_name    TEXT,
  ai_name               TEXT,
  greeting_style        TEXT,
  preferred_language    TEXT,
  visitor_greeting      TEXT,
  visitor_welcome_title TEXT
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
      sr.visitor_greeting,
      sr.visitor_welcome_title
    FROM users u
    JOIN plates p          ON p.owner_id  = u.id
    LEFT JOIN security_rules sr ON sr.owner_id = u.id
    WHERE (
      p.plate_id = v_normalized
      OR p.qr_slug = v_normalized
    )
    AND p.status          = 'active'
    AND p.owner_id        IS NOT NULL
    AND p.activation_date IS NOT NULL
    AND u.full_name        IS NOT NULL
    AND u.full_name        != ''
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate(TEXT) TO anon, authenticated, service_role;

-- Verify both changes
SELECT column_name FROM information_schema.columns
WHERE table_name  = 'security_rules'
  AND column_name = 'visitor_welcome_title';
