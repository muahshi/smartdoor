-- ============================================================
-- SMART DOOR — PHASE 9: BETA LAUNCH SCHEMA
-- Migration: 11_beta_launch_schema.sql
-- Run AFTER all previous migrations (01–10)
--
-- Adds:
--   customer_onboarding     — Onboarding step tracking per user
--   customer_health         — Health score snapshots
--   renewal_notifications   — Renewal reminder audit log
--   renewal_engine_logs     — Daily cron run logs
--   nps_responses           — Customer NPS scores
--   referrals               — Referral code registry
--   referral_logs           — Individual referral tracking
--   shipments               — Shipping provider integration
--   delivery_events         — Delivery webhook events
--   beta_users              — Beta tester registry
--   bug_reports             — Beta bug submissions
--   feature_requests        — Beta feature requests
--   feedback_logs           — General star ratings + comments
--
-- Additive only — does NOT touch existing tables.
-- ============================================================

-- ────────── 1. CUSTOMER ONBOARDING ──────────

CREATE TABLE IF NOT EXISTS customer_onboarding (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Step completion flags
  order_placed            BOOLEAN DEFAULT FALSE,
  order_placed_at         TIMESTAMPTZ,

  payment_done            BOOLEAN DEFAULT FALSE,
  payment_done_at         TIMESTAMPTZ,

  plate_manufactured      BOOLEAN DEFAULT FALSE,
  plate_manufactured_at   TIMESTAMPTZ,

  plate_shipped           BOOLEAN DEFAULT FALSE,
  plate_shipped_at        TIMESTAMPTZ,

  plate_delivered         BOOLEAN DEFAULT FALSE,
  plate_delivered_at      TIMESTAMPTZ,

  account_activated       BOOLEAN DEFAULT FALSE,
  account_activated_at    TIMESTAMPTZ,

  family_setup            BOOLEAN DEFAULT FALSE,
  family_setup_at         TIMESTAMPTZ,

  status_setup            BOOLEAN DEFAULT FALSE,
  status_setup_at         TIMESTAMPTZ,

  security_setup          BOOLEAN DEFAULT FALSE,
  security_setup_at       TIMESTAMPTZ,

  first_visitor_scan      BOOLEAN DEFAULT FALSE,
  first_visitor_scan_at   TIMESTAMPTZ,

  -- Completion
  completed_at            TIMESTAMPTZ,

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(owner_id)
);

-- RLS
ALTER TABLE customer_onboarding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_owner_read" ON customer_onboarding;
CREATE POLICY "onboarding_owner_read" ON customer_onboarding
  FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "onboarding_admin_all" ON customer_onboarding;
CREATE POLICY "onboarding_admin_all" ON customer_onboarding
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_onboarding_owner ON customer_onboarding(owner_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_incomplete ON customer_onboarding(account_activated)
  WHERE account_activated = FALSE;

-- ────────── 2. CUSTOMER HEALTH SCORES ──────────

CREATE TABLE IF NOT EXISTS customer_health (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier        TEXT NOT NULL CHECK (tier IN ('healthy', 'at_risk', 'churning')),
  factors     JSONB DEFAULT '[]',
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id)
);

ALTER TABLE customer_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health_admin_all" ON customer_health;
CREATE POLICY "health_admin_all" ON customer_health
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_health_tier ON customer_health(tier);
CREATE INDEX IF NOT EXISTS idx_health_score ON customer_health(score);

-- ────────── 3. RENEWAL NOTIFICATIONS LOG ──────────

CREATE TABLE IF NOT EXISTS renewal_notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_key       TEXT NOT NULL,           -- 'reminder_90d' | 'reminder_30d' | 'reminder_7d' | 'reminder_1d' | 'expired'
  days_left        INTEGER NOT NULL,
  channels_sent    TEXT[] DEFAULT '{}',
  channel_results  JSONB DEFAULT '{}',
  sent_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(subscription_id, window_key)
);

