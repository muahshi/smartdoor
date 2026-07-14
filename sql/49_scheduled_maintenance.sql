-- ════════════════════════════════════════════════════════════════════════════
-- Migration 49: Scheduled Maintenance — actually run the purge functions
--
-- PRODUCTION AUDIT FINDING (storage cleanup / SQL performance):
--   Every housekeeping function already written in this codebase —
--   purge_old_data() (sql/10), purge_old_rate_limit_events() (sql/04),
--   purge_old_rtc_presence_events() (sql/38), purge_old_rtc_call_attempts()
--   (sql/39), purge_old_rtc_call_claims() (sql/40), purge_old_visitor_visits()
--   (sql/41) — was defined correctly but NEVER scheduled. Every "Schedule
--   via pg_cron" line in those files was left as a commented-out example.
--   Net effect: visitor_logs, audit_logs, error_logs, rate_limit_events,
--   rtc_presence_events, rtc_call_attempts, rtc_call_claims, and
--   visitor_visits have been growing completely unbounded since launch —
--   worse index bloat and slower scans on exactly the hot tables (visitor
--   feed, rate limiting, WebRTC presence/signaling) every single day.
--
-- This migration turns that on. Idempotent (unschedule-then-schedule, so
-- re-running this file is always safe) and defensive: if pg_cron isn't
-- available on this Postgres instance (some self-hosted/local setups
-- don't have it), the DO block catches that and skips scheduling instead
-- of failing the whole migration — every purge function above already
-- has a safe manual fallback (`SELECT purge_old_data();` etc. from the
-- SQL editor) documented in its own file.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/48_notification_center.sql
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension not available on this instance — skipping scheduled maintenance. Run the purge_*() functions manually or via an external scheduler instead.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- One combined job covers visitor_logs / audit_logs / error_logs /
    -- rate_limit_events (see purge_old_data()'s own retention comments).
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-old-data';
    PERFORM cron.schedule('smartdoor-purge-old-data', '0 2 * * *', 'SELECT purge_old_data()');

    -- rate_limit_events has a much shorter (24h) retention window per
    -- purge_old_data(); purge_old_rate_limit_events() (sql/04) is an
    -- older, narrower duplicate of that same cleanup — kept scheduled
    -- too since it's harmless (DELETE ... WHERE created_at < cutoff is
    -- a no-op once purge_old_data() has already caught up) and some
    -- environments may only have this function if sql/10 was skipped.
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-rate-limits';
    PERFORM cron.schedule('smartdoor-purge-rate-limits', '*/30 * * * *', 'SELECT purge_old_rate_limit_events()');

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-rtc-presence';
    PERFORM cron.schedule('smartdoor-purge-rtc-presence', '15 2 * * *', 'SELECT purge_old_rtc_presence_events()');

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-rtc-call-attempts';
    PERFORM cron.schedule('smartdoor-purge-rtc-call-attempts', '20 2 * * *', 'SELECT purge_old_rtc_call_attempts()');

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-rtc-call-claims';
    PERFORM cron.schedule('smartdoor-purge-rtc-call-claims', '25 2 * * *', 'SELECT purge_old_rtc_call_claims()');

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smartdoor-purge-visitor-visits';
    PERFORM cron.schedule('smartdoor-purge-visitor-visits', '30 2 * * *', 'SELECT purge_old_visitor_visits()');

  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'smartdoor-%' ORDER BY jobname;
-- Expect 6 rows, all active = true. If pg_cron isn't installed on this
-- project, this query itself will error with "relation cron.job does not
-- exist" — that confirms the DO block above safely no-op'd instead of
-- failing the migration.
-- ════════════════════════════════════════════════════════════════════════════
