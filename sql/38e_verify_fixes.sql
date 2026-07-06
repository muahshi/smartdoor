-- ============================================================================
-- SmartDoor
-- Phase 1 Verification Script (Updated)
--
-- Run AFTER:
--   1. 38_webrtc_phase0_phase1.sql
--   2. 38c_presence_event_type_constraint.sql
--
-- Read Only (except optional manual test)
-- ============================================================================


-- ============================================================================
-- CHECK 1
-- Verify CHECK constraint exists and is validated
-- ============================================================================

SELECT
    conname,
    convalidated
FROM pg_constraint
WHERE conname = 'rtc_presence_events_event_type_check';

-- Expected:
-- 1 row
-- convalidated = true



-- ============================================================================
-- CHECK 2
-- Verify invalid event_type is rejected
-- (Manual Test)
-- ============================================================================

-- Replace OWNER_UUID with a valid owner id

/*
INSERT INTO rtc_presence_events
(
    owner_id,
    event_type
)
VALUES
(
    'OWNER_UUID',
    'invalid_event'
);

Expected:
ERROR:
violates check constraint
rtc_presence_events_event_type_check
*/



-- ============================================================================
-- CHECK 3
-- Verify only valid values exist
-- ============================================================================

SELECT DISTINCT event_type
FROM rtc_presence_events;

-- Expected:
-- connect
-- disconnect
-- reconnect
-- stale_cleanup
--
-- No unexpected values.



-- ============================================================================
-- CHECK 4
-- Verify no invalid rows exist
-- ============================================================================

SELECT *
FROM rtc_presence_events
WHERE event_type NOT IN
(
    'connect',
    'disconnect',
    'reconnect',
    'stale_cleanup'
);

-- Expected:
-- 0 rows



-- ============================================================================
-- CHECK 5
-- Verify table structure
-- ============================================================================

SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name='rtc_presence_events'
ORDER BY ordinal_position;

-- Verify expected columns exist.



-- ============================================================================
-- CHECK 6
-- Verify index exists
-- ============================================================================

SELECT
    indexname
FROM pg_indexes
WHERE tablename='rtc_presence_events';

-- Expected:
-- Presence table indexes visible.



-- ============================================================================
-- CHECK 7
-- Verify RLS enabled
-- ============================================================================

SELECT
    relname,
    relrowsecurity
FROM pg_class
WHERE relname='rtc_presence_events';

-- Expected:
-- relrowsecurity = true



-- ============================================================================
-- CHECK 8
-- Verify Presence.js behaviour
-- (Manual)
-- ============================================================================

/*
1. Open dashboard.

2. Open same owner on another browser/device.

3. Close one browser.

Expected:

✓ Exactly ONE disconnect event.

✓ Correct device_id logged.

✓ No duplicate disconnect events.

✓ Remaining device count correct.

✓ No console errors.
*/



-- ============================================================================
-- CHECK 9
-- Production Smoke Test
-- ============================================================================

/*
Verify:

✓ Dashboard loads normally.

✓ No UI changes.

✓ No WebRTC features visible.

✓ Existing realtime still works.

✓ Existing notifications still work.

✓ Existing messaging still works.

✓ Existing QR flow still works.

✓ Existing payment flow unaffected.

✓ No JavaScript errors.

✓ Feature remains disabled.
*/



-- ============================================================================
-- PHASE 1 RESULT
-- ============================================================================

/*
PASS if:

✓ All SQL checks pass.

✓ Manual Presence test passes.

✓ No duplicate disconnect events.

✓ No console errors.

✓ Existing production behaviour unchanged.

Then:

Phase 1 = APPROVED FOR STAGING TESTING
*/