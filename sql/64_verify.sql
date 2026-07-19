-- Run AFTER 64_launch_readiness_certification.sql completes successfully.
-- Run each SELECT separately.

-- Check 1: backup_snapshots has the two new verification columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'backup_snapshots' AND column_name IN ('verified_at', 'verified_ok');
-- Expect: 2 rows (verified_at timestamptz, verified_ok boolean)

-- Check 2: schema_migrations exists and has all 64 rows backfilled
SELECT COUNT(*) AS migrations_recorded FROM schema_migrations;
-- Expect: 64

-- Check 3: RLS is on for the new ledger table too
SELECT relrowsecurity FROM pg_class WHERE relname = 'schema_migrations';
-- Expect: true

-- Check 4: the one-query production readiness report runs cleanly
SELECT * FROM verify_production_readiness();
-- Expect: 6 rows, review any row with status = 'fail' before go-live

-- Check 5 (manual, confirms zero production impact):
-- Open the admin panel's Backup & Recovery panel and confirm the existing
-- "Trigger Backup" button still works exactly as before (backup_trigger
-- now calls the shared module in _shared/backupSnapshot.ts but behavior
-- and response shape are unchanged).
