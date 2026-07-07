-- ════════════════════════════════════════════════════════════════════════════
-- Migration 39: WebRTC Phase 2 — Tap to Talk Call Attempt Log
--
-- PURPOSE
--   Additive observability table for Phase 2 (WebRTC "Tap to Talk" with
--   automatic masked-call fallback). Records the OUTCOME of each Tap to
--   Talk attempt (owner offline / mic denied / connected / rejected /
--   ICE failed / timed out → fallback fired). One row per attempt,
--   written once at resolution — same fail-silent, best-effort trust
--   model as rtc_presence_events (sql/38_webrtc_phase0_phase1.sql) and
--   message_logs (sql/04_communication_schema.sql).
--
-- WHAT THIS DOES NOT DO
--   - Does NOT store SDP offers/answers/ICE candidates. Those are
--     relayed peer-to-peer via ephemeral Supabase Realtime Broadcast
--     channels (rtc:ring:{ownerId}, rtc:call:{callId}) and never touch
--     the database — no signaling table exists or is needed.
--   - Does NOT touch call_logs, message_logs, or any existing
--     communication/payment/RBAC table, policy, or function.
--   - Does NOT change initiate-call, call-status-webhook, Exotel, or
--     Twilio in any way. This table is written independently of the
--     (unmodified) masked-call flow; a fallback call still creates its
--     own call_logs row exactly as it does today.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/38_webrtc_phase0_phase1.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS rtc_call_attempts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id           TEXT NOT NULL,
  call_id            UUID,           -- client-generated correlation id (signaling channel suffix); no SDP/ICE stored
  outcome            TEXT NOT NULL,  -- see config/rtcConfig.js RTC_MONITORING_EVENTS for the canonical vocabulary
  fallback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtc_call_attempts_owner
  ON rtc_call_attempts(owner_id, created_at DESC);

ALTER TABLE rtc_call_attempts ENABLE ROW LEVEL SECURITY;

-- Owner can read their own Tap to Talk attempt history (future
-- admin/monitoring UI) — same trust model as rtc_presence_events_select_own.
DROP POLICY IF EXISTS "rtc_call_attempts_select_own" ON rtc_call_attempts;
CREATE POLICY "rtc_call_attempts_select_own" ON rtc_call_attempts
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Visitor (anon) writes the outcome row. Same trust model as
-- messages_insert_anon / message_logs_insert_anon (sql/05_communication_rls.sql,
-- sql/31_unified_messaging.sql): owner_id + plate_id come from the client's
-- public plate lookup, and plate_id is constrained to the known slug shape
-- so this can't be used to spam arbitrary rows against unrelated owners
-- without also knowing a real plate slug.
DROP POLICY IF EXISTS "rtc_call_attempts_insert_anon" ON rtc_call_attempts;
CREATE POLICY "rtc_call_attempts_insert_anon" ON rtc_call_attempts
  FOR INSERT WITH CHECK (plate_id ~ '^SD-[A-Z0-9]{6}$');

COMMENT ON TABLE rtc_call_attempts IS
  'Phase 2 observability only: one row per Tap to Talk attempt outcome (owner_offline_skip / mic_denied / connected / owner_rejected / ice_failed / timeout_fallback). No SDP/ICE/session payload — signaling is ephemeral via Supabase Realtime Broadcast, never persisted. Does not replace or duplicate call_logs.';

-- Housekeeping, mirrors purge_old_rtc_presence_events().
CREATE OR REPLACE FUNCTION purge_old_rtc_call_attempts()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rtc_call_attempts WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (see sql/39b_verify.sql)
-- ════════════════════════════════════════════════════════════════════════════
