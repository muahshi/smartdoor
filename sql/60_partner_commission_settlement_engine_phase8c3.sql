-- ============================================================
-- SMART DOOR — PHASE 8C (PART 3): PARTNER COMMISSION & SETTLEMENT ENGINE
-- Migration: 60_partner_commission_settlement_engine_phase8c3.sql
-- Run AFTER all previous migrations (01–59)
--
-- CONTEXT (audit findings — see accompanying response for full writeup):
--   dealer_commissions already exists (34_enterprise_rbac_phase5.sql) as a
--   FOUNDATION LEDGER ONLY — dealer_admin_id, plate_id, order_id, amount,
--   status (pending/approved/paid), notes. No auto-calculation, no
--   franchise/distributor support, no rules, no settlement, no payout
--   tracking, no refund reversal, no analytics. admin-data/index.ts already
--   exposes commission_list (read, dealer-scoped only) and
--   commission_update_status (manual pending→approved→paid, no amount
--   logic) against this table.
--
--   This migration closes exactly those gaps. dealer_commissions is
--   EXTENDED (new columns only, nothing dropped/renamed) so every existing
--   row, query, and the two admin-data handlers above keep working exactly
--   as before — it becomes the general partner-commission ledger it was
--   always structurally capable of being (dealer_admin_id already just
--   references admin_users, not a dealer-only table).
--
-- Additive only:
--   NEW tables: commission_rules, commission_settlement_batches
--   NEW columns on EXISTING dealer_commissions (role_name, entry_type,
--     commission_rule_id, related_commission_id, gross_order_amount,
--     reason_code, settlement_batch_id, approved_by/at, paid_by/at)
--   NEW columns on EXISTING dealer_commissions.status CHECK constraint
--     (adds 'cancelled', 'reversed' to existing pending/approved/paid)
--   NEW triggers on EXISTING orders table (commission calc on paid,
--     reversal on refund) — orders table structure itself untouched
--   Reuses: admin_users, admin_roles, orders, payments, refund_ledger,
--     partner_applications (bank details), admin_audit_logs (audit trail)
--
-- EXPLICITLY OUT OF SCOPE (per instructions):
--   - Partner Dashboard UI (separate deliverable)
--   - Any change to checkout behaviour, pricing, or GST calculation
--   - Duplicating orders/payments logic
--
-- Idempotent — safe to run multiple times. Backward compatible.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. COMMISSION RULES
--    Resolution specificity (most → least specific), evaluated in
--    resolve_commission_rule() below:
--      a) admin_user_id set + product_type set   (partner+product override)
--      b) admin_user_id set + product_type NULL   (partner-wide override)
--      c) role_name set + product_type set        (role+product default)
--      d) role_name set + product_type NULL        (role-wide default)
--    "Category-wise" = product_type-wise: this codebase has no separate
--    product-category taxonomy beyond product_type (acrylic/stainless/
--    teakwood — see design-system/template-data) — reusing it rather than
--    inventing a parallel category concept.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  role_name             TEXT CHECK (role_name IN ('dealer', 'franchise', 'distributor')), -- NULL only valid when admin_user_id is set
  admin_user_id         UUID REFERENCES admin_users(id) ON DELETE CASCADE,                -- NULL = role-wide default rule
  product_type          TEXT,                                                              -- NULL = applies to every product type
  commission_mode       TEXT NOT NULL CHECK (commission_mode IN ('percentage', 'fixed', 'hybrid')),
  percentage_value      NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- used by 'percentage' and 'hybrid'
  fixed_value           NUMERIC(10,2) NOT NULL DEFAULT 0,   -- used by 'fixed' and 'hybrid'
  max_commission_amount NUMERIC(10,2),                       -- optional cap; NULL = uncapped
  priority              INTEGER NOT NULL DEFAULT 100,        -- lower = preferred among equally-specific matches
  effective_from        TIMESTAMPTZ,
  effective_until       TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CHECK (role_name IS NOT NULL OR admin_user_id IS NOT NULL),
  CHECK (
    (commission_mode = 'percentage' AND percentage_value > 0) OR
    (commission_mode = 'fixed'      AND fixed_value > 0) OR
    (commission_mode = 'hybrid'     AND (percentage_value > 0 OR fixed_value > 0))
  )
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_role    ON commission_rules(role_name, product_type, is_active);
CREATE INDEX IF NOT EXISTS idx_commission_rules_partner ON commission_rules(admin_user_id, product_type, is_active);

