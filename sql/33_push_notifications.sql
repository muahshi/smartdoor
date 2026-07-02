-- ════════════════════════════════════════════════════════════════════════════
-- Migration 33: Production Push Notification Architecture (Ring/Nest-grade)
--
-- PURPOSE
--   Today, notifications only fire from client-side JS (services/
--   notificationDispatcher.js calling reg.showNotification()) — which ONLY
--   works while the owner's PWA/tab process is alive. This migration adds
--   the missing server-side leg: a DB-trigger → Edge Function → Web Push /
--   FCM pipeline that fires the moment an event is written to the database,
--   completely independent of whether the owner's browser/app is open.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch visitor_logs, message_logs, messages, or notifications
--     table DEFINITIONS (no columns removed, no renames).
--   - Does NOT create a second notifications pipeline — it hooks the
--     EXISTING write points (notifications insert, visitor_logs qr_scan
--     insert, messages insert) so there is exactly one path per event type,
--     server-driven, matching the "unified Notification Service" mandate.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / CREATE OR REPLACE / DROP+CREATE
-- for policies and triggers throughout. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Extensions ─────────────────────────────────────────────────────────
-- pg_net lets a Postgres trigger make an outbound HTTP call (to our Edge
-- Function) without any external cron/worker. This is the standard
-- Supabase-recommended pattern for "DB event → server push".
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 1. owner_devices — multi-device FCM/Web Push registry ─────────────────
CREATE TABLE IF NOT EXISTS owner_devices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL DEFAULT 'web',   -- 'android' | 'ios' | 'desktop' | 'web'
  device_name        TEXT,                          -- e.g. "Chrome on Pixel 8", set client-side
  push_provider      TEXT NOT NULL,                 -- 'webpush' | 'fcm'
  endpoint           TEXT,                          -- Web Push subscription endpoint (VAPID path)
  p256dh             TEXT,                          -- Web Push encryption key (VAPID path)
  auth_key           TEXT,                          -- Web Push auth secret (VAPID path)
  fcm_token          TEXT,                           -- FCM registration token (FCM path)
  user_agent         TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,  -- flipped false on invalid-token cleanup
  last_active_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb, -- future: per-device mute/priority
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owner_devices_provider_chk CHECK (push_provider IN ('webpush', 'fcm')),
  CONSTRAINT owner_devices_has_target_chk CHECK (
    (push_provider = 'webpush' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth_key IS NOT NULL)
    OR (push_provider = 'fcm' AND fcm_token IS NOT NULL)
  )
);

-- One row per physical subscription — re-subscribing (token/endpoint
-- refresh) updates the existing row instead of creating a duplicate device.
-- Plain (non-partial) unique indexes on purpose: Postgres treats NULLs as
-- distinct under a plain UNIQUE index (rows with a NULL endpoint/fcm_token
-- never conflict with each other), AND — unlike a partial unique index — a
-- plain one can be targeted directly by `ON CONFLICT (owner_id, endpoint)`
-- from services/pushRegistration.js's upsert() calls.
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_devices_endpoint
  ON owner_devices(owner_id, endpoint);
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_devices_fcm_token
  ON owner_devices(owner_id, fcm_token);

CREATE INDEX IF NOT EXISTS idx_owner_devices_owner_active
  ON owner_devices(owner_id, is_active);

DROP TRIGGER IF EXISTS trg_owner_devices_updated_at ON owner_devices;
CREATE TRIGGER trg_owner_devices_updated_at
  BEFORE UPDATE ON owner_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE owner_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_devices_select_own" ON owner_devices;
CREATE POLICY "owner_devices_select_own" ON owner_devices
  FOR SELECT USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "owner_devices_insert_own" ON owner_devices;
CREATE POLICY "owner_devices_insert_own" ON owner_devices
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "owner_devices_update_own" ON owner_devices;
CREATE POLICY "owner_devices_update_own" ON owner_devices
  FOR UPDATE USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "owner_devices_delete_own" ON owner_devices;
CREATE POLICY "owner_devices_delete_own" ON owner_devices
  FOR DELETE USING (owner_id = get_my_owner_id());

GRANT ALL ON owner_devices TO service_role;

COMMENT ON TABLE owner_devices IS
  'Registered owner devices for background push (Web Push VAPID + FCM). Multiple rows per owner_id = multiple devices, all notified in parallel.';

