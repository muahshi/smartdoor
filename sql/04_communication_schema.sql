-- ============================================================
-- SMART DOOR — PHASE 5: COMMUNICATION ENGINE SCHEMA
-- Run AFTER 01_schema.sql, 02_rls_policies.sql, 03_realtime_seed.sql
--
-- Adds: call_logs, message_logs, rate_limit_events
-- Extends: notifications (multi-channel architecture columns)
-- Does NOT touch existing tables' data — additive only.
-- ============================================================

-- ────────── 1. CALL LOGS ──────────
-- One row per masked call attempt (Visitor → Virtual Number → Owner / Family)
CREATE TABLE IF NOT EXISTS call_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id            TEXT NOT NULL,
  visitor_identifier  TEXT,                          -- hashed/partial visitor phone or session id — NEVER the raw owner/visitor number pair stored together
  masked_number        TEXT,                          -- virtual number used to bridge the call
  call_status          TEXT DEFAULT 'initiated',       -- 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'rejected'
  duration              INTEGER DEFAULT 0,              -- seconds
  provider              TEXT DEFAULT 'exotel',           -- 'exotel' | 'twilio'
  provider_call_sid    TEXT,                           -- provider's call/session id, for webhook reconciliation
  routed_to_priority   INTEGER DEFAULT 1,              -- which family_members priority tier answered/was tried
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  ended_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 2. MESSAGE LOGS ──────────
-- Unified visitor → owner message log: text, voice, emergency
CREATE TABLE IF NOT EXISTS message_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id            TEXT NOT NULL,
  visitor_identifier  TEXT,
  message_type        TEXT NOT NULL,                  -- 'text' | 'voice' | 'emergency'
  content              TEXT,                           -- text body (null for pure voice messages)
  voice_note_id        UUID REFERENCES voice_notes(id) ON DELETE SET NULL,
  priority              TEXT DEFAULT 'normal',          -- 'normal' | 'high' | 'critical' (critical = emergency/SOS)
  is_read               BOOLEAN DEFAULT FALSE,
  delivered_channels    JSONB DEFAULT '[]',             -- e.g. ["in_app","sms"] — which channels actually fired
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 3. RATE LIMIT EVENTS ──────────
-- Sliding-window abuse protection: spam calls, repeated scans, repeated SOS, etc.
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id            TEXT NOT NULL,
  visitor_identifier  TEXT,                            -- device fingerprint / session id (no PII required)
  action_type         TEXT NOT NULL,                   -- 'qr_scan' | 'call_attempt' | 'voice_message' | 'sos' | 'text_message'
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 4. EXTEND NOTIFICATIONS (multi-channel architecture) ──────────
-- Additive columns only — existing rows unaffected by defaults.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '["in_app"]';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';        -- 'normal' | 'high' | 'critical'
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_status JSONB DEFAULT '{}';     -- per-channel delivery state, e.g. {"push":"sent","sms":"pending"}

-- ────────── INDEXES ──────────
CREATE INDEX IF NOT EXISTS idx_call_logs_owner       ON call_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_plate       ON call_logs(plate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_sid         ON call_logs(provider_call_sid);
CREATE INDEX IF NOT EXISTS idx_message_logs_owner    ON message_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_plate    ON message_logs(plate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_type     ON message_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window     ON rate_limit_events(plate_id, action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_visitor     ON rate_limit_events(visitor_identifier, action_type, created_at DESC);

-- ────────── 5. RATE LIMIT CHECK FUNCTION ──────────
-- Reusable server-side check: how many actions of a given type has this plate/visitor
-- triggered within the last `p_window_secs` seconds? Called from Edge Functions and,
-- optionally, directly by anon clients (read-only, no PII exposed).
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_plate_id   TEXT,
  p_action_type TEXT,
  p_window_secs INTEGER DEFAULT 60,
  p_max_count   INTEGER DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM rate_limit_events
  WHERE plate_id = p_plate_id
    AND action_type = p_action_type
    AND created_at >= NOW() - (p_window_secs || ' seconds')::INTERVAL;

  RETURN recent_count < p_max_count; -- TRUE = allowed, FALSE = blocked
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────── 6. AUTO-LOG RATE LIMIT EVENT FUNCTION ──────────
-- Convenience RPC so anon clients can record an attempt without needing a custom policy per table.
CREATE OR REPLACE FUNCTION log_rate_limit_event(
  p_plate_id            TEXT,
  p_visitor_identifier  TEXT,
  p_action_type          TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO rate_limit_events (plate_id, visitor_identifier, action_type)
  VALUES (p_plate_id, p_visitor_identifier, p_action_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────── HOUSEKEEPING: AUTO-PURGE OLD RATE LIMIT ROWS ──────────
-- Optional — call periodically (e.g. via pg_cron or a scheduled Edge Function) to keep the table small.
CREATE OR REPLACE FUNCTION purge_old_rate_limit_events()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
