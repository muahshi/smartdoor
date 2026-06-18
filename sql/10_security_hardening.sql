-- ============================================================
-- SMART DOOR — PHASE 8: SECURITY HARDENING
-- sql/10_security_hardening.sql
--
-- Run AFTER 09_performance_indexes.sql
-- Fixes RLS policy gaps, hardens storage, adds PIN lockout.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: FIX OVERLY-PERMISSIVE RLS POLICIES
-- ────────────────────────────────────────────────────────────

-- PROBLEM: visitor_logs_insert_anon allows ANY data to be inserted by anon.
-- FIX: Restrict to valid plate_id format only.
DROP POLICY IF EXISTS "visitor_logs_insert_anon" ON visitor_logs;
CREATE POLICY "visitor_logs_insert_anon" ON visitor_logs
  FOR INSERT WITH CHECK (
    plate_id ~ '^SD-[A-Z0-9]{6}$'
    AND event_type IN ('qr_scan', 'bell_ring', 'voice_message', 'call_attempt', 'spam_blocked', 'sos', 'ai_intent')
    AND (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))
  );

-- PROBLEM: security_rules_public_read exposes ALL columns to anon users.
-- FIX: Replace table-level policy with a restricted VIEW.
DROP POLICY IF EXISTS "security_rules_public_read" ON security_rules;

-- Create a visitor-safe view (only non-sensitive fields)
CREATE OR REPLACE VIEW visitor_security_view AS
  SELECT
    owner_id,
    night_mode_on,
    night_mode_start,
    night_mode_end,
    allow_sos,
    allow_voice,
    allow_calls,
    current_status,
    custom_message
    -- Deliberately excluded: do_not_disturb details, family config, etc.
  FROM security_rules;

-- Anon can read from the view (not the table directly)
-- Grant SELECT on view to anon role
GRANT SELECT ON visitor_security_view TO anon;

-- Owner can still read their own full row
CREATE POLICY "security_rules_select_own_only" ON security_rules
  FOR SELECT USING (owner_id = get_my_owner_id());

-- PROBLEM: users_insert_registration allows ANY insert with no validation.
-- FIX: This should only happen via service_role (Edge Function), not anon.
DROP POLICY IF EXISTS "users_insert_registration" ON users;
-- Do NOT add anon insert back — registration always goes through Edge Function with service_role.

-- PROBLEM: voice_notes_insert_anon is completely open.
-- FIX: Restrict to valid plate_id and storage path format.
DROP POLICY IF EXISTS "voice_notes_insert_anon" ON voice_notes;
CREATE POLICY "voice_notes_insert_anon" ON voice_notes
  FOR INSERT WITH CHECK (
    plate_id ~ '^SD-[A-Z0-9]{6}$'
    AND storage_path LIKE 'voice-notes/%'
    AND duration_secs > 0
    AND duration_secs <= 120  -- Max 2 minutes
  );

-- ────────────────────────────────────────────────────────────
-- SECTION 2: PIN LOCKOUT SYSTEM
-- ────────────────────────────────────────────────────────────

-- Track failed PIN attempts (server-side, not client-side)
CREATE TABLE IF NOT EXISTS pin_lockouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id      TEXT NOT NULL,
  failed_count  INTEGER DEFAULT 1,
  locked_until  TIMESTAMPTZ,           -- NULL = not locked
  last_attempt  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plate_id)
);

ALTER TABLE pin_lockouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pin_lockouts_no_public" ON pin_lockouts
  FOR ALL TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_pin_lockouts_plate_id
  ON pin_lockouts(plate_id);

CREATE INDEX IF NOT EXISTS idx_pin_lockouts_locked_until
  ON pin_lockouts(locked_until)
  WHERE locked_until IS NOT NULL;

-- Function: record a failed PIN attempt and return lockout status
CREATE OR REPLACE FUNCTION record_failed_pin(p_plate_id TEXT)
RETURNS JSONB AS $$
DECLARE
  rec pin_lockouts%ROWTYPE;
  max_attempts CONSTANT INTEGER := 5;
  lockout_minutes CONSTANT INTEGER := 15;
