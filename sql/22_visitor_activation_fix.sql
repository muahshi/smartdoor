-- ════════════════════════════════════════════════════════════════════════════
-- Migration 22: Visitor Activation Fix
-- Fixes "Activation Pending" bug for active plates + auto-creates security_rules
-- Idempotent — safe to run multiple times.
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Backfill qr_slug for any plates missing it ──────────────────────────
-- Ensures getPlateBySlug can find plates by qr_slug even if backfill in migration 21 missed any
UPDATE plates
SET qr_slug = plate_id
WHERE qr_slug IS NULL AND plate_id IS NOT NULL;

-- Also fix plates where qr_slug differs from plate_id (admin-provisioned plates should match)
UPDATE plates
SET qr_slug = plate_id
WHERE qr_slug != plate_id AND provisioning_source = 'admin_manual';

-- ── 2. Auto-create security_rules for every active plate with owner ─────────
-- Newly provisioned plates have no security_rules row → getPlateBySlug was returning
-- { data: null, error: PGRST116 } from .single() (now fixed to .maybeSingle() in JS).
-- This migration also seeds default rows so the DB is fully clean.
INSERT INTO security_rules (
  owner_id,
  night_mode_on,
  night_mode_start,
  night_mode_end,
  allow_sos,
  allow_voice,
  allow_calls,
  call_forwarding,
  current_status,
  custom_message
)
SELECT
  p.owner_id,
  false,
  '22:00:00'::time,
  '07:00:00'::time,
  true,
  true,
  true,
  true,
  'available',
  NULL
FROM plates p
WHERE p.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM security_rules sr WHERE sr.owner_id = p.owner_id
  );

-- ── 3. Fix get_owner_display_for_plate RPC ────────────────────────────────
-- Previous version only searched by plate_id OR qr_slug.
-- This version is more robust: searches both columns, handles NULLs safely.
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_plate_id));
BEGIN
  RETURN QUERY
    SELECT u.full_name
    FROM users u
    JOIN plates p ON p.owner_id = u.id
    WHERE (
      p.plate_id = v_normalized
      OR p.qr_slug = v_normalized
    )
    AND p.status = 'active'
    AND u.full_name IS NOT NULL
    AND u.full_name != ''
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

-- ── 4. Fix get_subscription_status_for_plate RPC (idempotent) ──────────────
CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_plate_id));
BEGIN
  RETURN QUERY
    SELECT s.plan, s.status, s.expiry_date
    FROM subscriptions s
    JOIN plates p ON p.owner_id = s.owner_id
    WHERE (
      p.plate_id = v_normalized
      OR p.qr_slug = v_normalized
    )
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

-- ── 5. Auto-create security_rules trigger for new plate provisioning ────────
-- Every time a new plate is inserted with an owner_id, auto-seed security_rules.
CREATE OR REPLACE FUNCTION fn_auto_create_security_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only run if plate has an owner and is active
  IF NEW.owner_id IS NOT NULL AND NEW.status = 'active' THEN
    INSERT INTO security_rules (
      owner_id,
      night_mode_on,
      night_mode_start,
      night_mode_end,
      allow_sos,
      allow_voice,
      allow_calls,
      call_forwarding,
      current_status,
      custom_message
    )
    VALUES (
      NEW.owner_id,
      false,
      '22:00:00'::time,
      '07:00:00'::time,
      true,
      true,
      true,
      true,
      'available',
      NULL
    )
    ON CONFLICT (owner_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trg_auto_create_security_rules ON plates;
CREATE TRIGGER trg_auto_create_security_rules
  AFTER INSERT OR UPDATE OF owner_id, status ON plates
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_create_security_rules();

-- ── 6. Ensure plates_public_qr_lookup policy exists and is correct ──────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plates' AND policyname = 'plates_public_qr_lookup'
  ) THEN
    CREATE POLICY plates_public_qr_lookup ON plates
      FOR SELECT USING (status = 'active');
  END IF;
END $$;

-- ── 7. Performance index: qr_slug lookup ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plates_qr_slug_active ON plates(qr_slug) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_plates_plate_id_active ON plates(plate_id) WHERE status = 'active';

COMMIT;