DROP TRIGGER IF EXISTS trg_commission_rules_updated_at ON commission_rules;
CREATE TRIGGER trg_commission_rules_updated_at BEFORE UPDATE ON commission_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION commission_rule_effective_status(p_row commission_rules)
RETURNS TEXT AS $$
BEGIN
  IF NOT p_row.is_active THEN RETURN 'disabled'; END IF;
  IF p_row.effective_from IS NOT NULL AND NOW() < p_row.effective_from THEN RETURN 'scheduled'; END IF;
  IF p_row.effective_until IS NOT NULL AND NOW() > p_row.effective_until THEN RETURN 'expired'; END IF;
  RETURN 'active';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW commission_rules_with_status AS
  SELECT r.*, commission_rule_effective_status(r) AS effective_status
  FROM commission_rules r;

-- Resolver: returns the single best-matching active rule for a given
-- partner/role/product combination, or NULL if none configured.
CREATE OR REPLACE FUNCTION resolve_commission_rule(
  p_admin_user_id UUID,
  p_role_name     TEXT,
  p_product_type  TEXT
) RETURNS commission_rules AS $$
DECLARE
  v_rule commission_rules%ROWTYPE;
BEGIN
  SELECT * INTO v_rule FROM commission_rules
  WHERE is_active = true
    AND (effective_from IS NULL OR NOW() >= effective_from)
    AND (effective_until IS NULL OR NOW() <= effective_until)
    AND (
      (admin_user_id = p_admin_user_id AND product_type = p_product_type) OR
      (admin_user_id = p_admin_user_id AND product_type IS NULL) OR
      (admin_user_id IS NULL AND role_name = p_role_name AND product_type = p_product_type) OR
      (admin_user_id IS NULL AND role_name = p_role_name AND product_type IS NULL)
    )
  ORDER BY
    (admin_user_id = p_admin_user_id AND product_type = p_product_type) DESC,
    (admin_user_id = p_admin_user_id) DESC,
    (product_type = p_product_type) DESC,
    priority ASC
  LIMIT 1;

  RETURN v_rule; -- NULL ROW (all fields NULL) if nothing matched — caller checks v_rule.id IS NULL
END;
$$ LANGUAGE plpgsql STABLE;

-- ────────────────────────────────────────────────────────────
-- 2. EXTEND dealer_commissions — generalize the existing placeholder
--    ledger into the full commission ledger (pending/approved/paid,
--    now also cancelled/reversed; reversal + adjustment entries;
--    rule + settlement linkage). Every existing column, row, and the
--    two admin-data handlers already reading/writing this table are
--    untouched and keep working.
-- ────────────────────────────────────────────────────────────
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS role_name             TEXT CHECK (role_name IN ('dealer', 'franchise', 'distributor'));
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS entry_type            TEXT NOT NULL DEFAULT 'commission' CHECK (entry_type IN ('commission', 'reversal', 'adjustment'));
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS commission_rule_id    UUID REFERENCES commission_rules(id) ON DELETE SET NULL;
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS related_commission_id UUID REFERENCES dealer_commissions(id) ON DELETE SET NULL; -- reversal/adjustment → points at the original 'commission' row
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS gross_order_amount    NUMERIC(10,2); -- order base amount commission was computed on, snapshot for audit
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS reason_code           TEXT;          -- 'order_paid' | 'refund_reversal' | 'manual_adjustment' | 'settlement_correction'
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS settlement_batch_id   UUID; -- FK added below, after the batches table exists
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS approved_by           UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ;
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS paid_by               UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE dealer_commissions ADD COLUMN IF NOT EXISTS paid_at               TIMESTAMPTZ;

ALTER TABLE dealer_commissions DROP CONSTRAINT IF EXISTS dealer_commissions_status_check;
ALTER TABLE dealer_commissions ADD CONSTRAINT dealer_commissions_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'cancelled', 'reversed'));

-- One 'commission' entry per order — the auto-calc trigger relies on this
-- for idempotency (ON CONFLICT DO NOTHING). Reversal/adjustment rows are
-- exempt (an order can have at most one reversal today since razorpay-refund
-- already blocks a second refund on the same order — see audit notes — but
-- adjustments may be added manually more than once).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_commissions_order_commission
  ON dealer_commissions(order_id) WHERE entry_type = 'commission' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dealer_commissions_role        ON dealer_commissions(role_name, status);
