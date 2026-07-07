-- Run AFTER 38_webrtc_phase0_phase1.sql completes successfully.
-- Run each SELECT separately.

-- Check 1: feature_flags table exists and both flags are seeded FALSE
SELECT key, enabled, description FROM feature_flags
WHERE key IN ('webrtc_global_enabled', 'webrtc_kill_switch');
-- Expect: both rows present, enabled = false

-- Check 2: security_rules has the new column, defaulted FALSE
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'security_rules' AND column_name = 'webrtc_calling_enabled';
-- Expect: boolean, default false

-- Check 3: no existing security_rules row was flipped to TRUE by the migration
SELECT COUNT(*) AS owners_with_webrtc_enabled
FROM security_rules WHERE webrtc_calling_enabled = TRUE;
-- Expect: 0

-- Check 4: rtc_presence_events table + index exist
SELECT indexname FROM pg_indexes
WHERE tablename = 'rtc_presence_events' AND indexname = 'idx_rtc_presence_events_owner';

-- Check 5: RLS policies exist and are scoped correctly
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'rtc_presence_events';
-- Expect: rtc_presence_events_select_own (SELECT), rtc_presence_events_insert_own (INSERT)

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'feature_flags';
-- Expect: feature_flags_select_all (SELECT) only — no INSERT/UPDATE/DELETE policy

-- Check 6 (manual, confirms zero production impact):
-- Log in to the existing owner dashboard as any real owner and confirm
-- nothing visually changes, no new UI appears, and no console errors
-- reference feature_flags / rtc_presence_events.
