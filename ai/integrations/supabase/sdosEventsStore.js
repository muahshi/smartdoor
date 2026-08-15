/**
 * SDOS — Supabase Event Store (Phase 14A)
 * ai/integrations/supabase/sdosEventsStore.js
 *
 * The ONLY file under ai/ that opens a network/database connection for
 * the Event Bus. Per ai/core/permissions/SECURITY_MODEL.md constraint 1
 * ("No direct network or database access from ai/ [outside
 * ai/integrations/]"), ai/core/events/eventBus.js never talks to
 * Supabase directly — it calls the functions exported here.
 *
 * SCOPE NOTE (see this phase's final report, "Real Gap"):
 * ai/integrations/supabase/README.md documents a *read-only* SDOS
 * Supabase integration that explicitly never uses service_role. That
 * capability does not exist yet (Phase 10 shipped zero executable
 * code). This file is a narrower, DIFFERENT capability:
 * write-and-read access to exactly two SDOS-owned tables
 * (sdos_events, sdos_event_lifecycle), per
 * ai/docs/implementation/PRODUCTION_BOUNDARY.md's "What SDOS May
 * Eventually Write" — the one write path that document authorizes.
 * It intentionally does NOT read or write any SmartDoor production
 * table (orders, customers, payments, subscriptions, etc.) — doing so
 * would violate PRODUCTION_BOUNDARY.md regardless of credential.
 *
 * CREDENTIAL: uses service_role, mirroring the existing system_config
 * lockdown pattern (sql/33_push_notifications.sql) rather than
 * inventing a new IAM role — see SECURITY_IMPLEMENTATION_PLAN.md's
 * "Write Operations" section for the ideal (a role scoped to *only*
 * these two tables, distinct from service_role's broader grants) and
 * this phase's final report for why that narrower role is deferred to
 * Phase 14B rather than blocking this phase: Supabase does not offer a
 * simple SQL-only path to provision a new PostgREST-exposed role, and
 * the repository's own existing precedent (system_config) already
 * accepts service_role for isolated, non-customer-facing tables. The
 * residual risk is bounded by REVOKE UPDATE, DELETE (migration 72) —
 * even with service_role, this module structurally cannot issue an
 * UPDATE or DELETE against either table; a bug here cannot silently
 * corrupt event history, only fail to insert.
 *
 * PHASE 14B UPDATE: migration 73 creates the narrower role
 * (`sdos_service`) SECURITY_IMPLEMENTATION_PLAN.md asks for, scoped to
 * exactly these two tables via real RLS policies rather than
 * service_role's BYPASSRLS attribute. It is NOLOGIN — dormant, cannot
 * authenticate — because completing the cutover requires a manually
 * issued credential/JWT outside repository SQL (see migration 73's
 * "MANUAL DEPLOYMENT STEPS" and ai/adr/ADR-0011-Event-Bus-Hardening.md
 * for why that step cannot be done from this file alone).
 *
 * PHASE 14E UPDATE: the manual cutover (migration 73's steps 1-2) is
 * complete — sdos_service now has LOGIN and SDOS_DB_URL exists as an
 * Edge Function secret. insertEvent(), appendLifecycleStage(), and
 * isEventBusEnabled() (the DB-credential path per ADR-0012) now use a
 * direct Postgres connection via getDbClient() when SDOS_DB_URL is
 * present, bypassing PostgREST's JWT-role resolution — the only way
 * sdos_service (not exposed via SUPABASE_SERVICE_ROLE_KEY's JWT) can
 * ever be reached, exactly as migration 73's "MANUAL DEPLOYMENT STEPS"
 * §3 specified. broadcastEvent() is UNCHANGED — it still authenticates
 * as service_role via getClient() below, because it needs a Supabase
 * Realtime JWT, not a bare Postgres role (ADR-0012 §2). If SDOS_DB_URL
 * is absent, the DB-credential functions fall back to this same
 * getClient()/service_role path, matching migration 73's documented
 * fallback design and keeping any environment that hasn't completed
 * cutover (e.g. a second project, a future rollback) working exactly
 * as before. If SDOS_DB_URL IS present but the direct connection or
 * query fails, they do NOT fall back to service_role — they fail
 * closed (Phase 14E brief, Step 4): a narrower credential that can
 * silently degrade to a broader one on any hiccup is not a narrower
 * credential.
 *
 * Never imported by any SmartDoor production file — one-way dependency
 * (SECURITY_MODEL.md constraint 2). Never holds a Razorpay, Twilio,
 * Exotel, or groq-proxy credential (PRODUCTION_BOUNDARY.md).
 */

