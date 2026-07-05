-- ============================================================
-- SMART DOOR — PHASE 5: ENTERPRISE RBAC MODULES
-- Migration: 34_enterprise_rbac_phase5.sql
-- Run AFTER all previous migrations (01–33)
--
-- Adds (all additive — no existing table/column/policy/role touched):
--   1. admin_users: parent_admin_id, region        (hierarchy + territory)
--   2. orders: installation_status                 (independent of manufacturing_status)
--   3. manufacturing: batch_id                      (links a production row to a batch)
--   4. inventory_items                              (Manufacturer — Inventory)
--   5. inventory_batches                            (Manufacturer — Batch management)
--   6. plate_dealer_assignments                     (Manufacturer → Dealer assignment)
--   7. installation_jobs                            (Installer workflow — auto-created)
--   8. installation_job_photos                      (Installer — completion photos)
--   9. dealer_commissions                            (Dealer — commission ledger, UI-only for now)
--  10. Trigger: auto-create installation_jobs row when orders.installation_status → 'pending'
--  11. admin_roles.permissions: additive JSONB merge for manufacturing/dealer/franchise/installer
--  12. Storage bucket: installation-photos
--
-- Nothing here changes: existing table structures, existing columns' meaning,
-- manufacturing_status lifecycle (queued→...→delivered), subscription activation,
-- notifications, push, Firebase, or the existing admin_roles wildcard for super_admin.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT everywhere).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ADMIN_USERS — hierarchy + territory (nullable, backward compatible)
-- ────────────────────────────────────────────────────────────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS parent_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS region TEXT;
CREATE INDEX IF NOT EXISTS idx_admin_users_parent ON admin_users(parent_admin_id);

-- ────────────────────────────────────────────────────────────
-- 2. ORDERS — installation_status (separate column, does NOT touch
--    manufacturing_status/tracking_status or the delivered→subscription flow)
-- ────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installation_status TEXT DEFAULT NULL;
-- Values (informal, no CHECK constraint — consistent with rest of schema):
--   NULL | 'not_required' | 'pending' | 'claimed' | 'in_progress' | 'completed'
CREATE INDEX IF NOT EXISTS idx_orders_installation_status ON orders(installation_status);

-- ────────────────────────────────────────────────────────────
-- 3. MANUFACTURING — link a production row to a batch (nullable)
-- ────────────────────────────────────────────────────────────
-- (column added after inventory_batches table below, see section 5b)

-- ────────────────────────────────────────────────────────────
-- 4. INVENTORY ITEMS — Manufacturer inventory management
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT DEFAULT 'raw_material',   -- 'raw_material' | 'component' | 'packaging' | 'finished_good'
  unit              TEXT DEFAULT 'pcs',             -- 'pcs' | 'kg' | 'm' | 'l' etc.
  quantity_on_hand  NUMERIC(12,2) NOT NULL DEFAULT 0,
  reorder_threshold NUMERIC(12,2) DEFAULT 0,
  notes             TEXT,
  created_by        UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  change_qty    NUMERIC(12,2) NOT NULL,             -- positive = stock in, negative = stock out
  reason        TEXT,                               -- 'restock' | 'production_use' | 'adjustment' | 'wastage'
  recorded_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_id);

-- ────────────────────────────────────────────────────────────
-- 5. INVENTORY BATCHES — Manufacturer batch management
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number   TEXT UNIQUE NOT NULL,               -- e.g. BATCH-20260705-0001
  product_type   TEXT NOT NULL DEFAULT 'acrylic',    -- 'acrylic' | 'stainless' | 'teakwood'
  planned_qty    INT NOT NULL DEFAULT 0,
  completed_qty  INT NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'planned',    -- 'planned' | 'in_progress' | 'completed' | 'cancelled'
  notes          TEXT,
  created_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_status ON inventory_batches(status);

-- 5b. manufacturing.batch_id — nullable FK, does not affect existing rows
ALTER TABLE manufacturing ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_manufacturing_batch ON manufacturing(batch_id);

-- Helper: batch number generator (mirrors generate_ticket_number() pattern)
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TEXT AS $$
DECLARE
  seq INT;
  today TEXT;
BEGIN
  today := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq FROM inventory_batches WHERE DATE(created_at) = CURRENT_DATE;
  RETURN 'BATCH-' || today || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 6. PLATE ↔ DEALER ASSIGNMENTS — Manufacturer → Dealer assignment
--    (kept as its own table rather than a column on `plates`, so the
--    existing plates table is not touched at all)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plate_dealer_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id         TEXT NOT NULL,                    -- references plates.plate_id (not FK — plate_id is TEXT there too)
  dealer_admin_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  assigned_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'assigned', -- 'assigned' | 'installed' | 'returned'
  notes            TEXT,
  assigned_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plate_dealer_assignments_plate ON plate_dealer_assignments(plate_id);
CREATE INDEX IF NOT EXISTS idx_plate_dealer_assignments_dealer ON plate_dealer_assignments(dealer_admin_id);

