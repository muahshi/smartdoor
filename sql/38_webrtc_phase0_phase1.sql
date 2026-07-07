-- ════════════════════════════════════════════════════════════════════════════
-- Migration 38: WebRTC Phase 0 (Infra Validation) + Phase 1 (Presence Layer)
--
-- PURPOSE
--   Lays the additive groundwork for a future "WebRTC Voice Calling with
--   Masked Call Fallback" feature, per the approved architecture audit.
--   This migration implements ONLY:
--     - A generic, client-readable feature_flags table (global enable +
--       global kill switch for WebRTC calling).
--     - One new per-owner column on security_rules (per-owner WebRTC opt-in).
--     - A presence-event log table for monitoring owner online/offline
--       transitions (connect / disconnect / reconnect / stale_cleanup).
--
-- WHAT THIS DOES NOT DO
--   - Does NOT create rtc_sessions, SDP/ICE storage, or any signaling table.
--   - Does NOT touch call_logs, message_logs, initiate-call, call-status-webhook,
--     or any existing communication/payment/RBAC table or policy.
--   - Does NOT enable WebRTC for any owner — every new flag defaults to FALSE.
--   - Does NOT remove or alter any existing column, policy, or function.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/37_dealer_order_visibility.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. FEATURE FLAGS (generic, reusable key/value toggle table)
-- ────────────────────────────────────────────────────────────────────────
-- Distinct from `system_config` (sql/33_push_notifications.sql), which is
-- intentionally locked down with NO client-readable policies and reserved
-- for server-only secrets (push function URL, webhook secret). Feature
-- flags are booleans with no sensitive payload, so a narrow read-only
-- policy is safe and lets the client check flag state without an Edge
-- Function round trip. Writes are NOT exposed to anon/authenticated
-- clients — flip flags via the Supabase Dashboard / SQL Editor only,
-- exactly like system_config's own documented operating model.
CREATE TABLE IF NOT EXISTS feature_flags (
  key          TEXT PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_select_all" ON feature_flags;
CREATE POLICY "feature_flags_select_all" ON feature_flags
  FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy for anon/authenticated — service_role
-- (bypasses RLS) or the SQL Editor is the only way to change a flag.

-- Seed the two global WebRTC flags. ON CONFLICT DO NOTHING so re-running
-- this migration never resets a flag an operator has already toggled.
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('webrtc_global_enabled', FALSE, 'Master switch for WebRTC voice calling. Must be TRUE, AND the owner''s security_rules.webrtc_calling_enabled must be TRUE, for WebRTC to be attempted for that owner. Defaults FALSE — no behavior change until explicitly turned on.'),
  ('webrtc_kill_switch',    FALSE, 'Emergency kill switch. When TRUE, WebRTC is force-disabled for ALL owners regardless of any other flag, and the app falls back to the existing masked-call flow immediately. Defaults FALSE (not killed).')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE feature_flags IS
  'Read-only-to-clients boolean feature toggles. Currently holds only webrtc_global_enabled and webrtc_kill_switch. Change values via Supabase Dashboard > Table Editor or SQL Editor, never via the app.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. PER-OWNER WEBRTC OPT-IN (additive column on security_rules)
-- ────────────────────────────────────────────────────────────────────────
-- Mirrors the existing allow_calls / allow_sos / allow_voice boolean-flag
-- pattern already on this table. Defaults FALSE — existing owners are
-- unaffected until an operator (or a future owner-facing settings toggle,
-- out of scope for this phase) explicitly opts them in.
ALTER TABLE security_rules
  ADD COLUMN IF NOT EXISTS webrtc_calling_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN security_rules.webrtc_calling_enabled IS
  'Per-owner opt-in for WebRTC voice calling (Phase 2+). Has no effect unless feature_flags.webrtc_global_enabled is also TRUE and feature_flags.webrtc_kill_switch is FALSE. Defaults FALSE.';

-- Existing security_rules_select_own / security_rules RLS policies
-- (sql/02_rls_policies.sql) already cover SELECT/UPDATE scoped to
-- owner_id = get_my_owner_id() for the whole row, including this new
-- column — no new policy needed here.

-- ────────────────────────────────────────────────────────────────────────
-- 3. PRESENCE MONITORING EVENTS (Phase 1 observability only)
-- ────────────────────────────────────────────────────────────────────────
-- One row per presence transition, written client-side (best-effort,
-- fail-silent, same trust model as audit_logs writes from
-- services/communication.js#_audit()). This is NOT a signaling table and
-- holds no SDP/ICE/session data — it exists purely so Phase 1 presence
-- behavior (connects/disconnects/reconnects/stale cleanup) is observable
-- before any WebRTC calling logic is built on top of it.
CREATE TABLE IF NOT EXISTS rtc_presence_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,  -- 'connect' | 'disconnect' | 'reconnect' | 'stale_cleanup'
  device_count INTEGER,        -- number of distinct devices tracked present at event time
  device_id    TEXT,           -- this device's own presence key, for debugging multi-device fan-out
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtc_presence_events_owner
  ON rtc_presence_events(owner_id, created_at DESC);

ALTER TABLE rtc_presence_events ENABLE ROW LEVEL SECURITY;

-- Owner can read their own presence history (future admin/monitoring UI).
DROP POLICY IF EXISTS "rtc_presence_events_select_own" ON rtc_presence_events;
CREATE POLICY "rtc_presence_events_select_own" ON rtc_presence_events
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Only the authenticated owner's own browser writes its own presence
-- events (never anon, never another owner's id) — mirrors the trust
-- model of security_rules_update_own, not the anon-insert model used by
-- visitor-facing tables like message_logs.
DROP POLICY IF EXISTS "rtc_presence_events_insert_own" ON rtc_presence_events;
CREATE POLICY "rtc_presence_events_insert_own" ON rtc_presence_events
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

COMMENT ON TABLE rtc_presence_events IS
  'Phase 1 observability only: logs owner presence connect/disconnect/reconnect/stale_cleanup transitions from services/presence.js. No SDP/ICE/session data. Not used by any existing production feature.';

-- ────────────────────────────────────────────────────────────────────────
-- 4. HOUSEKEEPING: AUTO-PURGE OLD PRESENCE EVENTS
-- ────────────────────────────────────────────────────────────────────────
-- Mirrors purge_old_rate_limit_events() in sql/04_communication_schema.sql.
-- Optional — call periodically (pg_cron or a scheduled Edge Function) to
-- keep this table small. Not wired to any cron in this phase.
CREATE OR REPLACE FUNCTION purge_old_rtc_presence_events()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rtc_presence_events WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (see sql/38b_verify.sql)
-- ════════════════════════════════════════════════════════════════════════════