// The @supabase/supabase-js import is intentionally DYNAMIC (inside
// getClient() below, not a top-level import) and resolved via esm.sh,
// matching every existing supabase/functions/*/index.ts client
// construction (e.g. supabase/functions/health-check/index.ts). Two
// reasons it's dynamic rather than a top-level import:
//   1. Deno (Edge Functions) resolves a remote https:// specifier
//      natively; Node does not, without a custom loader. Making the
//      import lazy means simply *importing* this module (as
//      eventBus.js does) never fails in a plain Node context — the
//      network fetch only happens the first time getClient() actually
//      runs, i.e. the first time a real (non-test, non-disabled)
//      persist/broadcast/flag-read is attempted.
//   2. It keeps every test in scripts/sdos-event-bus-test.js free of
//      any network dependency by construction: those tests inject
//      deps.store, so getClient() (and therefore this import) is never
//      reached at all — not mocked around, structurally unreachable.
let _client = null;

/**
 * Lazy singleton. Reads SDOS-specific env vars first
 * (SDOS_SUPABASE_URL / SDOS_SUPABASE_SERVICE_ROLE_KEY) so a future
 * Phase 14B can point this at a narrower-scoped credential without
 * touching this file again; falls back to the same
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY every existing Edge
 * Function already reads (e.g. supabase/functions/health-check/index.ts)
 * so this module works today without new secrets being provisioned
 * before Phase 14A can even be tested.
 */
async function getClient(env = (typeof Deno !== 'undefined' ? Deno.env.toObject() : process.env)) {
  if (_client) return _client;
  const url = env.SDOS_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SDOS_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[SDOS EventStore] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SDOS_-prefixed equivalents).');
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Test-only seam — never called from production code paths. */
export function _resetClientForTests(fakeClient) {
  _client = fakeClient || null;
}

// ── Phase 14E: direct-Postgres path for sdos_service ─────────────────────
//
// Used ONLY by insertEvent(), appendLifecycleStage(), and
// isEventBusEnabled() — the three DB-credential operations ADR-0012 §2
// scopes to sdos_service. broadcastEvent() never calls this; it stays
// on getClient()/service_role for Realtime, unconditionally.
//
// Scope is structural, not just convention: the three queries below are
// the ONLY SQL this module ever issues over this connection, and they
// touch exactly sdos_events, sdos_event_lifecycle, and a single-row
// read of feature_flags — the same three-table surface sdos_service's
// own grants (migration 73) and RLS policies (migrations 73 + 74)
// enforce server-side. No other table name appears in this file.
let _dbClient = null;

/** Test-only seam, mirrors _resetClientForTests above. */
export function _resetDbClientForTests(fakeDbClient) {
  _dbClient = fakeDbClient || null;
}

/**
 * Lazy singleton direct-Postgres client, scoped to SDOS_DB_URL only.
 * Returns null (not a throw) when SDOS_DB_URL is absent — callers use
 * that to fall back to the existing service_role path, matching
 * migration 73's documented fallback design. Once SDOS_DB_URL IS
 * present, any failure to construct/connect the client throws, and
 * callers must NOT catch-and-fall-back-to-service_role — they fail
 * closed and report INTEGRATION_ERROR (Step 4).
 *
 * `postgres` (postgres.js) is loaded the same way @supabase/supabase-js
 * already is above — a lazy esm.sh import, not a package.json
 * dependency — because this file's only proven runtime is Deno Edge
 * Functions (see the comment on `_client` above); Deno resolves the
 * remote specifier natively, and the import is never reached in the
 * Node-based test suite since tests always inject deps.client/deps.db.
 * `max: 1` matches the one-connection-per-invocation shape correct for
 * a serverless/edge function; short timeouts avoid a hung invocation
 * blocking on a bad credential instead of failing closed quickly.
 */
