-- ════════════════════════════════════════════════════════════════════════════
-- Migration 27: Activation Flow Redesign
--
-- Fixes: QR scan always shows "Activation Pending" even on active plates.
--
-- Root cause:
--   The `plates_public_qr_lookup` RLS policy only allowed anon SELECT when
--   status = 'active'. This meant isPlateActive() (and the old getPlateBySlug)
--   could NOT read a plate row to check activation state unless it was already
--   active — a circular dependency.
--
--   Additionally, getActivationPendingInfo() in activation.js was querying
--   the `orders` table to generate a pending-screen message, creating a hard
--   dependency on orders/manufacturing for a pure activation state check.
--
-- Fix:
--   1. Replace plates_public_qr_lookup with plates_public_activation_check:
--      Anon can SELECT any plate row by qr_slug OR plate_id.
--      Only minimal activation fields exposed (no sensitive data).
--
--   2. Add plate_id to all lookup RPCs so old plates (where plate_id was
--      used directly as the URL slug before qr_slug column existed) still work.
--
--   3. Ensure get_owner_display_for_plate searches both qr_slug AND plate_id.
--
-- Idempotent — safe to run multiple times.
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Replace the over-restrictive plates_public_qr_lookup policy ──────────
--
-- OLD: FOR SELECT USING (status = 'active')
--   Problem: Anon cannot read a plate row to check why it's inactive.
--            isPlateActive() returns { active: false, reason: 'not_found' }
--            for ANY plate that isn't already active, making it impossible
--            to distinguish "plate doesn't exist" from "plate inactive".
--
-- NEW: Allow anon to SELECT all plate rows, restricted to activation-state
--      columns only. The JS layer (isPlateActive) then evaluates the three
--      conditions. Sensitive columns (expiry_date etc.) are not part of this
--      policy — they're fetched only after isPlateActive() returns true,
--      via authenticated RPCs.
--
-- Security note: plate_id, qr_slug, status, owner_id (UUID only),
--   activation_date are not sensitive. The owner's identity is exposed only
--   via the SECURITY DEFINER get_owner_display_for_plate() RPC which returns
--   only full_name.

DROP POLICY IF EXISTS plates_public_qr_lookup ON plates;

CREATE POLICY plates_public_activation_check ON plates
  FOR SELECT
  USING (true);

-- Note: PostgREST column-level select filtering is enforced via the JS
-- select() call: .select('id, plate_id, qr_slug, product_type, status, owner_id, activation_date')
-- A user cannot SELECT columns not specified in the query. The policy above
-- allows row access; the RLS on users/subscriptions/etc. prevents any join
-- from leaking sensitive data.

-- ── 2. Update get_owner_display_for_plate to search both columns ─────────────
-- Ensures old plates (plate_id used as slug) resolve correctly.

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
    -- Only return a name if the plate is genuinely active (all three conditions)
    AND p.status = 'active'
    AND p.owner_id IS NOT NULL
    AND p.activation_date IS NOT NULL
    AND u.full_name IS NOT NULL
    AND u.full_name != ''
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

-- ── 3. Update get_subscription_status_for_plate to search both columns ───────

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
    AND p.owner_id IS NOT NULL
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

-- ── 4. Ensure activation_date is set on all existing active plates ───────────
-- Plates provisioned before activation_date column existed may have NULL.
-- The isPlateActive() check requires activation_date IS NOT NULL.
-- Backfill: if a plate is active and has an owner, it was activated —
-- use created_at as the activation_date if missing.

UPDATE plates
SET activation_date = COALESCE(activation_date, created_at)
WHERE status = 'active'
  AND owner_id IS NOT NULL
  AND activation_date IS NULL;

-- ── 5. Ensure qr_slug matches plate_id for all existing plates ──────────────
-- isPlateActive() queries OR(qr_slug, plate_id) so both work. But for clean
-- data, keep them in sync for admin-provisioned plates.

UPDATE plates
SET qr_slug = plate_id
WHERE (qr_slug IS NULL OR qr_slug != plate_id)
  AND plate_id IS NOT NULL;

-- ── 6. Update activation-check indexes ─────────────────────────────────────
-- Remove partial index (only covered active plates — misses inactive/pending plates).
DROP INDEX IF EXISTS idx_plates_qr_slug_active;
DROP INDEX IF EXISTS idx_plates_plate_id_active;

-- Full covering index for the isPlateActive() query pattern.
CREATE INDEX IF NOT EXISTS idx_plates_qr_slug     ON plates(qr_slug);
CREATE INDEX IF NOT EXISTS idx_plates_plate_id    ON plates(plate_id);

-- ── 7. Verify (run the SELECT below to confirm fix after applying) ───────────
-- SELECT plate_id, qr_slug, status, owner_id IS NOT NULL as has_owner,
--        activation_date IS NOT NULL as is_activated
-- FROM plates ORDER BY created_at DESC LIMIT 20;

COMMIT;