BEGIN
  -- Upsert failed attempt
  INSERT INTO pin_lockouts (plate_id, failed_count, last_attempt)
  VALUES (p_plate_id, 1, NOW())
  ON CONFLICT (plate_id) DO UPDATE
    SET failed_count = pin_lockouts.failed_count + 1,
        last_attempt = NOW()
  RETURNING * INTO rec;

  -- Apply lockout if threshold exceeded
  IF rec.failed_count >= max_attempts THEN
    UPDATE pin_lockouts
    SET locked_until = NOW() + (lockout_minutes || ' minutes')::INTERVAL
    WHERE plate_id = p_plate_id
    RETURNING * INTO rec;

    RETURN jsonb_build_object(
      'locked', true,
      'failed_count', rec.failed_count,
      'locked_until', rec.locked_until,
      'retry_after_minutes', lockout_minutes
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', false,
    'failed_count', rec.failed_count,
    'attempts_remaining', max_attempts - rec.failed_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: check if plate is currently locked out
CREATE OR REPLACE FUNCTION check_pin_lockout(p_plate_id TEXT)
RETURNS JSONB AS $$
DECLARE
  rec pin_lockouts%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM pin_lockouts WHERE plate_id = p_plate_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('locked', false, 'failed_count', 0);
  END IF;

  -- If lockout has expired, reset
  IF rec.locked_until IS NOT NULL AND rec.locked_until < NOW() THEN
    UPDATE pin_lockouts
    SET failed_count = 0, locked_until = NULL
    WHERE plate_id = p_plate_id;
    RETURN jsonb_build_object('locked', false, 'failed_count', 0);
  END IF;

  IF rec.locked_until IS NOT NULL THEN
    RETURN jsonb_build_object(
      'locked', true,
      'locked_until', rec.locked_until,
      'failed_count', rec.failed_count,
      'seconds_remaining', EXTRACT(EPOCH FROM (rec.locked_until - NOW()))::INTEGER
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', false,
    'failed_count', COALESCE(rec.failed_count, 0),
    'attempts_remaining', 5 - COALESCE(rec.failed_count, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: reset lockout on successful login
CREATE OR REPLACE FUNCTION reset_pin_lockout(p_plate_id TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM pin_lockouts WHERE plate_id = p_plate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: STORAGE BUCKET POLICIES
-- (Run these via Supabase Dashboard > Storage > Policies)
-- Documented here for reference and manual execution.
-- ────────────────────────────────────────────────────────────

-- ── voice-notes bucket (PRIVATE) ──
-- INSERT (anon): Visitors can upload to their plate's folder only
--   bucket_id = 'voice-notes'
--   AND (storage.foldername(name))[1] = split_part(name, '/', 1)
--   AND name ~ '^SD-[A-Z0-9]{6}/'    <- folder must match plate_id format
--   AND octet_length(name) < 200

-- SELECT (authenticated): Owner can read their own voice notes
--   bucket_id = 'voice-notes'
--   AND (storage.foldername(name))[1] = (
--     SELECT plate_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
--   )

-- ── qr-codes bucket (PUBLIC read, service_role write) ──
-- SELECT: public = true (set in bucket settings)
-- INSERT/UPDATE/DELETE: service_role only (no anon/user policy)

-- ── user-uploads bucket (PRIVATE) ──
-- SELECT/INSERT/UPDATE/DELETE:
--   auth.uid() IS NOT NULL
--   AND (storage.foldername(name))[1] = auth.uid()::text

-- ── plate-assets bucket (PUBLIC read) ──
-- SELECT: public = true
-- INSERT/DELETE: service_role only

-- ────────────────────────────────────────────────────────────
-- SECTION 4: ADMIN PANEL ADDITIONAL SECURITY
-- ────────────────────────────────────────────────────────────

-- Admin session invalidation table
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ DEFAULT NOW(),
  reason     TEXT
);

ALTER TABLE admin_session_revocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_revocations_no_public" ON admin_session_revocations
  FOR ALL TO anon, authenticated USING (false);

-- ────────────────────────────────────────────────────────────
-- SECTION 5: AUDIT LOG EXPANSION
-- Add action types previously missing from audit_logs
-- ────────────────────────────────────────────────────────────

-- Add CHECK constraint to audit_logs.action (allow-listed actions)
-- NOTE: Add new actions to this list before using them in code.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_action'
  ) THEN
    ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_action
      CHECK (action IN (
        'login', 'logout',
        'pin_changed', 'pin_failed', 'pin_locked',
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
        'plate_activated', 'plate_suspended',
        'data_export_requested', 'account_deleted'
      ));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 6: DATA RETENTION POLICIES
-- ────────────────────────────────────────────────────────────

-- Function: purge old visitor logs (GDPR / retention compliance)
-- Retains: 90 days of visitor_logs
-- Retains: 365 days of audit_logs
-- Retains: 30 days of error_logs (managed in Section 10 of prev migration)
-- Retains: voice notes until explicitly deleted by owner

CREATE OR REPLACE FUNCTION purge_old_data()
RETURNS TABLE(table_name TEXT, rows_deleted BIGINT) AS $$
DECLARE
  deleted_visitor BIGINT;
  deleted_audit   BIGINT;
  deleted_errors  BIGINT;
  deleted_rate    BIGINT;
BEGIN
  -- Visitor logs: 90 days
  DELETE FROM visitor_logs WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_visitor = ROW_COUNT;

  -- Audit logs: 365 days
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '365 days';
  GET DIAGNOSTICS deleted_audit = ROW_COUNT;

  -- Error logs: 90 days
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_errors = ROW_COUNT;

  -- Rate limit events: 24 hours
  DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_rate = ROW_COUNT;

  RETURN QUERY VALUES
    ('visitor_logs', deleted_visitor),
    ('audit_logs', deleted_audit),
    ('error_logs', deleted_errors),
    ('rate_limit_events', deleted_rate);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule via pg_cron (enable extension first):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('purge-old-data', '0 2 * * *', 'SELECT purge_old_data()');

-- ────────────────────────────────────────────────────────────
-- SECTION 7: PHONE NUMBER MASKING IN LOGS
-- ────────────────────────────────────────────────────────────

-- Function: mask a phone number for display (never expose full number in logs)
CREATE OR REPLACE FUNCTION mask_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone IS NULL OR length(phone) < 4 THEN RETURN '****'; END IF;
  RETURN OVERLAY(phone PLACING '******' FROM 3 FOR length(phone) - 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example: mask_phone('9876543210') → '98******10'

-- ────────────────────────────────────────────────────────────
-- SECTION 8: VERIFY HARDENING (informational queries)
-- ────────────────────────────────────────────────────────────

-- Verify no anon INSERT policy on users table:
-- SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'users' AND cmd = 'INSERT';
-- Expected: 0 rows (only service_role can insert users now)

-- Verify security_rules has no wildcard anon SELECT:
-- SELECT policyname FROM pg_policies
--   WHERE tablename = 'security_rules' AND roles @> '{anon}';
-- Expected: 0 rows (visitor reads via visitor_security_view)

-- Verify pin_lockouts is not readable by anon:
-- SELECT policyname FROM pg_policies
--   WHERE tablename = 'pin_lockouts';
-- Expected: only 'pin_lockouts_no_public'
