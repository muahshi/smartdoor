-- ════════════════════════════════════════════════════════════════════════════
-- Migration 25: Notifications Schema + Consolidation
--
-- Purpose:
--   1. Ensure notifications table has all required columns for Workflow 8
--      (auto-notifications on customer created, order created, QR generated,
--       plate activated, visitor arrived, subscription expiry, manufacturing
--       status, shipment status).
--   2. Add missing delivery_status column if not present.
--   3. Consolidate duplicate admin_session_revocations definitions.
--   4. Ensure activation_events table exists (used by admin-provision-customer
--      and verify-pin for audit trail).
--
-- Idempotent — safe to run multiple times.
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Ensure notifications table has delivery_status column ─────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivery_status JSONB DEFAULT '{}'::jsonb;

-- ── 2. Ensure notifications has channels column ──────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['in_app'];

-- ── 3. Ensure activation_events table exists ─────────────────────────────────
CREATE TABLE IF NOT EXISTS activation_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id     TEXT        NOT NULL,
  owner_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL, -- 'activated' | 'reactivated' | 'deactivated'
  event_detail TEXT,
  actor        TEXT        NOT NULL DEFAULT 'system', -- 'admin' | 'owner' | 'system'
  metadata     JSONB       DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookup by plate
CREATE INDEX IF NOT EXISTS idx_activation_events_plate_id
  ON activation_events(plate_id);

CREATE INDEX IF NOT EXISTS idx_activation_events_owner_id
  ON activation_events(owner_id);

-- RLS: admin service role only (no public access)
ALTER TABLE activation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activation_events_service_only" ON activation_events;
CREATE POLICY "activation_events_service_only" ON activation_events
  FOR ALL USING (false); -- only service_role (bypasses RLS) can access

GRANT ALL ON activation_events TO service_role;

-- ── 4. Ensure admin_session_revocations is idempotent (duplicate-safe) ───────
-- Already created in migrations 10, 16, 21 with IF NOT EXISTS — no action needed.
-- Adding missing index if somehow absent:
CREATE INDEX IF NOT EXISTS idx_admin_session_revocations_token
  ON admin_session_revocations(session_token);

-- ── 5. Notifications RLS — allow service_role to insert welcome notifications ─
-- The admin-provision-customer Edge Function uses service_role key, so it
-- bypasses RLS. But anon/authenticated users should only see their own.

-- Ensure existing policies cover owner reads:
DROP POLICY IF EXISTS "notifications_owner_read" ON notifications;
CREATE POLICY "notifications_owner_read" ON notifications
  FOR SELECT USING (auth.uid() = (
    SELECT auth_user_id FROM users WHERE id = owner_id LIMIT 1
  ));

DROP POLICY IF EXISTS "notifications_owner_update" ON notifications;
CREATE POLICY "notifications_owner_update" ON notifications
  FOR UPDATE USING (auth.uid() = (
    SELECT auth_user_id FROM users WHERE id = owner_id LIMIT 1
  ));

-- ── 6. Index for notifications realtime performance ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_owner_read
  ON notifications(owner_id, read, created_at DESC);

COMMIT;
