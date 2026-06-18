-- ============================================================
-- SMART DOOR — PHASE 8: PERFORMANCE INDEXES & CONSTRAINTS
-- sql/09_performance_indexes.sql
--
-- Run AFTER all previous migrations (01–08).
-- Additive only — safe to run on existing data.
-- Estimated execution time on 100k rows: < 30 seconds (CONCURRENTLY).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: CORE TABLE INDEXES
-- ────────────────────────────────────────────────────────────

-- users — plate_id is the primary lookup key for login
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_plate_id
  ON users(plate_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone
  ON users(phone);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users(email)
  WHERE email IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_auth_user_id
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- plates — qr_slug is hit on every QR scan (highest traffic query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plates_qr_slug
  ON plates(qr_slug);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plates_owner_id
  ON plates(owner_id);

-- Partial index: active plates only (most QR lookups filter status='active')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plates_qr_slug_active
  ON plates(qr_slug)
  WHERE status = 'active';

-- subscriptions — frequently queried by owner + status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_owner_id
  ON subscriptions(owner_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_owner_active
  ON subscriptions(owner_id, status)
  WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_expiry_date
  ON subscriptions(expiry_date)
  WHERE status = 'active';

-- ────────────────────────────────────────────────────────────
-- SECTION 2: VISITOR LOGS (highest write volume table)
-- ────────────────────────────────────────────────────────────

-- Dashboard live feed: owner_id + created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_logs_owner_created
  ON visitor_logs(owner_id, created_at DESC);

-- Event type filtering (stats queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_logs_owner_event_type
  ON visitor_logs(owner_id, event_type, created_at DESC);

-- plate_id lookup (for visitor-side rate limiting)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_logs_plate_id
  ON visitor_logs(plate_id, created_at DESC);

-- AI intent analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_logs_ai_intent
  ON visitor_logs(owner_id, ai_intent)
  WHERE ai_intent IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: VOICE NOTES
-- ────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voice_notes_owner_created
  ON voice_notes(owner_id, created_at DESC);

-- Unheard notes badge count
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voice_notes_owner_unheard
  ON voice_notes(owner_id, is_heard)
  WHERE is_heard = FALSE;

-- ────────────────────────────────────────────────────────────
-- SECTION 4: FAMILY MEMBERS
-- ────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_family_members_owner_priority
  ON family_members(owner_id, priority ASC)
  WHERE is_active = TRUE;

-- ────────────────────────────────────────────────────────────
-- SECTION 5: SECURITY RULES
-- ────────────────────────────────────────────────────────────

-- One row per owner — unique constraint already exists via UNIQUE column,
-- but a covering index speeds up QR visitor lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_rules_owner_id
  ON security_rules(owner_id);

-- ────────────────────────────────────────────────────────────
-- SECTION 6: COMMUNICATION TABLES
-- ────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_owner_created
  ON call_logs(owner_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_plate_id
  ON call_logs(plate_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_status
  ON call_logs(call_status)
  WHERE call_status IN ('initiated', 'ringing', 'in_progress');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_logs_owner_created
  ON message_logs(owner_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_logs_plate_type
  ON message_logs(plate_id, message_type, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 7: RATE LIMITING TABLE
-- ────────────────────────────────────────────────────────────

-- check_rate_limit() RPC uses plate_id + action_type + created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rate_limit_events_lookup
  ON rate_limit_events(plate_id, action_type, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 8: COMMERCE / ORDERS
-- ────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_owner_id
  ON orders(owner_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_payment_status
  ON orders(payment_status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_email
  ON orders(customer_email, created_at DESC)
  WHERE customer_email IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_order_number
  ON orders(order_number);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_order_id
  ON payments(order_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_provider_payment_id
  ON payments(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- Idempotency: one captured payment per provider_payment_id
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_captured_unique
  ON payments(provider_payment_id)
  WHERE status = 'captured' AND provider_payment_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracking_events_order_id
  ON tracking_events(order_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manufacturing_order_id
  ON manufacturing(order_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manufacturing_status
  ON manufacturing(production_status, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 9: AUDIT / NOTIFICATIONS
-- ────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_owner_action
  ON audit_logs(owner_id, action, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_owner_unread
  ON notifications(owner_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- ────────────────────────────────────────────────────────────
-- SECTION 10: ERROR LOGS (Phase 8 new table)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS error_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level       TEXT NOT NULL,         -- 'warn' | 'error' | 'fatal'
  category    TEXT NOT NULL,         -- matches Category enum in monitoring.js
  message     TEXT NOT NULL,
  meta        JSONB DEFAULT '{}',
  session_id  TEXT,
  user_agent  TEXT,
  url         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "error_logs_no_public_access" ON error_logs
  FOR ALL TO anon, authenticated USING (false);
-- Service role only

CREATE INDEX IF NOT EXISTS idx_error_logs_level_created
  ON error_logs(level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_category_created
  ON error_logs(category, created_at DESC);

-- Auto-purge old error logs after 90 days (run via pg_cron or Supabase scheduled functions)
-- SELECT cron.schedule('purge-error-logs', '0 3 * * *',
--   $$DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '90 days'$$);

-- ────────────────────────────────────────────────────────────
-- SECTION 11: DATA INTEGRITY CONSTRAINTS
-- ────────────────────────────────────────────────────────────

-- Ensure PIN hash is never stored as plain text (must be bcrypt: starts with $2)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_pin_hash_bcrypt'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_pin_hash_bcrypt
      CHECK (pin_hash = 'UNSET' OR pin_hash LIKE '$2%');
  END IF;
END $$;

-- Ensure product_type is always one of valid values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_product_type'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_product_type
      CHECK (product_type IN ('acrylic', 'stainless', 'teakwood'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_plates_product_type'
  ) THEN
    ALTER TABLE plates ADD CONSTRAINT chk_plates_product_type
      CHECK (product_type IN ('acrylic', 'stainless', 'teakwood'));
  END IF;
END $$;

-- Ensure payment amounts are positive
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount_positive'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payments_amount_positive
      CHECK (amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_total_positive'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_total_positive
      CHECK (total_amount > 0);
  END IF;
END $$;

-- Ensure plate_id format: SD-XXXXXX
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_plates_plate_id_format'
  ) THEN
    ALTER TABLE plates ADD CONSTRAINT chk_plates_plate_id_format
      CHECK (plate_id ~ '^SD-[A-Z0-9]{6}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_plate_id_format'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_plate_id_format
      CHECK (plate_id ~ '^SD-[A-Z0-9]{6}$' OR plate_id IS NULL);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 12: QUERY OPTIMIZATION — STATISTICS
-- ────────────────────────────────────────────────────────────

-- Update planner statistics on high-traffic tables
ANALYZE visitor_logs;
ANALYZE call_logs;
ANALYZE message_logs;
ANALYZE plates;
ANALYZE orders;
ANALYZE payments;
ANALYZE subscriptions;
ANALYZE rate_limit_events;

-- ────────────────────────────────────────────────────────────
-- SECTION 13: REALTIME PUBLICATION
-- (Ensure Phase 8 new table is excluded from realtime)
-- ────────────────────────────────────────────────────────────

-- error_logs should NOT be in realtime pub (noisy, admin-only)
-- If using 'supabase_realtime' publication with specific tables,
-- do NOT add error_logs to it.

-- ────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run to confirm indexes were created)
-- ────────────────────────────────────────────────────────────

-- SELECT indexname, tablename, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- CHECK constraint violations:
-- SELECT id, pin_hash FROM users WHERE pin_hash NOT LIKE '$2%' AND pin_hash != 'UNSET';