-- ── 2. system_config — tiny key/value store for the trigger's own wiring ──
-- Holds ONLY the Edge Function URL + a shared webhook secret (never the
-- Supabase service_role key, never VAPID/FCM private keys — those stay in
-- Edge Function secrets, server-side only). RLS locked down completely;
-- only the SECURITY DEFINER trigger function and service_role can read it.
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies — table is inaccessible via anon/authenticated
-- API keys entirely (PostgREST). Only service_role (bypasses RLS) and the
-- SECURITY DEFINER function below (owned by postgres) can read it.

GRANT ALL ON system_config TO service_role;

COMMENT ON TABLE system_config IS
  'Server-only key/value config. Currently holds push_function_url + push_webhook_secret used by fn_dispatch_push(). Populate via SQL Editor (service_role context), never via the app.';

-- ── 3. fn_dispatch_push() — the ONE trigger function every push-eligible
--       table insert calls. This is intentionally table-agnostic: it just
--       forwards { table, record } to the Edge Function, which owns all
--       event -> title/body/priority mapping (single source of truth,
--       see supabase/functions/send-push/index.ts). Never blocks or fails
--       the original INSERT — push delivery is best-effort by design.
CREATE OR REPLACE FUNCTION fn_dispatch_push()
RETURNS TRIGGER AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url    FROM system_config WHERE key = 'push_function_url';
  SELECT value INTO v_secret FROM system_config WHERE key = 'push_webhook_secret';

  -- Not configured yet (fresh install, secrets not set up) — no-op.
  -- This is what makes the whole feature safely inert until deployed.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.net_http_post_wrapper(v_url, v_secret, TG_TABLE_NAME, to_jsonb(NEW));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Push dispatch must NEVER break the write it's attached to.
  RAISE WARNING 'fn_dispatch_push failed for table %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Small wrapper isolates the actual net.http_post call so fn_dispatch_push
-- stays simple and pg_net's async request/response bookkeeping (which
-- writes to net._http_response) doesn't need to be inlined everywhere.
CREATE OR REPLACE FUNCTION extensions.net_http_post_wrapper(
  p_url TEXT, p_secret TEXT, p_table TEXT, p_record JSONB
) RETURNS BIGINT AS $$
  SELECT net.http_post(
    url     := p_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Secret', p_secret
    ),
    body    := jsonb_build_object('table', p_table, 'record', p_record),
    timeout_milliseconds := 5000
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions;

-- ── 4. Triggers — hook the EXISTING write points, one per event surface ───
-- notifications: covers everything already routed through services/
--   notifications.js dispatch() — bell, sos (owner + family), call requests,
--   inbox_message, and every lifecycle status_change (order/ship/deliver/
--   activate/renewal). This is the primary hook.
DROP TRIGGER IF EXISTS trg_push_on_notifications ON notifications;
CREATE TRIGGER trg_push_on_notifications
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION fn_dispatch_push();

-- visitor_logs: QR scans are inserted directly (never pass through
-- notifications.js), so they need their own hook. bell_ring/sos on this
-- table are intentionally EXCLUDED here — they already fire via the
-- notifications trigger above (notifyBellRing / triggerEmergencyBroadcast),
-- so including them here would double-send.
DROP TRIGGER IF EXISTS trg_push_on_visitor_logs ON visitor_logs;
CREATE TRIGGER trg_push_on_visitor_logs
  AFTER INSERT ON visitor_logs
  FOR EACH ROW WHEN (NEW.event_type = 'qr_scan')
  EXECUTE FUNCTION fn_dispatch_push();

-- messages (unified inbox, migration 31/32): covers Visitor Message, Voice
-- Message and AI Escalation. sender_type='owner' is intentionally excluded
-- — the owner who just sent that message is by definition already active,
-- so no push is needed for their own outbound reply.
DROP TRIGGER IF EXISTS trg_push_on_messages ON messages;
CREATE TRIGGER trg_push_on_messages
  AFTER INSERT ON messages
  FOR EACH ROW WHEN (NEW.sender_type IN ('visitor', 'ai'))
  EXECUTE FUNCTION fn_dispatch_push();

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-DEPLOY STEP (run separately, AFTER `supabase functions deploy send-push`):
--
--   INSERT INTO system_config (key, value) VALUES
--     ('push_function_url', 'https://<PROJECT_REF>.functions.supabase.co/send-push'),
--     ('push_webhook_secret', '<same value as PUSH_WEBHOOK_SECRET Edge Function secret>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
--
-- Until this INSERT is run, fn_dispatch_push() no-ops safely (see step 3) —
-- existing in-app / client-side notification behavior is completely
-- unaffected either way.
-- ════════════════════════════════════════════════════════════════════════════
