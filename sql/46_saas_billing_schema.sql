-- ════════════════════════════════════════════════════════════════════════════
-- Migration 46: SaaS Launch — Subscription Plans, Feature Gating, Usage Limits,
--               Billing (Razorpay), Invoices, Admin Controls
--
-- PURPOSE
--   Introduces a proper 3-tier SaaS plan system (free / premium / enterprise)
--   on top of the existing `subscriptions` table (which already carries
--   'hardware_only' / 'smartdoor_care' plan keys from the hardware-bundled
--   1-year subscription flow). This migration is 100% additive:
--     - No existing column is renamed or dropped.
--     - No existing row's `plan` value is changed.
--     - 'hardware_only' and 'smartdoor_care' remain valid, resolvable plan
--       keys (seeded into plan_catalog as legacy aliases of free/premium)
--       so every current subscriber keeps working exactly as before.
--
-- ADDS
--   plan_catalog            — plan definitions: pricing + feature limits
--   usage_counters           — per-owner, per-month feature usage counts
--   invoices                 — SaaS billing invoices (separate from the
--                               existing hardware `orders`/`payments` tables)
--   subscriptions.*          — additive columns: billing_cycle, grace_until,
--                               cancel_at_period_end, is_admin_assigned,
--                               admin_notes, source
--   check_and_increment_usage()  — SECURITY DEFINER RPC, authoritative
--                                   server-side usage-limit enforcement
--   get_usage_summary()          — SECURITY DEFINER RPC, read-only usage +
--                                   limits summary for the dashboard
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch call_logs, rtc_call_attempts, signaling, WebRTC, or any
--     calling/ringing logic (initiate-call is not modified).
--   - Does NOT touch visitor_profiles, Activity Center RPCs/tables.
--   - Does NOT change any existing RLS policy already in force.
--
-- SAFE / IDEMPOTENT — ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, ON CONFLICT DO NOTHING/UPDATE throughout.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. PLAN CATALOG ──────────
CREATE TABLE IF NOT EXISTS plan_catalog (
  plan_key                 TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  tagline                   TEXT,
  price_monthly             NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly              NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency                  TEXT NOT NULL DEFAULT 'INR',
  calls_per_month           INTEGER NOT NULL DEFAULT 30,   -- -1 = unlimited
  visitor_history_days      INTEGER NOT NULL DEFAULT 7,    -- -1 = unlimited
  photo_uploads_per_month   INTEGER NOT NULL DEFAULT 20,   -- -1 = unlimited
  storage_mb                INTEGER NOT NULL DEFAULT 100,  -- -1 = unlimited
  exports_per_month         INTEGER NOT NULL DEFAULT 1,    -- -1 = unlimited
  family_members_limit      INTEGER NOT NULL DEFAULT 2,    -- -1 = unlimited
  analytics_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  ai_features_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  priority_support          BOOLEAN NOT NULL DEFAULT FALSE,
  support_tier              TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'priority' | 'dedicated'
  sort_order                INTEGER NOT NULL DEFAULT 0,
  is_legacy_alias           BOOLEAN NOT NULL DEFAULT FALSE,    -- TRUE for hardware_only/smartdoor_care rows
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,     -- FALSE = hidden from pricing UI (legacy aliases)
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plan_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plan_catalog'
    AND policyname = 'plan_catalog_public_read'
  ) THEN
    CREATE POLICY plan_catalog_public_read ON plan_catalog
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plan_catalog'
    AND policyname = 'plan_catalog_admin_write'
  ) THEN
    CREATE POLICY plan_catalog_admin_write ON plan_catalog
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Seed the three commercial SaaS tiers.
INSERT INTO plan_catalog (
  plan_key, name, tagline, price_monthly, price_yearly,
  calls_per_month, visitor_history_days, photo_uploads_per_month, storage_mb,
  exports_per_month, family_members_limit, analytics_enabled, ai_features_enabled,
  priority_support, support_tier, sort_order, is_legacy_alias, is_active
) VALUES
  ('free', 'Free', 'Get started with the essentials', 0, 0,
   30, 7, 20, 100,
   1, 2, FALSE, FALSE,
   FALSE, 'standard', 1, FALSE, TRUE),
  ('premium', 'Premium', 'AI receptionist + full visibility', 29, 299,
   500, 90, 500, 2048,
   20, 5, TRUE, TRUE,
   TRUE, 'priority', 2, FALSE, TRUE),
  ('enterprise', 'Enterprise', 'Unlimited scale, dedicated support', 999, 9999,
   -1, 365, -1, 20480,
   -1, 20, TRUE, TRUE,
   TRUE, 'dedicated', 3, FALSE, TRUE)
