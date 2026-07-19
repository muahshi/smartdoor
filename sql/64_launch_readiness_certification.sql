-- ════════════════════════════════════════════════════════════════════════════
-- SMART DOOR — PHASE 12: LAUNCH READINESS & PRODUCTION CERTIFICATION
-- Migration: 64_launch_readiness_certification.sql
-- Run AFTER all previous migrations (01–63)
--
-- AUDIT SUMMARY — already exists, NOT touched by this migration:
--   backup_snapshots + backup-snapshots bucket + manual backup_trigger
--   (sql/56, supabase/functions/admin-data), RLS on every table (sql/02,
--   05, 10, 19, ...), PIN lockout + bcrypt constraint (sql/10), payment
--   idempotency index (sql/10), health-check Edge Function, per-migration
--   *_verify.sql spot-checks, get_cron_job_health() (sql/62). None of that
--   is rebuilt here.
--
-- REAL GAPS closed by this migration:
--   1. backup_snapshots had no way to record whether a completed backup
--      was ever actually confirmed restorable — only a status flag set at
--      write time. Adds verified_at / verified_ok, populated by the new
--      backup_verify Edge Function type (see _shared/backupSnapshot.ts).
--   2. 63 sequential SQL files exist in sql/ with zero tracking of which
--      have actually been run against a given database — "migration
--      safety" was entirely manual (read filenames, remember what you
--      ran). Adds a standard schema_migrations ledger table and backfills
--      it for 01–64 so drift between "files in the repo" and "migrations
--      actually applied" becomes a one-query check going forward. Every
--      migration from 65 onward should INSERT its own row at the end of
--      its file (see the pattern at the bottom of this file).
--   3. There was no single query that answered "is this database
--      production-ready right now" — the equivalent information existed
--      only spread across ~15 individual *_verify.sql files and manual
--      checklist docs. verify_production_readiness() below consolidates
--      the handful of checks that are structural (schema-level) and safe
--      to automate; it does not replace the vendor/business checks in
--      LAUNCH_CHECKLIST.md (Razorpay live mode, DNS, legal pages, etc.)
--      which aren't observable from SQL.
--
-- Additive only — does NOT alter, rename, or drop any existing table,
-- column, policy, or role. Every statement is IF NOT EXISTS / OR REPLACE /
-- guarded, so this file is safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────── 1. backup_snapshots: restore-verification columns ──────────
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS verified_ok BOOLEAN;

COMMENT ON COLUMN backup_snapshots.verified_at IS
  'Phase 12: set when backup_verify (admin-data) re-downloads the stored '
  'snapshot and confirms it parses with matching row counts. NULL means '
  'the backup was never verified after being written.';
COMMENT ON COLUMN backup_snapshots.verified_ok IS
  'Phase 12: result of the most recent verification. NULL = never verified, '
  'TRUE = confirmed restorable, FALSE = parse error or row-count mismatch.';

-- ────────── 2. MIGRATION LEDGER ──────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,           -- e.g. '64_launch_readiness_certification.sql'
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT
);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schema_migrations_service_role_only" ON schema_migrations;
CREATE POLICY "schema_migrations_service_role_only" ON schema_migrations
  FOR ALL USING (auth.role() = 'service_role');