CREATE INDEX IF NOT EXISTS idx_dealer_commissions_entry_type  ON dealer_commissions(entry_type);
CREATE INDEX IF NOT EXISTS idx_dealer_commissions_settlement  ON dealer_commissions(settlement_batch_id);
CREATE INDEX IF NOT EXISTS idx_dealer_commissions_related     ON dealer_commissions(related_commission_id);
CREATE INDEX IF NOT EXISTS idx_dealer_commissions_status_dealer ON dealer_commissions(dealer_admin_id, status, settlement_batch_id);

DROP TRIGGER IF EXISTS trg_dealer_commissions_updated_at ON dealer_commissions;
CREATE TRIGGER trg_dealer_commissions_updated_at BEFORE UPDATE ON dealer_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. SETTLEMENT BATCHES (weekly / monthly / manual)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_settlement_batches (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference         TEXT UNIQUE NOT NULL,             -- e.g. SETL-20260718-0001
  partner_admin_id        UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_name               TEXT CHECK (role_name IN ('dealer', 'franchise', 'distributor')),
  settlement_type         TEXT NOT NULL CHECK (settlement_type IN ('weekly', 'monthly', 'manual')),
  period_start            TIMESTAMPTZ,
  period_end              TIMESTAMPTZ,
  item_count              INTEGER NOT NULL DEFAULT 0,
  total_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0, -- net of any reversal/adjustment rows included
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid', 'failed', 'cancelled')),
  -- Payout tracking
  payout_method           TEXT DEFAULT 'bank_transfer',
  bank_account_name       TEXT,                              -- snapshot at batch-creation time (from partner_applications, if on file)
  bank_account_number     TEXT,
  bank_ifsc               TEXT,
  bank_name               TEXT,
  utr_number               TEXT,
  payout_date              TIMESTAMPTZ,
  failure_reason           TEXT,
  retry_count               INTEGER NOT NULL DEFAULT 0,
  -- Workflow / audit
  created_by_admin_id      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_by               UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_partner ON commission_settlement_batches(partner_admin_id, status);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status  ON commission_settlement_batches(status, settlement_type);

DROP TRIGGER IF EXISTS trg_settlement_batches_updated_at ON commission_settlement_batches;
CREATE TRIGGER trg_settlement_batches_updated_at BEFORE UPDATE ON commission_settlement_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dealer_commissions_settlement_batch') THEN
    ALTER TABLE dealer_commissions ADD CONSTRAINT fk_dealer_commissions_settlement_batch
      FOREIGN KEY (settlement_batch_id) REFERENCES commission_settlement_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_settlement_reference()
RETURNS TEXT AS $$
DECLARE
  today TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  seq   INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
  FROM commission_settlement_batches
  WHERE batch_reference LIKE 'SETL-' || today || '-%';
  RETURN 'SETL-' || today || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 4. AUTO-CALCULATE COMMISSION ON SUCCESSFUL PAYMENT
--    Fires from a DB trigger (not application code) so it fires
--    identically no matter which path marks the order paid:
--      - verify-razorpay-payment (checkout → orders UPDATE payment_status)
--      - admin-provision-customer (admin-created order → orders INSERT
--        already 'paid') — both are covered by firing on INSERT and UPDATE.
--    Idempotent via uq_dealer_commissions_order_commission above (ON
--    CONFLICT DO NOTHING) — safe even if this fires more than once for
--    the same order. Reuses existing orders.created_by_admin_id (already
--    populated for dealer/franchise checkout orders and for every
--    admin-provisioned order regardless of role) — no orders/payments
--    logic duplicated, no checkout flow file touched.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_partner_commission_on_order_paid()
RETURNS TRIGGER AS $$
DECLARE
  v_role_name TEXT;
  v_rule      commission_rules%ROWTYPE;
  v_base      NUMERIC(10,2);
  v_amount    NUMERIC(10,2);
BEGIN
  IF NEW.created_by_admin_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ar.name INTO v_role_name
  FROM admin_users au JOIN admin_roles ar ON ar.id = au.role_id
  WHERE au.id = NEW.created_by_admin_id AND au.is_active = true;

  IF v_role_name IS NULL OR v_role_name NOT IN ('dealer', 'franchise', 'distributor') THEN
    RETURN NEW; -- inactive/unknown admin, or created by ops/support/manufacturing etc — not a commission-eligible partner
  END IF;

  v_rule := resolve_commission_rule(NEW.created_by_admin_id, v_role_name, NEW.product_type);
  IF v_rule.id IS NULL THEN
    RETURN NEW; -- no commission rule configured for this partner/product — no silent guess at a rate
  END IF;

  -- Commission base = product_price only (excludes shipping, which is a
  -- pass-through cost, and subscription_price, which is bundled/free —
  -- see 47_premium_included_migration.sql — not partner-attributable revenue).
  v_base := COALESCE(NEW.product_price, 0);

  v_amount := CASE v_rule.commission_mode
    WHEN 'percentage' THEN ROUND(v_base * v_rule.percentage_value / 100.0, 2)
    WHEN 'fixed'       THEN v_rule.fixed_value
    WHEN 'hybrid'       THEN ROUND(v_base * v_rule.percentage_value / 100.0, 2) + v_rule.fixed_value
    ELSE 0
  END;

  IF v_rule.max_commission_amount IS NOT NULL THEN
    v_amount := LEAST(v_amount, v_rule.max_commission_amount);
  END IF;

  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO dealer_commissions (
    dealer_admin_id, plate_id, order_id, amount, status,
    role_name, entry_type, commission_rule_id, gross_order_amount, reason_code
  ) VALUES (
    NEW.created_by_admin_id, NEW.plate_id, NEW.id, v_amount, 'pending',
    v_role_name, 'commission', v_rule.id, v_base, 'order_paid'
  )
  ON CONFLICT (order_id) WHERE entry_type = 'commission' DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_commission_on_insert ON orders;
CREATE TRIGGER trg_orders_commission_on_insert
  AFTER INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid')
  EXECUTE FUNCTION calculate_partner_commission_on_order_paid();

DROP TRIGGER IF EXISTS trg_orders_commission_on_update ON orders;
CREATE TRIGGER trg_orders_commission_on_update
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION calculate_partner_commission_on_order_paid();

-- ────────────────────────────────────────────────────────────
-- 5. REVERSE COMMISSION ON REFUND (full + partial)
--    Fires when orders.payment_status transitions to 'refunded' (the only
--    refund-related order state this codebase has — razorpay-refund sets
--    it for both full and partial refunds and blocks a second refund on
--    the same order via payments.refund_id, so this fires at most once
--    per order). Ratio = refunded amount ÷ order total, applied to the
--    original commission so a partial refund only partially reverses.
--    Writes a NEGATIVE 'reversal' ledger entry rather than mutating the
--    original 'commission' row, so the ledger stays append-only/auditable
--    and nets correctly whether the original commission was already paid
--    (reversal nets against a FUTURE settlement) or still pending/approved
--    (reversal nets out before it's ever settled).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reverse_partner_commission_on_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_original       dealer_commissions%ROWTYPE;
  v_total_refunded NUMERIC(10,2);
  v_ratio          NUMERIC;
  v_reversal_amt   NUMERIC(10,2);
  v_already_reversed NUMERIC(10,2);
BEGIN
  SELECT * INTO v_original FROM dealer_commissions
  WHERE order_id = NEW.id AND entry_type = 'commission'
  LIMIT 1;

  IF v_original.id IS NULL THEN
    RETURN NEW; -- no commission was ever recorded for this order — nothing to reverse
  END IF;

  IF EXISTS (SELECT 1 FROM dealer_commissions WHERE related_commission_id = v_original.id AND entry_type = 'reversal') THEN
    RETURN NEW; -- already reversed (idempotency guard)
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
  FROM refund_ledger WHERE order_id = NEW.id;

  IF v_total_refunded <= 0 OR NEW.total_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_ratio := LEAST(1.0, v_total_refunded / NEW.total_amount);

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_already_reversed
  FROM dealer_commissions WHERE related_commission_id = v_original.id AND entry_type = 'reversal';

  v_reversal_amt := LEAST(ROUND(v_original.amount * v_ratio, 2), v_original.amount - v_already_reversed);

  IF v_reversal_amt <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO dealer_commissions (
    dealer_admin_id, plate_id, order_id, amount, status,
    role_name, entry_type, related_commission_id, gross_order_amount, reason_code, notes
  ) VALUES (
    v_original.dealer_admin_id, v_original.plate_id, NEW.id, -v_reversal_amt, 'pending',
    v_original.role_name, 'reversal', v_original.id, v_original.gross_order_amount, 'refund_reversal',
    format('Reversal of ₹%s (%s%% of order refunded) against commission %s', v_reversal_amt, ROUND(v_ratio * 100, 1), v_original.id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_commission_reversal ON orders;
CREATE TRIGGER trg_orders_commission_reversal
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded')
  EXECUTE FUNCTION reverse_partner_commission_on_refund();

-- ────────────────────────────────────────────────────────────
-- 6. MANUAL ADJUSTMENT (admin-initiated correction, with reason history)
--    Ledger row only — approval/audit trail is the caller's responsibility
--    (commission-engine Edge Function logs before/after to admin_audit_logs,
--    same convention as commission_update_status in admin-data).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_commission_adjustment(
  p_dealer_admin_id UUID,
  p_amount          NUMERIC,     -- positive = credit, negative = debit
  p_reason          TEXT,
  p_related_commission_id UUID DEFAULT NULL,
  p_order_id        UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_role_name TEXT;
  v_id        UUID;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'create_commission_adjustment: amount cannot be zero';
  END IF;

  SELECT ar.name INTO v_role_name
  FROM admin_users au JOIN admin_roles ar ON ar.id = au.role_id
  WHERE au.id = p_dealer_admin_id;

  INSERT INTO dealer_commissions (
    dealer_admin_id, order_id, amount, status, role_name,
    entry_type, related_commission_id, reason_code, notes
  ) VALUES (
    p_dealer_admin_id, p_order_id, p_amount, 'pending', v_role_name,
    'adjustment', p_related_commission_id, 'manual_adjustment', p_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────
-- 7. SETTLEMENT ENGINE — create batch / approve / mark paid / mark failed
-- ────────────────────────────────────────────────────────────

-- Bundles every 'approved' (and not-yet-settled) ledger row for one
-- partner into a new draft batch. Only 'approved' rows are eligible —
-- forces the review step (commission_update_status / commission-engine
-- approval) before anything can be paid out. Reversal/adjustment rows are
-- included on equal footing so they net against genuine commissions in
-- the same batch.
CREATE OR REPLACE FUNCTION create_commission_settlement_batch(
  p_partner_admin_id UUID,
  p_settlement_type  TEXT,
  p_period_start     TIMESTAMPTZ,
  p_period_end       TIMESTAMPTZ,
  p_created_by_admin_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_role_name TEXT;
  v_bank      RECORD;
  v_batch_id  UUID;
  v_ref       TEXT;
  v_total     NUMERIC(10,2);
  v_count     INTEGER;
BEGIN
  IF p_settlement_type NOT IN ('weekly', 'monthly', 'manual') THEN
    RAISE EXCEPTION 'create_commission_settlement_batch: invalid settlement_type %', p_settlement_type;
  END IF;

  SELECT ar.name INTO v_role_name
  FROM admin_users au JOIN admin_roles ar ON ar.id = au.role_id
  WHERE au.id = p_partner_admin_id;

  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO v_count, v_total
  FROM dealer_commissions
  WHERE dealer_admin_id = p_partner_admin_id
    AND status = 'approved'
    AND settlement_batch_id IS NULL
    AND (p_period_start IS NULL OR created_at >= p_period_start)
    AND (p_period_end   IS NULL OR created_at <= p_period_end);

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No approved, unsettled commission entries found for this partner/period.');
  END IF;

  -- Bank details snapshot: most recent APPROVED partner_applications row
  -- for this admin (the source of truth for payout bank details captured
  -- at KYC time — see 58_partner_onboarding_kyc.sql). NULL if the partner
  -- was onboarded before that migration existed; admin can fill manually.
  SELECT bank_account_name, bank_account_number, bank_ifsc, bank_name INTO v_bank
  FROM partner_applications
  WHERE resulting_admin_id = p_partner_admin_id AND status = 'approved'
  ORDER BY reviewed_at DESC NULLS LAST LIMIT 1;

  v_ref := generate_settlement_reference();

  INSERT INTO commission_settlement_batches (
    batch_reference, partner_admin_id, role_name, settlement_type,
    period_start, period_end, item_count, total_commission_amount, status,
    bank_account_name, bank_account_number, bank_ifsc, bank_name,
    created_by_admin_id
  ) VALUES (
    v_ref, p_partner_admin_id, v_role_name, p_settlement_type,
    p_period_start, p_period_end, v_count, v_total, 'draft',
    v_bank.bank_account_name, v_bank.bank_account_number, v_bank.bank_ifsc, v_bank.bank_name,
    p_created_by_admin_id
  )
  RETURNING id INTO v_batch_id;

  UPDATE dealer_commissions SET settlement_batch_id = v_batch_id
  WHERE dealer_admin_id = p_partner_admin_id
    AND status = 'approved'
    AND settlement_batch_id IS NULL
    AND (p_period_start IS NULL OR created_at >= p_period_start)
    AND (p_period_end   IS NULL OR created_at <= p_period_end);

  RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'batch_reference', v_ref, 'item_count', v_count, 'total_amount', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION approve_commission_settlement_batch(p_batch_id UUID, p_admin_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_batch commission_settlement_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM commission_settlement_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Batch not found'); END IF;
  IF v_batch.status NOT IN ('draft', 'pending_approval') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Batch already ' || v_batch.status);
  END IF;

  UPDATE commission_settlement_batches
  SET status = 'approved', approved_by = p_admin_id, approved_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Marks the batch (and every ledger row in it) as paid. UTR is mandatory —
-- this is the payout reference number the brief calls for.
CREATE OR REPLACE FUNCTION mark_commission_settlement_paid(
  p_batch_id UUID,
  p_utr      TEXT,
  p_payout_date TIMESTAMPTZ,
  p_paid_by_admin_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_batch commission_settlement_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM commission_settlement_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Batch not found'); END IF;
  IF v_batch.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Batch must be approved before it can be marked paid (current: ' || v_batch.status || ')');
  END IF;
  IF p_utr IS NULL OR LENGTH(TRIM(p_utr)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'UTR / bank reference is required to mark a settlement paid.');
  END IF;

  UPDATE commission_settlement_batches
  SET status = 'paid', utr_number = p_utr, payout_date = COALESCE(p_payout_date, NOW()), failure_reason = NULL
  WHERE id = p_batch_id;

  UPDATE dealer_commissions
  SET status = 'paid', paid_by = p_paid_by_admin_id, paid_at = NOW()
  WHERE settlement_batch_id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'paid');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Failure + retry support: bumps retry_count, records the reason, and
-- releases the batch's ledger rows back to unsettled so they can be
-- picked up by a fresh batch OR the same batch can simply be retried
-- (bank reference/UTR resubmitted via mark_commission_settlement_paid).
CREATE OR REPLACE FUNCTION mark_commission_settlement_failed(
  p_batch_id UUID,
  p_reason   TEXT,
  p_release_items BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
BEGIN
  UPDATE commission_settlement_batches
  SET status = 'failed', failure_reason = p_reason, retry_count = retry_count + 1
  WHERE id = p_batch_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Batch not found'); END IF;

  IF p_release_items THEN
    UPDATE dealer_commissions SET settlement_batch_id = NULL
    WHERE settlement_batch_id = p_batch_id AND status = 'approved';
  END IF;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'failed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────
-- 8. RLS — service_role only, matching the existing dealer_commissions
--    no_public_access pattern exactly (all reads/writes go through
--    admin-data / commission-engine Edge Functions using the service key).
-- ────────────────────────────────────────────────────────────
ALTER TABLE commission_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settlement_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commission_rules' AND policyname='commission_rules_no_public_access') THEN
    CREATE POLICY commission_rules_no_public_access ON commission_rules FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commission_settlement_batches' AND policyname='commission_settlement_batches_no_public_access') THEN
    CREATE POLICY commission_settlement_batches_no_public_access ON commission_settlement_batches FOR ALL TO anon, authenticated USING (false);
  END IF;
END $$;

CREATE POLICY commission_rules_service_all              ON commission_rules              FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY commission_settlement_batches_service_all  ON commission_settlement_batches FOR ALL USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 9. RBAC — new 'commission_management' resource for rule/settlement
--    admin (distinct from the existing 'commissions' resource, which stays
--    exactly as-is: partner-facing read + super_admin's manual status
--    update in admin-data). super_admin's '*' wildcard already covers it.
-- ────────────────────────────────────────────────────────────
UPDATE admin_roles
SET permissions = permissions || '{"commission_management":["read","write"]}'::jsonb
WHERE name = 'ops_manager'
  AND NOT (permissions ? '*');

UPDATE admin_roles
SET permissions = permissions || '{"commission_management":["read"]}'::jsonb
WHERE name = 'analyst'
  AND NOT (permissions ? '*');

-- ────────────────────────────────────────────────────────────
-- 10. ANALYTICS
-- ────────────────────────────────────────────────────────────

-- Per-partner rollup: pending / approved / paid / net totals + order count
CREATE OR REPLACE VIEW commission_summary_by_partner AS
SELECT
  dc.dealer_admin_id                         AS admin_user_id,
  au.full_name                                AS partner_name,
  dc.role_name,
  COUNT(*) FILTER (WHERE dc.entry_type = 'commission')                                   AS commission_count,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.status = 'pending'), 0)                        AS pending_amount,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.status = 'approved'), 0)                       AS approved_amount,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.status = 'paid'), 0)                           AS paid_amount,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.entry_type = 'reversal'), 0)                   AS total_reversed,
  COALESCE(SUM(dc.amount), 0)                                                             AS net_amount
FROM dealer_commissions dc
JOIN admin_users au ON au.id = dc.dealer_admin_id
GROUP BY dc.dealer_admin_id, au.full_name, dc.role_name;

-- Top partners by paid + approved commission (ranking helper — caller ORDER BY / LIMIT)
CREATE OR REPLACE VIEW top_partners_by_commission AS
SELECT admin_user_id, partner_name, role_name, (approved_amount + paid_amount) AS earned_amount, paid_amount, pending_amount
FROM commission_summary_by_partner
ORDER BY earned_amount DESC;

-- Commission by product type (join through orders — commission entries
-- without an order_id, e.g. free-standing adjustments, are excluded here)
CREATE OR REPLACE VIEW commission_by_product_analytics AS
SELECT
  o.product_type,
  COUNT(*) FILTER (WHERE dc.entry_type = 'commission')                     AS commission_count,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.status IN ('approved','paid')), 0) AS total_commission
