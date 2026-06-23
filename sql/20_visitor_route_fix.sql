-- ════════════════════════════════════════════════════════════════════════════
-- Migration 20: Visitor Route RLS Fix
-- ════════════════════════════════════════════════════════════════════════════
--
-- ROOT CAUSE: getPlateBySlug() in services/plates.js used an embedded
-- PostgREST join: users!plates_owner_id_fkey(id, full_name, phone)
-- The plates_public_qr_lookup policy allows anon reads on PLATES,
-- but the embedded join to USERS goes through users_select_own which
-- requires auth_user_id = auth.uid() — returns NULL for anon visitors.
-- Result: owner name was NULL → fell back to 'Sharma Family' (stale demo data)
-- or whatever the last cached/default value was in the UI.
--
-- FIX: New SECURITY DEFINER RPC get_owner_display_for_plate(text)
-- that only exposes the owner's display name (no phone, no email, no auth_user_id).
-- Called from services/plates.js instead of the broken embedded join.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── get_owner_display_for_plate ───────────────────────────────────────────
-- Returns only the display name for a plate's owner.
-- SECURITY DEFINER: runs as the function owner (postgres), bypasses RLS.
-- Safe: only exposes full_name, nothing sensitive.
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT u.full_name
    FROM users u
    JOIN plates p ON p.owner_id = u.id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id)
      AND p.status = 'active'
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

-- ── Also fix get_subscription_status_for_plate to handle both plate_id ──────
-- and qr_slug lookups (some plates only have one set)
CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT s.plan, s.status, s.expiry_date
    FROM subscriptions s
    JOIN plates p ON p.owner_id = s.owner_id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id)
      AND p.status = 'active'
    ORDER BY
      CASE s.status
        WHEN 'active'       THEN 0
        WHEN 'grace_period' THEN 1
        ELSE 2
      END,
      s.created_at DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_status_for_plate TO anon, authenticated, service_role;

-- ── get_family_members_for_plate (idempotent re-create after DROP fix) ──────
DROP FUNCTION IF EXISTS get_family_members_for_plate(text);

CREATE FUNCTION get_family_members_for_plate(p_plate_id TEXT)
RETURNS TABLE(name TEXT, phone TEXT, relation TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT fm.name, fm.phone, fm.relation
    FROM family_members fm
    JOIN plates p ON p.owner_id = fm.owner_id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id)
      AND p.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_family_members_for_plate TO anon, authenticated, service_role;

-- ── Ensure qr-codes storage bucket exists and is public ─────────────────────
-- (Run manually in Supabase Dashboard > Storage if this fails)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-codes',
  'qr-codes',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS: public read
CREATE POLICY IF NOT EXISTS "qr_codes_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'qr-codes');

-- Service role can upload
CREATE POLICY IF NOT EXISTS "qr_codes_service_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'qr-codes' AND auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "qr_codes_service_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'qr-codes' AND auth.role() = 'service_role');

COMMIT;
