-- ============================================================
-- SMART DOOR — PHASE 6: COMMERCE ENGINE SCHEMA
-- Run AFTER all previous migrations (01–06)
-- Adds: orders, payments, manufacturing, tracking_events
-- Additive only — does NOT touch existing tables.
-- ============================================================

-- ────────── 1. ORDERS ──────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         TEXT UNIQUE NOT NULL,              -- e.g. SD-ORD-20260618-0001
  owner_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  plate_id             TEXT,                              -- SD-ABX9K7 — set after payment
  product_type         TEXT NOT NULL DEFAULT 'acrylic',  -- 'acrylic' | 'stainless' | 'teakwood'
  product_price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  subscription_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed' | 'refunded'
  manufacturing_status TEXT NOT NULL DEFAULT 'queued',   -- 'queued' | 'in_production' | 'packed' | 'dispatched' | 'delivered'
  tracking_status      TEXT NOT NULL DEFAULT 'order_placed', -- see tracking_events.event_type
  customer_name        TEXT,
  customer_email       TEXT,
  customer_phone       TEXT,
  shipping_address     JSONB DEFAULT '{}',               -- { line1, city, state, pincode, country }
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 2. PAYMENTS ──────────
CREATE TABLE IF NOT EXISTS payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL DEFAULT 'razorpay',  -- 'razorpay' | 'stripe' (future)
  provider_order_id    TEXT,                               -- Razorpay order_id
  provider_payment_id  TEXT,                               -- Razorpay payment_id
  provider_signature   TEXT,                               -- Razorpay HMAC signature (store for audit, not for lookup)
  amount               NUMERIC(10,2) NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'INR',
  status               TEXT NOT NULL DEFAULT 'created',   -- 'created' | 'authorized' | 'captured' | 'failed' | 'refunded'
  refund_id            TEXT,                               -- Razorpay refund_id if refunded
  refund_amount        NUMERIC(10,2),
  raw_webhook          JSONB DEFAULT '{}',                 -- full webhook payload for audit
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 3. MANUFACTURING ──────────
CREATE TABLE IF NOT EXISTS manufacturing (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  plate_id             TEXT NOT NULL,                     -- SD-ABX9K7
  plate_name           TEXT,                              -- e.g. "Sharma Family"
  house_number         TEXT,                              -- e.g. "B-204"
  font_style           TEXT DEFAULT 'modern',            -- 'modern' | 'classic' | 'bold'
  product_type         TEXT NOT NULL DEFAULT 'acrylic',
  qr_slug              TEXT NOT NULL,                    -- same as plate_id
  qr_png_path          TEXT,                             -- Supabase Storage path: qr-codes/SD-ABX9K7.png
  qr_svg_path          TEXT,                             -- Supabase Storage path: qr-codes/SD-ABX9K7.svg
  production_status    TEXT NOT NULL DEFAULT 'queued',   -- 'queued' | 'printing' | 'quality_check' | 'packed' | 'ready'
  production_notes     TEXT,
  assigned_to          TEXT,                             -- operator name/id
  pdf_path             TEXT,                             -- production sheet PDF path in storage
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 4. TRACKING EVENTS ──────────
CREATE TABLE IF NOT EXISTS tracking_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL,
  -- 'order_placed' | 'payment_verified' | 'plate_generated' | 'qr_generated'
  -- | 'in_production' | 'quality_check' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered'
  event_label          TEXT NOT NULL,                    -- Human-readable label
  event_detail         TEXT,                             -- Optional extra info
  actor                TEXT DEFAULT 'system',            -- 'system' | 'admin' | 'courier'
  metadata             JSONB DEFAULT '{}',               -- e.g. { tracking_number, courier }
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 5. EXTEND ORDERS — INDEXES ──────────
CREATE INDEX IF NOT EXISTS idx_orders_owner        ON orders(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_plate        ON orders(plate_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_mfg_status   ON orders(manufacturing_status);
CREATE INDEX IF NOT EXISTS idx_payments_order      ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider   ON payments(provider_order_id, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_order ON manufacturing(order_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_plate ON manufacturing(plate_id);
CREATE INDEX IF NOT EXISTS idx_tracking_order      ON tracking_events(order_id, created_at ASC);

-- ────────── 6. AUTO-UPDATE updated_at ──────────
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_manufacturing_updated_at
  BEFORE UPDATE ON manufacturing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────── 7. ORDER NUMBER GENERATOR ──────────
-- Generates sequential order numbers: SD-ORD-20260618-0001
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  today TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  seq   INTEGER;
  onum  TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
  FROM orders
  WHERE order_number LIKE 'SD-ORD-' || today || '-%';

  onum := 'SD-ORD-' || today || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN onum;
END;
$$ LANGUAGE plpgsql;

-- ────────── 8. RLS POLICIES ──────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturing ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

-- Owners can read their own orders
CREATE POLICY orders_owner_read ON orders
  FOR SELECT
  USING (
    owner_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Payments: owner read via order
CREATE POLICY payments_owner_read ON payments
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE owner_id IN (
        SELECT id FROM users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Tracking events: owner read via order
CREATE POLICY tracking_owner_read ON tracking_events
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE owner_id IN (
        SELECT id FROM users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Manufacturing: only service_role (admin) can read/write
-- (owners do NOT see raw manufacturing data for security)
CREATE POLICY manufacturing_admin_only ON manufacturing
  FOR ALL
  USING (auth.role() = 'service_role');

-- Service role bypass (for Edge Functions with service_role key)
CREATE POLICY orders_service_all ON orders
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY payments_service_all ON payments
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY tracking_service_all ON tracking_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- ────────── 9. REALTIME ──────────
-- Enable realtime on tracking_events so owner dashboard updates live
ALTER PUBLICATION supabase_realtime ADD TABLE tracking_events;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
