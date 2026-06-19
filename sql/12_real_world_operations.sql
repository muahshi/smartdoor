-- ============================================================
-- SMART DOOR — PHASE 11: REAL WORLD OPERATIONS SCHEMA
-- Migration: 12_real_world_operations.sql
-- Run AFTER all previous migrations (01–11)
--
-- Adds:
--   activation_events       — Plate lifecycle event log (Activated/Deactivated/Transferred/Renewed/Expired)
--   manufacturing_qc        — Quality control checklist per manufacturing item
--   retention_events        — Owner activity pings for DAU/WAU/MAU
--   replacement_requests    — Lost / damaged plate replacement workflow
--   ownership_transfers     — House sold / tenant changed / new owner workflow
--   packaging_records       — Tracks which packaging documents were generated
--   activation_metrics_view — Live, computed activation funnel metrics (no placeholders)
--   retention_metrics_view  — Live, computed DAU/WAU/MAU + renewal/retention rate
--   get_family_members_for_plate() — SECURITY DEFINER RPC so the public
--     visitor route can fan out an SOS alert without family_members ever
--     being readable by anon directly (RLS on that table stays untouched).
--
-- Additive only — does NOT touch existing tables, columns, or policies.
-- ============================================================

-- ────────── 1. ACTIVATION EVENTS ──────────
-- Full plate lifecycle audit trail: Activated | Deactivated | Transferred | Renewed | Expired

