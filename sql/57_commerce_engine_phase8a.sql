-- ============================================================
-- SMART DOOR — PHASE 8A: COMMERCE ENGINE
-- Migration: 57_commerce_engine_phase8a.sql
-- Run AFTER all previous migrations (01–56)
--
-- SCOPE (per Phase 8A spec — commerce layer only):
--   Coupon Engine, Promo Codes, Pricing Rule Engine, Dealer/Franchise
--   Pricing, Bulk Pricing, Referral Reward calculation (existing
--   referrals/referral_logs tables only — not recreated), Launch
--   Campaigns, Commerce Validation, Commerce Analytics.
--
-- EXPLICITLY OUT OF SCOPE (later phases): billing, GST, KYC.
--
-- Additive only:
--   - New tables: coupons, pricing_rules, partner_price_lists,
--     bulk_pricing_tiers, campaigns, order_discounts
--   - New columns on EXISTING tables: orders.quantity,
--     orders.discount_amount, orders.coupon_code,
--     referral_logs.reward_amount
--   - Reuses existing orders, payments, referrals, referral_logs,
--     admin_users, admin_roles tables — none are recreated or altered
--     destructively.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ────────── 1. COUPONS ──────────
CREATE TABLE IF NOT EXISTS coupons (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     TEXT UNIQUE NOT NULL,            -- stored uppercase, e.g. LAUNCH500
  description              TEXT,
  discount_type            TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
  discount_value            NUMERIC(10,2) NOT NULL DEFAULT 0, -- % (0-100) or ₹ amount; ignored for free_shipping
  max_discount_amount      NUMERIC(10,2),                   -- cap for percentage coupons (nullable = no cap)
  min_order_value          NUMERIC(10,2) NOT NULL DEFAULT 0,
  usage_limit_total        INTEGER,                          -- NULL = unlimited; 1 = one-time coupon
  usage_limit_per_customer INTEGER NOT NULL DEFAULT 1,       -- NULL = unlimited per customer
  times_used               INTEGER NOT NULL DEFAULT 0,       -- atomic counter, maintained by reserve_coupon()/release_order_discounts()
  starts_at                TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  applicable_product_types TEXT[],                          -- NULL/empty = all product types
  campaign_id               UUID,                            -- FK added below (after campaigns table exists)
  created_by_admin_id      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code_active ON coupons(code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coupons_campaign    ON coupons(campaign_id);

-- ────────── 2. PRICING RULES (configurable, stackable-by-priority engine) ──────────
CREATE TABLE IF NOT EXISTS pricing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  rule_type       TEXT NOT NULL CHECK (rule_type IN (
                    'launch_offer', 'festival_offer', 'referral_discount',
                    'dealer_discount', 'franchise_discount', 'bulk_discount',
                    'premium_customer_discount', 'renewal_discount', 'campaign'
                  )),
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_discount_amount NUMERIC(10,2),
  priority        INTEGER NOT NULL DEFAULT 100,             -- lower = evaluated/applied first
  stackable       BOOLEAN NOT NULL DEFAULT false,            -- if false, this rule excludes all other rules when it's the top match
  conditions      JSONB NOT NULL DEFAULT '{}',               -- { product_types:[], min_quantity, plan_keys:[], min_order_value, role_names:[] }
  campaign_id      UUID,                                     -- FK added below
  starts_at       TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON pricing_rules(rule_type, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_campaign ON pricing_rules(campaign_id);

-- ────────── 3. CAMPAIGNS (launch / festival / referral / seasonal wrappers) ──────────
CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  campaign_type TEXT NOT NULL DEFAULT 'launch_offer',
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  auto_enable   BOOLEAN NOT NULL DEFAULT true,               -- becomes 'active' once starts_at passes
  auto_disable  BOOLEAN NOT NULL DEFAULT true,                -- becomes 'ended' once ends_at passes
  status_override TEXT CHECK (status_override IN ('disabled')), -- manual kill switch; NULL = follow auto schedule
  created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_window ON campaigns(starts_at, ends_at);

-- Now that campaigns exists, wire the FKs deferred above (guarded for idempotent re-runs — ADD CONSTRAINT has no IF NOT EXISTS in Postgres).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_coupons_campaign') THEN
    ALTER TABLE coupons ADD CONSTRAINT fk_coupons_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pricing_rules_campaign') THEN
    ALTER TABLE pricing_rules ADD CONSTRAINT fk_pricing_rules_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Effective status is computed, not stored, so it's always correct without a
-- cron job flipping rows. auto_enable/auto_disable only gate whether the
-- time window is honored at all; status_override='disabled' always wins.
CREATE OR REPLACE FUNCTION campaign_effective_status(p_campaign campaigns)
RETURNS TEXT AS $$
BEGIN
  IF p_campaign.status_override = 'disabled' THEN RETURN 'disabled'; END IF;
  IF p_campaign.auto_enable AND NOW() < p_campaign.starts_at THEN RETURN 'scheduled'; END IF;
  IF p_campaign.auto_disable AND NOW() > p_campaign.ends_at THEN RETURN 'ended'; END IF;
  RETURN 'active';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW campaigns_with_status AS
  SELECT c.*, campaign_effective_status(c) AS effective_status
  FROM campaigns c;

-- ────────── 4. PARTNER PRICING (Dealer + Franchise price lists) ──────────
CREATE TABLE IF NOT EXISTS partner_price_lists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id    UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_name        TEXT NOT NULL CHECK (role_name IN ('dealer', 'franchise')),
  product_type     TEXT NOT NULL,                            -- 'acrylic' | 'stainless' | 'teakwood'
  partner_price    NUMERIC(10,2),                             -- absolute override price (nullable if using discount_percent instead)
  discount_percent NUMERIC(5,2),                               -- % off public price (nullable if using partner_price instead)
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_user_id, product_type),
  CHECK (partner_price IS NOT NULL OR discount_percent IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_partner_price_lists_admin ON partner_price_lists(admin_user_id, is_active);

-- ────────── 5. BULK PRICING (quantity breaks) ──────────
CREATE TABLE IF NOT EXISTS bulk_pricing_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type    TEXT NOT NULL,
  min_quantity    INTEGER NOT NULL,
  max_quantity    INTEGER,                                    -- NULL = no upper bound
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (max_quantity IS NULL OR max_quantity >= min_quantity)
);

CREATE INDEX IF NOT EXISTS idx_bulk_pricing_product ON bulk_pricing_tiers(product_type, min_quantity);

-- ────────── 6. ORDER DISCOUNTS (unified redemption ledger — powers analytics + abuse prevention) ──────────
CREATE TABLE IF NOT EXISTS order_discounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,   -- denormalized from order, may be NULL for guest checkout
  customer_email  TEXT,                                            -- denormalized, used for per-customer coupon limits on guest checkout
  discount_source TEXT NOT NULL CHECK (discount_source IN ('coupon', 'pricing_rule')),
  source_id       UUID NOT NULL,                                   -- coupons.id or pricing_rules.id (no FK — two possible parent tables)
  source_code     TEXT NOT NULL,                                   -- coupon code or pricing rule name, denormalized for analytics/display
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
  discount_value  NUMERIC(10,2) NOT NULL DEFAULT 0,                 -- rule's configured value at time of use
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,                 -- actual ₹ amount applied to this order
  status          TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_discounts_order  ON order_discounts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_source ON order_discounts(discount_source, source_id, status);
CREATE INDEX IF NOT EXISTS idx_order_discounts_customer ON order_discounts(customer_email, discount_source, source_id);

-- ────────── 7. EXTEND ORDERS (additive columns only — existing rows unaffected, defaults preserve current behavior) ──────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity        INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code     TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code ON orders(coupon_code) WHERE coupon_code IS NOT NULL;

-- ────────── 8. EXTEND REFERRAL_LOGS (reward calculation — does NOT touch referrals/referral_logs structure otherwise) ──────────
ALTER TABLE referral_logs ADD COLUMN IF NOT EXISTS reward_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ────────── 9. AUTO-UPDATE updated_at (reuses existing shared trigger function from 01_schema.sql) ──────────
DROP TRIGGER IF EXISTS trg_coupons_updated_at ON coupons;
CREATE TRIGGER trg_coupons_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_rules_updated_at ON pricing_rules;
CREATE TRIGGER trg_pricing_rules_updated_at BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_partner_price_lists_updated_at ON partner_price_lists;
CREATE TRIGGER trg_partner_price_lists_updated_at BEFORE UPDATE ON partner_price_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_bulk_pricing_tiers_updated_at ON bulk_pricing_tiers;
CREATE TRIGGER trg_bulk_pricing_tiers_updated_at BEFORE UPDATE ON bulk_pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 10. RESERVE COUPON (atomic — row-locked to prevent race-condition abuse) ──────────
-- Called from create-razorpay-order at checkout time, BEFORE payment capture.
-- Validates + reserves a usage slot in the same transaction, so two
-- simultaneous checkouts can never both slip through a usage_limit_total=1
-- coupon. Reservation is released (release_order_discounts) if payment
-- fails/is cancelled, or confirmed (confirm_order_discounts) once paid.
CREATE OR REPLACE FUNCTION reserve_coupon(
  p_code           TEXT,
  p_order_id       UUID,
  p_order_total    NUMERIC,
  p_product_type   TEXT,
  p_customer_email TEXT,
  p_owner_id       UUID
) RETURNS JSONB AS $$
DECLARE
  v_coupon coupons%ROWTYPE;
  v_prior_redemptions INTEGER;
  v_discount_amount NUMERIC(10,2);
BEGIN
  SELECT * INTO v_coupon FROM coupons
  WHERE UPPER(code) = UPPER(p_code)
  FOR UPDATE;                                    -- lock this coupon row for the duration of the transaction

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid coupon code.');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'This coupon is no longer active.');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND NOW() < v_coupon.starts_at THEN
    RETURN jsonb_build_object('success', false, 'message', 'This coupon is not active yet.');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND NOW() > v_coupon.expires_at THEN
    RETURN jsonb_build_object('success', false, 'message', 'This coupon has expired.');
  END IF;

  IF p_order_total < v_coupon.min_order_value THEN
    RETURN jsonb_build_object('success', false, 'message',
      format('Minimum order value for this coupon is ₹%s.', v_coupon.min_order_value));
  END IF;

  IF v_coupon.applicable_product_types IS NOT NULL
     AND array_length(v_coupon.applicable_product_types, 1) > 0
     AND NOT (p_product_type = ANY(v_coupon.applicable_product_types)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'This coupon does not apply to the selected product.');
  END IF;

  IF v_coupon.usage_limit_total IS NOT NULL AND v_coupon.times_used >= v_coupon.usage_limit_total THEN
    RETURN jsonb_build_object('success', false, 'message', 'This coupon has reached its usage limit.');
  END IF;

  IF v_coupon.usage_limit_per_customer IS NOT NULL AND p_customer_email IS NOT NULL THEN
    SELECT COUNT(*) INTO v_prior_redemptions
    FROM order_discounts
    WHERE discount_source = 'coupon'
      AND source_id = v_coupon.id
      AND customer_email = p_customer_email
      AND status IN ('reserved', 'confirmed');

    IF v_prior_redemptions >= v_coupon.usage_limit_per_customer THEN
      RETURN jsonb_build_object('success', false, 'message', 'You have already used this coupon the maximum number of times.');
    END IF;
  END IF;

  -- ── Compute discount amount ──
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount_amount := ROUND(p_order_total * v_coupon.discount_value / 100.0, 2);
    IF v_coupon.max_discount_amount IS NOT NULL THEN
      v_discount_amount := LEAST(v_discount_amount, v_coupon.max_discount_amount);
    END IF;
  ELSIF v_coupon.discount_type = 'fixed' THEN
    v_discount_amount := LEAST(v_coupon.discount_value, p_order_total);
  ELSE -- free_shipping: this codebase already ships all hardware free (SHIPPING_PRICE_PAISE = 0),
       -- so there is nothing left to discount; the coupon still records as redeemed for analytics.
    v_discount_amount := 0;
  END IF;

  -- ── Reserve: increment counter + log redemption, all inside this locked transaction ──
  UPDATE coupons SET times_used = times_used + 1 WHERE id = v_coupon.id;

  INSERT INTO order_discounts (
    order_id, owner_id, customer_email, discount_source, source_id, source_code,
    discount_type, discount_value, discount_amount, status
  ) VALUES (
    p_order_id, p_owner_id, p_customer_email, 'coupon', v_coupon.id, v_coupon.code,
    v_coupon.discount_type, v_coupon.discount_value, v_discount_amount, 'reserved'
  );

  RETURN jsonb_build_object('success', true, 'discount_amount', v_discount_amount, 'discount_type', v_coupon.discount_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────── 11. CONFIRM / RELEASE order discounts (payment captured / payment failed or cancelled) ──────────
CREATE OR REPLACE FUNCTION confirm_order_discounts(p_order_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE order_discounts
  SET status = 'confirmed', confirmed_at = NOW()
  WHERE order_id = p_order_id AND status = 'reserved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION release_order_discounts(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM order_discounts WHERE order_id = p_order_id AND status = 'reserved' LOOP
    IF r.discount_source = 'coupon' THEN
      UPDATE coupons SET times_used = GREATEST(times_used - 1, 0) WHERE id = r.source_id;
    END IF;
    UPDATE order_discounts SET status = 'cancelled' WHERE id = r.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────── 12. REFERRAL REWARD CREDIT (integrates with EXISTING referrals/referral_logs — no new referral tables) ──────────
-- Called once, from verify-razorpay-payment, the moment a referred
-- customer's order is marked paid. Idempotent: a referral_logs row can
-- only be converted once (guarded by the WHERE status = 'pending' below),
-- which is what prevents the same referral being rewarded twice.
CREATE OR REPLACE FUNCTION credit_referral_reward(p_referred_owner_id UUID, p_reward_amount NUMERIC)
RETURNS JSONB AS $$
DECLARE
  v_log referral_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_log FROM referral_logs
  WHERE referred_owner_id = p_referred_owner_id AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'No pending referral for this customer.');
  END IF;

  UPDATE referral_logs
  SET status = 'converted', converted_at = NOW(), reward_amount = p_reward_amount
  WHERE id = v_log.id;

  UPDATE referrals
  SET successful_referrals = successful_referrals + 1,
      reward_earned        = reward_earned + p_reward_amount,
      updated_at            = NOW()
  WHERE id = v_log.referral_id;

  RETURN jsonb_build_object('success', true, 'referral_id', v_log.referral_id, 'reward_amount', p_reward_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────── 13. RLS — service_role only (all commerce writes/reads go through Edge Functions) ──────────
ALTER TABLE coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_price_lists  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_pricing_tiers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_discounts      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupons_service_all             ON coupons;
DROP POLICY IF EXISTS pricing_rules_service_all       ON pricing_rules;
DROP POLICY IF EXISTS campaigns_service_all           ON campaigns;
DROP POLICY IF EXISTS partner_price_lists_service_all ON partner_price_lists;
DROP POLICY IF EXISTS bulk_pricing_tiers_service_all  ON bulk_pricing_tiers;
DROP POLICY IF EXISTS order_discounts_service_all     ON order_discounts;
DROP POLICY IF EXISTS order_discounts_owner_read      ON order_discounts;

CREATE POLICY coupons_service_all             ON coupons             FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY pricing_rules_service_all       ON pricing_rules       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY campaigns_service_all           ON campaigns           FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY partner_price_lists_service_all ON partner_price_lists FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY bulk_pricing_tiers_service_all  ON bulk_pricing_tiers  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY order_discounts_service_all     ON order_discounts     FOR ALL USING (auth.role() = 'service_role');

-- Owners can read the discount lines that applied to their own orders
-- (order history / invoice display) — mirrors the existing
-- payments_owner_read / tracking_owner_read pattern from 07_commerce_schema.sql.
CREATE POLICY order_discounts_owner_read ON order_discounts
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- ────────── 14. RBAC — grant the EXISTING admin roles a 'commerce' resource ──────────
-- Role names here match exactly what's seeded in 08_admin_schema.sql /
-- 15_admin_provisioning_schema.sql / 20_franchise_installer_roles.sql —
-- 'super_admin' already has the '*' wildcard (sees everything, no update
-- needed). Additive permission merge only — does not touch any other
-- resource key already present on these roles. Any role without '*' or an
-- explicit grant here simply has no commerce access (adminCan() defaults
-- to false), consistent with how every other resource in this app is gated.
UPDATE admin_roles
SET permissions = permissions || '{"commerce":["read","write"]}'::jsonb
WHERE name = 'ops_manager'
  AND NOT (permissions ? '*');

UPDATE admin_roles
SET permissions = permissions || '{"commerce":["read"]}'::jsonb
WHERE name = 'analyst'
  AND NOT (permissions ? '*');

-- Dealers/franchise partners get read-only visibility into their OWN
-- partner_price_lists rows (enforced in commerce-engine Edge Function by
-- admin_user_id = ctx.id, same pattern as 37_dealer_order_visibility.sql) —
-- not table-wide read, so no RLS change needed beyond the service-role
-- policies above; the Edge Function is the enforcement point.
UPDATE admin_roles
SET permissions = permissions || '{"commerce":["read"]}'::jsonb
WHERE name IN ('dealer', 'franchise')
  AND NOT (permissions ? '*')
  AND NOT (permissions -> 'commerce' ? 'write');

-- ────────── 15. COMMERCE ANALYTICS VIEWS ──────────

-- Coupon usage: redemption counts + revenue impact per coupon
CREATE OR REPLACE VIEW coupon_usage_analytics AS
SELECT
  c.id                AS coupon_id,
  c.code,
  c.discount_type,
  c.is_active,
  c.usage_limit_total,
  c.times_used,
  COUNT(od.id)         FILTER (WHERE od.status = 'confirmed')              AS confirmed_redemptions,
  COUNT(od.id)         FILTER (WHERE od.status = 'reserved')               AS pending_redemptions,
  COALESCE(SUM(od.discount_amount) FILTER (WHERE od.status = 'confirmed'), 0) AS total_discount_given,
  COALESCE(SUM(o.total_amount) FILTER (WHERE od.status = 'confirmed'), 0)     AS revenue_from_coupon_orders
FROM coupons c
LEFT JOIN order_discounts od ON od.discount_source = 'coupon' AND od.source_id = c.id
LEFT JOIN orders o ON o.id = od.order_id
GROUP BY c.id, c.code, c.discount_type, c.is_active, c.usage_limit_total, c.times_used;

-- Campaign performance: rolls up both coupons and pricing_rules tied to a campaign
CREATE OR REPLACE VIEW campaign_performance_analytics AS
SELECT
  camp.id AS campaign_id,
  camp.name,
  camp.slug,
  campaign_effective_status(camp) AS effective_status,
  camp.starts_at,
  camp.ends_at,
  COUNT(DISTINCT od.order_id) AS orders_impacted,
  COALESCE(SUM(od.discount_amount) FILTER (WHERE od.status = 'confirmed'), 0) AS total_discount_given,
  COALESCE(SUM(o.total_amount) FILTER (WHERE od.status = 'confirmed'), 0)     AS revenue_impact
FROM campaigns camp
LEFT JOIN coupons c        ON c.campaign_id = camp.id
LEFT JOIN pricing_rules pr ON pr.campaign_id = camp.id
LEFT JOIN order_discounts od ON (
  (od.discount_source = 'coupon'       AND od.source_id = c.id) OR
  (od.discount_source = 'pricing_rule' AND od.source_id = pr.id)
)
LEFT JOIN orders o ON o.id = od.order_id
GROUP BY camp.id, camp.name, camp.slug, camp.starts_at, camp.ends_at;

-- Overall discount/revenue impact, by source type — for a dashboard summary card
CREATE OR REPLACE VIEW discount_revenue_impact_analytics AS
SELECT
  discount_source,
  COUNT(*) FILTER (WHERE status = 'confirmed')                    AS confirmed_count,
  COALESCE(SUM(discount_amount) FILTER (WHERE status = 'confirmed'), 0) AS total_discount_given
FROM order_discounts
GROUP BY discount_source;

-- ────────── END OF MIGRATION 57 ──────────
