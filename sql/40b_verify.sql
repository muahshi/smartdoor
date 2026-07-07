-- Verification for sql/40_webrtc_phase2_hardening.sql
-- Run each block after applying the migration.

-- 1. realtime.messages policies present for the three new rules
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'realtime' AND tablename = 'messages'
  AND policyname IN (
    'rtc_ring_receive_owner_only',
    'rtc_ring_send_visitor_and_owner',
    'rtc_call_channel_participants'
  );

-- 2. rtc_call_claims table exists with expected columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'rtc_call_claims'
ORDER BY ordinal_position;

-- 3. RLS is enabled on rtc_call_claims
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'rtc_call_claims';

-- 4. Policies present on rtc_call_claims
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'rtc_call_claims';

-- 5. Primary key on call_id enforces atomic claiming
SELECT tc.constraint_type, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'rtc_call_claims' AND tc.constraint_type = 'PRIMARY KEY';

-- 6. Index present
SELECT indexname FROM pg_indexes WHERE tablename = 'rtc_call_claims';

-- 7. Purge function exists
SELECT proname FROM pg_proc WHERE proname = 'purge_old_rtc_call_claims';

-- 8. Regression check — confirm no policy was added for any OTHER topic
--    prefix (i.e. this migration did not touch public/postgres_changes
--    channels used elsewhere in the app).
SELECT policyname FROM pg_policies
WHERE schemaname = 'realtime' AND tablename = 'messages'
  AND policyname NOT IN (
    'rtc_ring_receive_owner_only',
    'rtc_ring_send_visitor_and_owner',
    'rtc_call_channel_participants'
  );
-- Expected: 0 rows (or only rows you know were added independently of this migration).

-- 9. Manual claim-race sanity check (run as two different authenticated
--    owner sessions against the SAME call_id — the second must fail with
--    23505 unique_violation):
-- INSERT INTO rtc_call_claims (call_id, owner_id, device_id)
-- VALUES ('00000000-0000-0000-0000-000000000000', get_my_owner_id(), 'device-a');
