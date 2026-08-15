-- ════════════════════════════════════════════════════════════════════════════
-- Migration 74: SDOS Feature Flag Read Fix for sdos_service (Phase 14C)
--
-- PURPOSE
--   Closes the one confirmed real gap from the Phase 14C credential-
--   cutover readiness audit: migration 73 narrowed
--   "feature_flags_select_all" to USING (key NOT LIKE 'sdos_%'), which
--   correctly hides SDOS-internal flags from anon/authenticated, but
--   that same USING clause applies to EVERY role that isn't named in a
--   more specific policy — including sdos_service, which migration 73
--   also granted table-level SELECT on feature_flags for exactly this
--   purpose (ai/integrations/supabase/sdosEventsStore.js#isEventBusEnabled()
--   reading sdos_event_bus_enabled). A table GRANT does not bypass RLS;
--   with no sdos_service-scoped policy, sdos_service's read of
--   sdos_event_bus_enabled would be silently filtered to zero rows by
--   "feature_flags_select_all" the moment sdos_service can authenticate
--   at all (see migration 73's "MANUAL DEPLOYMENT STEPS") —
--   isEventBusEnabled() would then always fail-safe to `false`, making
--   the flag structurally impossible to ever read as `true` through
--   that credential. This was flagged, not yet fixed, in the Phase 14C
--   brief's "KNOWN FINDINGS FROM 14B REVIEW".
--
--   Postgres RLS: multiple permissive policies for the same command
--   are OR'd together. Adding a second, narrower permissive policy
--   scoped TO sdos_service does not touch or replace
--   "feature_flags_select_all" — it only adds a second path that
--   applies exclusively to sdos_service.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT change "feature_flags_select_all" (migration 73) in any
--     way — anon/authenticated remain unable to see any 'sdos_%' key,
--     exactly as migration 73 left them.
--   - Does NOT grant sdos_service INSERT/UPDATE/DELETE on feature_flags
--     — read-only, matching migration 73's own comment ("no write
--     policy is granted on feature_flags to any non-service_role role,
--     here or elsewhere").
--   - Does NOT grant any role beyond sdos_service the ability to read
--     'sdos_%' keys.
--   - Does NOT change how sdosEventsStore.js authenticates today — it
--     still reads feature_flags as service_role (which bypasses RLS
--     entirely), so this migration has zero effect on the live
--     production code path until the migration-73 manual cutover steps
--     are completed by an operator. This migration only removes what
--     would otherwise be a silent trap waiting at the end of that
--     future cutover.
--
-- SAFE / IDEMPOTENT — uses DROP POLICY IF EXISTS. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/73_sdos_credential_and_flag_hardening.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- sdos_service may read exactly the keys "feature_flags_select_all"
-- excludes for everyone else: 'sdos_%'-prefixed rows. Combined with
-- migration 73's table-level GRANT SELECT, this makes
-- sdos_event_bus_enabled actually readable by sdos_service once (and
-- only once) the manual login/JWT cutover in migration 73 is
-- completed. Until then this policy exists but is unreachable, same
-- as every other sdos_service grant/policy migration 73 already
-- created for a NOLOGIN role.
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sdos_service_select_sdos_flags" ON feature_flags;
CREATE POLICY "sdos_service_select_sdos_flags" ON feature_flags
  FOR SELECT TO sdos_service USING (key LIKE 'sdos_%');

COMMENT ON TABLE feature_flags IS
  'Read-only-to-clients boolean feature toggles. anon/authenticated (via "feature_flags_select_all", sql/38+sql/73) see every key EXCEPT sdos_-prefixed ones. sdos_service (via "sdos_service_select_sdos_flags", sql/74) sees ONLY sdos_-prefixed keys, read-only — the two policies are complementary, not overlapping, and neither role can read what the other is scoped to. Change values via Supabase Dashboard > Table Editor or SQL Editor, never via the app.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (see sql/74b_verify.sql)
-- ════════════════════════════════════════════════════════════════════════════
