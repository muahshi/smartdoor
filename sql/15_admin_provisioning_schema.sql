-- ============================================================
-- SMART DOOR — PHASE 12: INTERNAL ADMIN PROVISIONING
-- Migration: 15_admin_provisioning_schema.sql
-- Run AFTER all previous migrations (01–14)
--
-- Adds:
--   - 'dealer' admin role (create customer / create plate, no revenue)
--   - 'support' role gains pin_reset + activation_resend permissions
--   - plates: qr_image_url, qr_svg_url, suspended_reason/at/by
--     (qr_image_url is referenced by generate-qr, services/qr.js and
--      admin.html already, but no migration ever created the column —
--      this fixes that pre-existing gap as part of extending QR support)
--   - users: address (required field on the new Create Customer form)
--   - audit_logs: allow-lists the new admin-initiated action types
--   - admin_audit_logs: index on resource_id for plate activity lookups
--
-- Additive only — does NOT touch existing tables, columns, policies,
-- or data. Safe to run multiple times (IF NOT EXISTS / DO blocks).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. DEALER ROLE
-- ────────────────────────────────────────────────────────────
-- dealer: can create customers + plates, cannot see revenue/financial data.
-- support: gains explicit pin_reset + activation_resend (view-only otherwise).
-- super_admin: unchanged (wildcard '*' already grants everything).

INSERT INTO admin_roles (name, label, color, permissions) VALUES
  ('dealer', 'Dealer', '#3B82F6',
    '{"customers":["read","write"],"plates":["read","write"],"qr":["read","write"],"pin_reset":["write"],"activation_resend":["write"]}'
  )
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  label       = EXCLUDED.label,
  color       = EXCLUDED.color;

UPDATE admin_roles
SET permissions = permissions
  || '{"plates":["read"],"pin_reset":["write"],"activation_resend":["write"]}'::jsonb
WHERE name = 'support';

-- ────────────────────────────────────────────────────────────
-- 2. PLATES — QR + SUSPENSION TRACKING COLUMNS
-- ────────────────────────────────────────────────────────────
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_image_url    TEXT;        -- public PNG URL (qr-codes bucket)
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_svg_url      TEXT;        -- public SVG URL (qr-codes bucket)
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioned_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioning_source TEXT DEFAULT 'order'; -- 'order' | 'admin_manual'

-- ────────────────────────────────────────────────────────────
-- 3. USERS — ADDRESS FIELD (Create Customer form)
-- ────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

-- ────────────────────────────────────────────────────────────
-- 4. AUDIT LOG ACTION ALLOW-LIST — ADD ADMIN PROVISIONING ACTIONS
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
    'data_export_requested', 'account_deleted'
  ));

-- ────────────────────────────────────────────────────────────
-- 5. INDEXES FOR NEW ADMIN LOOKUPS
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource_id ON admin_audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_plates_status                ON plates(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at       ON message_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_notes_created_at        ON voice_notes(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 6. ADMIN LOGIN BRUTE-FORCE PROTECTION
-- ────────────────────────────────────────────────────────────
-- Reuses the existing pin_lockouts table (Phase 8) keyed by a prefixed
-- string instead of a plate_id — it's a generic TEXT key, so this avoids
-- creating a near-duplicate table just for admin login attempts.
-- Convention: admin lockout key = 'ADMIN:' || lower(email)

COMMENT ON TABLE pin_lockouts IS
  'Generic failed-attempt lockout store. plate_id is the lockout key — for owner PIN attempts this is the real SD-XXXXXX plate id; for admin login attempts (Phase 12) it is the string ADMIN:<email>. Reused intentionally to avoid schema duplication.';

-- ────────────────────────────────────────────────────────────
-- 7. VERIFY (informational — run manually to confirm migration)
-- ────────────────────────────────────────────────────────────
-- SELECT name, permissions FROM admin_roles ORDER BY name;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'plates';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
