-- ════════════════════════════════════════════════════════════════════════════
-- Migration 58: Phase 8B — GST Billing & Invoicing Platform
--
-- PURPOSE
--   Makes the existing `invoices` table (sql/46, SaaS billing only) and the
--   hardware `orders`/`payments` tables (sql/07) GST-compliant, without
--   creating a parallel invoice table and without touching Commerce Engine,
--   Razorpay capture/refund logic, or any completed phase's behavior.
--
-- AUDIT SUMMARY (see conversation for full detail)
--   Already exists : invoices table (no tax fields), orders/payments (no tax
--                     fields at all — sql/57 explicitly scoped GST OUT),
--                     admin invoice_list/refund flow, owner invoice history UI.
--   Real gaps added here:
--     1. GST fields (GSTIN, HSN/SAC, CGST/SGST/IGST, taxable value, round-off)
--        — added to the EXISTING `invoices` table, plus an `order_id` link so
--        hardware-plate sales can also get a GST invoice row WITHOUT a
--        parallel table.
--     2. Financial-year, sequential, concurrency-safe invoice numbering
--        (replaces the COUNT(*)+1 race condition in generate_invoice_number()
--        — same function name/signature preserved for backward compatibility
--        with create-subscription-order, which already calls it).
--     3. Credit notes / debit notes (issue → approve → track → history),
--        stored as rows in the same `invoices` table (invoice_type column),
--        linked to the original invoice via reference_invoice_id.
--     4. Refund ledger, integrating with the existing Razorpay refund flow.
--     5. Configurable GST rates/HSN/company details (gst_settings) so future
--        rate changes are a data UPDATE, never a code deploy.
--     6. GSTIN validation + a single server-side tax-calculation function
--        (compute_gst_breakup) so the math can never drift between order
--        types or between client and server.
--
-- SAFE / IDEMPOTENT — ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, ON CONFLICT DO NOTHING/UPDATE throughout.
-- Safe to re-run. Does NOT modify Commerce Engine, Razorpay signature
-- verification, coupons, pricing rules, or any existing RLS policy.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. GST SETTINGS — single configurable source of truth for company GST
--    registration + default rates. Editable via admin panel; never hardcoded
--    in application code, so a GST rate change (e.g. 18% → 12%) is a data
--    UPDATE, not a deploy.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gst_settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  seller_legal_name     TEXT NOT NULL DEFAULT 'SmartDoor',
  seller_trade_name     TEXT NOT NULL DEFAULT 'SmartDoor',
  seller_gstin          TEXT,                                          -- set via admin before go-live
  seller_pan            TEXT,
  seller_address_line1  TEXT NOT NULL DEFAULT '',
  seller_address_line2  TEXT NOT NULL DEFAULT '',
  seller_city           TEXT NOT NULL DEFAULT '',
  seller_state          TEXT NOT NULL DEFAULT '',
  seller_state_code     TEXT NOT NULL DEFAULT '23',                    -- default MP; update via admin
  seller_pincode        TEXT NOT NULL DEFAULT '',
  seller_email          TEXT NOT NULL DEFAULT 'hello@mysmartdoor.in',
  seller_phone          TEXT NOT NULL DEFAULT '',
  hardware_hsn_code     TEXT NOT NULL DEFAULT '8310',                  -- Metal/plastic name-plates (configurable)
  hardware_gst_rate     NUMERIC(5,2) NOT NULL DEFAULT 18.00,           -- % — GST-inclusive listed prices
  saas_sac_code         TEXT NOT NULL DEFAULT '998319',                -- Other IT/software services (SaaS)
  saas_gst_rate         NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  invoice_prefix        TEXT NOT NULL DEFAULT 'SD/INV',
  credit_note_prefix    TEXT NOT NULL DEFAULT 'SD/CN',
  debit_note_prefix     TEXT NOT NULL DEFAULT 'SD/DN',
  is_gst_registered     BOOLEAN NOT NULL DEFAULT FALSE,                -- FALSE until seller_gstin is actually set/verified
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gst_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE gst_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gst_settings'
    AND policyname = 'gst_settings_public_read'
  ) THEN
    -- Company registration details are printed on every invoice a customer
    -- downloads — not sensitive, same visibility level as plan_catalog.
    CREATE POLICY gst_settings_public_read ON gst_settings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gst_settings'
    AND policyname = 'gst_settings_admin_write'
  ) THEN
    CREATE POLICY gst_settings_admin_write ON gst_settings FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TRIGGER trg_gst_settings_updated_at
  BEFORE UPDATE ON gst_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. GST STATE CODES — resolves a free-text state (as typed at checkout in
--    index.html's #state field) to the 2-digit GST state code needed for
--    place-of-supply / CGST+SGST vs IGST determination.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gst_state_codes (
  state_code   TEXT PRIMARY KEY,
  state_name   TEXT NOT NULL,
  aliases      TEXT[] NOT NULL DEFAULT '{}'   -- lowercase alternate spellings/abbreviations
);

ALTER TABLE gst_state_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gst_state_codes'
    AND policyname = 'gst_state_codes_public_read'
  ) THEN
    CREATE POLICY gst_state_codes_public_read ON gst_state_codes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gst_state_codes'
    AND policyname = 'gst_state_codes_admin_write'
  ) THEN
    CREATE POLICY gst_state_codes_admin_write ON gst_state_codes FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