async function getDbClient(env = (typeof Deno !== 'undefined' ? Deno.env.toObject() : process.env)) {
  const dbUrl = env.SDOS_DB_URL;
  if (!dbUrl) return null;
  if (_dbClient) return _dbClient;
  const { default: postgres } = await import('https://esm.sh/postgres@3');
  _dbClient = postgres(dbUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return _dbClient;
}

/**
 * Inserts one row into sdos_events. Returns { outcome, data?, error? }
 * — an IntegrationWriteResult, the write-path counterpart to
 * ai/integrations/DATA_CONTRACTS.md's read-only IntegrationResult
 * envelope (outcome: OK | DUPLICATE | INTEGRATION_ERROR).
 *
 * A duplicate event_id (same UUID inserted twice — e.g. a retried
 * emitEvent() call) is NOT an error: per EVENT_BUS.md's append-only
 * rule, the original row is authoritative and is returned unchanged,
 * outcome DUPLICATE, never a second row and never a thrown error.
 */
export async function insertEvent(event, deps = {}) {
  if (!deps.client) {
    const db = deps.db || await getDbClient();
    if (db) {
      try {
        const rows = await db`
          INSERT INTO sdos_events
            (event_id, event_type, source, session_id, correlation_id, priority, payload)
          VALUES (
            ${event.event_id}, ${event.event_type}, ${event.source},
            ${event.session_id ?? null}, ${event.correlation_id ?? null},
            ${event.priority}, ${db.json(event.payload)}
          )
          RETURNING *
        `;
        return { outcome: 'OK', data: rows[0], source: 'sdos_service', fetched_at: new Date().toISOString() };
      } catch (error) {
        // Postgres unique_violation on the event_id primary key = duplicate.
        if (error.code === '23505') {
          try {
            const existing = await db`SELECT * FROM sdos_events WHERE event_id = ${event.event_id}`;
            if (existing[0]) {
              return { outcome: 'DUPLICATE', data: existing[0], source: 'sdos_service', fetched_at: new Date().toISOString() };
            }
          } catch (_) { /* fall through to fail-closed error below */ }
        }
        // Fail closed (Step 4): never fall back to service_role here.
        return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'sdos_service', fetched_at: new Date().toISOString() };
      }
    }
  }

  // No SDOS_DB_URL configured (or a test-injected deps.client) —
  // existing service_role path, unchanged from Phase 14A/14B.
  const client = deps.client || await getClient();
  const { data, error } = await client
    .from('sdos_events')
    .insert({
      event_id: event.event_id,
      event_type: event.event_type,
      source: event.source,
      session_id: event.session_id ?? null,
      correlation_id: event.correlation_id ?? null,
      priority: event.priority,
      payload: event.payload,
    })
    .select()
    .single();

  if (error) {
    // Postgres unique_violation on the event_id primary key = duplicate.
    if (error.code === '23505') {
      const existing = await client
        .from('sdos_events')
        .select()
        .eq('event_id', event.event_id)
        .single();
      if (!existing.error) {
        return { outcome: 'DUPLICATE', data: existing.data, source: 'supabase', fetched_at: new Date().toISOString() };
      }
    }
    return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: new Date().toISOString() };
  }

  return { outcome: 'OK', data, source: 'supabase', fetched_at: new Date().toISOString() };
}

/**
 * Appends one row to sdos_event_lifecycle. Never updates a prior row —
 * every call is a new INSERT, per EVENT_BUS.md's append-only rule
 * applied to the lifecycle trace itself (migration 72's own comment on
 * sdos_event_lifecycle). A lifecycle-write failure is reported back,
 * never thrown/swallowed — eventBus.js decides what to do with it per
 * AUDIT_TRAIL.md's fail-closed-for-accountability-records principle,
 * this module only reports.
 */
export async function appendLifecycleStage({ event_id, stage, detail, correlation_id }, deps = {}) {
  if (!deps.client) {
    const db = deps.db || await getDbClient();
    if (db) {
      try {
        const rows = await db`
          INSERT INTO sdos_event_lifecycle (event_id, stage, detail, correlation_id)
          VALUES (${event_id}, ${stage}, ${detail ?? null}, ${correlation_id ?? null})
          RETURNING *
        `;
        return { outcome: 'OK', data: rows[0], source: 'sdos_service', fetched_at: new Date().toISOString() };
      } catch (error) {
        // Fail closed (Step 4): never fall back to service_role here.
        return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'sdos_service', fetched_at: new Date().toISOString() };
      }
    }
  }

  // No SDOS_DB_URL configured (or a test-injected deps.client) —
  // existing service_role path, unchanged from Phase 14A/14B.
  const client = deps.client || await getClient();
  const { data, error } = await client
    .from('sdos_event_lifecycle')
    .insert({ event_id, stage, detail: detail ?? null, correlation_id: correlation_id ?? null })
    .select()
    .single();

  if (error) {
    return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: new Date().toISOString() };
  }
  return { outcome: 'OK', data, source: 'supabase', fetched_at: new Date().toISOString() };
}

