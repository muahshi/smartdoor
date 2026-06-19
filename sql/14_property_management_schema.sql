-- ============================================================
-- SMART DOOR — PHASE 13: APARTMENT & SOCIETY PLATFORM
-- Migration: 14_property_management_schema.sql
-- Run AFTER all previous migrations (01–13)
--
-- Adds:
--   organizations       — Top-level entity (society / builder / enterprise)
--   properties          — Building / complex under an org
--   towers              — Tower / block within a property
--   floors              — Floor within a tower
--   units               — Flat / office unit on a floor
--   residents           — Owner / tenant / family member per unit
--   guards              — Security guard accounts per property
--   visitor_passes      — Pre-approved / QR passes issued by residents
--   society_admins      — Admin role grants per property
--   delivery_logs       — Delivery-specific tracking (Swiggy, Amazon, etc.)
--   emergency_events    — Society-wide emergency alerts
--   common_area_qr      — QR plates for clubhouse, gym, parking, etc.
--
-- Additive only — does NOT touch any existing table or RLS policy.
-- Single-home workflow fully preserved.
-- ============================================================

-- ────────── 0. EXTENSION (idempotent) ──────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────── 1. ORGANIZATIONS ──────────
-- Top-level entity: a residential society, builder group, or enterprise.
CREATE TABLE IF NOT EXISTS organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  org_type        TEXT NOT NULL DEFAULT 'society'
                    CHECK (org_type IN ('society', 'builder', 'enterprise', 'individual')),
  contact_email   TEXT,
  contact_phone   TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  logo_url        TEXT,
  billing_plan    TEXT NOT NULL DEFAULT 'per_unit'
                    CHECK (billing_plan IN ('per_home', 'per_unit', 'per_society', 'enterprise')),
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(org_type);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active);

-- ────────── 2. PROPERTIES ──────────
-- A building / gated community / office complex under an org.
CREATE TABLE IF NOT EXISTS properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                  -- "Prestige Lakeside Habitat"
  property_type   TEXT NOT NULL DEFAULT 'residential'
                    CHECK (property_type IN ('residential', 'commercial', 'mixed', 'gated_community')),
  total_towers    INTEGER DEFAULT 1,
  total_units     INTEGER DEFAULT 0,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(org_id);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);

-- ────────── 3. TOWERS ──────────
-- Tower / block / wing within a property.
CREATE TABLE IF NOT EXISTS towers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                  -- "Tower A", "Block 3", "Wing East"
  total_floors    INTEGER DEFAULT 1,
  total_units     INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE towers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_towers_property ON towers(property_id);
COMMENT ON TABLE towers IS 'Tower / block / wing within a property. Single-tower properties still have one row here.';

