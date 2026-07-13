-- ════════════════════════════════════════════════════════════════════════════
-- Migration 47: "Premium Included" — Business Model Alignment
--
-- PURPOSE
--   Every SmartDoor hardware purchase already includes a complimentary
--   12-month Premium membership (services/subscriptions.js activateFromOrder()
--   sets plan='hardware_only' + expiry_date = start_date + 1 year — this was
--   already true before this migration). What was wrong is that
--   plan_catalog's 'hardware_only' row (sql/46_saas_billing_schema.sql) was
--   seeded with FREE-tier limits and the confusing label
--   "Hardware Only (Legacy)". That meant every complimentary-Premium owner
--   silently hit Free-plan usage caps (30 calls/mo, no AI receptionist, no
--   analytics) during the very period they were supposed to feel unrestricted.
--
--   This migration:
--     1. Renames the 'hardware_only' plan_catalog row to "Premium Included"
--        with a tagline that communicates it came free with the hardware.
--     2. Raises its feature limits to match the 'premium' tier exactly, so
--        no hardware-purchase owner within their complimentary window ever
--        hits an artificial usage limit.
--     3. Leaves the plan_key, is_legacy_alias, and is_active values exactly
--        as they were — 'hardware_only' remains the exact same resolvable
--        key every existing subscriptions/plates/orders row already uses,
--        and it stays hidden (is_active=false) from the purchasable pricing
--        grid, since it is never something a customer buys directly.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT rename or touch the plan_key ('hardware_only' stays as-is) —
--     zero risk to existing subscriptions/plates/orders/analytics rows.
--   - Does NOT touch 'smartdoor_care', 'free', 'premium', or 'enterprise' rows.
--   - Does NOT delete or modify any visitor history, photos, notes, labels,
--     favorites, or analytics data.
--   - Does NOT touch call_logs, WebRTC, signaling, or visitor CRM tables.
--
-- SAFE / IDEMPOTENT — plain UPDATE, safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE plan_catalog
SET
  name                     = 'Premium Included',
  tagline                  = 'Included free with your SmartDoor purchase',
  calls_per_month          = (SELECT calls_per_month         FROM plan_catalog WHERE plan_key = 'premium'),
  visitor_history_days     = (SELECT visitor_history_days    FROM plan_catalog WHERE plan_key = 'premium'),
  photo_uploads_per_month  = (SELECT photo_uploads_per_month FROM plan_catalog WHERE plan_key = 'premium'),
  storage_mb               = (SELECT storage_mb              FROM plan_catalog WHERE plan_key = 'premium'),
  exports_per_month        = (SELECT exports_per_month       FROM plan_catalog WHERE plan_key = 'premium'),
  family_members_limit     = (SELECT family_members_limit    FROM plan_catalog WHERE plan_key = 'premium'),
  analytics_enabled        = TRUE,
  ai_features_enabled      = TRUE,
  priority_support         = TRUE,
  support_tier             = 'priority',
  updated_at               = NOW()
WHERE plan_key = 'hardware_only';

COMMENT ON COLUMN plan_catalog.name IS 'Display name shown in pricing UI / dashboards. "Premium Included" (hardware_only) communicates the complimentary 12-month Premium membership that ships with every SmartDoor hardware purchase.';

COMMIT;

-- ── Run this after migration to verify ──────────────────────────────────────
-- SELECT plan_key, name, tagline, calls_per_month, ai_features_enabled, analytics_enabled, is_active
-- FROM plan_catalog ORDER BY sort_order;