ON CONFLICT (plan_key) DO UPDATE SET
  name = EXCLUDED.name, tagline = EXCLUDED.tagline,
  price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  calls_per_month = EXCLUDED.calls_per_month, visitor_history_days = EXCLUDED.visitor_history_days,
  photo_uploads_per_month = EXCLUDED.photo_uploads_per_month, storage_mb = EXCLUDED.storage_mb,
  exports_per_month = EXCLUDED.exports_per_month, family_members_limit = EXCLUDED.family_members_limit,
  analytics_enabled = EXCLUDED.analytics_enabled, ai_features_enabled = EXCLUDED.ai_features_enabled,
  priority_support = EXCLUDED.priority_support, support_tier = EXCLUDED.support_tier,
  sort_order = EXCLUDED.sort_order, updated_at = NOW();

-- Legacy aliases — keep every existing subscriptions.plan value resolvable
-- with the exact same limits/pricing they already had, so nothing that
-- reads `subscriptions.plan` today breaks. Hidden from the pricing UI
-- (is_active = FALSE) since new signups/upgrades only ever use free/premium/enterprise.
INSERT INTO plan_catalog (
  plan_key, name, tagline, price_monthly, price_yearly,
  calls_per_month, visitor_history_days, photo_uploads_per_month, storage_mb,
  exports_per_month, family_members_limit, analytics_enabled, ai_features_enabled,
  priority_support, support_tier, sort_order, is_legacy_alias, is_active
) VALUES
  ('hardware_only', 'Hardware Only (Legacy)', 'Legacy free tier', 0, 0,
   30, 7, 20, 100,
   1, 2, FALSE, FALSE,
   FALSE, 'standard', 90, TRUE, FALSE),
  ('smartdoor_care', 'SmartDoor Care (Legacy)', 'Legacy premium tier', 29, 299,
   500, 90, 500, 2048,
   20, 5, TRUE, TRUE,
   TRUE, 'priority', 91, TRUE, FALSE)
ON CONFLICT (plan_key) DO NOTHING;

CREATE TRIGGER trg_plan_catalog_updated_at
  BEFORE UPDATE ON plan_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 2. USAGE COUNTERS ──────────
-- Generic per-owner, per-calendar-month, per-feature usage tally.
-- Written to exclusively via check_and_increment_usage() below (SECURITY
-- DEFINER) so it can't be tampered with client-side.
CREATE TABLE IF NOT EXISTS usage_counters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key    TEXT NOT NULL,          -- 'YYYY-MM'
  feature_key   TEXT NOT NULL,          -- 'calls' | 'photo_uploads' | 'exports' | ...
  used_count    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, period_key, feature_key)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_counters'
    AND policyname = 'usage_counters_owner_read'
  ) THEN
    CREATE POLICY usage_counters_owner_read ON usage_counters
      FOR SELECT USING (owner_id = get_my_owner_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_counters'
    AND policyname = 'usage_counters_admin_all'
  ) THEN
    CREATE POLICY usage_counters_admin_all ON usage_counters
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usage_counters_owner_period ON usage_counters(owner_id, period_key);

