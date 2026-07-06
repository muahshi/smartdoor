-- ════════════════════════════════════════════════════════════════════════════
-- Migration 38c: Enforce event_type integrity on rtc_presence_events
--
-- PURPOSE
--   Fixes review finding: rtc_presence_events.event_type had no CHECK
--   constraint despite only 4 documented valid values ('connect',
--   'disconnect', 'reconnect', 'stale_cleanup'). Any string could
--   previously be inserted by the client.
--
-- SAFE / IDEMPOTENT — checks pg_constraint before adding; safe to re-run.
--
-- PRODUCTION SAFETY NOTE — READ BEFORE RUNNING
--   This uses ADD CONSTRAINT ... NOT VALID followed by a separate
--   VALIDATE CONSTRAINT step. NOT VALID takes only a brief metadata lock
--   (no table scan, no blocking of concurrent reads/writes). The
--   VALIDATE step does scan the table, but under a SHARE UPDATE
--   EXCLUSIVE lock, which still allows concurrent reads and writes —
--   unlike a plain ADD CONSTRAINT CHECK (...), which would take an
--   ACCESS EXCLUSIVE lock for the full scan.
--
--   PRE-FLIGHT CHECK (run this first, not assumed):
--     SELECT DISTINCT event_type FROM rtc_presence_events
--     WHERE event_type NOT IN ('connect','disconnect','reconnect','stale_cleanup');
--   If this returns any rows, VALIDATE CONSTRAINT below will fail and
--   you must clean up or reclassify those rows before re-running the
--   validate step. This phase has been off for every owner by default,
--   so the table is expected to be empty or near-empty in production —
--   but that has not been verified against your live database and
--   should not be assumed.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/38_webrtc_phase0_phase1.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rtc_presence_events_event_type_check'
  ) THEN
    ALTER TABLE rtc_presence_events
      ADD CONSTRAINT rtc_presence_events_event_type_check
      CHECK (event_type IN ('connect', 'disconnect', 'reconnect', 'stale_cleanup'))
      NOT VALID;
  END IF;
END $$;

COMMIT;

-- Run VALIDATE as a separate statement/transaction from the ADD above —
-- this is intentional. Splitting them is what lets the ADD take a brief
-- lock while VALIDATE takes a lighter one; running them in the same
-- transaction would re-combine the lock cost.
ALTER TABLE rtc_presence_events
  VALIDATE CONSTRAINT rtc_presence_events_event_type_check;

COMMENT ON CONSTRAINT rtc_presence_events_event_type_check ON rtc_presence_events IS
  'Restricts event_type to the 4 values documented in sql/38_webrtc_phase0_phase1.sql and emitted by services/presence.js. Added in review-fix pass; original migration 38 omitted this.';
