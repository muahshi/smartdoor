-- ============================================================
-- SMART DOOR — PHASE 12: FIRST 100 CUSTOMERS SCHEMA
-- Migration: 13_customer_growth_schema.sql
-- Run AFTER all previous migrations (01–12)
--
-- Adds:
--   customer_segments        — Beta / Early Access / Paying / VIP registry
--   customer_interviews      — Structured interview notes
--   customer_reviews         — Post-activation review/testimonial workflow
--   feature_usage_events     — Generic feature-usage ping (most/least used)
--   bug_reports.assigned_to / resolved_at        (ALTER — was missing)
--   feature_requests.priority                    (ALTER — was missing)
--   support_tickets.escalated / escalated_at / escalated_reason (ALTER)
--   first_100_dashboard_view  — Live operational dashboard
--   churn_analysis_view       — Live churn signals
--   pmf_metrics_view          — Live product-market-fit signals
--   support_health_view       — Live support quality signals
--   feature_usage_summary_view, customer_segment_breakdown_view
--
-- Additive only — does NOT touch existing tables' existing columns,
-- does NOT change any RLS policy already in force.
-- ============================================================

-- ────────── 1. CUSTOMER SEGMENTS (Early Access Program) ──────────
-- One row per owner. Segment changes over the lifecycle:
-- beta -> early_access -> paying -> (optionally) vip

CREATE TABLE IF NOT EXISTS customer_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  segment       TEXT NOT NULL DEFAULT 'paying'
                  CHECK (segment IN ('beta', 'early_access', 'paying', 'vip')),
  source        TEXT DEFAULT 'signup',          -- 'signup' | 'manual' | 'promo' | 'referral'
  assigned_by   TEXT,                           -- admin email, or 'system'
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id)
);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segments_owner_read" ON customer_segments
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "segments_admin_all" ON customer_segments
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_segments_segment ON customer_segments(segment);

CREATE TRIGGER trg_segments_updated_at
  BEFORE UPDATE ON customer_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 2. CUSTOMER INTERVIEWS ──────────
-- Internal-only. Not exposed to owners.