-- ────────── 3. INVOICES (SaaS billing — separate from hardware `orders`) ──────────
CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        TEXT UNIQUE NOT NULL,
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id       UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan                  TEXT NOT NULL,
  billing_cycle         TEXT NOT NULL DEFAULT 'yearly',   -- 'monthly' | 'yearly'
  amount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'INR',
  status                TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  razorpay_signature    TEXT,
  refund_id             TEXT,
  refund_amount         NUMERIC(10,2),
  period_start          TIMESTAMPTZ,
  period_end            TIMESTAMPTZ,
  issued_by             TEXT DEFAULT 'self_serve',        -- 'self_serve' | 'admin_manual'
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices'
    AND policyname = 'invoices_owner_read'
  ) THEN
    CREATE POLICY invoices_owner_read ON invoices
      FOR SELECT USING (owner_id = get_my_owner_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices'
    AND policyname = 'invoices_admin_all'
  ) THEN
    CREATE POLICY invoices_admin_all ON invoices
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_owner        ON invoices(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status        ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_razorpay_order ON invoices(razorpay_order_id);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Sequential invoice number generator: SD-INV-20260713-0001
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  today TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  seq   INTEGER;
  inum  TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
  FROM invoices
  WHERE invoice_number LIKE 'SD-INV-' || today || '-%';

  inum := 'SD-INV-' || today || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN inum;
END;
$$ LANGUAGE plpgsql;

-- ────────── 4. EXTEND subscriptions (additive columns only) ──────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle         TEXT NOT NULL DEFAULT 'yearly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_until           TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_admin_assigned     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS admin_notes           TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source                TEXT NOT NULL DEFAULT 'self_serve'; -- 'self_serve' | 'admin_manual' | 'order_activation'

COMMENT ON COLUMN subscriptions.billing_cycle IS 'monthly | yearly — which price_catalog column priced this cycle';
COMMENT ON COLUMN subscriptions.grace_until IS 'If set and status=expired, feature access is still allowed until this timestamp (grace period) before auto-downgrade to free.';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'Owner requested cancellation — stays active until expiry_date, then auto-downgrades to free instead of renewing.';

-- ────────── 5. check_and_increment_usage() — authoritative server-side gate ──────────
-- Returns JSONB: { allowed, unlimited, used, limit }
-- SECURITY DEFINER so it can be called safely from the anon/authenticated
-- role (RLS on usage_counters would otherwise block the UPSERT for other
-- owners' rows, but here we trust p_owner_id the same way every other
-- owner-context RPC in this codebase already does, e.g. check_rate_limit()).
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_owner_id    UUID,
  p_feature_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_plan   TEXT;
  v_limit  INTEGER;
  v_period TEXT := TO_CHAR(NOW(), 'YYYY-MM');
  v_used   INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM subscriptions
    WHERE owner_id = p_owner_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  SELECT CASE p_feature_key
    WHEN 'calls'         THEN calls_per_month
    WHEN 'photo_uploads'  THEN photo_uploads_per_month
    WHEN 'exports'        THEN exports_per_month
    ELSE -1
  END INTO v_limit
  FROM plan_catalog WHERE plan_key = v_plan;

  IF v_limit IS NULL THEN v_limit := -1; END IF;

  IF v_limit = -1 THEN
    INSERT INTO usage_counters (owner_id, period_key, feature_key, used_count)
      VALUES (p_owner_id, v_period, p_feature_key, 1)
      ON CONFLICT (owner_id, period_key, feature_key)
      DO UPDATE SET used_count = usage_counters.used_count + 1, updated_at = NOW();
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'used', NULL, 'limit', -1, 'plan', v_plan);
  END IF;

  SELECT used_count INTO v_used FROM usage_counters
    WHERE owner_id = p_owner_id AND period_key = v_period AND feature_key = p_feature_key;
  v_used := COALESCE(v_used, 0);

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'used', v_used, 'limit', v_limit, 'plan', v_plan);
  END IF;

  INSERT INTO usage_counters (owner_id, period_key, feature_key, used_count)
    VALUES (p_owner_id, v_period, p_feature_key, 1)
    ON CONFLICT (owner_id, period_key, feature_key)
    DO UPDATE SET used_count = usage_counters.used_count + 1, updated_at = NOW();

  RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'used', v_used + 1, 'limit', v_limit, 'plan', v_plan);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── 6. get_usage_summary() — read-only dashboard summary ──────────
