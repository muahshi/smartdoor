/**
 * SDOS — Read-Only Events Reader (Phase 16)
 * ai/integrations/supabase/sdosEventsReader.js
 *
 * The first executable, capability-specific READ path against the two
 * SDOS-owned tables `sdosEventsStore.js` (Phase 14A/14E) writes to:
 * `sdos_events` and `sdos_event_lifecycle`. Per the Phase 16 brief's
 * "Approved Design Decision — Option A (Isolated Reader)", this file
 * deliberately does NOT import, extend, or depend on
 * `ai/integrations/supabase/sdosEventsStore.js` in any way. It carries
 * its own minimal credential/bootstrap logic so the existing Phase 14E
 * production write/broadcast store stays exactly as it is, and so a
 * bug or change in this reader can never affect the write path (and
 * vice versa) — no shared module-level state, no shared import.
 *
 * SCOPE: this is NOT the "future, RLS-scoped, read-only client into
 * SmartDoor production data" `ai/integrations/supabase/README.md`'s
 * main body describes (that capability still does not exist — no
 * `orders`, `subscriptions`, `plates`, `users`, or any other
 * production table is reachable from here, ever). This reader only
 * ever touches the two SDOS-internal, non-customer-facing tables
 * `sdosEventsStore.js` already writes to, exactly as
 * `ai/docs/implementation/PRODUCTION_BOUNDARY.md`'s "What SDOS May
 * Eventually Write" scopes those two tables.
 *
 * CAPABILITIES (exhaustive — nothing else is exported):
 *   - getRecentSdosEvents({ limit, event_type?, correlation_id? })
 *       capability: sdos_events.recent
 *   - getSdosEventById({ event_id })
 *       capability: sdos_events.by_id
 *   - getSdosEventLifecycle({ event_id })
 *       capability: sdos_event_lifecycle.by_event
 *
 * There is deliberately NO generic query(table)/read(table)/
 * select(table)/get(table)/execute(sql) or any arbitrary table/column
 * API. Every query below is a hardcoded, parameterized statement
 * against exactly one of the two named tables — table and column names
 * are never accepted from a caller.
 *
 * WRITE SURFACE: none. This file contains no INSERT, UPDATE, DELETE,
 * UPSERT, or RPC of any kind — structurally, not just by convention
 * (grep this file: there is no `.insert(`, `.update(`, `.delete(`,
 * `.upsert(`, or `INSERT`/`UPDATE`/`DELETE` SQL keyword anywhere below
 * the module doc comment).
 *
 * DATA CONTRACT: every function returns the `IntegrationResult`
 * envelope from `ai/integrations/DATA_CONTRACTS.md` exactly —
 * `{ outcome: 'OK' | 'EMPTY' | 'INTEGRATION_ERROR', data, source,
 * fetched_at, error? }`. No other envelope shape is used. A caller
 * asking for something outside the three named capabilities has no
 * function to call in the first place — there is nothing to reject at
 * runtime because there is no dynamic dispatch surface here at all.
 *
 * CREDENTIAL PATH: mirrors `sdosEventsStore.js`'s existing, already-
 * reviewed pattern exactly, applied to reads only:
 *   1. If a test injects `deps.client` or `deps.db`, that is used —
 *      this reader is never reached by a real credential in tests.
 *   2. Otherwise, if `SDOS_DB_URL` is configured, a direct-Postgres
 *      connection (the narrower `sdos_service` role, once an operator
 *      completes the manual cutover `sdosEventsStore.js` already
 *      documents) is used for the query. If that connection or query
 *      fails, this reader returns `INTEGRATION_ERROR` and does
 *      **not** fall back to `service_role` — a narrower credential
 *      that silently degrades to a broader one on any hiccup is not a
 *      narrower credential (same fail-closed rule `sdosEventsStore.js`
 *      already applies to its write path).
 *   3. If `SDOS_DB_URL` is absent, this reader falls back to the same
 *      `service_role` PostgREST client every existing Edge Function
 *      already uses (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, or
 *      the `SDOS_`-prefixed override) — the same documented,
 *      non-silent fallback design `sdosEventsStore.js` uses when no DB
 *      credential is configured at all. `service_role` bypasses RLS,
 *      but `sdos_events` / `sdos_event_lifecycle` have zero
 *      anon/authenticated policies (migration 72) and no
 *      UPDATE/DELETE grant on either table for any role, including
 *      `service_role` — so even this fallback path can only ever
 *      SELECT rows this module already only ever SELECTs.
 *
 * Never imported by any SmartDoor production file, any browser/
 * frontend code, `ai/core/events/eventBus.js`,
 * `ai/core/permissions/permissionEngine.js`, or any executive runtime
 * — this is an integration foundation only (Phase 16 brief). Never
 * logs `SDOS_DB_URL`, a database password, or any credential value.
 */