-- ────────── 4. FLOORS ──────────
CREATE TABLE IF NOT EXISTS floors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tower_id        UUID NOT NULL REFERENCES towers(id) ON DELETE CASCADE,
  floor_number    INTEGER NOT NULL,               -- 0 = Ground, 1, 2 ...
  floor_label     TEXT,                           -- "Ground Floor", "Mezzanine", "Terrace"
  total_units     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE floors ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_floors_tower ON floors(tower_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_floors_tower_num ON floors(tower_id, floor_number);

-- ────────── 5. UNITS ──────────
-- Individual flat / office / shop.
CREATE TABLE IF NOT EXISTS units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id        UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  tower_id        UUID NOT NULL REFERENCES towers(id) ON DELETE CASCADE,  -- denorm for fast lookups
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number     TEXT NOT NULL,                  -- "702", "A-12", "Shop-3"
  unit_type       TEXT NOT NULL DEFAULT 'apartment'
                    CHECK (unit_type IN ('apartment', 'villa', 'office', 'shop', 'penthouse', 'studio')),
  -- Optional link to existing SmartDoor owner if unit is self-managed
  linked_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Optional link to physical plate
  plate_id        TEXT REFERENCES plates(plate_id) ON DELETE SET NULL,
  is_occupied     BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_units_floor ON units(floor_id);
CREATE INDEX IF NOT EXISTS idx_units_tower ON units(tower_id);
CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_plate ON units(plate_id);
CREATE INDEX IF NOT EXISTS idx_units_owner ON units(linked_owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_property_number ON units(property_id, tower_id, unit_number);

-- ────────── 6. RESIDENTS ──────────
-- Every person who lives / works in a unit.
CREATE TABLE IF NOT EXISTS residents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- Link to existing SmartDoor user if they already have an account
  linked_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  resident_type   TEXT NOT NULL DEFAULT 'owner'
                    CHECK (resident_type IN ('owner', 'tenant', 'family', 'staff')),
  is_primary      BOOLEAN DEFAULT FALSE,          -- Primary contact for the unit
  routing_priority INTEGER DEFAULT 1,             -- 1 = first to be notified
  notification_prefs JSONB DEFAULT '{"whatsapp": true, "sms": true, "call": true}',
  -- Tenancy fields
  lease_start     DATE,
  lease_end       DATE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE residents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_residents_unit ON residents(unit_id);
CREATE INDEX IF NOT EXISTS idx_residents_property ON residents(property_id);
CREATE INDEX IF NOT EXISTS idx_residents_phone ON residents(phone);
CREATE INDEX IF NOT EXISTS idx_residents_user ON residents(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_residents_primary ON residents(unit_id, is_primary) WHERE is_primary = TRUE;

-- ────────── 7. SOCIETY ADMINS ──────────
-- Role grants: who can manage which property.
CREATE TABLE IF NOT EXISTS society_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  role            TEXT NOT NULL DEFAULT 'admin'
                    CHECK (role IN ('super_admin', 'admin', 'manager', 'viewer')),
  permissions     JSONB DEFAULT '{"manage_units": true, "manage_residents": true, "view_analytics": true, "manage_guards": true, "generate_reports": true}',
  is_active       BOOLEAN DEFAULT TRUE,
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, auth_user_id)
);

ALTER TABLE society_admins ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_society_admins_property ON society_admins(property_id);
CREATE INDEX IF NOT EXISTS idx_society_admins_user ON society_admins(auth_user_id);

-- ────────── 8. GUARDS ──────────
-- Security guard accounts per property.
CREATE TABLE IF NOT EXISTS guards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  auth_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  employee_id     TEXT,
  agency_name     TEXT,
  shift           TEXT DEFAULT 'day'
                    CHECK (shift IN ('day', 'night', 'rotating')),
  shift_start     TIME,
  shift_end       TIME,
  assigned_gate   TEXT,                           -- "Main Gate", "Gate 2"
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_guards_property ON guards(property_id);
CREATE INDEX IF NOT EXISTS idx_guards_phone ON guards(phone);

-- ────────── 9. VISITOR PASSES ──────────
-- Pre-approved passes issued by residents. Replaces manual phone calls.
CREATE TABLE IF NOT EXISTS visitor_passes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_code       TEXT UNIQUE NOT NULL DEFAULT upper(substring(gen_random_uuid()::TEXT, 1, 8)),
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  issued_by       UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  pass_type       TEXT NOT NULL DEFAULT 'guest'
                    CHECK (pass_type IN ('guest', 'delivery', 'worker', 'cab', 'one_time', 'recurring')),
  visitor_name    TEXT NOT NULL,
  visitor_phone   TEXT,
  visitor_vehicle TEXT,
  purpose         TEXT,
  -- Validity window
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  -- Usage tracking
  max_uses        INTEGER DEFAULT 1,              -- NULL = unlimited
  use_count       INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  -- Delivery classification
  delivery_partner TEXT,                          -- 'amazon' | 'flipkart' | 'swiggy' | 'zomato' | 'delhivery' | 'other'
  -- QR pass URL (generated on create)
  qr_url          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE visitor_passes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_visitor_passes_unit ON visitor_passes(unit_id);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_property ON visitor_passes(property_id);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_code ON visitor_passes(pass_code);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_status ON visitor_passes(status);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_valid ON visitor_passes(valid_from, valid_until);

-- ────────── 10. DELIVERY LOGS ──────────
-- Separate delivery tracking beyond visitor_logs.
CREATE TABLE IF NOT EXISTS delivery_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,
  guard_id        UUID REFERENCES guards(id) ON DELETE SET NULL,
  visitor_pass_id UUID REFERENCES visitor_passes(id) ON DELETE SET NULL,
  partner         TEXT NOT NULL DEFAULT 'other'
                    CHECK (partner IN ('amazon', 'flipkart', 'swiggy', 'zomato', 'blinkit', 'delhivery', 'bluedart', 'dtdc', 'courier', 'other')),
  delivery_person_name TEXT,
  delivery_person_phone TEXT,
  awb_number      TEXT,
  status          TEXT NOT NULL DEFAULT 'arrived'
                    CHECK (status IN ('arrived', 'delivered', 'returned', 'held_at_gate')),
  arrived_at      TIMESTAMPTZ DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  photo_url       TEXT,                           -- Guard can capture photo
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_delivery_logs_property ON delivery_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_unit ON delivery_logs(unit_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_partner ON delivery_logs(partner);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);

-- ────────── 11. EMERGENCY EVENTS ──────────
-- Society-wide emergency broadcast + response tracking.
CREATE TABLE IF NOT EXISTS emergency_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  triggered_by    UUID,                           -- guard or society_admin auth_user_id
  triggered_by_role TEXT DEFAULT 'guard'
                    CHECK (triggered_by_role IN ('guard', 'admin', 'resident', 'system')),
  event_type      TEXT NOT NULL
                    CHECK (event_type IN ('fire', 'medical', 'security', 'evacuation', 'flood', 'power', 'other')),
  severity        TEXT DEFAULT 'high'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description     TEXT,
  location_detail TEXT,                           -- "Tower B, Floor 3"
  status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  notification_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emergency_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_emergency_events_property ON emergency_events(property_id);
CREATE INDEX IF NOT EXISTS idx_emergency_events_status ON emergency_events(status);
CREATE INDEX IF NOT EXISTS idx_emergency_events_type ON emergency_events(event_type);

-- ────────── 12. COMMON AREA QR ──────────
-- QR plates for clubhouse, gym, parking, reception etc.
CREATE TABLE IF NOT EXISTS common_area_qr (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  area_name       TEXT NOT NULL,                  -- "Clubhouse", "Gym", "Parking B"
  area_type       TEXT NOT NULL DEFAULT 'other'
                    CHECK (area_type IN ('clubhouse', 'gym', 'parking', 'reception', 'security_desk', 'rooftop', 'swimming_pool', 'garden', 'other')),
  qr_slug         TEXT UNIQUE NOT NULL,
  plate_id        TEXT REFERENCES plates(plate_id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE common_area_qr ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_common_area_property ON common_area_qr(property_id);

-- ────────── 13. GUARD CHECK-IN LOG ──────────
-- Visitor entries logged at the gate by a guard.
CREATE TABLE IF NOT EXISTS guard_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guard_id        UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,
  visitor_pass_id UUID REFERENCES visitor_passes(id) ON DELETE SET NULL,
  visitor_name    TEXT NOT NULL,
  visitor_phone   TEXT,
  visitor_vehicle TEXT,
  purpose         TEXT,
  checkin_type    TEXT DEFAULT 'manual'
                    CHECK (checkin_type IN ('manual', 'qr_scan', 'pass_code', 'delivery')),
  -- Approval flow
  approval_status TEXT DEFAULT 'pending'
                    CHECK (approval_status IN ('pending', 'approved', 'denied', 'auto_approved')),
  approved_by_resident_id UUID REFERENCES residents(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  denial_reason   TEXT,
  -- Times
  checked_in_at   TIMESTAMPTZ DEFAULT NOW(),
  checked_out_at  TIMESTAMPTZ,
  photo_url       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guard_checkins ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_guard_checkins_property ON guard_checkins(property_id);
CREATE INDEX IF NOT EXISTS idx_guard_checkins_guard ON guard_checkins(guard_id);
CREATE INDEX IF NOT EXISTS idx_guard_checkins_unit ON guard_checkins(unit_id);
CREATE INDEX IF NOT EXISTS idx_guard_checkins_status ON guard_checkins(approval_status);
CREATE INDEX IF NOT EXISTS idx_guard_checkins_date ON guard_checkins(checked_in_at);

-- ────────── 14. BILLING: SOCIETY SUBSCRIPTIONS ──────────
-- Per-society / per-property billing separate from per-home billing.
CREATE TABLE IF NOT EXISTS society_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  plan            TEXT NOT NULL DEFAULT 'society_basic'
                    CHECK (plan IN ('society_basic', 'society_pro', 'enterprise')),
  billing_model   TEXT NOT NULL DEFAULT 'per_unit'
                    CHECK (billing_model IN ('per_home', 'per_unit', 'flat_rate', 'enterprise')),
  price_per_unit  NUMERIC(10, 2),
  flat_price      NUMERIC(10, 2),
  active_units    INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active', 'trial', 'expired', 'cancelled')),
  trial_ends_at   TIMESTAMPTZ,
  start_date      TIMESTAMPTZ DEFAULT NOW(),
  expiry_date     TIMESTAMPTZ,
  razorpay_sub_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE society_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_society_subs_org ON society_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_society_subs_property ON society_subscriptions(property_id);

-- ────────── 15. ANALYTICS VIEWS ──────────

-- Society visitor volume — daily rollup
CREATE OR REPLACE VIEW society_visitor_daily AS
SELECT
  gc.property_id,
  DATE(gc.checked_in_at)                               AS visit_date,
  COUNT(*)                                              AS total_visitors,
  COUNT(*) FILTER (WHERE gc.checkin_type = 'delivery') AS deliveries,
  COUNT(*) FILTER (WHERE gc.purpose = 'guest')          AS guests,
  COUNT(*) FILTER (WHERE gc.approval_status = 'denied') AS denied,
  COUNT(*) FILTER (WHERE gc.checked_out_at IS NOT NULL) AS checked_out
FROM guard_checkins gc
GROUP BY gc.property_id, DATE(gc.checked_in_at);

COMMENT ON VIEW society_visitor_daily IS 'Daily visitor volume rollup per property for society analytics dashboard.';

-- Active units per property
CREATE OR REPLACE VIEW property_occupancy AS
SELECT
  p.id                                         AS property_id,
  p.name                                       AS property_name,
  COUNT(u.id)                                  AS total_units,
  COUNT(u.id) FILTER (WHERE u.is_occupied)     AS occupied_units,
  COUNT(u.id) FILTER (WHERE NOT u.is_occupied) AS vacant_units,
  COUNT(r.id)                                  AS total_residents
FROM properties p
LEFT JOIN units u ON u.property_id = p.id AND u.is_active
LEFT JOIN residents r ON r.property_id = p.id AND r.is_active
GROUP BY p.id, p.name;

-- Delivery partner breakdown
CREATE OR REPLACE VIEW delivery_partner_stats AS
SELECT
  property_id,
  partner,
  COUNT(*)                                                    AS total_deliveries,
  COUNT(*) FILTER (WHERE status = 'delivered')                AS delivered,
  COUNT(*) FILTER (WHERE status = 'held_at_gate')             AS held,
  DATE_TRUNC('day', arrived_at)                               AS delivery_date
FROM delivery_logs
GROUP BY property_id, partner, DATE_TRUNC('day', arrived_at);

-- ────────── 16. RLS POLICIES ──────────

-- Organizations: service_role full access; org admins read their own
CREATE POLICY "orgs_service_all" ON organizations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "orgs_admin_read" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM society_admins sa
      JOIN properties p ON p.org_id = organizations.id
      WHERE sa.auth_user_id = auth.uid()
        AND sa.property_id = p.id
        AND sa.is_active
    )
  );

-- Properties
CREATE POLICY "properties_service_all" ON properties
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "properties_admin_read" ON properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM society_admins sa
      WHERE sa.auth_user_id = auth.uid()
        AND sa.property_id = properties.id
        AND sa.is_active
    )
  );

