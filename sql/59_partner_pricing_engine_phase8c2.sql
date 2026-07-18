-- ============================================================
-- SMART DOOR — PHASE 8C (PART 2): PARTNER PRICING ENGINE
-- Migration: 59_partner_pricing_engine_phase8c2.sql
-- Run AFTER all previous migrations (01–58)
--
-- CONTEXT: Audit of 57_commerce_engine_phase8a.sql found that
-- coupons, pricing_rules (priority + stackable), campaigns,
-- partner_price_lists (dealer/franchise), bulk_pricing_tiers,
-- order_discounts, and the computePricing() stacking engine already
-- exist and are production-live. 58_partner_onboarding_kyc.sql already
-- added a 'distributor' admin_role but explicitly deferred
-- distributor-specific pricing/territory scoping as future work.
--
-- This migration closes exactly those deferred gaps — nothing already
-- built is touched, redefined, or recreated:
--   1. partner_price_lists: allow role_name = 'distributor'; add
--      effective_from / effective_until scheduling columns.
--   2. admin_users: add nullable parent_distributor_id for
--      distributor → dealer/franchise hierarchy roll-up pricing.
--   3. territory_price_lists (NEW): state / city / zone / pincode
--      pricing, independent of the partner tables above.
--   4. pricing_change_history (NEW): who/when/old-value/new-value
--      audit trail for every pricing entity (existing
--      admin_audit_logs stores the action but not old-vs-new values).
--   5. partner_product_visibility (NEW): enable/disable a product per
--      partner type or per specific partner.
--   6. pricing_rules.rule_type: add 'distributor_discount' so the
--      existing stacking engine can match distributor-tier rules the
--      same way it already matches dealer_discount/franchise_discount.
--   7. Analytics views: pricing_rule_utilization_analytics (per-rule
--      breakdown — today only campaign-level rollup exists) and
--      partner_rule_discount_impact_analytics (partner/role breakdown
--      of rule-based discounts already logged in order_discounts).
--
-- EXPLICITLY OUT OF SCOPE (per instructions):
--   - Commission Engine, Partner Dashboard UI, Customer Pricing.
--   - Any change to create-razorpay-order / verify-razorpay-payment or
--     any other checkout-flow file — distributor + territory pricing
--     are usable today via the admin commerce-engine API and
--     pricing_preview dry-run; wiring them into the live checkout call
--     site is a separate, deliberately deferred step (see
--     "Production Risks" in the accompanying response).
--   - Cross-category reordering of Campaign→Coupon→Partner→Bulk→Base.
--     That ordering already lives in ONE place (commercePricing.ts)
--     and each pricing_rules row already has a configurable `priority`
--     column for same-category ordering. Rebuilding the category order
--     itself as data-driven config would mean changing the function
--     checkout already calls for every order — that IS the checkout
--     flow, so it is not touched here.
--
-- Idempotent — safe to run multiple times. Backward compatible:
-- existing dealer/franchise rows, RLS, and RBAC are unaffected.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PARTNER PRICE LISTS — add distributor tier + effective scheduling
-- ────────────────────────────────────────────────────────────
ALTER TABLE partner_price_lists DROP CONSTRAINT IF EXISTS partner_price_lists_role_name_check;
ALTER TABLE partner_price_lists ADD CONSTRAINT partner_price_lists_role_name_check
  CHECK (role_name IN ('dealer', 'franchise', 'distributor'));

ALTER TABLE partner_price_lists ADD COLUMN IF NOT EXISTS effective_from  TIMESTAMPTZ;
ALTER TABLE partner_price_lists ADD COLUMN IF NOT EXISTS effective_until TIMESTAMPTZ;
ALTER TABLE partner_price_lists ADD COLUMN IF NOT EXISTS updated_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_price_lists_effective
  ON partner_price_lists(effective_from, effective_until);

-- Computed effective status (mirrors campaign_effective_status pattern from
-- 57_commerce_engine_phase8a.sql) — no cron needed for activation/expiry.
CREATE OR REPLACE FUNCTION partner_price_list_effective_status(p_row partner_price_lists)
RETURNS TEXT AS $$
BEGIN
  IF NOT p_row.is_active THEN RETURN 'disabled'; END IF;
  IF p_row.effective_from IS NOT NULL AND NOW() < p_row.effective_from THEN RETURN 'scheduled'; END IF;
  IF p_row.effective_until IS NOT NULL AND NOW() > p_row.effective_until THEN RETURN 'expired'; END IF;
  RETURN 'active';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW partner_price_lists_with_status AS
  SELECT p.*, partner_price_list_effective_status(p) AS effective_status
  FROM partner_price_lists p;

