-- Run AFTER 74_sdos_feature_flag_service_read.sql completes successfully.
-- Run each block separately in the Supabase Dashboard SQL Editor
-- (connected as postgres/service_role, which can SET ROLE to any
-- role including a NOLOGIN one — SET ROLE only requires membership,
-- not LOGIN privilege; this is what lets us test a NOLOGIN role's RLS
-- behavior today, before the migration-73 manual cutover ever happens).

-- Check 1: the new policy exists, scoped to sdos_service only
SELECT tablename, policyname, cmd, roles, qual FROM pg_policies
WHERE tablename = 'feature_flags' AND policyname = 'sdos_service_select_sdos_flags';
-- Expect: one row, roles = {sdos_service}, qual contains "key ~~ 'sdos_%'" (LIKE)

-- Check 2: "feature_flags_select_all" (migration 73) is untouched
SELECT policyname, roles, qual FROM pg_policies
WHERE tablename = 'feature_flags' AND policyname = 'feature_flags_select_all';
-- Expect: one row, roles = {public}, qual unchanged from sql/73b_verify.sql Check 6

-- ────────────────────────────────────────────────────────────────────────
-- Check 3 (THE REAL TEST — proves the intended role can read the flag):
-- Run this whole block as one statement/transaction.
-- ────────────────────────────────────────────────────────────────────────
BEGIN;
  SET LOCAL ROLE sdos_service;
  SELECT key, enabled FROM feature_flags WHERE key = 'sdos_event_bus_enabled';
  -- Expect: exactly one row (key = 'sdos_event_bus_enabled', enabled = false).
  -- Before migration 74, this same query under sdos_service returned
  -- ZERO rows (blocked by feature_flags_select_all's NOT LIKE 'sdos_%'),
  -- which is the exact bug this migration fixes.
ROLLBACK;
-- ROLLBACK (not COMMIT) is deliberate — SET LOCAL ROLE only needs to
-- hold for the one SELECT above; rolling back leaves no session state
-- changed and performs no write.

-- Check 4 (confirms this migration adds exactly one thing, nothing
-- broader): sdos_service can ALSO see non-sdos_ keys — but that
-- access is pre-existing from migration 73's table GRANT plus
-- "feature_flags_select_all" applying to PUBLIC (no "TO <role>"
-- clause, so it already covers every role, sdos_service included,
-- for any key NOT LIKE 'sdos_%'). Migration 74 does not touch this.
BEGIN;
  SET LOCAL ROLE sdos_service;
  SELECT key FROM feature_flags WHERE key = 'webrtc_global_enabled';
  -- Expect: one row (unchanged behavior — not something migration 74
  -- introduced; recorded here only so a reader isn't surprised by it
  -- while verifying Check 3).
ROLLBACK;

-- Check 5 (confirms anon/authenticated are still fully blocked from
-- sdos_% keys — no regression from adding the sdos_service policy):
BEGIN;
  SET LOCAL ROLE anon;
  SELECT key FROM feature_flags WHERE key = 'sdos_event_bus_enabled';
  -- Expect: ZERO rows.
ROLLBACK;

-- Check 6 (manual, confirms zero client-facing regression, same as
-- sql/73b_verify.sql Check 7): using the project's anon key (never
-- service_role), run:
--   select * from feature_flags;
-- Expect: webrtc_global_enabled and webrtc_kill_switch rows present;
-- sdos_event_bus_enabled row still ABSENT.