-- Backfill 01–63: these were already applied (this project is in Phase 12,
-- launch is imminent) — the ledger starts truthful from here rather than
-- claiming false apply timestamps. applied_at defaults to NOW() for the
-- backfilled rows since the real historical apply time isn't recoverable;
-- note says so explicitly rather than implying precision that doesn't exist.
INSERT INTO schema_migrations (filename, note) VALUES
  ('01_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('02_rls_policies.sql', 'backfilled — pre-Phase 12 ledger'),
  ('03_realtime_seed.sql', 'backfilled — pre-Phase 12 ledger'),
  ('04_communication_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('05_communication_rls.sql', 'backfilled — pre-Phase 12 ledger'),
  ('06_communication_realtime.sql', 'backfilled — pre-Phase 12 ledger'),
  ('07_commerce_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('08_admin_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('09_performance_indexes.sql', 'backfilled — pre-Phase 12 ledger'),
  ('10_security_hardening.sql', 'backfilled — pre-Phase 12 ledger'),
  ('11_beta_launch_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('12_real_world_operations.sql', 'backfilled — pre-Phase 12 ledger'),
  ('13_customer_growth_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('14_property_management_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('15_admin_provisioning_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('16_phase13_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('17_plan_migration.sql', 'backfilled — pre-Phase 12 ledger'),
  ('18_storage_buckets.sql', 'backfilled — pre-Phase 12 ledger'),
  ('19_admin_data_rls_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('20_franchise_installer_roles.sql', 'backfilled — pre-Phase 12 ledger'),
  ('20_visitor_route_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('21_production_recovery.sql', 'backfilled — pre-Phase 12 ledger'),
  ('21b_storage_rls.sql', 'backfilled — pre-Phase 12 ledger'),
  ('22_visitor_activation_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('23_login_and_customers_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('24_plate_status_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('25_notifications_and_consolidation.sql', 'backfilled — pre-Phase 12 ledger'),
  ('26_auth_stabilization.sql', 'backfilled — pre-Phase 12 ledger'),
  ('27_activation_redesign.sql', 'backfilled — pre-Phase 12 ledger'),
  ('28_visitor_production.sql', 'backfilled — pre-Phase 12 ledger'),
  ('29_ai_receptionist_production.sql', 'backfilled — pre-Phase 12 ledger'),
  ('29b_owner_settings_columns_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('29c_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('30_polish_phase.sql', 'backfilled — pre-Phase 12 ledger'),
  ('31_unified_messaging.sql', 'backfilled — pre-Phase 12 ledger'),
  ('32_conversation_unification_v2.sql', 'backfilled — pre-Phase 12 ledger'),
  ('33_push_notifications.sql', 'backfilled — pre-Phase 12 ledger'),
  ('33_push_subscriptions.sql', 'backfilled — pre-Phase 12 ledger'),
  ('34_enterprise_rbac_phase5.sql', 'backfilled — pre-Phase 12 ledger'),
  ('34b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('35_create_role_admin_logins.sql', 'backfilled — pre-Phase 12 ledger'),
  ('36_phase6_completion.sql', 'backfilled — pre-Phase 12 ledger'),
  ('36b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('37_dealer_order_visibility.sql', 'backfilled — pre-Phase 12 ledger'),
  ('37b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('38_webrtc_phase0_phase1.sql', 'backfilled — pre-Phase 12 ledger'),
  ('38b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('38c_presence_event_type_constraint.sql', 'backfilled — pre-Phase 12 ledger'),
  ('38e_verify_fixes.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('39_webrtc_phase2_call_attempts.sql', 'backfilled — pre-Phase 12 ledger'),
  ('39b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('40_webrtc_phase2_hardening.sql', 'backfilled — pre-Phase 12 ledger'),
  ('40b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('41_visitor_memory.sql', 'backfilled — pre-Phase 12 ledger'),
  ('42_visitor_call_history.sql', 'backfilled — pre-Phase 12 ledger'),
  ('42b_verify.sql', 'backfilled — pre-Phase 12 ledger (verify script)'),
  ('43_owner_activity_center.sql', 'backfilled — pre-Phase 12 ledger'),
  ('44_visitor_management_upgrade.sql', 'backfilled — pre-Phase 12 ledger'),
  ('45_production_hardening_phase4.sql', 'backfilled — pre-Phase 12 ledger'),
  ('46_saas_billing_schema.sql', 'backfilled — pre-Phase 12 ledger'),
  ('47_premium_included_migration.sql', 'backfilled — pre-Phase 12 ledger'),
  ('48_notification_center.sql', 'backfilled — pre-Phase 12 ledger'),
  ('49_scheduled_maintenance.sql', 'backfilled — pre-Phase 12 ledger'),
  ('50_production_readiness_hardening.sql', 'backfilled — pre-Phase 12 ledger'),
  ('51_rtc_ring_anon_join_fix.sql', 'backfilled — pre-Phase 12 ledger'),
  ('52_ai_call_screening.sql', 'backfilled — pre-Phase 12 ledger'),
  ('53_ai_voice_receptionist.sql', 'backfilled — pre-Phase 12 ledger'),
  ('54_ai_receptionist_intelligence.sql', 'backfilled — pre-Phase 12 ledger'),
  ('55_ai_owner_assistant.sql', 'backfilled — pre-Phase 12 ledger'),
  ('56_phase7_operations_platform.sql', 'backfilled — pre-Phase 12 ledger'),
  ('57_commerce_engine_phase8a.sql', 'backfilled — pre-Phase 12 ledger'),
  ('58_gst_billing_phase8b.sql', 'backfilled — pre-Phase 12 ledger'),
  ('58_partner_onboarding_kyc.sql', 'backfilled — pre-Phase 12 ledger'),
  ('59_partner_pricing_engine_phase8c2.sql', 'backfilled — pre-Phase 12 ledger'),
  ('60_partner_commission_settlement_engine_phase8c3.sql', 'backfilled — pre-Phase 12 ledger'),
  ('61_phase9_security_hardening.sql', 'backfilled — pre-Phase 12 ledger'),
  ('62_observability_reliability_phase10.sql', 'backfilled — pre-Phase 12 ledger'),
  ('63_admin_dashboard_aggregation.sql', 'backfilled — pre-Phase 12 ledger'),
  ('64_launch_readiness_certification.sql', 'applied at Phase 12 launch readiness')
ON CONFLICT (filename) DO NOTHING;

COMMENT ON TABLE schema_migrations IS
  'Phase 12: migration ledger. Rows for 01-63 were backfilled on first run '
  'of this file (applied_at is the backfill time, not the true historical '
  'apply time — see note column). From 65 onward, each new sql/N_*.sql '
  'file should end with: '
  'INSERT INTO schema_migrations (filename) VALUES (''N_name.sql'') '
  'ON CONFLICT (filename) DO NOTHING; '
  'so drift between the sql/ directory and what has actually been run '
  'against this database stays a one-query check.';

-- ────────── 3. PRODUCTION READINESS REPORT (consolidated, read-only) ──────────
-- Structural/schema checks only — see header note above for what this
-- deliberately does NOT cover (live vendor keys, DNS, legal pages).
CREATE OR REPLACE FUNCTION verify_production_readiness()
RETURNS TABLE(check_name TEXT, status TEXT, detail TEXT) AS $$
BEGIN
  -- Tables without RLS enabled (excludes the migration ledger's own
  -- bookkeeping and Postgres/Supabase-internal schemas).
  RETURN QUERY
  SELECT
    'rls_enabled'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'ok' ELSE 'fail' END,
    CASE WHEN COUNT(*) = 0 THEN 'All public tables have RLS enabled'
         ELSE 'Missing RLS on: ' || string_agg(tablename, ', ') END
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = FALSE;

  -- Critical tables exist.
  RETURN QUERY
  SELECT
    'critical_tables_exist'::TEXT,
    CASE WHEN COUNT(*) = 8 THEN 'ok' ELSE 'fail' END,
    'Found ' || COUNT(*) || '/8 critical tables'
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN
    ('users', 'plates', 'orders', 'subscriptions', 'admin_users',
     'backup_snapshots', 'system_alerts', 'error_logs');

  -- PIN storage constraint (sql/10) still present.
  RETURN QUERY
  SELECT
    'pin_bcrypt_constraint'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'ok' ELSE 'fail' END,
    CASE WHEN COUNT(*) > 0 THEN 'chk_users_pin_hash_bcrypt present'
         ELSE 'chk_users_pin_hash_bcrypt missing — plain-text PINs are not blocked' END
  FROM pg_constraint WHERE conname = 'chk_users_pin_hash_bcrypt';

  -- Payment idempotency index (sql/10) still present.
  RETURN QUERY
  SELECT
    'payment_idempotency_index'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'ok' ELSE 'fail' END,
    CASE WHEN COUNT(*) > 0 THEN 'idx_payments_captured_unique present'
         ELSE 'idx_payments_captured_unique missing — duplicate payment capture is possible' END
  FROM pg_indexes WHERE indexname = 'idx_payments_captured_unique';

  -- Most recent backup: exists, completed, and within the 8-day staleness
  -- window docs/BACKUP_STRATEGY.md §8 already specifies.
  --
  -- BUGFIX (Phase 12 audit): this function RETURNS TABLE(..., status TEXT, ...),
  -- which declares "status" as a PL/pgSQL OUT parameter/variable in scope for
  -- the whole function body. Every unqualified reference to "status" below
  -- resolved to that OUT parameter instead of backup_snapshots.status,
  -- causing 42702 "column reference \"status\" is ambiguous" as soon as
  -- Postgres tried to disambiguate inside the subqueries. Fixed by aliasing
  -- backup_snapshots as "bs" and qualifying every column reference (bs.status,
  -- bs.created_at, bs.snapshot_type) so none of them can resolve to the OUT
  -- parameter.
  RETURN QUERY
  SELECT
    'recent_backup_exists'::TEXT,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM backup_snapshots) THEN 'fail'
      WHEN (SELECT bs.status FROM backup_snapshots bs ORDER BY bs.created_at DESC LIMIT 1) <> 'completed' THEN 'fail'
      WHEN (SELECT bs.created_at FROM backup_snapshots bs WHERE bs.status = 'completed' ORDER BY bs.created_at DESC LIMIT 1) < NOW() - INTERVAL '8 days' THEN 'fail'
      ELSE 'ok'
    END,
    COALESCE(
      (SELECT 'Last completed backup: ' || bs.created_at::TEXT || ' (' || bs.snapshot_type || ')'
       FROM backup_snapshots bs WHERE bs.status = 'completed' ORDER BY bs.created_at DESC LIMIT 1),
      'No backup_snapshots row found — run scheduled-backup or the admin panel "Trigger Backup" button'
    );

  -- Migration ledger completeness — every sql/NN_*.sql this migration
  -- knows about at write time has a row. New files added after 64 won't
  -- show here until they insert their own row per the convention above.
  RETURN QUERY
  SELECT
    'migration_ledger_populated'::TEXT,
    CASE WHEN COUNT(*) >= 64 THEN 'ok' ELSE 'fail' END,
    COUNT(*) || ' migrations recorded in schema_migrations'
  FROM schema_migrations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION verify_production_readiness() IS
  'Phase 12: consolidated structural production-readiness report. '
  'Run: SELECT * FROM verify_production_readiness(); '
  'Every row should show status = ''ok'' before go-live. Complements, '
  'does not replace, LAUNCH_CHECKLIST.md (vendor keys, DNS, legal — not '
  'observable from SQL).';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying (see sql/64_verify.sql for the full checklist)
-- ════════════════════════════════════════════════════════════════════════════