CREATE TABLE IF NOT EXISTS activation_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id    TEXT NOT NULL,                       -- SD-ABX9K7
  owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('activated','deactivated','transferred','renewed','expired')),
  event_detail TEXT,
  actor       TEXT DEFAULT 'system',                -- 'system' | 'admin' | 'owner'
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_events_plate   ON activation_events(plate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activation_events_owner   ON activation_events(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activation_events_type    ON activation_events(event_type, created_at DESC);

ALTER TABLE activation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activation_events_owner_read" ON activation_events
  FOR SELECT USING (
    owner_id = get_my_owner_id()
  );

CREATE POLICY "activation_events_admin_all" ON activation_events
  FOR ALL USING (auth.role() = 'service_role');

-- ────────── 2. MANUFACTURING QC ──────────

CREATE TABLE IF NOT EXISTS manufacturing_qc (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturing_id   UUID NOT NULL REFERENCES manufacturing(id) ON DELETE CASCADE,
  qr_verified        BOOLEAN DEFAULT FALSE,
  text_verified      BOOLEAN DEFAULT FALSE,
  material_verified  BOOLEAN DEFAULT FALSE,
  packaging_verified BOOLEAN DEFAULT FALSE,
  approved_by        TEXT,                          -- operator name / admin email
  approved_at        TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_manufacturing ON manufacturing_qc(manufacturing_id);

ALTER TABLE manufacturing_qc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manufacturing_qc_admin_only" ON manufacturing_qc
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_manufacturing_qc_updated_at
  BEFORE UPDATE ON manufacturing_qc
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 3. RETENTION EVENTS ──────────
-- Lightweight activity ping (login / dashboard view / app open) used to
-- compute DAU / WAU / MAU. Insert-heavy, read by admin analytics only.

CREATE TABLE IF NOT EXISTS retention_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL DEFAULT 'activity',     -- 'login' | 'dashboard_view' | 'app_open' | 'activity'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_owner_date ON retention_events(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_date        ON retention_events(created_at DESC);

ALTER TABLE retention_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_events_owner_insert" ON retention_events
  FOR INSERT WITH CHECK (
    owner_id = get_my_owner_id()
  );

CREATE POLICY "retention_events_admin_all" ON retention_events
  FOR ALL USING (auth.role() = 'service_role');

-- ────────── 4. REPLACEMENT REQUESTS ──────────
-- Lost / damaged plate → replacement QR → reissue

CREATE TABLE IF NOT EXISTS replacement_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id             TEXT NOT NULL,
  owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason               TEXT NOT NULL CHECK (reason IN ('lost','damaged')),
  status               TEXT NOT NULL DEFAULT 'requested'
                         CHECK (status IN ('requested','approved','shipped','completed','rejected')),
  old_qr_deactivated   BOOLEAN DEFAULT FALSE,
  replacement_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  notes                TEXT,
  requested_at         TIMESTAMPTZ DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replacement_owner  ON replacement_requests(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replacement_plate   ON replacement_requests(plate_id);
CREATE INDEX IF NOT EXISTS idx_replacement_status  ON replacement_requests(status);

ALTER TABLE replacement_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replacement_owner_read" ON replacement_requests
  FOR SELECT USING (
    owner_id = get_my_owner_id()
  );

CREATE POLICY "replacement_owner_insert" ON replacement_requests
  FOR INSERT WITH CHECK (
    owner_id = get_my_owner_id()
  );

CREATE POLICY "replacement_admin_all" ON replacement_requests
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_replacement_updated_at
  BEFORE UPDATE ON replacement_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 5. OWNERSHIP TRANSFERS ──────────
-- House sold / tenant changed / new owner. QR + plate_id stay identical —
-- only plates.owner_id changes once the transfer completes.

CREATE TABLE IF NOT EXISTS ownership_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id          TEXT NOT NULL,
  previous_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  new_owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  reason            TEXT NOT NULL CHECK (reason IN ('house_sold','tenant_changed','new_owner')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','cancelled')),
  initiated_by      TEXT DEFAULT 'owner',           -- 'owner' | 'admin'
  notes             TEXT,
  transferred_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_plate     ON ownership_transfers(plate_id);
CREATE INDEX IF NOT EXISTS idx_transfer_prev_owner ON ownership_transfers(previous_owner_id);
CREATE INDEX IF NOT EXISTS idx_transfer_status     ON ownership_transfers(status);

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_owner_read" ON ownership_transfers
  FOR SELECT USING (
    previous_owner_id = get_my_owner_id()
    OR new_owner_id = get_my_owner_id()
  );

CREATE POLICY "transfer_owner_insert" ON ownership_transfers
  FOR INSERT WITH CHECK (
    previous_owner_id = get_my_owner_id()
  );

CREATE POLICY "transfer_admin_all" ON ownership_transfers
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_transfer_updated_at
  BEFORE UPDATE ON ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 6. PACKAGING RECORDS ──────────
-- Tracks which printable documents were generated for a manufacturing item
-- before it leaves the floor: Packing Slip, Box Label, QR Verification
-- Sheet, Customer Card.

CREATE TABLE IF NOT EXISTS packaging_records (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturing_id            UUID NOT NULL REFERENCES manufacturing(id) ON DELETE CASCADE,
  order_id                    UUID REFERENCES orders(id) ON DELETE SET NULL,
  packing_slip_generated      BOOLEAN DEFAULT FALSE,
  box_label_generated         BOOLEAN DEFAULT FALSE,
  qr_verification_generated   BOOLEAN DEFAULT FALSE,
  customer_card_generated     BOOLEAN DEFAULT FALSE,
  generated_by                TEXT,
  generated_at                TIMESTAMPTZ DEFAULT NOW(),
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packaging_mfg ON packaging_records(manufacturing_id);

ALTER TABLE packaging_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packaging_admin_only" ON packaging_records
  FOR ALL USING (auth.role() = 'service_role');

-- ────────── 7. ACTIVATION METRICS (LIVE VIEW — no placeholders) ──────────

CREATE OR REPLACE VIEW activation_metrics_view AS
SELECT
  (SELECT COUNT(*) FROM orders)                                                  AS total_orders,
  (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid')                    AS paid_orders,
  (SELECT COUNT(*) FROM plates WHERE status = 'active')                          AS activated_plates,
  (SELECT COUNT(*) FROM orders o
     WHERE o.payment_status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM plates p WHERE p.plate_id = o.plate_id AND p.status = 'active'
       ))                                                                        AS pending_activation,
  ROUND(
    CASE WHEN (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid') = 0 THEN 0
    ELSE (SELECT COUNT(*) FROM plates WHERE status = 'active')::NUMERIC
         / (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid')::NUMERIC * 100
    END, 2)                                                                      AS activation_rate_pct,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (p.activation_date - o.created_at)) / 3600)::NUMERIC, 1)
     FROM plates p
     JOIN orders o ON o.plate_id = p.plate_id
     WHERE p.activation_date IS NOT NULL)                                        AS avg_activation_hours;

-- ────────── 8. RETENTION METRICS (LIVE VIEW — no placeholders) ──────────

CREATE OR REPLACE VIEW retention_metrics_view AS
SELECT
  (SELECT COUNT(DISTINCT owner_id) FROM retention_events WHERE created_at >= NOW() - INTERVAL '1 day')  AS daily_active_owners,
  (SELECT COUNT(DISTINCT owner_id) FROM retention_events WHERE created_at >= NOW() - INTERVAL '7 days') AS weekly_active_owners,
  (SELECT COUNT(DISTINCT owner_id) FROM retention_events WHERE created_at >= NOW() - INTERVAL '30 days') AS monthly_active_owners,
  (SELECT COUNT(*) FROM users)                                                                           AS total_owners,
  ROUND(
    CASE WHEN (SELECT COUNT(*) FROM users) = 0 THEN 0
    ELSE (SELECT COUNT(DISTINCT owner_id) FROM retention_events WHERE created_at >= NOW() - INTERVAL '30 days')::NUMERIC
         / (SELECT COUNT(*) FROM users)::NUMERIC * 100
    END, 2)                                                                                              AS retention_rate_pct,
  (SELECT COUNT(*) FROM activation_events WHERE event_type = 'renewed')                                  AS total_renewals,
  (SELECT COUNT(*) FROM activation_events WHERE event_type = 'expired')                                  AS total_expirations,
  ROUND(
    CASE WHEN (SELECT COUNT(*) FROM activation_events WHERE event_type IN ('renewed','expired')) = 0 THEN 0
    ELSE (SELECT COUNT(*) FROM activation_events WHERE event_type = 'renewed')::NUMERIC
         / (SELECT COUNT(*) FROM activation_events WHERE event_type IN ('renewed','expired'))::NUMERIC * 100
    END, 2)                                                                                              AS renewal_rate_pct;

-- ────────── 9. SOS FAN-OUT FOR ANONYMOUS VISITORS ──────────
-- family_members keeps its existing owner-only RLS policy untouched.
-- This SECURITY DEFINER function lets the public visitor route (anon key)
-- fetch only the minimal fields needed to fan out an SOS alert, and only
-- for a plate that is currently active.

CREATE OR REPLACE FUNCTION get_family_members_for_plate(p_plate_id TEXT)
RETURNS TABLE(id UUID, name TEXT, phone TEXT, priority INTEGER, is_active BOOLEAN)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT fm.id, fm.name, fm.phone, fm.priority, fm.is_active
  FROM family_members fm
  JOIN plates pl ON pl.owner_id = fm.owner_id
  WHERE pl.qr_slug = UPPER(TRIM(p_plate_id))
    AND pl.status = 'active'
    AND fm.is_active = TRUE
  ORDER BY fm.priority ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_family_members_for_plate(TEXT) TO anon, authenticated;

-- ────────── 9b. SUBSCRIPTION LIFECYCLE FOR ANONYMOUS VISITORS ──────────
-- subscriptions keeps its existing owner-only RLS policy untouched.
-- getPlateBySlug() (services/plates.js, an unmodified completed system)
-- filters its own subscription lookup on status = 'active', but nothing
-- in the current renewal pipeline actually flips that flag on expiry —
-- so the grace-period engine (services/gracePeriod.js) needs a read of
-- the real expiry_date that doesn't depend on that flag. This function
-- exposes only plan/status/expiry_date for the plate's current owner.

CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT s.plan, s.status, s.expiry_date
  FROM subscriptions s
  JOIN plates pl ON pl.owner_id = s.owner_id
  WHERE pl.qr_slug = UPPER(TRIM(p_plate_id))
  ORDER BY s.expiry_date DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_status_for_plate(TEXT) TO anon, authenticated;

-- ────────── 10. REALTIME ──────────
ALTER PUBLICATION supabase_realtime ADD TABLE activation_events;
ALTER PUBLICATION supabase_realtime ADD TABLE replacement_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE ownership_transfers;
