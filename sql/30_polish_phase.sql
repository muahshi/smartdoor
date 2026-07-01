-- ============================================================
-- Migration 30: Product Polish Phase
-- Adds visitor_welcome_title to security_rules.
-- Run after 29b_owner_settings_columns_fix.sql.
-- ============================================================

-- 1. New column: custom visitor page welcome title
ALTER TABLE security_rules
  ADD COLUMN IF NOT EXISTS visitor_welcome_title TEXT;

-- 2. Update the existing get_owner_display_for_plate RPC to include it
--    (full replacement to stay consistent with 29b)
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE (
  full_name            TEXT,
  residence_name       TEXT,
  family_name          TEXT,
  welcome_message      TEXT,
  owner_display_name   TEXT,
  ai_name              TEXT,
  greeting_style       TEXT,
  preferred_language   TEXT,
  visitor_greeting     TEXT,
  visitor_welcome_title TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.raw_user_meta_data->>'full_name'            AS full_name,
    sr.residence_name,
    sr.family_name,
    sr.welcome_message,
    sr.owner_display_name,
    sr.ai_name,
    sr.greeting_style,
    sr.preferred_language,
    sr.visitor_greeting,
    sr.visitor_welcome_title
  FROM smart_plates sp
  JOIN auth.users u  ON u.id  = sp.owner_id
  LEFT JOIN security_rules sr ON sr.owner_id = sp.owner_id
  WHERE sp.plate_id = p_plate_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate(TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'security_rules'
  AND column_name = 'visitor_welcome_title';