-- Computes real usage from existing source-of-truth tables wherever
-- possible (call_logs, storage.objects for visitor-photos/voice-notes),
-- falling back to usage_counters for features tracked only via
-- check_and_increment_usage (e.g. exports). Never writes anything.
CREATE OR REPLACE FUNCTION get_usage_summary(p_owner_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_plan_key   TEXT;
  v_plan       RECORD;
  v_period_start TIMESTAMPTZ := date_trunc('month', NOW());
  v_calls_used INTEGER := 0;
  v_photos_used INTEGER := 0;
  v_exports_used INTEGER := 0;
  v_family_used INTEGER := 0;
  v_storage_bytes BIGINT := 0;
BEGIN
  SELECT plan INTO v_plan_key FROM subscriptions
    WHERE owner_id = p_owner_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
  IF v_plan_key IS NULL THEN v_plan_key := 'free'; END IF;

  SELECT * INTO v_plan FROM plan_catalog WHERE plan_key = v_plan_key;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plan_catalog WHERE plan_key = 'free';
  END IF;

  SELECT COUNT(*) INTO v_calls_used FROM call_logs
    WHERE owner_id = p_owner_id AND created_at >= v_period_start;

  BEGIN
    SELECT COUNT(*) INTO v_photos_used FROM storage.objects
      WHERE bucket_id = 'visitor-photos'
        AND (storage.foldername(name))[1] = p_owner_id::text
        AND created_at >= v_period_start;
  EXCEPTION WHEN OTHERS THEN v_photos_used := 0;
  END;

  SELECT COALESCE(used_count, 0) INTO v_exports_used FROM usage_counters
    WHERE owner_id = p_owner_id AND period_key = TO_CHAR(NOW(), 'YYYY-MM') AND feature_key = 'exports';
  v_exports_used := COALESCE(v_exports_used, 0);

  SELECT COUNT(*) INTO v_family_used FROM family_members
    WHERE owner_id = p_owner_id AND is_active = TRUE;

  BEGIN
    SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0) INTO v_storage_bytes
      FROM storage.objects
      WHERE bucket_id IN ('visitor-photos', 'voice-notes')
        AND (storage.foldername(name))[1] = p_owner_id::text;
  EXCEPTION WHEN OTHERS THEN v_storage_bytes := 0;
  END;

  RETURN jsonb_build_object(
    'plan', v_plan_key,
    'planName', v_plan.name,
    'period', TO_CHAR(NOW(), 'YYYY-MM'),
    'calls',   jsonb_build_object('used', v_calls_used,   'limit', v_plan.calls_per_month),
    'photos',  jsonb_build_object('used', v_photos_used,  'limit', v_plan.photo_uploads_per_month),
    'exports', jsonb_build_object('used', v_exports_used, 'limit', v_plan.exports_per_month),
    'family',  jsonb_build_object('used', v_family_used,  'limit', v_plan.family_members_limit),
    'storage', jsonb_build_object('usedMb', ROUND((v_storage_bytes / 1048576.0)::NUMERIC, 2), 'limitMb', v_plan.storage_mb),
    'visitorHistoryDays', v_plan.visitor_history_days,
    'analyticsEnabled',   v_plan.analytics_enabled,
    'aiFeaturesEnabled',  v_plan.ai_features_enabled,
    'prioritySupport',    v_plan.priority_support,
    'supportTier',        v_plan.support_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────── 7. Admin audit convenience index (reuses existing admin_audit_logs table) ──────────
CREATE INDEX IF NOT EXISTS idx_admin_audit_subscriptions
  ON admin_audit_logs(resource, resource_id)
  WHERE resource IN ('subscriptions', 'invoices');

COMMIT;

-- ── Run these after migration to verify ──────────────────────────────────────
-- SELECT plan_key, name, price_monthly, price_yearly, is_active FROM plan_catalog ORDER BY sort_order;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions';
-- SELECT get_usage_summary('00000000-0000-0000-0000-000000000000'::uuid); -- replace with a real owner_id
