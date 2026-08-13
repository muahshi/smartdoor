-- ════════════════════════════════════════════════════════════════════════════
-- Migration 72: SDOS Event Bus Foundation (Phase 14A)
--
-- PURPOSE
--   Implements ONLY the minimum Event Bus foundation specified by
--   ai/core/events/EVENT_BUS.md, ai/core/events/EVENT_CATALOG.md, and
--   ai/docs/implementation/EVENT_BUS_IMPLEMENTATION_PLAN.md's recommended
--   Option E (dedicated append-only Postgres table + Supabase Realtime
--   broadcast). This migration implements ONLY:
--     - sdos_events        — append-only, one row per emitted event.
--     - sdos_event_lifecycle — append-only, one row per lifecycle stage
--       transition for a given event (received / validated /
--       validation_failed / authorized / authorization_failed / persisted /
--       persistence_failed / duplicate_detected / broadcast_attempted /
--       broadcast_succeeded / broadcast_failed), per EVENT_BUS.md's audit
--       requirement. A second row, never an UPDATE to the first — this is
--       the append-only enforcement mechanism itself, not just a policy.
--     - One new feature_flags row (sdos_event_bus_enabled) reusing the
--       existing generic feature_flags table (sql/38_webrtc_phase0_phase1.sql)
--       as the kill switch, per Golden Rule 17 ("reuse the existing
--       feature-flag mechanism, do not create a parallel one").
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch any existing table, column, policy, or function.
--   - Does NOT grant anon or authenticated any access to either new table
--     — this is SDOS-internal infrastructure, not a customer-facing
--     feature (see PRODUCTION_BOUNDARY.md: SDOS may write to its own
--     event table and nothing else).
--   - Does NOT enable anything — sdos_event_bus_enabled defaults FALSE.
--   - Does NOT create any second event, audit, or Realtime system —
--     reuses feature_flags exactly as-is and the same table+Realtime
--     composition already running in production for notifications/
--     activity-center (see services/notifications.js, services/
--     activityCenter.js).
--
-- SECURITY MODEL (see ai/docs/implementation/SECURITY_IMPLEMENTATION_PLAN.md)
--   RLS is enabled with NO policies for anon/authenticated — mirrors
--   system_config's lockdown pattern (sql/33_push_notifications.sql), not
--   feature_flags' client-readable pattern, because this event bus has no
--   client-facing purpose in Phase 14A. Only service_role (bypasses RLS)
--   can read or write these two tables. See the SQL Migration Summary /
--   RLS Security Summary in this phase's final report for the one
--   documented gap this choice leaves for Phase 14B (a narrower,
--   SDOS-only DB role instead of the shared service_role credential).
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/71_push_subscriptions_platform.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. SDOS_EVENTS — append-only event record
--    Field shape matches ai/core/events/EVENT_BUS.md's Event object
--    exactly (event_id, event_type, source, session_id, correlation_id,
--    timestamp, payload) plus the one additive field EVENT_CATALOG.md
--    already uses per-event (priority). No business-domain field (order
--    id, customer id, amount) is added — those live only inside payload,
--    banded/referenced per EVENT_CATALOG.md Rule 3, and this table never
--    joins against any commerce/customer/payment table. Broadcast
--    outcome is deliberately NOT a column on this table — recording it
--    here would require an UPDATE after INSERT, which this table's own
--    grants forbid by design (see below). It lives only as
--    broadcast_attempted/succeeded/failed rows in sdos_event_lifecycle,
--    so this row is immutable from the instant it's inserted.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sdos_events (
  event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,
  source            TEXT NOT NULL,
  session_id        TEXT,
  correlation_id    TEXT,
  priority          TEXT NOT NULL DEFAULT 'normal'
                       CHECK (priority IN ('normal', 'high', 'critical')),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  emitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdos_events_correlation
  ON sdos_events(correlation_id, emitted_at)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sdos_events_type_time
  ON sdos_events(event_type, emitted_at DESC);

ALTER TABLE sdos_events ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies — same lockdown as system_config
-- (sql/33_push_notifications.sql). Not reachable via anon/authenticated
-- PostgREST API keys at all. Only service_role (bypasses RLS) can read
-- or write. No UPDATE/DELETE grant is given to any role below, including
-- service_role's implicit superset — application code must never issue
-- an UPDATE or DELETE against this table; that is the structural
-- append-only enforcement EVENT_BUS.md's Delivery Contract Rule 2
-- requires, not merely a documented convention.

REVOKE UPDATE, DELETE ON sdos_events FROM service_role;
GRANT SELECT, INSERT ON sdos_events TO service_role;

COMMENT ON TABLE sdos_events IS
  'SDOS Phase 14A: append-only event log, per ai/core/events/EVENT_BUS.md. Server-only (service_role). INSERT-only — no UPDATE/DELETE grant exists on this table by design. Inert until feature_flags.sdos_event_bus_enabled is TRUE; even then, writes only ever originate from ai/core/events/eventBus.js via ai/integrations/supabase/sdosEventsStore.js, never from SmartDoor production code (one-way dependency, SECURITY_MODEL.md constraint 2).';

-- ────────────────────────────────────────────────────────────────────────
-- 2. SDOS_EVENT_LIFECYCLE — append-only lifecycle/audit trace
--    One row per stage transition. A correction or later stage is always
--    a NEW row referencing the same event_id, never an UPDATE to a prior
--    stage's row — this satisfies EVENT_BUS.md's "Every event lifecycle
--    must be traceable" requirement (received / validated / authorized /
--    persisted / broadcast_attempted / broadcast_succeeded|failed) without
--    creating a second, general-purpose audit system: this table is
--    narrowly scoped to event-bus lifecycle stages only and is NOT a
--    substitute for the founder-accountability AuditEntry shape
--    ai/core/contracts/AUDIT_TRAIL.md defines for approval/escalation
--    decisions — those do not exist yet in this phase (no approval flow
--    is implemented), so that contract has nothing to reuse yet. When a
--    future phase adds APPROVAL_DECIDED events, AUDIT_TRAIL.md's own
--    table is the one to build then, not an extension of this one.
--
--    event_id is intentionally NOT a foreign key to sdos_events. A
--    malformed or unauthorized event is rejected before persistence
--    (per EVENT_SCHEMA.md — reaches Validate, never reaches Persist) but
--    must still be traceable per TEST_STRATEGY.md's audit requirement
--    ("a decision not to invoke reasoning is itself auditable" — the
--    event-bus equivalent is "a decision not to persist is itself
--    traceable"). eventBus.js generates event_id once at Receive time,
--    before Validate, so every lifecycle row — including
--    validation_failed / authorization_failed for an event that never
--    reaches sdos_events — shares one stable event_id across its trace.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sdos_event_lifecycle (
  lifecycle_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL,
  stage          TEXT NOT NULL
                   CHECK (stage IN (
                     'received', 'validated', 'validation_failed',
                     'authorized', 'authorization_failed',
                     'persisted', 'persistence_failed',
                     'duplicate_detected',
                     'broadcast_attempted', 'broadcast_succeeded', 'broadcast_failed'
                   )),
  detail         TEXT,
  correlation_id TEXT,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdos_event_lifecycle_event
  ON sdos_event_lifecycle(event_id, recorded_at);

ALTER TABLE sdos_event_lifecycle ENABLE ROW LEVEL SECURITY;
-- Same lockdown as sdos_events above — no anon/authenticated policy.

REVOKE UPDATE, DELETE ON sdos_event_lifecycle FROM service_role;
GRANT SELECT, INSERT ON sdos_event_lifecycle TO service_role;

COMMENT ON TABLE sdos_event_lifecycle IS
  'SDOS Phase 14A: append-only per-event lifecycle trace (received/validated/authorized/persisted/broadcast_*), per ai/core/events/EVENT_BUS.md''s audit requirement. Server-only (service_role), INSERT-only. A row here for an event_id whose validation/authorization failed does not require a matching row in sdos_events — a rejected event is still fully traceable via this table alone (EVENT_SCHEMA.md: rejection happens before persistence).';

-- ────────────────────────────────────────────────────────────────────────
-- 3. REALTIME — enable Postgres change broadcast for sdos_events so a
--    future consumer (ai/dashboard/, still empty per ai/core/README.md)
--    can subscribe without polling. This is additive metadata only — it
--    does not create a channel, subscriber, or new Realtime concept, and
--    never touches any existing publication membership for WebRTC
--    signaling, presence, or notifications.
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sdos_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sdos_events;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 4. FEATURE FLAG — reuse the existing feature_flags table
--    (sql/38_webrtc_phase0_phase1.sql). ON CONFLICT DO NOTHING so
--    re-running this migration never resets a flag an operator already
--    toggled.
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('sdos_event_bus_enabled', FALSE,
   'SDOS Phase 14A master switch. When FALSE (default), ai/core/events/eventBus.js#emitEvent() short-circuits before any Validate/Authorize/Persist/Broadcast step and returns a no-op result — no row is ever written to sdos_events or sdos_event_lifecycle. Flip via Supabase Dashboard/SQL Editor only, never via the app. Disabling this at any time is a complete, safe SDOS rollback per ai/docs/implementation/ROLLBACK_STRATEGY.md — no production table, function, or credential is affected either way.')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (see sql/72b_verify.sql)
-- ════════════════════════════════════════════════════════════════════════════
