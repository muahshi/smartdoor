-- ============================================================
-- SMART DOOR — PHASE 6: DEALER ORDER VISIBILITY (COMPLETION PART 2)
-- Migration: 37_dealer_order_visibility.sql
-- Run AFTER 36_phase6_completion.sql
--
-- CONTEXT: Migration 36 gave dealer role "installations:write" (can request
-- an installer visit) but deliberately did NOT give dealer "orders:read",
-- because order_list had no way to scope results to a single dealer —
-- granting it would have let one dealer see every other dealer's orders.
--
-- This migration closes that gap the safe way:
--   1. Adds a nullable, purely additive `created_by_admin_id` column to
--      `orders` (who provisioned/created the order — works for any role,
--      not dealer-specific, useful for audit generally too).
--   2. Grants dealer role `orders:["read"]`.
--   3. order_list in admin-data/index.ts (code change, not SQL) now filters
--      by created_by_admin_id when ctx.role_name === 'dealer', so each
--      dealer only ever sees their own orders. All other roles are unaffected.
--
-- Existing orders rows: created_by_admin_id will be NULL for all of them
-- (no backfill attempted — we don't know who created historical orders,
-- and guessing would be inventing data). NULL rows simply won't show up
-- for any dealer — they remain fully visible to every other role as before.
--
-- Additive only — does NOT touch existing tables, columns, roles, data,
-- RLS policies, or triggers. Safe to run multiple times.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_by_admin ON orders(created_by_admin_id);

UPDATE admin_roles
SET permissions = permissions || '{"orders":["read"]}'::jsonb
WHERE name = 'dealer';

-- ============================================================
-- END OF MIGRATION 37
-- Dealer permissions after 36 + 37: customers, plates, qr, pin_reset,
-- activation_resend, installations[read,write], commissions[read],
-- orders[read] (own orders only, enforced in application code).
-- Dealer still cannot write/edit orders (no payment/manufacturing edit
-- rights) and still cannot see revenue/financial analytics.
-- ============================================================
