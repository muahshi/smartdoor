-- ════════════════════════════════════════════════════════════════════════════
-- SMART DOOR — PHASE 10: OBSERVABILITY & RELIABILITY
-- Migration: 62_observability_reliability_phase10.sql
-- Run AFTER all previous migrations (01–61)
--
-- AUDIT SUMMARY — already exists, NOT touched by this migration:
--   error_logs (sql/09), admin_audit_logs (sql/08), renewal_engine_logs
--   (sql/11), webhook_events incl. retry_count (sql/16 phase13), rtc_call_attempts
--   / rtc_presence_events (sql/38-40), notification_center /
--   notification_preferences (sql/48), backup_snapshots (sql/56),
--   product_skus / warranties (sql/56), purge_old_data() + pg_cron
--   schedule for existing purge jobs (sql/10, sql/49). The admin.html
--   "System Health" panel + operations_health Edge Function type already
--   surface edge-fn / AI / realtime / webhook / renewal-engine / error-log
--   health — none of that is rebuilt here.
--
-- REAL GAPS closed by this migration (nothing above already covered these):
--   1. error_logs has no request_id/correlation_id column — a client error
--      and the edge-function-side error it triggered could never be
--      stitched together. Added as a nullable column (backward compatible;
--      every existing row simply has NULL).
--   2. No persistent alert record exists anywhere. services/monitoring.js's
--      _triggerAlert() only ever did console.error with a "TODO: wire to
--      admin notification" — alerts were never actually visible to anyone
--      outside an open devtools console. New system_alerts table gives
--      alerts a durable, queryable, acknowledgeable record.
--   3. Push notification delivery (FCM, supabase/functions/send-push) only
--      ever logged success/failure to the Edge Function's own console —
--      nothing persisted, so "Notification delivery" as a reliability
--      metric was structurally impossible to report on. New
--      push_delivery_logs table closes this.
--   4. The 6 pg_cron jobs scheduled in sql/49 (purge-old-data etc.) run
--      completely unmonitored from the app's point of view — Supabase's
--      own cron.job_run_details exists at the Postgres level but nothing
--      in this app ever queried it. get_cron_job_health() below is a
--      thin, defensive read-only wrapper (works whether or not pg_cron /
--      job_run_details are available on this instance).
--
-- Additive only — does NOT alter, rename, or drop any existing table,
-- column, policy, or role. Every statement is IF NOT EXISTS / OR REPLACE /
-- guarded, so this file is safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. error_logs: request/correlation id (backward compatible) ──────────
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_error_logs_request_id
  ON error_logs(request_id) WHERE request_id IS NOT NULL;

COMMENT ON COLUMN error_logs.request_id IS
  'Correlation/trace id generated client-side (services/monitoring.js) or '
  'edge-function-side (_shared/requestId.ts) so a single logical request '
  'can be traced across browser -> edge function -> DB error rows.';

-- ────────── 2. SYSTEM ALERTS (durable record of threshold-breach alerts) ──────────
CREATE TABLE IF NOT EXISTS system_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key     TEXT NOT NULL,             -- e.g. 'payment_failure', 'api_error'
  level         TEXT NOT NULL DEFAULT 'warning' CHECK (level IN ('warning', 'critical')),
  message       TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 1,
  window_secs   INTEGER,
  meta          JSONB DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  source        TEXT NOT NULL DEFAULT 'client',   -- 'client' | 'edge_function' | 'cron'
  request_id    TEXT,
  acknowledged_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_alerts' AND policyname = 'system_alerts_no_public_access'
  ) THEN
    CREATE POLICY "system_alerts_no_public_access" ON system_alerts
      FOR ALL TO anon, authenticated USING (false);
  END IF;
END $$;
-- Service role only — inserts happen via the log-client-error Edge Function
-- (service role) or directly from other Edge Functions; reads/updates
-- happen via admin-data (service role), same pattern as error_logs.

CREATE INDEX IF NOT EXISTS idx_system_alerts_status_created
  ON system_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_key_created
  ON system_alerts(alert_key, created_at DESC);