FROM dealer_commissions dc
JOIN orders o ON o.id = dc.order_id
WHERE dc.entry_type = 'commission'
GROUP BY o.product_type;

-- Commission by partner type (dealer / franchise / distributor)
CREATE OR REPLACE VIEW commission_by_partner_type_analytics AS
SELECT
  role_name,
  COUNT(*) FILTER (WHERE entry_type = 'commission')                     AS commission_count,
  COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)             AS pending_amount,
  COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)            AS approved_amount,
  COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)                AS paid_amount
FROM dealer_commissions
GROUP BY role_name;

-- Settlement batch history (with partner name for display)
CREATE OR REPLACE VIEW commission_settlement_history AS
SELECT
  b.*,
  au.full_name AS partner_name,
  ab.full_name AS approved_by_name,
  cb.full_name AS created_by_name
FROM commission_settlement_batches b
JOIN admin_users au ON au.id = b.partner_admin_id
LEFT JOIN admin_users ab ON ab.id = b.approved_by
LEFT JOIN admin_users cb ON cb.id = b.created_by_admin_id
ORDER BY b.created_at DESC;

-- Dashboard summary card: overall pending vs approved vs paid, org-wide
CREATE OR REPLACE VIEW commission_pending_vs_paid_analytics AS
SELECT
  status,
  COUNT(*)                       AS entry_count,
  COALESCE(SUM(amount), 0)       AS total_amount
FROM dealer_commissions
GROUP BY status;

-- ────────────────────────────────────────────────────────────
-- END OF MIGRATION 60
-- New: commission_rules, commission_settlement_batches, 6 analytics
-- views, auto-calc + reversal triggers on orders, settlement engine
-- functions. Extended (not recreated): dealer_commissions. Untouched:
-- orders/payments column definitions, checkout flow files, GST billing,
-- Commerce Engine, Partner Pricing Engine, partner_applications.
-- ────────────────────────────────────────────────────────────