-- Guards: can read their own property
CREATE POLICY "guards_service_all" ON guards
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "guards_self_read" ON guards
  FOR SELECT USING (auth_user_id = auth.uid());

-- Visitor passes: residents can manage their own
CREATE POLICY "vpasses_service_all" ON visitor_passes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "vpasses_resident_own" ON visitor_passes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = visitor_passes.issued_by
        AND r.linked_user_id = auth.uid()
    )
  );

-- Guard checkins: guards and admins
CREATE POLICY "checkins_service_all" ON guard_checkins
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "checkins_guard_insert" ON guard_checkins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM guards g
      WHERE g.id = guard_checkins.guard_id
        AND g.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "checkins_admin_read" ON guard_checkins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM society_admins sa
      WHERE sa.auth_user_id = auth.uid()
        AND sa.property_id = guard_checkins.property_id
        AND sa.is_active
    )
  );

-- Emergency events: admins and guards
CREATE POLICY "emergency_service_all" ON emergency_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "emergency_property_read" ON emergency_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM society_admins sa
      WHERE sa.auth_user_id = auth.uid()
        AND sa.property_id = emergency_events.property_id
        AND sa.is_active
    )
  );

-- Residents: can read their own unit
CREATE POLICY "residents_service_all" ON residents
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "residents_self_read" ON residents
  FOR SELECT USING (linked_user_id = auth.uid());