// Dynamic import inside getClient()/getDbClient() only, exactly like
// sdosEventsStore.js — see that file's own comment for why (Deno
// resolves the remote esm.sh specifier natively; Node does not without
// a custom loader; and it keeps every injected-deps test free of any
// network dependency by construction, not just by mock).
let _client = null;
let _dbClient = null;

/** Test-only seam — never called from a real credential path. */
export function _resetReaderClientsForTests() {
  _client = null;
  _dbClient = null;
}

async function getClient(env = (typeof Deno !== 'undefined' ? Deno.env.toObject() : process.env)) {
  if (_client) return _client;
  const url = env.SDOS_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SDOS_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[SDOS EventsReader] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SDOS_-prefixed equivalents).');
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

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

// ── Input validation helpers ────────────────────────────────────────
// Deliberately strict and local to this file — a rejected input never
// reaches a query, parameterized or not.

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function assertValidLimit(limit) {
  if (limit === undefined || limit === null) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('[SDOS EventsReader] limit must be a positive integer.');
  }
  return Math.min(limit, MAX_LIMIT);
}

function assertValidEventId(event_id) {
  if (typeof event_id !== 'string' || event_id.trim().length === 0) {
    throw new Error('[SDOS EventsReader] event_id must be a non-empty string.');
  }
  return event_id;
}

function nowIso() {
  return new Date().toISOString();
}

// ── 1. getRecentSdosEvents — capability: sdos_events.recent ─────────

/**
 * Returns the most recent rows from `sdos_events`, newest first,
 * optionally filtered by `event_type` and/or `correlation_id`. `limit`
 * is required to be a positive integer and is hard-capped at
 * `MAX_LIMIT` regardless of what a caller requests — there is no way
 * to request an unbounded read.
 */
export async function getRecentSdosEvents({ limit, event_type, correlation_id } = {}, deps = {}) {
  let boundedLimit;
  try {
    boundedLimit = assertValidLimit(limit);
    if (event_type !== undefined && typeof event_type !== 'string') {
      throw new Error('[SDOS EventsReader] event_type must be a string.');
    }
    if (correlation_id !== undefined && typeof correlation_id !== 'string') {
      throw new Error('[SDOS EventsReader] correlation_id must be a string.');
    }
  } catch (validationError) {
    return { outcome: 'INTEGRATION_ERROR', error: validationError.message, source: 'validation', fetched_at: nowIso() };
  }

  if (!deps.client) {
    const db = deps.db || await getDbClient();
    if (db) {
      try {
        let rows;
        if (event_type && correlation_id) {
          rows = await db`
            SELECT * FROM sdos_events
            WHERE event_type = ${event_type} AND correlation_id = ${correlation_id}
            ORDER BY emitted_at DESC
            LIMIT ${boundedLimit}
          `;
        } else if (event_type) {
          rows = await db`
            SELECT * FROM sdos_events
            WHERE event_type = ${event_type}
            ORDER BY emitted_at DESC
            LIMIT ${boundedLimit}
          `;
        } else if (correlation_id) {
          rows = await db`
            SELECT * FROM sdos_events
            WHERE correlation_id = ${correlation_id}
            ORDER BY emitted_at DESC
            LIMIT ${boundedLimit}
          `;
        } else {
          rows = await db`
            SELECT * FROM sdos_events
            ORDER BY emitted_at DESC
            LIMIT ${boundedLimit}
          `;
        }
        return rows.length === 0
          ? { outcome: 'EMPTY', data: [], source: 'sdos_service', fetched_at: nowIso() }
          : { outcome: 'OK', data: rows, source: 'sdos_service', fetched_at: nowIso() };
      } catch (error) {
        // Fail closed — never fall back to service_role here.
        return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'sdos_service', fetched_at: nowIso() };
      }
    }
  }

  const client = deps.client || await getClient();
  try {
    let query = client
      .from('sdos_events')
      .select('*')
      .order('emitted_at', { ascending: false })
      .limit(boundedLimit);
    if (event_type) query = query.eq('event_type', event_type);
    if (correlation_id) query = query.eq('correlation_id', correlation_id);
    const { data, error } = await query;
    if (error) {
      return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: nowIso() };
    }
    return (!data || data.length === 0)
      ? { outcome: 'EMPTY', data: [], source: 'supabase', fetched_at: nowIso() }
      : { outcome: 'OK', data, source: 'supabase', fetched_at: nowIso() };
  } catch (error) {
    return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: nowIso() };
  }
}