-- ────────────────────────────────────────────────────────────
-- 2. DISTRIBUTOR → DEALER/FRANCHISE HIERARCHY (roll-up pricing fallback)
-- ────────────────────────────────────────────────────────────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS parent_distributor_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admin_users_parent_distributor ON admin_users(parent_distributor_id);

-- ────────────────────────────────────────────────────────────
-- 3. TERRITORY PRICE LISTS (NEW — state / city / zone / pincode)
--    Independent of the partner tables above: territory pricing keys
--    off a shipping/service territory, not off a specific admin_user_id,
--    so it is not a duplicate of partner_price_lists.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS territory_price_lists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_type   TEXT NOT NULL CHECK (territory_type IN ('state', 'city', 'zone', 'pincode')),
  territory_value  TEXT NOT NULL,                            -- e.g. 'Madhya Pradesh' | 'Bhopal' | 'zone-central' | '462001'
  role_name        TEXT CHECK (role_name IN ('dealer', 'franchise', 'distributor')), -- NULL = applies to all partner types
  product_type     TEXT NOT NULL,
  partner_price    NUMERIC(10,2),
  discount_percent NUMERIC(5,2),
  priority         INTEGER NOT NULL DEFAULT 100,             -- lower = preferred when >1 territory row matches (e.g. pincode over state)
  is_active        BOOLEAN NOT NULL DEFAULT true,
  effective_from   TIMESTAMPTZ,
  effective_until  TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CHECK (partner_price IS NOT NULL OR discount_percent IS NOT NULL)
);

-- One active row per (territory, role scope, product) — COALESCE folds the
-- nullable role_name ("applies to all") into the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_territory_price_lists_scope
  ON territory_price_lists (territory_type, territory_value, COALESCE(role_name, ''), product_type);

CREATE INDEX IF NOT EXISTS idx_territory_price_lists_lookup
  ON territory_price_lists(territory_type, territory_value, is_active, priority);

CREATE OR REPLACE FUNCTION territory_price_list_effective_status(p_row territory_price_lists)
RETURNS TEXT AS $$
BEGIN
  IF NOT p_row.is_active THEN RETURN 'disabled'; END IF;
  IF p_row.effective_from IS NOT NULL AND NOW() < p_row.effective_from THEN RETURN 'scheduled'; END IF;
  IF p_row.effective_until IS NOT NULL AND NOW() > p_row.effective_until THEN RETURN 'expired'; END IF;
  RETURN 'active';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW territory_price_lists_with_status AS
  SELECT t.*, territory_price_list_effective_status(t) AS effective_status
  FROM territory_price_lists t;