/**
 * Explicit Realtime broadcast on a dedicated 'sdos-events' channel,
 * using the same channel.send({ type: 'broadcast', ... }) pattern
 * already in production (services/webrtcSignaling.js). Chosen over
 * postgres_changes (the pattern services/notifications.js and
 * services/activityCenter.js use) specifically because it returns an
 * observable per-call status ('ok' | 'error' | 'timed out'), which
 * this phase's audit requirement (broadcast_attempted →
 * broadcast_succeeded|failed) needs and CDC-style postgres_changes
 * cannot provide from the writer's side. sdos_events remains in the
 * supabase_realtime publication (migration 72) as a second, standing
 * consumption path for any future subscriber that prefers polling/CDC
 * over this channel — the two are not mutually exclusive and neither
 * is authoritative; the table always is (EVENT_BUS.md Delivery
 * Contract: "Persistence remains the source of truth").
 *
 * PHASE 14B: this explicit-broadcast path is confirmed as SDOS's ONE
 * canonical event-delivery mechanism (ai/adr/ADR-0011-Event-Bus-
 * Hardening.md) — it is the only transport a caller's lifecycle trace
 * (broadcast_attempted/succeeded/failed) reflects, and the only one
 * emitEvent() ever awaits. sdos_events' supabase_realtime publication
 * membership remains, unchanged, for exactly the documented reason
 * above (a future polling/CDC consumer) and is NOT a second competing
 * delivery path any caller relies on today — see ADR-0011 for the full
 * comparison and why this is not "two architectures."
 */
export async function broadcastEvent(event, deps = {}) {
  const client = deps.client || await getClient();
  const channel = deps.channel || client.channel('sdos-events');
  try {
    const status = await channel.send({
      type: 'broadcast',
      event: event.event_type,
      payload: {
        event_id: event.event_id,
        event_type: event.event_type,
        source: event.source,
        correlation_id: event.correlation_id ?? null,
        priority: event.priority,
        emitted_at: event.emitted_at,
      },
    });
    return status === 'ok'
      ? { outcome: 'OK', source: 'supabase-realtime', fetched_at: new Date().toISOString() }
      : { outcome: 'INTEGRATION_ERROR', error: `broadcast status: ${status}`, source: 'supabase-realtime', fetched_at: new Date().toISOString() };
  } catch (err) {
    return { outcome: 'INTEGRATION_ERROR', error: err.message, source: 'supabase-realtime', fetched_at: new Date().toISOString() };
  }
}

/**
 * Reads feature_flags.sdos_event_bus_enabled (migration 72, seeded
 * FALSE). Fail-safe by design, same convention as
 * services/featureFlags.js#getGlobalWebRTCFlags(): any error, missing
 * row, or missing table resolves to `false` (bus disabled), never
 * `true`. This is the one feature_flags read this module performs —
 * it does not duplicate the rest of services/featureFlags.js.
 */
export async function isEventBusEnabled(deps = {}) {
  if (!deps.client) {
    try {
      const db = deps.db || await getDbClient();
      if (db) {
        const rows = await db`SELECT enabled FROM feature_flags WHERE key = 'sdos_event_bus_enabled' LIMIT 1`;
        // Fail-safe by design, same convention as the service_role path
        // below: missing row or non-true value → false. A query/connection
        // error here throws and is caught by the outer try/catch, which
        // also resolves to false — this function's contract is that it
        // NEVER throws, whichever credential path answered it.
        return rows[0]?.enabled === true;
      }
    } catch (err) {
      return false;
    }
  }

  // No SDOS_DB_URL configured (or a test-injected deps.client) —
  // existing service_role path, unchanged from Phase 14A/14B.
  const client = deps.client || await getClient();
  try {
    const { data, error } = await client
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'sdos_event_bus_enabled')
      .maybeSingle();
    if (error || !data) return false;
    return data.enabled === true;
  } catch (err) {
    return false;
  }
}

export default { insertEvent, appendLifecycleStage, broadcastEvent, isEventBusEnabled, _resetClientForTests, _resetDbClientForTests };
