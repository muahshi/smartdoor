-- SmartDoor Migration 21: Production Recovery
-- Idempotent — safe to run multiple times
-- Run in: Supabase Dashboard > SQL Editor > New Query

BEGIN;

-- 1. QR URL columns on plates
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_image_url       TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_svg_url         TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_reason   TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_at       TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_by       TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioned_by     TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioning_source TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS activation_date    TIMESTAMPTZ;

-- 2. User columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS plate_id  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address   TEXT;

-- 3. Backfill qr_slug from plate_id
UPDATE plates SET qr_slug = plate_id WHERE qr_slug IS NULL AND plate_id IS NOT NULL;

-- 4. Unique index on qr_slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_plates_qr_slug ON plates(qr_slug) WHERE qr_slug IS NOT NULL;

-- 5. Service-role bypass policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_users' AND policyname='admin_users_service_all') THEN
    CREATE POLICY admin_users_service_all ON admin_users FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_audit_logs' AND policyname='audit_logs_service_all') THEN
    CREATE POLICY audit_logs_service_all ON admin_audit_logs FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plates' AND policyname='plates_service_all') THEN
    CREATE POLICY plates_service_all ON plates FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_service_all') THEN
    CREATE POLICY users_service_all ON users FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subscriptions_service_all') THEN
    CREATE POLICY subscriptions_service_all ON subscriptions FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_service_all') THEN
    CREATE POLICY orders_service_all ON orders FOR ALL USING (auth.role()='service_role'); END IF;
END $$;

-- 6. admin_session_revocations (prevents verifyAdminSession crash on missing table)
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason     TEXT
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_session_revocations' AND policyname='revocations_service_all') THEN
    CREATE POLICY revocations_service_all ON admin_session_revocations FOR ALL USING (auth.role()='service_role');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_revocations_admin ON admin_session_revocations(admin_id, revoked_at);

-- 7. Visitor route RPCs
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(full_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT u.full_name FROM users u
    JOIN plates p ON p.owner_id = u.id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id) AND p.status = 'active'
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT s.plan, s.status, s.expiry_date FROM subscriptions s
    JOIN plates p ON p.owner_id = s.owner_id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id) AND p.status = 'active'
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'grace_period' THEN 1 ELSE 2 END,
             s.created_at DESC
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_subscription_status_for_plate TO anon, authenticated, service_role;

-- 8. activation_events extras
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS actor    TEXT;
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 9. Performance indexes
CREATE INDEX IF NOT EXISTS idx_plates_owner_id     ON plates(owner_id);
CREATE INDEX IF NOT EXISTS idx_plates_plate_id     ON plates(plate_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_owner        ON orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_plate_id      ON users(plate_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_token   ON admin_users(session_token) WHERE session_token IS NOT NULL;

COMMIT;
