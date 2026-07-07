-- Verification for sql/39_webrtc_phase2_call_attempts.sql
-- Run each block after applying the migration.

-- 1. Table exists with expected columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'rtc_call_attempts'
ORDER BY ordinal_position;

-- 2. RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'rtc_call_attempts';

-- 3. Policies present
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'rtc_call_attempts';

-- 4. Index present
SELECT indexname FROM pg_indexes WHERE tablename = 'rtc_call_attempts';

-- 5. Purge function exists
SELECT proname FROM pg_proc WHERE proname = 'purge_old_rtc_call_attempts';

-- 6. Sanity insert (run as anon / from client, not SQL editor with service role,
--    to actually exercise the RLS policy). Replace with a real owner_id + plate slug.
-- INSERT INTO rtc_call_attempts (owner_id, plate_id, call_id, outcome, fallback_triggered)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'SD-ABC123', gen_random_uuid(), 'timeout_fallback', true);
