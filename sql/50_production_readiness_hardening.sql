-- ============================================================
-- SMART DOOR — PRODUCTION READINESS HARDENING
-- sql/50_production_readiness_hardening.sql
--
-- Pre-launch audit fix. Additive only — does not redefine any
-- function body or touch any earlier migration file. Two parts:
--
--   PART 1 — RPC hardening: every SECURITY DEFINER function in the
--   public schema runs with the PRIVILEGES of its owner but, unless
--   search_path is pinned, still RESOLVES unqualified identifiers
--   (tables, other functions) using the CALLER's search_path. A
--   caller able to create objects earlier in that path (e.g. a
--   same-named function/table in a schema they control) can hijack
--   what a SECURITY DEFINER function actually executes — the
--   standard Postgres/Supabase "search_path hijack" issue flagged by
--   Supabase's own security linter. This locks every such function
--   in this project to `search_path = public, pg_temp` without
--   changing what any of them do. Implemented as a DO block that
--   discovers each function's real argument signature from pg_proc
--   at run time, so it is correct regardless of which migration file
--   last defined it and never needs hand-typed signatures.
--
--   PART 2 — missing indexes on foreign-key / lookup columns that
--   are joined or filtered on in existing RPCs and dashboard queries
--   (admin support tickets, RBAC audit trails, subscription lookups,
--   voice note replies, ownership-transfer/referral lookups) but
--   were never indexed by sql/09_performance_indexes.sql or any
--   later migration.
--
-- Safe to run multiple times (idempotent). Run after all previous
-- migrations.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PART 1: PIN search_path ON EVERY SECURITY DEFINER FUNCTION
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true               -- SECURITY DEFINER only
      AND p.proname IN (
        'check_and_increment_usage',
        'check_pin_lockout',
        'check_rate_limit',
        'generate_invoice_number',
        'get_family_members_for_plate',
        'get_my_owner_id',
        'get_owner_activity_feed',
        'get_owner_activity_stats',
        'get_owner_visitor_insights',
        'get_society_stats',
        'get_subscription_status_for_plate',
        'get_unit_residents',
        'get_usage_summary',
        'get_visitor_profile_summary',
        'get_visitor_recognition',
        'log_rate_limit_event',
        'purge_old_data',
        'purge_old_rate_limit_events',
        'purge_old_rtc_call_attempts',
        'purge_old_rtc_call_claims',
        'purge_old_rtc_presence_events',
        'purge_old_visitor_visits',
        'record_failed_pin',
        'record_visitor_visit',
        'reset_pin_lockout',
        'sd_notify_admin_activation_event',
        'sd_notify_missed_visitor',
        'sd_notify_payment_event',
        'set_visitor_blocked',
        'toggle_visitor_favorite',
        'update_visitor_notes_and_label',
        'validate_visitor_pass'
      )
      -- Skip any that were already pinned (idempotent re-run / already fixed)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      r.proname, r.args
    );
    RAISE NOTICE 'Pinned search_path on public.%(%)', r.proname, r.args;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- PART 2: MISSING INDEXES ON FK / LOOKUP COLUMNS
-- Each index gets its OWN DO block (its own exception scope) so a
-- table/column that doesn't exist in a given environment (an
-- optional module not provisioned there) only skips that one index
-- instead of rolling back every other index in this file — a single
-- shared block would lose all prior work on the first miss because
-- a PL/pgSQL exception rolls back everything already done inside
-- that same block.
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id
    ON ticket_comments(ticket_id);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_ticket_comments_ticket_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id
    ON invoices(subscription_id);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_invoices_subscription_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_admin_users_role_id
    ON admin_users(role_id);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_admin_users_role_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_message_logs_voice_note_id
    ON message_logs(voice_note_id)
    WHERE voice_note_id IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_message_logs_voice_note_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ownership_transfers_new_owner_id
    ON ownership_transfers(new_owner_id)
    WHERE new_owner_id IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_ownership_transfers_new_owner_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_referral_logs_referred_owner_id
    ON referral_logs(referred_owner_id);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_referral_logs_referred_owner_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_delivery_logs_visitor_pass_id
    ON delivery_logs(visitor_pass_id)
    WHERE visitor_pass_id IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_delivery_logs_visitor_pass_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_guard_checkins_visitor_pass_id
    ON guard_checkins(visitor_pass_id)
    WHERE visitor_pass_id IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_guard_checkins_visitor_pass_id — table/column not present';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_replacement_requests_replacement_order_id
    ON replacement_requests(replacement_order_id)
    WHERE replacement_order_id IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'Skipped idx_replacement_requests_replacement_order_id — table/column not present';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying:
--   SELECT proname, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.prosecdef = true AND proconfig IS NULL;
--   Expect ZERO rows (every SECURITY DEFINER function now has a pinned search_path).
--
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
--     AND indexname LIKE 'idx_%' ORDER BY indexname;
-- ════════════════════════════════════════════════════════════════════════════