-- ────────────────────────────────────────────────────────────
-- 7. INSTALLATION JOBS — Installer workflow (auto-created)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installation_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  plate_id           TEXT,
  customer_name      TEXT,
  customer_phone     TEXT,
  address            JSONB DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'claimed' | 'in_progress' | 'completed' | 'cancelled'
  installer_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  claimed_at         TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  completion_notes   TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id) -- one active job per order — prevents duplicate auto-creation
);
CREATE INDEX IF NOT EXISTS idx_installation_jobs_status ON installation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_installation_jobs_installer ON installation_jobs(installer_admin_id);

-- ────────────────────────────────────────────────────────────
-- 8. INSTALLATION JOB PHOTOS — completion report photo uploads
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installation_job_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  photo_url    TEXT NOT NULL,
  caption      TEXT,
  uploaded_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_installation_job_photos_job ON installation_job_photos(job_id);

-- ────────────────────────────────────────────────────────────
-- 9. DEALER COMMISSIONS — foundation ledger only, NO auto-calculation yet
--    (per brief: "UI placeholder abhi, calculation baad me")
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dealer_commissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_admin_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  plate_id         TEXT,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'paid'
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dealer_commissions_dealer ON dealer_commissions(dealer_admin_id);
-- NOTE: no trigger populates this table yet. It exists so the Dealer
-- dashboard has a real (empty) "Commissions" panel today, and so the
-- calculation engine (whenever the business rule is decided) has
-- somewhere to write to without a further migration.

-- ────────────────────────────────────────────────────────────
-- 10. AUTO-CREATE INSTALLATION JOB ON orders.installation_status → 'pending'
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_installation_job_on_pending()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.installation_status = 'pending'
     AND (OLD.installation_status IS DISTINCT FROM NEW.installation_status) THEN
    INSERT INTO installation_jobs (order_id, plate_id, customer_name, customer_phone, address)
    VALUES (NEW.id, NEW.plate_id, NEW.customer_name, NEW.customer_phone, COALESCE(NEW.shipping_address, '{}'::jsonb))
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_installation_pending ON orders;
CREATE TRIGGER trg_orders_installation_pending
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION create_installation_job_on_pending();

-- ────────────────────────────────────────────────────────────
-- 11. RLS — same "service_role only" pattern as every other admin table
-- ────────────────────────────────────────────────────────────
ALTER TABLE inventory_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE plate_dealer_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_job_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_commissions         ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_items' AND policyname='inventory_items_no_public_access') THEN
    CREATE POLICY inventory_items_no_public_access ON inventory_items FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_movements' AND policyname='inventory_movements_no_public_access') THEN
    CREATE POLICY inventory_movements_no_public_access ON inventory_movements FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_batches' AND policyname='inventory_batches_no_public_access') THEN
    CREATE POLICY inventory_batches_no_public_access ON inventory_batches FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plate_dealer_assignments' AND policyname='plate_dealer_assignments_no_public_access') THEN
    CREATE POLICY plate_dealer_assignments_no_public_access ON plate_dealer_assignments FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='installation_jobs' AND policyname='installation_jobs_no_public_access') THEN
    CREATE POLICY installation_jobs_no_public_access ON installation_jobs FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='installation_job_photos' AND policyname='installation_job_photos_no_public_access') THEN
    CREATE POLICY installation_job_photos_no_public_access ON installation_job_photos FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dealer_commissions' AND policyname='dealer_commissions_no_public_access') THEN
    CREATE POLICY dealer_commissions_no_public_access ON dealer_commissions FOR ALL TO anon, authenticated USING (false);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 12. STORAGE BUCKET — installation-photos (private; served via signed URL
--     through admin-data Edge Function, same pattern as voice-notes)
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('installation-photos', 'installation-photos', false, 10485760, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 13. ROLE PERMISSIONS — additive JSONB merge (existing keys untouched,
--     new resource keys added). super_admin's '*' wildcard already
--     covers everything below — not modified.
-- ────────────────────────────────────────────────────────────

-- Manufacturer (existing 'manufacturing' role): + inventory, batches, dealer_assignment
UPDATE admin_roles
SET permissions = permissions || '{"inventory":["read","write"],"batches":["read","write"],"dealer_assignment":["read","write"]}'::jsonb
WHERE name = 'manufacturing';

-- Dealer: + installations (read-only view of jobs tied to their assigned plates), commissions (read)
UPDATE admin_roles
SET permissions = permissions || '{"installations":["read"],"commissions":["read"]}'::jsonb
WHERE name = 'dealer';

-- Franchise: + installers (view/manage installers under them), franchise_overview
UPDATE admin_roles
SET permissions = permissions || '{"installers":["read","write"],"franchise_overview":["read"]}'::jsonb
WHERE name = 'franchise';

-- Installer: + installation_jobs (claim + update their own jobs)
UPDATE admin_roles
SET permissions = permissions || '{"installation_jobs":["read","write"]}'::jsonb
WHERE name = 'installer';

-- ============================================================
-- END OF MIGRATION 34
-- Verify with sql/34b_verify.sql after running this.
-- ============================================================