-- ────────── 3. PUSH DELIVERY LOGS (FCM send-push outcome, per dispatch) ──────────
CREATE TABLE IF NOT EXISTS push_delivery_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,             -- bell_ring | qr_scan | voice | text | sos | ai_escalation | status_reminder
  row_id        TEXT,                      -- source row's own id (visitor_logs/message_logs/subscriptions)
  subscriptions_total   INTEGER NOT NULL DEFAULT 0,
  sent_count            INTEGER NOT NULL DEFAULT 0,
  failed_count          INTEGER NOT NULL DEFAULT 0,
  stale_cleaned_count   INTEGER NOT NULL DEFAULT 0,
  skipped               TEXT,              -- 'throttled' | 'quiet_hours' | 'no_subscriptions' | NULL
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE push_delivery_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_delivery_logs' AND policyname = 'push_delivery_logs_no_public_access'
  ) THEN
    CREATE POLICY "push_delivery_logs_no_public_access" ON push_delivery_logs
      FOR ALL TO anon, authenticated USING (false);
  END IF;
END $$;
-- Service role only — written by supabase/functions/send-push.

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_created
  ON push_delivery_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_type_created
  ON push_delivery_logs(event_type, created_at DESC);

-- ────────── 4. CRON JOB HEALTH (read-only wrapper over pg_cron's own log) ──────────
-- Supabase provisions pg_cron with a companion `cron.job_run_details` table
-- automatically when the extension is enabled — this function does not
-- create any new scheduling or duplicate sql/49's job definitions, it only
-- reads pg_cron's own execution history for the 'smartdoor-%' jobs so the
-- admin ops dashboard can show last-run status/duration instead of nothing.
-- Returns an empty set (never errors) if pg_cron / job_run_details aren't
-- available on this Postgres instance.
CREATE OR REPLACE FUNCTION get_cron_job_health()
RETURNS TABLE(
  jobname     TEXT,
  schedule    TEXT,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  duration_ms NUMERIC,
  active      BOOLEAN
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE $q$
    SELECT
      j.jobname::TEXT,
      j.schedule::TEXT,
      d.last_run_at,
      d.last_status::TEXT,
      d.duration_ms,
      j.active
    FROM cron.job j
    LEFT JOIN LATERAL (
      SELECT
        rd.end_time AS last_run_at,
        rd.status   AS last_status,
        EXTRACT(EPOCH FROM (rd.end_time - rd.start_time)) * 1000 AS duration_ms
      FROM cron.job_run_details rd
      WHERE rd.jobid = j.jobid
      ORDER BY rd.start_time DESC
      LIMIT 1
    ) d ON TRUE
    WHERE j.jobname LIKE 'smartdoor-%'
    ORDER BY j.jobname
  $q$;
EXCEPTION WHEN OTHERS THEN
  -- cron.job_run_details not readable/available on this instance (e.g. RLS,
  -- permissions, or an older pg_cron version) — degrade to empty, never fail.
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_cron_job_health() IS
  'Phase 10 observability: read-only view of pg_cron run history for the '
  'smartdoor-* jobs scheduled in sql/49_scheduled_maintenance.sql. Never '
  'raises — returns an empty set if pg_cron is unavailable.';

-- ────────── 5. RETENTION for the two new tables (reuses existing pg_cron pattern) ──────────
CREATE OR REPLACE FUNCTION purge_old_observability_data()
RETURNS TABLE(table_name TEXT, rows_deleted BIGINT) AS $$
DECLARE
  deleted_alerts BIGINT;
  deleted_push   BIGINT;
BEGIN
  -- Resolved/acknowledged alerts: 180 days. Open alerts are never purged.
  DELETE FROM system_alerts
    WHERE status <> 'open' AND created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS deleted_alerts = ROW_COUNT;

  -- Push delivery logs: 30 days (high volume, low long-term value).
  DELETE FROM push_delivery_logs WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_push = ROW_COUNT;

  RETURN QUERY VALUES
    ('system_alerts', deleted_alerts),
    ('push_delivery_logs', deleted_push);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-observability';
    PERFORM cron.schedule('smartdoor-purge-observability', '40 2 * * *', 'SELECT purge_old_observability_data()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — run SELECT purge_old_observability_data() manually/via external scheduler.';
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'error_logs' AND column_name = 'request_id';
--   SELECT * FROM get_cron_job_health();
--   SELECT jobname, active FROM cron.job WHERE jobname = 'smartdoor-purge-observability';
--   SELECT to_regclass('public.system_alerts'), to_regclass('public.push_delivery_logs');
-- ════════════════════════════════════════════════════════════════════════════