CREATE TABLE IF NOT EXISTS customer_interviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  interview_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conducted_by        TEXT,                      -- admin name/email
  channel             TEXT DEFAULT 'call',        -- 'call' | 'whatsapp' | 'in_person' | 'video'
  feedback_notes      TEXT,
  problems_found      JSONB DEFAULT '[]',         -- ["confusing setup step", ...]
  requested_features  JSONB DEFAULT '[]',
  sentiment           TEXT DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  follow_up_needed    BOOLEAN DEFAULT FALSE,
  follow_up_notes     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customer_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interviews_admin_only" ON customer_interviews
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_interviews_owner ON customer_interviews(owner_id);
CREATE INDEX IF NOT EXISTS idx_interviews_date  ON customer_interviews(interview_date DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_followup ON customer_interviews(follow_up_needed) WHERE follow_up_needed = TRUE;

-- ────────── 3. CUSTOMER REVIEWS (post-activation workflow) ──────────
-- One row created when a review is requested; updated when the owner submits.

CREATE TABLE IF NOT EXISTS customer_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id              UUID REFERENCES orders(id) ON DELETE SET NULL,
  channel               TEXT DEFAULT 'whatsapp',   -- 'whatsapp' | 'sms' | 'email'
  status                TEXT NOT NULL DEFAULT 'requested'
                          CHECK (status IN ('requested', 'submitted', 'declined')),
  product_rating        INTEGER CHECK (product_rating BETWEEN 1 AND 5),
  manufacturing_rating  INTEGER CHECK (manufacturing_rating BETWEEN 1 AND 5),
  delivery_rating       INTEGER CHECK (delivery_rating BETWEEN 1 AND 5),
  testimonial           TEXT,
  public_consent        BOOLEAN DEFAULT FALSE,     -- owner allowed using testimonial publicly
  requested_at          TIMESTAMPTZ DEFAULT NOW(),
  submitted_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_owner_read" ON customer_reviews
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "reviews_owner_update" ON customer_reviews
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "reviews_admin_all" ON customer_reviews
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_reviews_owner  ON customer_reviews(owner_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON customer_reviews(status);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON customer_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 4. FEATURE USAGE EVENTS ──────────
-- Generic "feature was used" ping. App calls this for whichever features
-- it wants visibility into (status update, family routing, security rule
-- change, etc). No schema change needed to add a new feature_key later.

CREATE TABLE IF NOT EXISTS feature_usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  used_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feature_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_usage_owner_insert" ON feature_usage_events
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

CREATE POLICY "feature_usage_admin_all" ON feature_usage_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_feature_usage_key  ON feature_usage_events(feature_key, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_owner ON feature_usage_events(owner_id, used_at DESC);

-- ────────── 5. ALTER: BUG REPORTS — assignment + resolution tracking ──────────
-- bug_reports already exists (11_beta_launch_schema.sql) without these.

ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bugs_assigned ON bug_reports(assigned_to);

-- ────────── 6. ALTER: FEATURE REQUESTS — priority ──────────

ALTER TABLE feature_requests ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

CREATE INDEX IF NOT EXISTS idx_features_priority ON feature_requests(priority);

-- ────────── 7. ALTER: SUPPORT TICKETS — escalation tracking ──────────

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalated_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_escalated ON support_tickets(escalated) WHERE escalated = TRUE;

-- ────────── 8. FIRST 100 DASHBOARD (LIVE VIEW — no placeholders) ──────────

CREATE OR REPLACE VIEW first_100_dashboard_view AS
SELECT
  (SELECT COUNT(*) FROM users)                                              AS total_customers,
  (SELECT COUNT(*) FROM customer_onboarding WHERE account_activated = TRUE) AS activated_customers,
  (SELECT COUNT(DISTINCT owner_id) FROM retention_events
     WHERE created_at >= NOW() - INTERVAL '30 days')                       AS active_customers,
  (SELECT COUNT(*) FROM customer_onboarding WHERE account_activated = FALSE) AS pending_activations,
  (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'pending')) AS open_support_tickets,
  (SELECT COUNT(*) FROM subscriptions
     WHERE status = 'active' AND expiry_date <= NOW() + INTERVAL '30 days'
       AND expiry_date > NOW())                                            AS renewals_due_30d,
  (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM feedback_logs)                AS avg_product_satisfaction,
  (SELECT ROUND(AVG(score)::NUMERIC, 1) FROM nps_responses
     WHERE category = 'satisfaction')                                      AS avg_nps_satisfaction;

-- ────────── 9. CHURN ANALYSIS (LIVE VIEW) ──────────

CREATE OR REPLACE VIEW churn_analysis_view AS
SELECT
  (SELECT COUNT(*) FROM users u WHERE NOT EXISTS (
      SELECT 1 FROM retention_events re
      WHERE re.owner_id = u.id AND re.created_at >= NOW() - INTERVAL '30 days'
   ))                                                                       AS inactive_customers_30d,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'expired')            AS expired_subscriptions,
  (SELECT COUNT(*) FROM activation_events WHERE event_type = 'expired')    AS failed_renewals,
  (SELECT COUNT(*) FROM customer_health WHERE tier = 'churning')           AS low_engagement_customers;

-- ────────── 10. PRODUCT-MARKET-FIT METRICS (LIVE VIEW) ──────────
-- Builds on retention_metrics_view (12_real_world_operations.sql).

CREATE OR REPLACE VIEW pmf_metrics_view AS
SELECT
  r.daily_active_owners,
  r.weekly_active_owners,
  r.monthly_active_owners,
  r.retention_rate_pct,
  r.renewal_rate_pct,
  (SELECT ROUND(AVG(score)::NUMERIC, 1) FROM nps_responses
     WHERE category = 'renewal_likelihood')                                AS avg_renewal_intent,
  (SELECT ROUND(AVG(score)::NUMERIC, 1) FROM nps_responses
     WHERE category = 'referral_likelihood')                               AS avg_referral_intent,
  (SELECT ROUND(AVG(cnt)::NUMERIC, 1) FROM (
      SELECT owner_id, COUNT(*) AS cnt FROM retention_events
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY owner_id
   ) t)                                                                     AS avg_usage_events_per_owner_30d
FROM retention_metrics_view r;

-- ────────── 11. SUPPORT HEALTH (LIVE VIEW) ──────────

CREATE OR REPLACE VIEW support_health_view AS
SELECT
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::NUMERIC, 1)
     FROM support_tickets WHERE resolved_at IS NOT NULL)                   AS avg_resolution_hours,
  (SELECT COUNT(*) FROM support_tickets WHERE escalated = TRUE)            AS escalated_tickets,
  (SELECT COUNT(*) FROM (
      SELECT owner_id FROM support_tickets
      WHERE owner_id IS NOT NULL AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY owner_id HAVING COUNT(*) > 1
   ) t)                                                                     AS repeat_issue_customers;

-- ────────── 12. FEATURE USAGE SUMMARY (LIVE VIEW) ──────────

CREATE OR REPLACE VIEW feature_usage_summary_view AS
SELECT feature_key, COUNT(*) AS usage_count
FROM feature_usage_events
WHERE used_at >= NOW() - INTERVAL '30 days'
GROUP BY feature_key
ORDER BY usage_count DESC;

-- ────────── 13. CUSTOMER SEGMENT BREAKDOWN (LIVE VIEW) ──────────

CREATE OR REPLACE VIEW customer_segment_breakdown_view AS
SELECT segment, COUNT(*) AS count
FROM customer_segments
GROUP BY segment;

-- ────────── 14. REALTIME ──────────

ALTER PUBLICATION supabase_realtime ADD TABLE customer_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE customer_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;

-- ────────── DONE ──────────
-- ============================================================

