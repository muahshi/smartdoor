-- ════════════════════════════════════════════════════════════════════════════
-- Migration 73: SDOS Event Bus Hardening (Phase 14B)
--
-- PURPOSE
--   Implements the two SQL-only hardening steps Phase 14B's audit of
--   Phase 14A's two open decisions (service_role usage, feature_flags
--   reuse) found to be safely implementable without dashboard/manual
--   Supabase configuration and without touching any existing production
--   table, policy, or grant:
--
--     1. A dormant, narrowly-scoped `sdos_service` Postgres role — the
--        credential boundary objective 1 of Phase 14B asked to be
--        investigated. This role is NOLOGIN (cannot authenticate at
--        all) until an operator manually completes the deployment steps
--        documented below. Creating and granting it now is zero-risk:
--        it changes nothing about how ai/integrations/supabase/
--        sdosEventsStore.js authenticates today (still service_role),
--        and does not revoke or alter any existing service_role grant.
--
--     2. A narrower feature_flags SELECT policy that hides sdos_%-
--        prefixed rows from anon/authenticated, closing the one real
--        finding from objective 2's feature-flag audit: feature_flags'
--        existing "select_all" policy (sql/38_webrtc_phase0_phase1.sql)
--        is USING (true) — client-readable by design for the two
--        WebRTC flags it was built for, but that same policy also
--        currently exposes sdos_event_bus_enabled's key, boolean state,
--        and full internal-architecture description to any anon
--        client. Reusing feature_flags is still correct (Golden Rule
--        17 — do not create a parallel flag system); this migration
--        narrows the existing policy rather than replacing the table.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT change how sdosEventsStore.js authenticates. It still
--     uses SUPABASE_SERVICE_ROLE_KEY (or the SDOS_-prefixed override)
--     exactly as Phase 14A shipped it. sdos_service has no password and
--     cannot log in, so nothing in the running application can use it
--     yet — see "MANUAL DEPLOYMENT STEPS (NOT executed by this
--     migration)" below for what a future cutover requires.
--   - Does NOT revoke, alter, or narrow any existing service_role
--     grant, on sdos_events/sdos_event_lifecycle or anywhere else.
--   - Does NOT change webrtc_global_enabled or webrtc_kill_switch's
--     client-readability — the narrowed policy only excludes keys
--     matching 'sdos_%'; both existing flags are unaffected.
--   - Does NOT touch orders, customers, payments, subscriptions, or any
--     other production table.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS
-- throughout. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/72_sdos_event_bus_foundation.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. SDOS_SERVICE — dormant, narrowly-scoped role
--
--    NOLOGIN NOINHERIT: cannot authenticate under any credential that
--    exists today, and does not automatically inherit any privilege
--    from another role. This is the SQL-only ceiling this phase can
--    safely reach: Supabase's PostgREST layer resolves the acting
--    Postgres role from the `role` claim embedded in the JWT behind
--    SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY, and that claim is
--    fixed at project-key-generation time — minting a JWT whose `role`
--    claim is `sdos_service` (the only way PostgREST would ever pick
--    this role for a request) requires either the Supabase Dashboard's
--    custom-role/JWT tooling or a manually-signed token, neither of
--    which is a SQL statement this migration can safely issue in a
--    repository migration. See MANUAL DEPLOYMENT STEPS below.
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sdos_service') THEN
    CREATE ROLE sdos_service NOLOGIN NOINHERIT;
  END IF;
END $$;

COMMENT ON ROLE sdos_service IS
  'SDOS Phase 14B: dormant credential-boundary scaffold. NOLOGIN — cannot authenticate today. Grants below are scoped to exactly sdos_events + sdos_event_lifecycle (SELECT, INSERT only, matching service_role''s own migration-72 grant), so that IF a future phase completes the manual JWT/role cutover documented in this file''s header, the resulting credential is structurally narrower than service_role from the moment it can first authenticate. Until that manual step happens, this role has zero effect on any running code path.';

-- Table grants — identical shape to service_role's own grant in
-- migration 72 (SELECT + INSERT only; UPDATE/DELETE explicitly
-- withheld, never granted then revoked, since this role is new).
GRANT SELECT, INSERT ON sdos_events TO sdos_service;
GRANT SELECT, INSERT ON sdos_event_lifecycle TO sdos_service;

-- RLS policies scoped explicitly to sdos_service. Unlike service_role
-- (which bypasses RLS entirely via its BYPASSRLS attribute),
-- sdos_service has no such attribute — its access is governed by real,
-- inspectable RLS policies, which is the whole point of this boundary
-- being genuinely narrower once it can authenticate at all.
DROP POLICY IF EXISTS "sdos_service_select_events" ON sdos_events;
CREATE POLICY "sdos_service_select_events" ON sdos_events
  FOR SELECT TO sdos_service USING (true);

