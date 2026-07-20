-- ============================================================
-- SMART DOOR — PRODUCTION BUG FIX
-- Migration: 65_fix_owner_id_rls_mismatch.sql
--
-- ROOT CAUSE:
--   sql/11_beta_launch_schema.sql wrote several owner-facing RLS
--   policies as:
--       USING (auth.uid() = owner_id)
--   `owner_id` on these tables is a FK to users(id) — a random
--   gen_random_uuid(), completely independent of the Supabase Auth
--   UUID. The correct/only valid identity chain in this schema is:
--       auth.uid()  →  users.auth_user_id  →  users.id (= owner_id)
--   which is exactly what get_my_owner_id() (sql/02_rls_policies.sql)
--   and every other table's policy already do correctly.
--
--   auth.uid() = owner_id can NEVER be true for any row, for any
--   owner (their UUIDs live in different, unrelated ID spaces), so
--   every SELECT/INSERT gated by this predicate is silently denied
--   by RLS — no error surfaces to the client, the query just returns
--   zero rows / a blocked write.
--
-- AFFECTED TABLES (owner-facing policies only — admin_all policies
-- are untouched, they were already correct):
--   customer_onboarding (SELECT), nps_responses (INSERT),
--   referrals (SELECT), bug_reports (INSERT + SELECT),
--   feature_requests (INSERT), feedback_logs (INSERT)
--
-- FIX: replace with the same owner_id = get_my_owner_id() pattern
-- used everywhere else in the schema. Idempotent — safe to re-run.
-- ============================================================

-- customer_onboarding
DROP POLICY IF EXISTS "onboarding_owner_read" ON customer_onboarding;
CREATE POLICY "onboarding_owner_read" ON customer_onboarding
  FOR SELECT USING (owner_id = get_my_owner_id());

-- nps_responses
DROP POLICY IF EXISTS "nps_owner_insert" ON nps_responses;
CREATE POLICY "nps_owner_insert" ON nps_responses
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

-- referrals
DROP POLICY IF EXISTS "referral_owner_read" ON referrals;
CREATE POLICY "referral_owner_read" ON referrals
  FOR SELECT USING (owner_id = get_my_owner_id());

-- bug_reports
DROP POLICY IF EXISTS "bug_owner_insert" ON bug_reports;
CREATE POLICY "bug_owner_insert" ON bug_reports
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "bug_owner_read" ON bug_reports;
CREATE POLICY "bug_owner_read" ON bug_reports
  FOR SELECT USING (owner_id = get_my_owner_id());

-- feature_requests
DROP POLICY IF EXISTS "feat_owner_insert" ON feature_requests;
CREATE POLICY "feat_owner_insert" ON feature_requests
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

-- feedback_logs
DROP POLICY IF EXISTS "feedback_owner_insert" ON feedback_logs;
CREATE POLICY "feedback_owner_insert" ON feedback_logs
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());