ALTER TABLE renewal_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "renewal_notif_admin" ON renewal_notifications;
CREATE POLICY "renewal_notif_admin" ON renewal_notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_renewal_notif_owner ON renewal_notifications(owner_id);
CREATE INDEX IF NOT EXISTS idx_renewal_notif_window ON renewal_notifications(window_key);

-- ────────── 4. RENEWAL ENGINE RUN LOGS ──────────

CREATE TABLE IF NOT EXISTS renewal_engine_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed     INTEGER DEFAULT 0,
  skipped       INTEGER DEFAULT 0,
  errors_count  INTEGER DEFAULT 0,
  meta          JSONB DEFAULT '{}'
);

-- ────────── 5. NPS RESPONSES ──────────

CREATE TABLE IF NOT EXISTS nps_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  category    TEXT NOT NULL CHECK (category IN ('satisfaction', 'renewal_likelihood', 'referral_likelihood')),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nps_owner_insert" ON nps_responses;
CREATE POLICY "nps_owner_insert" ON nps_responses
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "nps_admin_all" ON nps_responses;
CREATE POLICY "nps_admin_all" ON nps_responses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_nps_category ON nps_responses(category);
CREATE INDEX IF NOT EXISTS idx_nps_score    ON nps_responses(score);

-- ────────── 6. REFERRALS ──────────

CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code         TEXT UNIQUE NOT NULL,
  total_referrals       INTEGER DEFAULT 0,
  successful_referrals  INTEGER DEFAULT 0,
  reward_earned         INTEGER DEFAULT 0,    -- In rupees or reward points
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referral_owner_read" ON referrals;
CREATE POLICY "referral_owner_read" ON referrals
  FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "referral_admin_all" ON referrals;
CREATE POLICY "referral_admin_all" ON referrals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_referral_code ON referrals(referral_code);

-- ────────── 7. REFERRAL LOGS ──────────

CREATE TABLE IF NOT EXISTS referral_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id       UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  referred_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'expired')),
  converted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_log_status ON referral_logs(status);

-- ────────── 8. SHIPMENTS ──────────

CREATE TABLE IF NOT EXISTS shipments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'manual',   -- 'shiprocket' | 'delhivery' | 'bluedart' | 'dtdc' | 'manual'
  awb_number          TEXT UNIQUE NOT NULL,
  tracking_url        TEXT,
  status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','in_transit','out_for_delivery','delivered','failed','returned')),
  estimated_delivery  TIMESTAMPTZ,
  remarks             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipment_admin_all" ON shipments;
CREATE POLICY "shipment_admin_all" ON shipments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_shipments_order  ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_awb    ON shipments(awb_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

-- ────────── 9. DELIVERY EVENTS ──────────

CREATE TABLE IF NOT EXISTS delivery_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,   -- 'shipped' | 'in_transit' | 'delivered' | 'failed'
  awb        TEXT,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON delivery_events(order_id);

-- ────────── 10. BETA USERS ──────────

CREATE TABLE IF NOT EXISTS beta_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  city          TEXT,
  beta_tier     TEXT DEFAULT 'standard' CHECK (beta_tier IN ('internal', 'close_beta', 'standard')),
  device_info   JSONB DEFAULT '{}',
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  is_active     BOOLEAN DEFAULT TRUE,
  notes         TEXT
);

ALTER TABLE beta_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beta_users_admin" ON beta_users;
CREATE POLICY "beta_users_admin" ON beta_users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_beta_users_tier ON beta_users(beta_tier);

-- ────────── 11. BUG REPORTS ──────────

CREATE TABLE IF NOT EXISTS bug_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status      TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('open', 'investigating', 'fixed', 'wontfix')),
  screenshot_url TEXT,
  device_info JSONB DEFAULT '{}',
  admin_notes TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bug_owner_insert" ON bug_reports;