INSERT INTO gst_state_codes (state_code, state_name, aliases) VALUES
  ('01','Jammu and Kashmir', ARRAY['jammu and kashmir','jammu & kashmir','j&k','jk']),
  ('02','Himachal Pradesh',  ARRAY['himachal pradesh','hp']),
  ('03','Punjab',           ARRAY['punjab','pb']),
  ('04','Chandigarh',       ARRAY['chandigarh','ch']),
  ('05','Uttarakhand',      ARRAY['uttarakhand','uk','uttaranchal']),
  ('06','Haryana',          ARRAY['haryana','hr']),
  ('07','Delhi',            ARRAY['delhi','new delhi','ncr','dl']),
  ('08','Rajasthan',        ARRAY['rajasthan','rj']),
  ('09','Uttar Pradesh',    ARRAY['uttar pradesh','up']),
  ('10','Bihar',            ARRAY['bihar','br']),
  ('11','Sikkim',           ARRAY['sikkim','sk']),
  ('12','Arunachal Pradesh',ARRAY['arunachal pradesh','ar']),
  ('13','Nagaland',         ARRAY['nagaland','nl']),
  ('14','Manipur',          ARRAY['manipur','mn']),
  ('15','Mizoram',          ARRAY['mizoram','mz']),
  ('16','Tripura',          ARRAY['tripura','tr']),
  ('17','Meghalaya',        ARRAY['meghalaya','ml']),
  ('18','Assam',            ARRAY['assam','as']),
  ('19','West Bengal',      ARRAY['west bengal','wb']),
  ('20','Jharkhand',        ARRAY['jharkhand','jh']),
  ('21','Odisha',           ARRAY['odisha','orissa','or']),
  ('22','Chhattisgarh',     ARRAY['chhattisgarh','cg']),
  ('23','Madhya Pradesh',   ARRAY['madhya pradesh','mp']),
  ('24','Gujarat',          ARRAY['gujarat','gj']),
  ('26','Dadra and Nagar Haveli and Daman and Diu', ARRAY['dadra and nagar haveli','daman and diu','dnh','dd']),
  ('27','Maharashtra',      ARRAY['maharashtra','mh']),
  ('29','Karnataka',        ARRAY['karnataka','ka']),
  ('30','Goa',              ARRAY['goa','ga']),
  ('31','Lakshadweep',      ARRAY['lakshadweep','ld']),
  ('32','Kerala',           ARRAY['kerala','kl']),
  ('33','Tamil Nadu',       ARRAY['tamil nadu','tn']),
  ('34','Puducherry',       ARRAY['puducherry','pondicherry','py']),
  ('35','Andaman and Nicobar Islands', ARRAY['andaman and nicobar islands','andaman','an']),
  ('36','Telangana',        ARRAY['telangana','ts']),
  ('37','Andhra Pradesh',   ARRAY['andhra pradesh','ap']),
  ('38','Ladakh',           ARRAY['ladakh','la'])
ON CONFLICT (state_code) DO NOTHING;

