-- Run AFTER 73_sdos_credential_and_flag_hardening.sql completes successfully.
-- Run each SELECT separately.

-- Check 1: sdos_service role exists and is NOLOGIN (cannot authenticate)
SELECT rolname, rolcanlogin, rolinherit FROM pg_roles WHERE rolname = 'sdos_service';
-- Expect: one row, rolcanlogin = false, rolinherit = false

-- Check 2: sdos_service has SELECT + INSERT only on the two SDOS tables
-- — no UPDATE, no DELETE
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name IN ('sdos_events', 'sdos_event_lifecycle')
  AND grantee = 'sdos_service'
ORDER BY table_name, privilege_type;
-- Expect: SELECT and INSERT rows only for each table

-- Check 3: sdos_service has no grant on any other table
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee = 'sdos_service' AND table_name NOT IN ('sdos_events', 'sdos_event_lifecycle', 'feature_flags');
-- Expect: zero rows

-- Check 4: sdos_service policies exist and are scoped to sdos_service only
SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE policyname LIKE 'sdos_service_%'
ORDER BY tablename, policyname;
-- Expect: 4 rows (select+insert x 2 tables), roles = {sdos_service}

-- Check 5: service_role's own grants are unchanged from migration 72
-- (SELECT + INSERT only, no UPDATE/DELETE) — confirms this migration
-- did not touch service_role
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name IN ('sdos_events', 'sdos_event_lifecycle')
  AND grantee = 'service_role'
ORDER BY table_name, privilege_type;
-- Expect: identical to sql/72b_verify.sql Check 6 — SELECT and INSERT only

-- Check 6: feature_flags policy now excludes sdos_%-prefixed keys
SELECT policyname, qual FROM pg_policies
WHERE tablename = 'feature_flags' AND policyname = 'feature_flags_select_all';
-- Expect: one row, qual contains "key <> ALL" / "NOT LIKE" equivalent for 'sdos_%'

-- Check 7 (manual, confirms zero client-facing regression): using the
-- project's anon key (never service_role), run:
--   select * from feature_flags;
-- Expect: webrtc_global_enabled and webrtc_kill_switch rows present;
-- sdos_event_bus_enabled row ABSENT.

-- Check 8 (manual, confirms zero production impact, same as
-- sql/72b_verify.sql Check 10): log in to the existing owner dashboard
-- as any real owner and confirm nothing visually changes — the WebRTC
-- feature-flag UI (if any) still reads webrtc_global_enabled /
-- webrtc_kill_switch exactly as before.
