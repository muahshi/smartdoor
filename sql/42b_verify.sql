-- ════════════════════════════════════════════════════════════════════════════
-- Verify Migration 42: Visitor Call History
-- Run AFTER sql/42_visitor_call_history.sql
-- ════════════════════════════════════════════════════════════════════════════

-- 1. New columns exist on visitor_visits
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'visitor_visits'
  AND column_name IN ('visitor_name', 'call_status', 'network_type')
ORDER BY column_name;
-- Expect: 3 rows, all is_nullable = 'YES'

-- 2. Index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'visitor_visits' AND indexname = 'idx_visitor_visits_call_status';
-- Expect: 1 row

-- 3. RPC signature updated (10 params)
SELECT pg_get_function_identity_arguments(oid)
FROM pg_proc WHERE proname = 'record_visitor_visit';
-- Expect: p_owner_id uuid, p_plate_id text, p_phone text, p_purpose text,
--         p_call_type text, p_accepted boolean, p_duration integer,
--         p_name text, p_call_status text, p_network_type text

-- 4. Functional test — old-style call (no new params) still works
-- SELECT record_visitor_visit(
--   '00000000-0000-0000-0000-000000000000'::uuid, 'SD-ABC123', '9876543210'
-- );

-- 5. Functional test — new fields populate correctly
-- SELECT record_visitor_visit(
--   '00000000-0000-0000-0000-000000000000'::uuid, 'SD-ABC123', '9876543211',
--   NULL, 'masked_call', true, 42, 'Rahul', 'connected', '4g'
-- );
-- SELECT visitor_name, call_status, network_type FROM visitor_visits
--   WHERE plate_id = 'SD-ABC123' ORDER BY created_at DESC LIMIT 1;
-- Expect: visitor_name = 'Rahul', call_status = 'connected', network_type = '4g'

-- 6. Invalid call_status is silently ignored, not an error
-- SELECT record_visitor_visit(
--   '00000000-0000-0000-0000-000000000000'::uuid, 'SD-ABC123', '9876543212',
--   NULL, 'masked_call', false, 0, NULL, 'bogus_status', NULL
-- );
-- SELECT call_status FROM visitor_visits WHERE plate_id = 'SD-ABC123' ORDER BY created_at DESC LIMIT 1;
-- Expect: call_status IS NULL (not 'bogus_status')