DROP TRIGGER IF EXISTS trg_territory_price_lists_updated_at ON territory_price_lists;
CREATE TRIGGER trg_territory_price_lists_updated_at BEFORE UPDATE ON territory_price_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. PARTNER PRODUCT VISIBILITY (NEW — enable/disable a product per
--    partner type, or per specific partner as a narrower override)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_product_visibility (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name      TEXT NOT NULL CHECK (role_name IN ('dealer', 'franchise', 'distributor')),
  admin_user_id  UUID REFERENCES admin_users(id) ON DELETE CASCADE,  -- NULL = applies to every partner of this role_name
  product_type   TEXT NOT NULL,
  is_visible     BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_product_visibility_scope
  ON partner_product_visibility (role_name, COALESCE(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), product_type);

DROP TRIGGER IF EXISTS trg_partner_product_visibility_updated_at ON partner_product_visibility;
CREATE TRIGGER trg_partner_product_visibility_updated_at BEFORE UPDATE ON partner_product_visibility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 5. PRICING CHANGE HISTORY (NEW — old vs new values, who, when)
--    admin_audit_logs (used elsewhere in this codebase) already records
--    action + metadata, but not a structured old-value/new-value diff
--    for pricing entities specifically. This is additive, not a
--    replacement for admin_audit_logs.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_change_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL CHECK (entity_type IN (
                 'partner_price_list', 'territory_price_list', 'pricing_rule',
                 'bulk_pricing_tier', 'coupon', 'partner_product_visibility'
               )),
  entity_id    UUID NOT NULL,
  admin_id     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'toggle')),
  old_value    JSONB,
  new_value    JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_change_history_entity
  ON pricing_change_history(entity_type, entity_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 6. PRICING RULES — add 'distributor_discount' rule_type so the
--    existing computePricing() stacking engine can match distributor
--    tiers exactly like it already matches dealer_discount /
--    franchise_discount. No other rule_type values are changed.
-- ────────────────────────────────────────────────────────────
ALTER TABLE pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_rule_type_check;
ALTER TABLE pricing_rules ADD CONSTRAINT pricing_rules_rule_type_check
  CHECK (rule_type IN (
    'launch_offer', 'festival_offer', 'referral_discount',
    'dealer_discount', 'franchise_discount', 'distributor_discount', 'bulk_discount',
    'premium_customer_discount', 'renewal_discount', 'campaign'
  ));

-- ────────────────────────────────────────────────────────────
-- 7. RLS — service_role only, same pattern as every other commerce table
-- ────────────────────────────────────────────────────────────
ALTER TABLE territory_price_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_product_visibility  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_change_history      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS territory_price_lists_service_all      ON territory_price_lists;
DROP POLICY IF EXISTS partner_product_visibility_service_all ON partner_product_visibility;
DROP POLICY IF EXISTS pricing_change_history_service_all     ON pricing_change_history;

CREATE POLICY territory_price_lists_service_all      ON territory_price_lists      FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY partner_product_visibility_service_all ON partner_product_visibility FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY pricing_change_history_service_all     ON pricing_change_history     FOR ALL USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 8. RBAC — extend the EXISTING 'commerce' resource to the distributor
--    role, same read-only-own-rows pattern already granted to
--    dealer/franchise in 57_commerce_engine_phase8a.sql. No new
--    resource key, no change to any other role's permissions.
-- ────────────────────────────────────────────────────────────
UPDATE admin_roles
SET permissions = permissions || '{"commerce":["read"]}'::jsonb
WHERE name = 'distributor'
  AND NOT (permissions ? '*')
  AND NOT (permissions -> 'commerce' ? 'write');

-- ────────────────────────────────────────────────────────────
-- 9. ANALYTICS — additive views only, built entirely from EXISTING
--    data (order_discounts, orders.created_by_admin_id from
--    37_dealer_order_visibility.sql, admin_users). No checkout-flow
--    change was needed to make these possible.
-- ────────────────────────────────────────────────────────────

-- Per-rule utilization (today, campaign_performance_analytics only
-- rolls rules up BY CAMPAIGN; standalone/non-campaign rules — e.g. a
-- plain dealer_discount rule with no campaign_id — had no view at all).
CREATE OR REPLACE VIEW pricing_rule_utilization_analytics AS
SELECT
  pr.id                AS rule_id,
  pr.name,
  pr.rule_type,
  pr.priority,
  pr.stackable,
  pr.is_active,
  pr.campaign_id,
  COUNT(od.id)          FILTER (WHERE od.status = 'confirmed')              AS confirmed_applications,
  COUNT(od.id)          FILTER (WHERE od.status = 'reserved')               AS pending_applications,
  COALESCE(SUM(od.discount_amount) FILTER (WHERE od.status = 'confirmed'), 0) AS total_discount_given,
  COALESCE(SUM(o.total_amount) FILTER (WHERE od.status = 'confirmed'), 0)     AS revenue_impact
FROM pricing_rules pr
LEFT JOIN order_discounts od ON od.discount_source = 'pricing_rule' AND od.source_id = pr.id
LEFT JOIN orders o ON o.id = od.order_id
GROUP BY pr.id, pr.name, pr.rule_type, pr.priority, pr.stackable, pr.is_active, pr.campaign_id;

-- Partner/role breakdown of rule-based partner discounts specifically
-- (dealer_discount / franchise_discount / distributor_discount rule
-- types only — these are the partner discounts that go through
-- pricing_rules and are therefore already logged in order_discounts).
-- NOTE (documented limitation, see Production Risks): a partner_price_lists
-- override/discount_percent lowers the base unit price directly rather
-- than being logged as a discrete order_discounts row, so it is not
-- included in this ledger-based view. Attributing that savings would
-- require either a checkout-flow change (out of scope) or a duplicate
-- product-price reference table outside the existing single source of
-- truth (supabase/functions/_shared/pricing.ts) — neither was done here.
CREATE OR REPLACE VIEW partner_rule_discount_impact_analytics AS
SELECT
  o.created_by_admin_id AS admin_user_id,
  au.full_name          AS partner_name,
  ar.name                AS role_name,
  pr.rule_type,
  COUNT(DISTINCT od.order_id)                                                 AS orders_impacted,
  COALESCE(SUM(od.discount_amount) FILTER (WHERE od.status = 'confirmed'), 0) AS total_discount_given,
  COALESCE(SUM(o.total_amount) FILTER (WHERE od.status = 'confirmed'), 0)     AS revenue_impact
FROM order_discounts od
JOIN orders o        ON o.id = od.order_id
JOIN pricing_rules pr ON od.discount_source = 'pricing_rule' AND od.source_id = pr.id
                          AND pr.rule_type IN ('dealer_discount', 'franchise_discount', 'distributor_discount')
JOIN admin_users au   ON au.id = o.created_by_admin_id
JOIN admin_roles ar   ON ar.id = au.role_id
WHERE o.created_by_admin_id IS NOT NULL
GROUP BY o.created_by_admin_id, au.full_name, ar.name, pr.rule_type;

-- ────────── END OF MIGRATION 59 ──────────