CREATE POLICY "bug_owner_insert" ON bug_reports
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "bug_owner_read" ON bug_reports;
CREATE POLICY "bug_owner_read" ON bug_reports
  FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "bug_admin_all" ON bug_reports;
CREATE POLICY "bug_admin_all" ON bug_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bug_reports(severity);
CREATE INDEX IF NOT EXISTS idx_bugs_status   ON bug_reports(status);

-- ────────── 12. FEATURE REQUESTS ──────────

CREATE TABLE IF NOT EXISTS feature_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'planned', 'in_progress', 'shipped', 'declined')),
  upvotes     INTEGER DEFAULT 0,
  admin_notes TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feat_owner_insert" ON feature_requests;
CREATE POLICY "feat_owner_insert" ON feature_requests
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "feat_owner_read" ON feature_requests;
CREATE POLICY "feat_owner_read" ON feature_requests
  FOR SELECT USING (TRUE);   -- Anyone can read feature requests
DROP POLICY IF EXISTS "feat_admin_all" ON feature_requests;
CREATE POLICY "feat_admin_all" ON feature_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_features_status  ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_features_upvotes ON feature_requests(upvotes DESC);

-- ────────── 13. FEEDBACK LOGS (General Star Rating) ──────────

CREATE TABLE IF NOT EXISTS feedback_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  context     TEXT DEFAULT 'dashboard',   -- 'dashboard' | 'visitor_flow' | 'setup_wizard' | 'support'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feedback_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_owner_insert" ON feedback_logs;
CREATE POLICY "feedback_owner_insert" ON feedback_logs
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "feedback_admin_all" ON feedback_logs;
CREATE POLICY "feedback_admin_all" ON feedback_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_feedback_rating  ON feedback_logs(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_context ON feedback_logs(context);

-- ────────── 14. ENV CONFIG REGISTRY (runtime env check) ──────────

CREATE TABLE IF NOT EXISTS env_config (
  key         TEXT PRIMARY KEY,
  is_set      BOOLEAN DEFAULT FALSE,
  category    TEXT,   -- 'payment' | 'communication' | 'shipping' | 'ai' | 'auth'
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed env config keys (admin can check which vars are configured)
INSERT INTO env_config (key, category, note) VALUES
  ('VITE_SUPABASE_URL',         'auth',          'Supabase project URL'),
  ('VITE_SUPABASE_ANON_KEY',    'auth',          'Supabase anon key'),
  ('VITE_RAZORPAY_KEY_ID',      'payment',       'Razorpay public key'),
  ('RAZORPAY_KEY_SECRET',       'payment',       'Razorpay secret (Edge Function only)'),
  ('VITE_GROQ_API_KEY',         'ai',            'Groq LLaMA-3 API key'),
  ('EXOTEL_API_KEY',            'communication', 'Exotel SID'),
  ('EXOTEL_API_TOKEN',          'communication', 'Exotel token'),
  ('TWILIO_ACCOUNT_SID',        'communication', 'Twilio SID'),
  ('TWILIO_AUTH_TOKEN',         'communication', 'Twilio auth token'),
  ('MSG91_AUTH_KEY',            'communication', 'MSG91 key for SMS'),
  ('SHIPPING_PROVIDER',         'shipping',      'Active shipping provider key'),
  ('SHIPROCKET_EMAIL',          'shipping',      'Shiprocket login email'),
  ('SHIPROCKET_PASSWORD',       'shipping',      'Shiprocket login password'),
  ('DELHIVERY_TOKEN',           'shipping',      'Delhivery API token')
ON CONFLICT (key) DO NOTHING;

-- ────────── REALTIME ──────────

-- Enable realtime on tables the admin ops dashboard needs live
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customer_onboarding') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customer_onboarding;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customer_health') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customer_health;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'shipments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shipments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bug_reports') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bug_reports;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'feature_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE feature_requests;
  END IF;
END $$;

-- ────────── DONE ──────────
-- Run 12_beta_launch_rls.sql next if you need granular per-field RLS.
-- ============================================================