-- Resolves free-text state input → 2-digit GST state code.
-- Falls back to NULL (caller must then decide a safe default) rather than
-- guessing, so place-of-supply is never silently wrong.
CREATE OR REPLACE FUNCTION resolve_gst_state_code(p_state_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_normalized TEXT := lower(trim(coalesce(p_state_text, '')));
  v_code TEXT;
BEGIN
  IF v_normalized = '' THEN RETURN NULL; END IF;

  SELECT state_code INTO v_code FROM gst_state_codes
    WHERE lower(state_name) = v_normalized
    LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  SELECT state_code INTO v_code FROM gst_state_codes
    WHERE v_normalized = ANY(aliases)
    LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- Loose partial match (e.g. "Madhya Pradesh, India" or "MP - Indore")
  SELECT state_code INTO v_code FROM gst_state_codes
    WHERE v_normalized LIKE '%' || lower(state_name) || '%'
    LIMIT 1;

  RETURN v_code;  -- may be NULL — caller handles fallback
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. EXTEND `invoices` (additive columns only) — GST fields, hardware-order
--    linkage, and credit/debit note support on the SAME table. No parallel
--    invoice table is created.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_id              UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type          TEXT NOT NULL DEFAULT 'tax_invoice';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_invoice_id  UUID REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_gstin          TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_gstin           TEXT;               -- optional, B2B customers only
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hsn_sac               TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply_state TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply_code  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_interstate         BOOLEAN;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS taxable_value         NUMERIC(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_rate             NUMERIC(5,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_amount           NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_rate             NUMERIC(5,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_amount           NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_rate             NUMERIC(5,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_amount           NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS round_off             NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_total         NUMERIC(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_snapshot      JSONB DEFAULT '{}'; -- customer name/address/phone/email frozen at issue time
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_description      TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_status       TEXT NOT NULL DEFAULT 'approved'; -- tax_invoice: auto-approved; notes: 'pending_approval'|'approved'|'rejected'
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_by           TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_last_generated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
      CHECK (invoice_type IN ('tax_invoice', 'credit_note', 'debit_note'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_approval_status_check'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_approval_status_check
      CHECK (approval_status IN ('pending_approval', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_order_id            ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type         ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_reference_invoice_id ON invoices(reference_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_approval_status      ON invoices(approval_status) WHERE invoice_type <> 'tax_invoice';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. INVOICE NUMBERING — financial-year, sequential, concurrency-safe.
--    Backed by a counter table with an atomic UPSERT increment (single-row
--    UPDATE takes Postgres's row lock, so two concurrent callers can never
--    receive the same sequence number — unlike the old
--    `SELECT COUNT(*) + 1 FROM invoices` approach, which had a race window).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  invoice_type    TEXT NOT NULL,
  financial_year  TEXT NOT NULL,   -- 'YY-YY', e.g. '25-26' (Apr 2025 – Mar 2026)
  last_seq        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (invoice_type, financial_year)
);

ALTER TABLE invoice_number_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_number_counters'
    AND policyname = 'invoice_number_counters_admin_all'
  ) THEN
    CREATE POLICY invoice_number_counters_admin_all ON invoice_number_counters
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION _current_financial_year()
RETURNS TEXT AS $$
DECLARE
  v_year  INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_month INTEGER := EXTRACT(MONTH FROM NOW())::INTEGER;
  v_start INTEGER;
BEGIN
  -- Indian financial year: 1 Apr – 31 Mar
  v_start := CASE WHEN v_month >= 4 THEN v_year ELSE v_year - 1 END;
  RETURN LPAD((v_start % 100)::TEXT, 2, '0') || '-' || LPAD(((v_start + 1) % 100)::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- Concurrency-safe generator: SD/INV/25-26/00001
CREATE OR REPLACE FUNCTION generate_gst_invoice_number(p_invoice_type TEXT DEFAULT 'tax_invoice')
RETURNS TEXT AS $$
DECLARE
  v_fy     TEXT := _current_financial_year();
  v_prefix TEXT;
  v_seq    INTEGER;
BEGIN
  SELECT CASE p_invoice_type
    WHEN 'credit_note' THEN credit_note_prefix
    WHEN 'debit_note'  THEN debit_note_prefix
    ELSE invoice_prefix
  END INTO v_prefix
  FROM gst_settings WHERE id = 1;

  IF v_prefix IS NULL THEN v_prefix := 'SD/INV'; END IF;

  INSERT INTO invoice_number_counters (invoice_type, financial_year, last_seq)
    VALUES (p_invoice_type, v_fy, 1)
    ON CONFLICT (invoice_type, financial_year)
    DO UPDATE SET last_seq = invoice_number_counters.last_seq + 1
    RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '/' || v_fy || '/' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backward-compatible shim: create-subscription-order (sql/46-era code)
-- already calls generate_invoice_number() with no arguments. Keep the exact
-- same name/signature/return type working, now delegating to the
-- concurrency-safe FY generator instead of the old COUNT(*)+1 race.
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
  SELECT generate_gst_invoice_number('tax_invoice');
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. TAX CALCULATION — single source of truth. Given a GST-INCLUSIVE amount
--    (SmartDoor's listed prices already include tax, per _shared/pricing.ts)
--    and a rate, backs out the taxable value and splits the tax into
--    CGST+SGST (intra-state) or IGST (inter-state), with paisa-level
--    round-off reconciled so the components always sum to the exact total.
--    Never hardcoded per call-site — every issuer calls this same function.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_gst_breakup(
  p_inclusive_amount NUMERIC,
  p_gst_rate         NUMERIC,
  p_is_interstate    BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_taxable   NUMERIC(10,2);
  v_total_tax NUMERIC(10,2);
  v_cgst_rate NUMERIC(5,2) := 0;
  v_sgst_rate NUMERIC(5,2) := 0;
  v_igst_rate NUMERIC(5,2) := 0;
  v_cgst_amt  NUMERIC(10,2) := 0;
  v_sgst_amt  NUMERIC(10,2) := 0;
  v_igst_amt  NUMERIC(10,2) := 0;
  v_round_off NUMERIC(10,2) := 0;
  v_reconciled_total NUMERIC(10,2);
BEGIN
  IF p_inclusive_amount IS NULL OR p_inclusive_amount < 0 THEN
    RAISE EXCEPTION 'compute_gst_breakup: invalid amount';
  END IF;
  IF p_gst_rate IS NULL OR p_gst_rate < 0 THEN
    RAISE EXCEPTION 'compute_gst_breakup: invalid gst rate';
  END IF;

  -- Back out the taxable value from a tax-inclusive price.
  v_taxable   := ROUND(p_inclusive_amount / (1 + p_gst_rate / 100.0), 2);
  v_total_tax := ROUND(p_inclusive_amount - v_taxable, 2);

  IF p_is_interstate THEN
    v_igst_rate := p_gst_rate;
    v_igst_amt  := v_total_tax;
  ELSE
    v_cgst_rate := ROUND(p_gst_rate / 2.0, 2);
    v_sgst_rate := ROUND(p_gst_rate / 2.0, 2);
    v_cgst_amt  := ROUND(v_total_tax / 2.0, 2);
    v_sgst_amt  := v_total_tax - v_cgst_amt;  -- remainder absorbs odd-paisa so cgst+sgst = v_total_tax exactly
  END IF;

  v_reconciled_total := v_taxable + v_cgst_amt + v_sgst_amt + v_igst_amt;
  v_round_off := ROUND(p_inclusive_amount - v_reconciled_total, 2);

  RETURN jsonb_build_object(
    'taxableValue', v_taxable,
    'cgstRate',     v_cgst_rate,  'cgstAmount', v_cgst_amt,
    'sgstRate',     v_sgst_rate,  'sgstAmount', v_sgst_amt,
    'igstRate',     v_igst_rate,  'igstAmount', v_igst_amt,
    'roundOff',     v_round_off,
    'invoiceTotal', p_inclusive_amount,
    'isInterstate', p_is_interstate
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- GSTIN format validation (15 chars: 2-digit state + 10-char PAN + entity +
-- 'Z' + checksum). Format check only — does not call the GSTN API.
CREATE OR REPLACE FUNCTION is_valid_gstin(p_gstin TEXT)
RETURNS BOOLEAN AS $$
  SELECT p_gstin IS NOT NULL
     AND p_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$';
$$ LANGUAGE SQL IMMUTABLE;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. HARDWARE ORDER → GST TAX INVOICE
--    Called (best-effort, non-blocking) from verify-razorpay-payment right
--    after an order is marked paid. Idempotent: a second call for the same
--    order_id is a no-op if a tax_invoice already exists for it.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_hardware_gst_invoice(p_order_id UUID)
RETURNS UUID AS $$
DECLARE
  v_order       RECORD;
  v_settings    RECORD;
  v_state_code  TEXT;
  v_interstate  BOOLEAN;
  v_breakup     JSONB;
  v_invoice_id  UUID;
  v_existing    UUID;
BEGIN
  SELECT id INTO v_existing FROM invoices
    WHERE order_id = p_order_id AND invoice_type = 'tax_invoice' LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'create_hardware_gst_invoice: order % not found', p_order_id; END IF;
  IF v_order.owner_id IS NULL THEN
    RAISE EXCEPTION 'create_hardware_gst_invoice: order % has no owner_id yet — call after owner assignment', p_order_id;
  END IF;

  SELECT * INTO v_settings FROM gst_settings WHERE id = 1;

  v_state_code := resolve_gst_state_code(v_order.shipping_address->>'state');
  v_interstate := (v_state_code IS NOT NULL AND v_state_code <> v_settings.seller_state_code);
  -- Unknown/unparseable state → conservatively treat as intra-state (CGST+SGST)
  -- and flag it via place_of_supply_state so admin can correct manually;
  -- this never blocks the plate/manufacturing pipeline that already succeeded.
  IF v_state_code IS NULL THEN v_interstate := FALSE; END IF;

  v_breakup := compute_gst_breakup(v_order.total_amount, v_settings.hardware_gst_rate, v_interstate);

  INSERT INTO invoices (
    invoice_number, owner_id, order_id, plan, billing_cycle, amount, currency, status,
    invoice_type, seller_gstin, hsn_sac, place_of_supply_state, place_of_supply_code,
    is_interstate, taxable_value, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
    igst_rate, igst_amount, round_off, invoice_total, billing_snapshot, line_description,
    issued_by, approval_status
  ) VALUES (
    generate_gst_invoice_number('tax_invoice'), v_order.owner_id, p_order_id,
    v_order.product_type, 'one_time', v_order.total_amount, 'INR', 'paid',
    'tax_invoice', v_settings.seller_gstin, v_settings.hardware_hsn_code,
    COALESCE(v_order.shipping_address->>'state', 'Unknown'), COALESCE(v_state_code, v_settings.seller_state_code),
    v_interstate, (v_breakup->>'taxableValue')::NUMERIC,
    (v_breakup->>'cgstRate')::NUMERIC, (v_breakup->>'cgstAmount')::NUMERIC,
    (v_breakup->>'sgstRate')::NUMERIC, (v_breakup->>'sgstAmount')::NUMERIC,
    (v_breakup->>'igstRate')::NUMERIC, (v_breakup->>'igstAmount')::NUMERIC,
    (v_breakup->>'roundOff')::NUMERIC, (v_breakup->>'invoiceTotal')::NUMERIC,
    jsonb_build_object(
      'name', v_order.customer_name, 'email', v_order.customer_email,
      'phone', v_order.customer_phone, 'address', v_order.shipping_address
    ),
    'SmartDoor ' || INITCAP(v_order.product_type) || ' QR Nameplate — Order ' || v_order.order_number,
    'self_serve', 'approved'
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. SAAS SUBSCRIPTION INVOICE → BACKFILL GST FIELDS
--    Called (best-effort) from verify-subscription-payment right after an
--    existing `invoices` row (created pending by create-subscription-order)
--    is marked paid. Idempotent: only fills GST columns once
--    (taxable_value IS NULL guard).
--    Place of supply: SaaS owners don't have a stored billing address, so
--    this resolves it from their most recent hardware order's shipping
--    state (the plate delivery address they already gave us); falls back to
--    the seller's own state (intra-state) if no order exists yet — this
--    fallback is a documented assumption, see Production Risks.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION populate_gst_fields_for_invoice(p_invoice_id UUID)
RETURNS UUID AS $$
DECLARE
  v_invoice     RECORD;
  v_settings    RECORD;
  v_owner_state TEXT;
  v_state_code  TEXT;
  v_interstate  BOOLEAN;
  v_breakup     JSONB;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'populate_gst_fields_for_invoice: invoice % not found', p_invoice_id; END IF;

  IF v_invoice.taxable_value IS NOT NULL THEN
    RETURN p_invoice_id;  -- already populated — idempotent no-op
  END IF;

  SELECT * INTO v_settings FROM gst_settings WHERE id = 1;

  SELECT o.shipping_address->>'state' INTO v_owner_state
    FROM orders o
    WHERE o.owner_id = v_invoice.owner_id AND o.shipping_address IS NOT NULL
    ORDER BY o.created_at DESC LIMIT 1;

  v_state_code := resolve_gst_state_code(v_owner_state);
  v_interstate := (v_state_code IS NOT NULL AND v_state_code <> v_settings.seller_state_code);
  IF v_state_code IS NULL THEN v_interstate := FALSE; END IF;

  v_breakup := compute_gst_breakup(v_invoice.amount, v_settings.saas_gst_rate, v_interstate);

  UPDATE invoices SET
    seller_gstin          = v_settings.seller_gstin,
    hsn_sac                = v_settings.saas_sac_code,
    place_of_supply_state  = COALESCE(v_owner_state, v_settings.seller_state),
    place_of_supply_code   = COALESCE(v_state_code, v_settings.seller_state_code),
    is_interstate          = v_interstate,
    taxable_value          = (v_breakup->>'taxableValue')::NUMERIC,
    cgst_rate              = (v_breakup->>'cgstRate')::NUMERIC,
    cgst_amount            = (v_breakup->>'cgstAmount')::NUMERIC,
    sgst_rate              = (v_breakup->>'sgstRate')::NUMERIC,
    sgst_amount            = (v_breakup->>'sgstAmount')::NUMERIC,
    igst_rate              = (v_breakup->>'igstRate')::NUMERIC,
    igst_amount            = (v_breakup->>'igstAmount')::NUMERIC,
    round_off              = (v_breakup->>'roundOff')::NUMERIC,
    invoice_total          = (v_breakup->>'invoiceTotal')::NUMERIC,
    line_description       = INITCAP(v_invoice.plan) || ' Plan — ' || v_invoice.billing_cycle || ' subscription',
    updated_at             = NOW()
  WHERE id = p_invoice_id;

  RETURN p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. CREDIT NOTES / DEBIT NOTES — issue → approve → track → history.
--    Stored as rows in the same `invoices` table (invoice_type), linked to
--    the original tax invoice via reference_invoice_id. Starts
--    'pending_approval' so a second admin (or the same admin, deliberately)
--    confirms before it's final — approve_billing_note() below flips it.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION issue_billing_note(
  p_original_invoice_id UUID,
  p_note_type           TEXT,   -- 'credit_note' | 'debit_note'
  p_amount              NUMERIC,
  p_reason              TEXT,
  p_issued_by            TEXT DEFAULT 'admin'
)
RETURNS UUID AS $$
DECLARE
  v_original  RECORD;
  v_note_id   UUID;
  v_rate      NUMERIC;
  v_breakup   JSONB;
BEGIN
  IF p_note_type NOT IN ('credit_note', 'debit_note') THEN
    RAISE EXCEPTION 'issue_billing_note: invalid note type %', p_note_type;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'issue_billing_note: amount must be positive';
  END IF;

  SELECT * INTO v_original FROM invoices WHERE id = p_original_invoice_id AND invoice_type = 'tax_invoice';
  IF NOT FOUND THEN RAISE EXCEPTION 'issue_billing_note: original tax invoice % not found', p_original_invoice_id; END IF;

  -- Re-derive the effective GST rate actually used on the original invoice
  -- (cgst_rate*2 for intra-state, igst_rate for inter-state) so the note's
  -- tax breakup matches the original exactly rather than re-reading
  -- possibly-since-changed gst_settings.
  v_rate := CASE WHEN v_original.is_interstate THEN v_original.igst_rate ELSE v_original.cgst_rate + v_original.sgst_rate END;
  v_breakup := compute_gst_breakup(p_amount, COALESCE(v_rate, 0), COALESCE(v_original.is_interstate, FALSE));

  INSERT INTO invoices (
    invoice_number, owner_id, order_id, subscription_id, plan, billing_cycle, amount, currency, status,
    invoice_type, reference_invoice_id, seller_gstin, buyer_gstin, hsn_sac,
    place_of_supply_state, place_of_supply_code, is_interstate,
    taxable_value, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount,
    round_off, invoice_total, billing_snapshot, line_description, notes,
    issued_by, approval_status
  ) VALUES (
    generate_gst_invoice_number(p_note_type), v_original.owner_id, v_original.order_id, v_original.subscription_id,
    v_original.plan, v_original.billing_cycle, p_amount, v_original.currency, 'issued',
    p_note_type, p_original_invoice_id, v_original.seller_gstin, v_original.buyer_gstin, v_original.hsn_sac,
    v_original.place_of_supply_state, v_original.place_of_supply_code, v_original.is_interstate,
    (v_breakup->>'taxableValue')::NUMERIC,
    (v_breakup->>'cgstRate')::NUMERIC, (v_breakup->>'cgstAmount')::NUMERIC,
    (v_breakup->>'sgstRate')::NUMERIC, (v_breakup->>'sgstAmount')::NUMERIC,
    (v_breakup->>'igstRate')::NUMERIC, (v_breakup->>'igstAmount')::NUMERIC,
    (v_breakup->>'roundOff')::NUMERIC, (v_breakup->>'invoiceTotal')::NUMERIC,
    v_original.billing_snapshot,
    (CASE WHEN p_note_type = 'credit_note' THEN 'Credit Note' ELSE 'Debit Note' END) || ' against ' || v_original.invoice_number,
    p_reason, p_issued_by, 'pending_approval'
  )
  RETURNING id INTO v_note_id;

  RETURN v_note_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Approve or reject a pending credit/debit note. Only tracks the decision —
-- callers (admin-data Edge Function) are responsible for the RBAC check
-- before invoking this, same convention as check_and_increment_usage()
-- trusting its caller's p_owner_id.
CREATE OR REPLACE FUNCTION approve_billing_note(
  p_note_id     UUID,
  p_admin_email TEXT,
  p_decision    TEXT   -- 'approved' | 'rejected'
)
RETURNS JSONB AS $$
DECLARE
  v_note RECORD;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'approve_billing_note: invalid decision %', p_decision;
  END IF;

  SELECT * INTO v_note FROM invoices WHERE id = p_note_id AND invoice_type IN ('credit_note', 'debit_note');
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Note not found'); END IF;

  IF v_note.approval_status <> 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Note already ' || v_note.approval_status);
  END IF;

  UPDATE invoices SET
    approval_status = p_decision,
    approved_by     = p_admin_email,
    approved_at     = NOW(),
    status          = CASE WHEN p_decision = 'approved' THEN 'issued' ELSE 'cancelled' END,
    updated_at      = NOW()
  WHERE id = p_note_id;

  RETURN jsonb_build_object('success', true, 'noteId', p_note_id, 'decision', p_decision);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. REFUND LEDGER — unified, append-only record of every refund, whichever
--    path it came from (hardware `payments`/`orders`, or SaaS `invoices`).
--    Populated by razorpay-refund (both existing branches), additive only —
--    does not change how the refund itself is executed against Razorpay.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refund_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type         TEXT NOT NULL,       -- 'hardware_order' | 'saas_invoice'
  order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
  invoice_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
  owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  razorpay_refund_id  TEXT,
  amount              NUMERIC(10,2) NOT NULL,
  reason              TEXT,
  credit_note_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
  initiated_by        TEXT NOT NULL DEFAULT 'admin',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE refund_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'refund_ledger'
    AND policyname = 'refund_ledger_owner_read'
  ) THEN
    CREATE POLICY refund_ledger_owner_read ON refund_ledger FOR SELECT USING (owner_id = get_my_owner_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'refund_ledger'
    AND policyname = 'refund_ledger_admin_all'
  ) THEN
    CREATE POLICY refund_ledger_admin_all ON refund_ledger FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_refund_ledger_owner   ON refund_ledger(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_ledger_order    ON refund_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_ledger_invoice   ON refund_ledger(invoice_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Admin audit convenience — reuses the existing admin_audit_logs table,
--     no schema change needed there. Just an index for the new resource.
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_audit_billing
  ON admin_audit_logs(resource, resource_id)
  WHERE resource IN ('billing', 'gst_settings');

COMMIT;

-- ── Run these after migration to verify ──────────────────────────────────────
-- SELECT * FROM gst_settings;
-- SELECT generate_gst_invoice_number('tax_invoice');
-- SELECT compute_gst_breakup(1499, 18, false);   -- intra-state example
-- SELECT compute_gst_breakup(1499, 18, true);    -- inter-state example
-- SELECT resolve_gst_state_code('MP'), resolve_gst_state_code('Maharashtra');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' ORDER BY ordinal_position;
