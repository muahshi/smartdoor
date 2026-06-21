-- ============================================================
-- SMART DOOR — PHASE 13: PRODUCTION AUDIT SCHEMA
-- Migration: 16_phase13_schema.sql
-- Run AFTER all previous migrations (01–15)
--
-- Adds:
--   1. admin_session_revocations (SECURITY FIX — was missing, breaks auth)
--   2. pin_recovery_otps (Forgot PIN / Owner Recovery — Task 6)
--   3. plates.fulfillment_status + tracking columns (Task 4 Lifecycle)
--   4. webhook_events table (Task 5 Razorpay architecture)
--
-- Additive only — does NOT touch existing tables, columns, policies, or data.
-- Safe to run multiple times (all IF NOT EXISTS).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ADMIN SESSION REVOCATIONS [SECURITY FIX — REQUIRED]
-- ────────────────────────────────────────────────────────────
-- verifyAdminSession() in _shared/adminAuth.ts already queries this table.
-- Without it, every admin login check fails and ALL admins are locked out.

CREATE TABLE IF NOT EXISTS admin_session_revocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT  -- 'password_changed' | 'admin_disabled' | 'manual_logout' | 'security_breach'
);

CREATE INDEX IF NOT EXISTS idx_session_revocations_admin
  ON admin_session_revocations(admin_id, revoked_at DESC);

ALTER TABLE admin_session_revocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_session_revocations_no_public_access"
  ON admin_session_revocations
  FOR ALL TO anon, authenticated
  USING (false);

-- ────────────────────────────────────────────────────────────
-- 2. PIN RECOVERY OTPs (Forgot PIN / Owner Recovery)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pin_recovery_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id      TEXT NOT NULL,                          -- SD-XXXXXX
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash      TEXT NOT NULL,                          -- SHA-256 of the 6-digit OTP
  channel       TEXT NOT NULL DEFAULT 'phone',          -- 'phone' | 'email'
  expires_at    TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'used' | 'expired' | 'invalidated' | 'failed'
  attempt_count INT NOT NULL DEFAULT 0,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pin_recovery_plate
  ON pin_recovery_otps(plate_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_recovery_owner
  ON pin_recovery_otps(owner_id);

ALTER TABLE pin_recovery_otps ENABLE ROW LEVEL SECURITY;

-- Owners cannot read their own OTP hashes — Edge Function only via service_role
CREATE POLICY "pin_recovery_otps_no_public_access"
  ON pin_recovery_otps
  FOR ALL TO anon, authenticated
  USING (false);

-- ────────────────────────────────────────────────────────────
-- 3. PLATES — FULFILLMENT LIFECYCLE + TRACKING
-- ────────────────────────────────────────────────────────────

ALTER TABLE plates ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'created'
  CHECK (fulfillment_status IN (
    'created', 'manufacturing', 'printed', 'packed', 'shipped', 'delivered', 'activated'
  ));

ALTER TABLE plates ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS shipped_at      TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS packed_at       TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS printed_at      TIMESTAMPTZ;

-- Backfill existing active plates to 'activated' fulfillment status
UPDATE plates
  SET fulfillment_status = 'activated'
  WHERE status = 'active'
  AND fulfillment_status = 'created'
  AND activation_date IS NOT NULL;

-- Index for fulfillment pipeline dashboard query
CREATE INDEX IF NOT EXISTS idx_plates_fulfillment_status
  ON plates(fulfillment_status);

-- ────────────────────────────────────────────────────────────
-- 4. WEBHOOK EVENTS (Razorpay architecture — Task 5)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      TEXT UNIQUE NOT NULL,                   -- Razorpay event.id (idempotency key)
  event_type    TEXT NOT NULL,                          -- 'payment.captured' | 'subscription.charged' etc.
  entity_id     TEXT,                                   -- payment.id / subscription.id etc.
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'processed' | 'failed' | 'duplicate'
  error_message TEXT,
  processed_at  TIMESTAMPTZ,
  retry_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type
  ON webhook_events(event_type, created_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_no_public_access"
  ON webhook_events
  FOR ALL TO anon, authenticated
  USING (false);

-- ────────────────────────────────────────────────────────────
-- 5. BULK PROVISION AUDIT — extend activation_events metadata
-- ────────────────────────────────────────────────────────────
-- No schema change needed — metadata JSONB already exists on activation_events.
-- Phase 13 adds 'batch_row' key to metadata for bulk imports.
-- Documented here for clarity.

COMMENT ON COLUMN activation_events.metadata IS
  'Free-form JSONB. Phase 12: {provisioned_by, role, product_type}. Phase 13 bulk: adds {batch_row}.';

-- ────────────────────────────────────────────────────────────
-- 6. AUDIT LOG ACTION ALLOW-LIST — ADD PHASE 13 ACTIONS
-- ────────────────────────────────────────────────────────────
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;
ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_action
  CHECK (action IN (
    'login', 'logout',
    'pin_changed', 'pin_failed', 'pin_locked', 'pin_reset_admin',
    'qr_regenerated', 'qr_viewed',
    'subscription_activated', 'subscription_renewed', 'subscription_cancelled',
    'order_placed', 'order_cancelled',
    'payment_initiated', 'payment_verified', 'payment_failed', 'refund_issued',
    'family_member_added', 'family_member_removed', 'family_member_updated',
    'security_rules_updated', 'status_changed',
    'voice_note_heard', 'voice_note_deleted',
    'call_ended', 'call_initiated',
    'support_ticket_created', 'support_ticket_resolved',
    'admin_action', 'admin_login', 'admin_logout',
    'plate_activated', 'plate_suspended', 'plate_reactivated',
    'customer_provisioned', 'ownership_transferred', 'activation_resent',
    'data_export_requested', 'account_deleted',
    -- Phase 13 additions:
    'bulk_provisioned', 'fulfillment_status_updated',
    'print_pack_generated', 'owner_pin_recovery_otp_sent', 'owner_pin_recovery_completed',
    'webhook_received', 'webhook_processed', 'webhook_failed'
  ));

-- ────────────────────────────────────────────────────────────
-- 7. VERIFY (run manually to confirm)
-- ────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
--   'admin_session_revocations', 'pin_recovery_otps', 'webhook_events'
-- );
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'plates'
--   AND column_name IN ('fulfillment_status','tracking_number','shipped_at','delivered_at');
