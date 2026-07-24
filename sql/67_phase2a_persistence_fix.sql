-- Phase 2A Production Persistence Fix
-- ============================================================
-- SMART DOOR — PHASE 2A: CHECKOUT PERSISTENCE FIX
-- Run AFTER all previous migrations (01–66)
-- Additive only — ADD COLUMN IF NOT EXISTS. No DROP, no ALTER TYPE,
-- no destructive changes. Safe to run multiple times.
--
-- ROOT CAUSE:
--   create-razorpay-order/index.ts already received houseName,
--   houseNumber, fontStyle, and the full customization object
--   (size, finish, symbol, qrStyle, logoFileName) from the
--   configurator/checkout, but the `orders` table had no columns to
--   store them and the insert silently dropped them on the floor.
--   verify-razorpay-payment and razorpay-webhook then tried to read
--   this data back out of the WRONG places (order.shipping_address
--   and order.notes, a plain TEXT column that is never JSON), so the
--   `manufacturing` row that actually drives production/admin/the
--   production sheet/packaging was built from empty or wrong values.
--
-- This migration only ADDS the columns needed to persist that data
-- end-to-end. No existing column is renamed, dropped, or retyped.
--
-- DEPLOYMENT ORDER MATTERS: this migration MUST be run (and the PostgREST
-- schema cache reloaded) BEFORE the updated create-razorpay-order /
-- verify-razorpay-payment / razorpay-webhook Edge Functions are deployed,
-- or their inserts into these new columns will fail. See the full runbook:
-- docs/PHASE2A_DEPLOYMENT.md
-- ============================================================

-- ────────── 1. ORDERS — persist what checkout actually sent ──────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS house_name    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS house_number  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS font_style    TEXT DEFAULT 'modern';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customization JSONB DEFAULT '{}'::jsonb;
-- customization holds: { size, finish, symbol, qrStyle, logoFileName, subtitle, houseNumber }
-- product_type (existing column) already carries "Material" — no change needed there.

-- ────────── 2. MANUFACTURING — same fields, needed at the production/admin/packaging layer ──────────
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS house_name     TEXT;
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS finish         TEXT;
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS plate_size     TEXT;
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS symbol         TEXT;
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS qr_style       TEXT;
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS logo_file_name TEXT;
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS customization  JSONB DEFAULT '{}'::jsonb;
-- house_number, font_style, plate_name, product_type already exist on this table
-- (sql/07_commerce_schema.sql) — kept as-is, only their SOURCE VALUE in the
-- Edge Functions is corrected (see index.ts changes), not the column itself.

-- ────────── 3. INDEXES (cheap, optional lookups — additive) ──────────
CREATE INDEX IF NOT EXISTS idx_orders_house_number       ON orders(house_number) WHERE house_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manufacturing_house_number ON manufacturing(house_number) WHERE house_number IS NOT NULL;

-- No RLS changes required — RLS in this schema is row-level only, and the
-- existing policies on orders/manufacturing already govern these tables
-- regardless of which columns are selected.