-- Society admins: admin full access to their properties
CREATE POLICY "sadmins_service_all" ON society_admins
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "sadmins_self_read" ON society_admins
  FOR SELECT USING (auth_user_id = auth.uid());

-- Towers / Floors / Units: admin read
CREATE POLICY "towers_service_all" ON towers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "floors_service_all" ON floors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "units_service_all" ON units FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "common_area_service_all" ON common_area_qr FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "delivery_logs_service_all" ON delivery_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "society_subs_service_all" ON society_subscriptions FOR ALL USING (auth.role() = 'service_role');

-- ────────── 17. HELPER FUNCTIONS ──────────

-- Get all residents for a unit ordered by routing priority
CREATE OR REPLACE FUNCTION get_unit_residents(p_unit_id UUID)
RETURNS TABLE (
  resident_id UUID,
  full_name TEXT,
  phone TEXT,
  resident_type TEXT,
  routing_priority INTEGER,
  notification_prefs JSONB
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, full_name, phone, resident_type, routing_priority, notification_prefs
  FROM residents
  WHERE unit_id = p_unit_id AND is_active = TRUE
  ORDER BY routing_priority ASC, is_primary DESC;
$$;

-- Validate a visitor pass
CREATE OR REPLACE FUNCTION validate_visitor_pass(p_pass_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pass visitor_passes%ROWTYPE;
  v_unit units%ROWTYPE;
BEGIN
  SELECT * INTO v_pass FROM visitor_passes WHERE pass_code = upper(p_pass_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'pass_not_found');
  END IF;

  IF v_pass.status != 'active' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'pass_' || v_pass.status);
  END IF;

  IF v_pass.valid_until IS NOT NULL AND v_pass.valid_until < NOW() THEN
    UPDATE visitor_passes SET status = 'expired' WHERE id = v_pass.id;
    RETURN jsonb_build_object('valid', false, 'reason', 'pass_expired');
  END IF;

  IF v_pass.max_uses IS NOT NULL AND v_pass.use_count >= v_pass.max_uses THEN
    UPDATE visitor_passes SET status = 'used' WHERE id = v_pass.id;
    RETURN jsonb_build_object('valid', false, 'reason', 'pass_max_uses');
  END IF;

  -- Increment use count
  UPDATE visitor_passes
  SET use_count = use_count + 1,
      status = CASE WHEN max_uses IS NOT NULL AND (use_count + 1) >= max_uses THEN 'used' ELSE status END
  WHERE id = v_pass.id;

  SELECT * INTO v_unit FROM units WHERE id = v_pass.unit_id;

  RETURN jsonb_build_object(
    'valid', true,
    'pass_id', v_pass.id,
    'unit_id', v_pass.unit_id,
    'unit_number', v_unit.unit_number,
    'visitor_name', v_pass.visitor_name,
    'pass_type', v_pass.pass_type,
    'purpose', v_pass.purpose
  );
END;
$$;

-- Society-wide analytics snapshot (for admin dashboard)
CREATE OR REPLACE FUNCTION get_society_stats(p_property_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_units',       (SELECT COUNT(*) FROM units WHERE property_id = p_property_id AND is_active),
    'occupied_units',    (SELECT COUNT(*) FROM units WHERE property_id = p_property_id AND is_occupied),
    'total_residents',   (SELECT COUNT(*) FROM residents WHERE property_id = p_property_id AND is_active),
    'active_guards',     (SELECT COUNT(*) FROM guards WHERE property_id = p_property_id AND is_active),
    'visitors_today',    (SELECT COUNT(*) FROM guard_checkins WHERE property_id = p_property_id AND checked_in_at >= CURRENT_DATE),
    'deliveries_today',  (SELECT COUNT(*) FROM delivery_logs WHERE property_id = p_property_id AND arrived_at >= CURRENT_DATE),
    'active_passes',     (SELECT COUNT(*) FROM visitor_passes WHERE property_id = p_property_id AND status = 'active'),
    'open_emergencies',  (SELECT COUNT(*) FROM emergency_events WHERE property_id = p_property_id AND status = 'active')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ────────── 18. REALTIME ──────────
ALTER PUBLICATION supabase_realtime ADD TABLE guard_checkins;
ALTER PUBLICATION supabase_realtime ADD TABLE visitor_passes;
ALTER PUBLICATION supabase_realtime ADD TABLE emergency_events;
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_logs;

-- ────────── DONE ──────────
-- Phase 13 schema applied.
-- All existing tables, RLS policies, and single-home workflows unchanged.