// ── 2. getSdosEventById — capability: sdos_events.by_id ─────────────

/** Returns a single `sdos_events` row by its primary key, or EMPTY. */
export async function getSdosEventById({ event_id } = {}, deps = {}) {
  try {
    assertValidEventId(event_id);
  } catch (validationError) {
    return { outcome: 'INTEGRATION_ERROR', error: validationError.message, source: 'validation', fetched_at: nowIso() };
  }

  if (!deps.client) {
    const db = deps.db || await getDbClient();
    if (db) {
      try {
        const rows = await db`SELECT * FROM sdos_events WHERE event_id = ${event_id} LIMIT 1`;
        return rows.length === 0
          ? { outcome: 'EMPTY', data: null, source: 'sdos_service', fetched_at: nowIso() }
          : { outcome: 'OK', data: rows[0], source: 'sdos_service', fetched_at: nowIso() };
      } catch (error) {
        return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'sdos_service', fetched_at: nowIso() };
      }
    }
  }

  const client = deps.client || await getClient();
  try {
    const { data, error } = await client
      .from('sdos_events')
      .select('*')
      .eq('event_id', event_id)
      .maybeSingle();
    if (error) {
      return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: nowIso() };
    }
    return !data
      ? { outcome: 'EMPTY', data: null, source: 'supabase', fetched_at: nowIso() }
      : { outcome: 'OK', data, source: 'supabase', fetched_at: nowIso() };
  } catch (error) {
    return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: nowIso() };
  }
}

// ── 3. getSdosEventLifecycle — capability: sdos_event_lifecycle.by_event ──

/**
 * Returns every `sdos_event_lifecycle` row for a given `event_id`,
 * oldest first (the natural order of a lifecycle trace), or EMPTY if
 * none exist. `event_id` is not a foreign key on the lifecycle table
 * (per migration 72's own comment — a rejected event can have
 * lifecycle rows with no matching `sdos_events` row), so this
 * intentionally does not require a prior `getSdosEventById` hit.
 */
export async function getSdosEventLifecycle({ event_id } = {}, deps = {}) {
  try {
    assertValidEventId(event_id);
  } catch (validationError) {
    return { outcome: 'INTEGRATION_ERROR', error: validationError.message, source: 'validation', fetched_at: nowIso() };
  }

  if (!deps.client) {
    const db = deps.db || await getDbClient();
    if (db) {
      try {
        const rows = await db`
          SELECT * FROM sdos_event_lifecycle
          WHERE event_id = ${event_id}
          ORDER BY recorded_at ASC
        `;
        return rows.length === 0
          ? { outcome: 'EMPTY', data: [], source: 'sdos_service', fetched_at: nowIso() }
          : { outcome: 'OK', data: rows, source: 'sdos_service', fetched_at: nowIso() };
      } catch (error) {
        return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'sdos_service', fetched_at: nowIso() };
      }
    }
  }

  const client = deps.client || await getClient();
  try {
    const { data, error } = await client
      .from('sdos_event_lifecycle')
      .select('*')
      .eq('event_id', event_id)
      .order('recorded_at', { ascending: true });
    if (error) {
      return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: nowIso() };
    }
    return (!data || data.length === 0)
      ? { outcome: 'EMPTY', data: [], source: 'supabase', fetched_at: nowIso() }
      : { outcome: 'OK', data, source: 'supabase', fetched_at: nowIso() };
  } catch (error) {
    return { outcome: 'INTEGRATION_ERROR', error: error.message, source: 'supabase', fetched_at: nowIso() };
  }
}

export default {
  getRecentSdosEvents,
  getSdosEventById,
  getSdosEventLifecycle,
  _resetReaderClientsForTests,
};
