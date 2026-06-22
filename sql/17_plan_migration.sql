-- ============================================================
-- sql/17_plan_migration.sql
-- SmartDoor Phase 13 Recovery — Plan + Schema Fixes
-- Run once in Supabase Dashboard → SQL Editor
-- ============================================================

BEGIN;

-- ── 1. Migrate existing subscriptions to new plan names ──────────────────────
UPDATE subscriptions
  SET plan = 'hardware_only'
  WHERE plan IN ('starter');

UPDATE subscriptions
  SET plan = 'smartdoor_care'
  WHERE plan IN ('standard', 'scale');

-- ── 2. Fix renewal_price ─────────────────────────────────────────────────────
UPDATE subscriptions SET renewal_price = 0   WHERE plan = 'hardware_only';
UPDATE subscriptions SET renewal_price = 299 WHERE plan = 'smartdoor_care';

-- ── 3. Update column default + comment ──────────────────────────────────────
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'hardware_only';
COMMENT ON COLUMN subscriptions.plan IS 'hardware_only | smartdoor_care';

-- ── 4. Resolve duplicate admin_session_revocations RLS policy ────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'admin_session_revocations'
      AND policyname = 'admin_session_revocations_no_public_access'
  ) THEN
    DROP POLICY admin_session_revocations_no_public_access ON admin_session_revocations;
    RAISE NOTICE 'Dropped duplicate policy';
  ELSE
    RAISE NOTICE 'No duplicate policy found — skipping';
  END IF;
END $$;

-- ── 5. Ensure pin_recovery_otps table exists ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pin_recovery_otps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash   TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pin_recovery_otps ENABLE ROW LEVEL SECURITY;

-- ── 6. RLS policy on pin_recovery_otps (DO block — no IF NOT EXISTS) ─────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_recovery_otps'
      AND policyname = 'pin_recovery_service_only'
  ) THEN
    CREATE POLICY pin_recovery_service_only ON pin_recovery_otps
      USING (FALSE);
    RAISE NOTICE 'Created RLS policy: pin_recovery_service_only';
  ELSE
    RAISE NOTICE 'RLS policy already exists — skipping';
  END IF;
END $$;

-- ── 7. Index for fast OTP lookups ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pin_recovery_owner_active
  ON pin_recovery_otps(owner_id, expires_at)
  WHERE used = FALSE;

-- ── 8. Fix plates missing expiry_date (hardware_only Year 1) ─────────────────
UPDATE plates p
  SET expiry_date = (
    SELECT s.expiry_date FROM subscriptions s
    WHERE s.owner_id = p.owner_id
      AND s.status = 'active'
    LIMIT 1
  )
  WHERE p.expiry_date IS NULL
    AND p.status = 'active';

COMMIT;

-- ── Run these after migration to verify ──────────────────────────────────────
-- SELECT plan, count(*) FROM subscriptions GROUP BY plan;
-- SELECT renewal_price, count(*) FROM subscriptions GROUP BY renewal_price;
-- SELECT policyname FROM pg_policies WHERE tablename = 'admin_session_revocations';
-- SELECT policyname FROM pg_policies WHERE tablename = 'pin_recovery_otps';
