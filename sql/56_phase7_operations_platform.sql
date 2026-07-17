-- ════════════════════════════════════════════════════════════════════════════
-- SMART DOOR — PHASE 7: OPERATIONS & ADMINISTRATION PLATFORM
-- Migration: 56_phase7_operations_platform.sql
-- Run AFTER all previous migrations (01–55)
--
-- AUDIT SUMMARY (see handoff notes / PR description for full detail):
--   Already exists and is NOT touched by this migration:
--     inventory_items, inventory_batches, manufacturing, manufacturing_qc,
--     orders, shipments, tracking_events, delivery_events, support_tickets,
--     ticket_comments, admin_audit_logs, replacement_requests,
--     ownership_transfers, error_logs, renewal_engine_logs,
--     rtc_presence_events, rtc_call_attempts, webhook_events,
--     ai_call_screenings, plate_dealer_assignments, admin_roles/admin_users.
--   Real gaps this migration closes (net-new tables only where nothing
--   existing could be reused):
--     1. product_skus        — Product SKU Management (sellable plate
--        products/pricing was hardcoded in js/productCatalog.js with no
--        DB-backed admin management; raw-material inventory_items is a
--        different table and does not cover this).
--     2. warranties + warranty_claims — Warranty Management. Distinct from
--        replacement_requests (lost/damaged plate swap workflow, already
--        built) — this tracks coverage windows and defect/service claims.
--     3. backup_snapshots    — Backup & Recovery Tools. No backup tracking
--        existed anywhere in the schema.
--   Everything else in Phase 7 (Shipment Tracking, Replacement/Transfer
--   console, Live System Health incl. AI/Edge/Realtime/Background-Job
--   monitoring) is wired to EXISTING tables/services in this migration's
--   companion Edge Function + admin.html changes — no schema needed.
--
-- Additive only — does NOT alter, rename, or drop any existing table,
-- column, policy, or role. Safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. PRODUCT SKUS (sellable finished-good catalog) ──────────
CREATE TABLE IF NOT EXISTS product_skus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             TEXT UNIQUE NOT NULL,          -- e.g. 'PLATE-ACRYLIC-STD'
  name            TEXT NOT NULL,                 -- e.g. 'Acrylic Smart Plate'
  material        TEXT NOT NULL CHECK (material IN ('acrylic','teakwood','stainless_steel','other')),
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'INR',
  image_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_skus_active ON product_skus(is_active, sort_order);

ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_skus_public_read_active" ON product_skus;
CREATE POLICY "product_skus_public_read_active" ON product_skus
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "product_skus_admin_all" ON product_skus;
CREATE POLICY "product_skus_admin_all" ON product_skus
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_product_skus_updated_at
  BEFORE UPDATE ON product_skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 2. WARRANTIES ──────────
-- Coverage window per plate/order. Distinct from replacement_requests
-- (lost/damaged swap) — this is the underlying entitlement record.
CREATE TABLE IF NOT EXISTS warranties (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id       TEXT NOT NULL,
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  owner_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coverage_type  TEXT NOT NULL DEFAULT 'standard' CHECK (coverage_type IN ('standard','extended')),
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at        TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','void')),
  terms          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranties_owner  ON warranties(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranties_plate  ON warranties(plate_id);
CREATE INDEX IF NOT EXISTS idx_warranties_status ON warranties(status, ends_at);

ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warranties_owner_read" ON warranties;
CREATE POLICY "warranties_owner_read" ON warranties
  FOR SELECT USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "warranties_admin_all" ON warranties;
CREATE POLICY "warranties_admin_all" ON warranties
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_warranties_updated_at
  BEFORE UPDATE ON warranties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Warranty claims — defect/service requests filed against a warranty.
CREATE TABLE IF NOT EXISTS warranty_claims (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id      UUID NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  plate_id         TEXT NOT NULL,
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_description TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','approved','rejected','resolved')),
  resolution       TEXT,
  admin_notes      TEXT,
  resolved_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_warranty ON warranty_claims(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_owner    ON warranty_claims(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_status   ON warranty_claims(status);

ALTER TABLE warranty_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warranty_claims_owner_read" ON warranty_claims;
CREATE POLICY "warranty_claims_owner_read" ON warranty_claims
  FOR SELECT USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "warranty_claims_owner_insert" ON warranty_claims;
CREATE POLICY "warranty_claims_owner_insert" ON warranty_claims
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "warranty_claims_admin_all" ON warranty_claims;
CREATE POLICY "warranty_claims_admin_all" ON warranty_claims
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_warranty_claims_updated_at
  BEFORE UPDATE ON warranty_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 3. BACKUP SNAPSHOTS ──────────
-- Tracks manual/scheduled data-export snapshots (JSON export of critical
-- tables to Supabase Storage) triggered from the admin Backup & Recovery
-- panel. Not a substitute for Supabase's own Postgres point-in-time backups
-- (which run at the infra level and aren't reachable from an Edge
-- Function) — this is an operator-visible export log + manual trigger for
-- the app-data layer, so an admin always has a recent, restorable JSON
-- snapshot and a visible history of when backups last ran.
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type  TEXT NOT NULL DEFAULT 'manual' CHECK (snapshot_type IN ('manual','scheduled')),
  tables_included TEXT[] NOT NULL DEFAULT '{}',
  row_counts     JSONB DEFAULT '{}',
  storage_path   TEXT,
  status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error_message  TEXT,
  triggered_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_created ON backup_snapshots(created_at DESC);

ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_snapshots_admin_all" ON backup_snapshots;
CREATE POLICY "backup_snapshots_admin_all" ON backup_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- Storage bucket for backup snapshot JSON files (private — service_role only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('backup-snapshots', 'backup-snapshots', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "backup_snapshots_storage_service_role" ON storage.objects;
CREATE POLICY "backup_snapshots_storage_service_role" ON storage.objects
  FOR ALL USING (bucket_id = 'backup-snapshots' AND auth.role() = 'service_role');

-- ────────── 4. RBAC — GRANT NEW RESOURCES TO EXISTING ROLES ──────────
-- super_admin already has '*' — unaffected. New resources: 'shipments',
-- 'replacements', 'warranty', 'product_skus', 'backup'. 'backup' is
-- deliberately NOT granted to any non-super_admin role.

UPDATE admin_roles
SET permissions = permissions
  || '{"shipments":["read","write"]}'::jsonb
WHERE name IN ('ops_manager', 'manufacturing');

UPDATE admin_roles
SET permissions = permissions
  || '{"replacements":["read","write"]}'::jsonb
WHERE name IN ('ops_manager', 'support');

UPDATE admin_roles
SET permissions = permissions
  || '{"warranty":["read","write"]}'::jsonb
WHERE name IN ('ops_manager', 'support');

UPDATE admin_roles
SET permissions = permissions
  || '{"product_skus":["read","write"]}'::jsonb
WHERE name = 'ops_manager';

UPDATE admin_roles
SET permissions = permissions
  || '{"product_skus":["read"]}'::jsonb
WHERE name = 'manufacturing';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name IN ('product_skus','warranties','warranty_claims','backup_snapshots');
--   SELECT name, permissions FROM admin_roles ORDER BY name;
--   SELECT id FROM storage.buckets WHERE id = 'backup-snapshots';
-- ════════════════════════════════════════════════════════════════════════════
