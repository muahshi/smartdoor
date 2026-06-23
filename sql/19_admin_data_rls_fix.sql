-- ════════════════════════════════════════════════════════════════════════════
-- Migration 19: Admin Data RLS Fix + QR Backfill
-- ════════════════════════════════════════════════════════════════════════════
--
-- ROOT CAUSE: The admin panel (admin.html) was reading users, plates, orders,
-- subscriptions, and support_tickets using the anon key directly from the
-- browser. All those tables have RLS policies that only allow owners to read
-- their OWN rows — no policy existed that let an admin session read ALL rows.
--
-- THE FIX: All admin reads now go through the `admin-data` Edge Function which
-- uses service_role (bypasses RLS). No new RLS policies are needed for that.
--
-- This migration:
--   1. Ensures qr_svg_url + qr_image_url columns exist on plates
--   2. Backfills qr_slug for any plate that has plate_id but NULL qr_slug
--   3. Adds UNIQUE index on plates.qr_slug if not present
--   4. Ensures support_tickets.owner_id is nullable (for guest tickets)
--   5. Adds missing service_role bypass policies on admin tables
--   6. Adds the get_subscription_status_for_plate RPC if missing
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Ensure QR URL columns on plates ──────────────────────────────────────
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_image_url TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_svg_url   TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_by TEXT;

-- ── 2. Backfill qr_slug from plate_id for any NULL rows ─────────────────────
UPDATE plates
  SET qr_slug = plate_id
WHERE qr_slug IS NULL
  AND plate_id IS NOT NULL;

-- ── 3. Ensure UNIQUE index on qr_slug ───────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_plates_qr_slug ON plates(qr_slug)
  WHERE qr_slug IS NOT NULL;

-- ── 4. Ensure admin_audit_logs has the expected columns ─────────────────────
-- (Some deploys may have an older schema from 08_admin_schema.sql)
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS resource  TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;

-- ── 5. Ensure admin tables have service_role bypass policies ────────────────
-- (These may already exist from 10_security_hardening.sql but we use
--  CREATE POLICY IF NOT EXISTS to be idempotent.)

-- admin_users: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_users' AND policyname = 'admin_users_service_all'
  ) THEN
    CREATE POLICY admin_users_service_all ON admin_users
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- admin_audit_logs: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_audit_logs' AND policyname = 'audit_logs_service_all'
  ) THEN
    CREATE POLICY audit_logs_service_all ON admin_audit_logs
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- support_tickets: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_tickets' AND policyname = 'tickets_service_all'
  ) THEN
    CREATE POLICY tickets_service_all ON support_tickets
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- plates: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plates' AND policyname = 'plates_service_all'
  ) THEN
    CREATE POLICY plates_service_all ON plates
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- users: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'users_service_all'
  ) THEN
    CREATE POLICY users_service_all ON users
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- subscriptions: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'subscriptions_service_all'
  ) THEN
    CREATE POLICY subscriptions_service_all ON subscriptions
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- message_logs: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_logs' AND policyname = 'message_logs_service_all'
  ) THEN
    ALTER TABLE IF EXISTS message_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY message_logs_service_all ON message_logs
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 6. Ensure get_subscription_status_for_plate RPC exists ─────────────────
-- (Was in 12_real_world_operations.sql but guarded here in case that
--  migration was skipped or partially applied)
CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as owner, bypasses RLS safely
AS $$
BEGIN
  RETURN QUERY
    SELECT s.plan, s.status, s.expiry_date
    FROM subscriptions s
    JOIN plates p ON p.owner_id = s.owner_id
    WHERE p.plate_id = p_plate_id
      OR  p.qr_slug  = p_plate_id
    ORDER BY
      CASE s.status WHEN 'active' THEN 0 WHEN 'grace_period' THEN 1 ELSE 2 END,
      s.created_at DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_status_for_plate TO anon, authenticated, service_role;

-- ── 7. Ensure get_family_members_for_plate RPC exists ──────────────────────
CREATE OR REPLACE FUNCTION get_family_members_for_plate(p_plate_id TEXT)
RETURNS TABLE(name TEXT, phone TEXT, relation TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ── 8. Performance: add index on plates.owner_id if missing ─────────────────
CREATE INDEX IF NOT EXISTS idx_plates_owner_id ON plates(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner_id ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_owner_id ON orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION NOTES
-- ════════════════════════════════════════════════════════════════════════════
--
-- After running this migration:
--
-- 1. Deploy the new `admin-data` Edge Function:
--      supabase functions deploy admin-data
--
-- 2. Deploy the updated `generate-qr` Edge Function:
--      supabase functions deploy generate-qr
--
-- 3. For existing customers with NULL qr_image_url / qr_svg_url,
--    regenerate their QRs from Admin → QR Management → Regenerate QR.
--    Or run the backfill query below (requires APP_URL in env):
--
--    -- This backfill should be done via the generate-qr Edge Function,
--    -- not SQL, since QR generation requires Deno crypto libraries.
--    -- Use the admin panel "Regenerate QR" button for each affected customer.
--
-- 4. Verify the storage bucket 'qr-codes' exists and has public read:
--      supabase storage ls
--      -- Should show: qr-codes (public)
-- ════════════════════════════════════════════════════════════════════════════
