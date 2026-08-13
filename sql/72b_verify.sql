-- Run AFTER 72_sdos_event_bus_foundation.sql completes successfully.
-- Run each SELECT separately.

-- Check 1: sdos_events and sdos_event_lifecycle tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('sdos_events', 'sdos_event_lifecycle');
-- Expect: both rows present

-- Check 2: sdos_event_bus_enabled flag seeded FALSE
SELECT key, enabled, description FROM feature_flags
WHERE key = 'sdos_event_bus_enabled';
-- Expect: one row, enabled = false

-- Check 3: RLS is enabled on both new tables
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('sdos_events', 'sdos_event_lifecycle');
-- Expect: both rows, relrowsecurity = true

-- Check 4: NO policies exist for either table (locked down, same as
-- system_config — no anon/authenticated access at all)
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('sdos_events', 'sdos_event_lifecycle');
-- Expect: zero rows

-- Check 5: anon/authenticated have NO grants on either table
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name IN ('sdos_events', 'sdos_event_lifecycle')
  AND grantee IN ('anon', 'authenticated');
-- Expect: zero rows

-- Check 6: service_role has SELECT + INSERT only — no UPDATE/DELETE
-- (structural append-only enforcement)
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name IN ('sdos_events', 'sdos_event_lifecycle')
  AND grantee = 'service_role'
ORDER BY table_name, privilege_type;
-- Expect: SELECT and INSERT rows only for each table — no UPDATE, no DELETE

-- Check 7: indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('sdos_events', 'sdos_event_lifecycle')
ORDER BY indexname;
-- Expect: idx_sdos_events_correlation, idx_sdos_events_type_time,
--         idx_sdos_event_lifecycle_event

-- Check 8: sdos_events is in the supabase_realtime publication
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'sdos_events';
-- Expect: one row

-- Check 9: zero rows written by the migration itself (feature-flag
-- insert is the only write; both event tables start empty)
SELECT COUNT(*) AS sdos_events_row_count FROM sdos_events;
SELECT COUNT(*) AS sdos_event_lifecycle_row_count FROM sdos_event_lifecycle;
-- Expect: both 0

-- Check 10 (manual, confirms zero production impact):
-- Log in to the existing owner dashboard as any real owner and confirm
-- nothing visually changes, no new UI appears, and no console errors
-- reference sdos_events / sdos_event_lifecycle / sdos_event_bus_enabled.