DROP POLICY IF EXISTS "sdos_service_insert_events" ON sdos_events;
CREATE POLICY "sdos_service_insert_events" ON sdos_events
  FOR INSERT TO sdos_service WITH CHECK (true);

DROP POLICY IF EXISTS "sdos_service_select_lifecycle" ON sdos_event_lifecycle;
CREATE POLICY "sdos_service_select_lifecycle" ON sdos_event_lifecycle
  FOR SELECT TO sdos_service USING (true);

DROP POLICY IF EXISTS "sdos_service_insert_lifecycle" ON sdos_event_lifecycle;
CREATE POLICY "sdos_service_insert_lifecycle" ON sdos_event_lifecycle
  FOR INSERT TO sdos_service WITH CHECK (true);

-- sdos_service may read its own kill switch (mirrors the one
-- feature_flags read sdosEventsStore.js#isEventBusEnabled() performs).
-- Read-only — no write policy is granted on feature_flags to any
-- non-service_role role, here or elsewhere.
GRANT SELECT ON feature_flags TO sdos_service;

-- ────────────────────────────────────────────────────────────────────────
-- MANUAL DEPLOYMENT STEPS (NOT executed by this migration — documented
-- per Phase 14B's brief: "If a genuinely narrower credential requires
-- dashboard/manual configuration rather than repository code, document
-- the exact manual setup as a Future/Deployment requirement.")
--
-- To actually cut sdosEventsStore.js over to sdos_service instead of
-- service_role, a future deployment phase must, outside this
-- repository's SQL:
--   1. Generate a strong random password and run, once, by hand in the
--      Supabase SQL Editor (never commit it):
--        ALTER ROLE sdos_service LOGIN PASSWORD '<generated-secret>';
--   2. Provision a direct Postgres connection string using that
--      role/password (Supabase Dashboard > Project Settings > Database
--      > Connection string, substituting the sdos_service credential)
--      as a new Supabase Edge Function secret, e.g. SDOS_DB_URL — never
--      as a Vercel/client-side env var.
--   3. Update ai/integrations/supabase/sdosEventsStore.js's getClient()
--      to open a direct `pg`/`postgres` driver connection using
--      SDOS_DB_URL when present (bypassing PostgREST and its JWT-role
--      resolution entirely, which is the only way a locally-defined
--      NOLOGIN-until-step-1 role can ever be reached), falling back to
--      today's supabase-js + service_role client when it is not — so
--      this stays a deployment-time cutover, not a code branch on any
--      request-supplied input.
--   4. Confirm via sql/73b_verify.sql Check 5 that sdos_service can
--      SELECT/INSERT on exactly the two SDOS tables and nothing else,
--      then confirm (Check 6) that service_role's own grants are
--      byte-for-byte unchanged from migration 72.
--
-- RESIDUAL RISK IF STEPS 1–3 ARE NEVER DONE: sdosEventsStore.js
-- continues using service_role, which — per migration 72's own
-- documented rationale — is bounded by REVOKE UPDATE, DELETE (this
-- migration does not touch that grant) and by SDOS writing to exactly
-- two isolated, non-production tables. That residual risk is
-- unchanged by this migration; this migration only makes closing it,
-- later, a deployment-config step rather than a repository-code
-- rewrite.
-- ────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────
-- 2. FEATURE_FLAGS — narrow the existing client-readable policy
--
--    feature_flags_select_all (sql/38_webrtc_phase0_phase1.sql) is
--    USING (true) — every row, every anon/authenticated client. That
--    is the correct, intended behavior for webrtc_global_enabled and
--    webrtc_kill_switch (the client needs to read them to decide
--    whether to attempt WebRTC). It was never evaluated against an
--    SDOS-internal flag before migration 72 added one. Narrowing to
--    exclude 'sdos_%' keys closes that gap for sdos_event_bus_enabled
--    today and any future sdos_-prefixed flag, without narrowing
--    anything for the two flags this policy was actually built for.
--
--    Confirmed safe: no file under js/, services/, dashboard/, or any
--    other production path reads feature_flags for an 'sdos_%' key
--    (grep across the repository) — this narrowing removes a read
--    path nothing currently uses, not one anything depends on.
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "feature_flags_select_all" ON feature_flags;
CREATE POLICY "feature_flags_select_all" ON feature_flags
  FOR SELECT USING (key NOT LIKE 'sdos_%');

COMMENT ON TABLE feature_flags IS
  'Read-only-to-clients boolean feature toggles, EXCEPT keys prefixed sdos_ (Phase 14B, migration 73) which are excluded from the client-readable policy — SDOS-internal flags are operational, not client-facing, and their existence/state should not be enumerable via the anon key. webrtc_global_enabled and webrtc_kill_switch remain fully client-readable, unchanged. Change values via Supabase Dashboard > Table Editor or SQL Editor, never via the app.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (see sql/73b_verify.sql)
-- ════════════════════════════════════════════════════════════════════════════
