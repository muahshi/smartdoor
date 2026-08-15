
/**
 * ⚠️ TEMPORARY — SDOS Phase 14E LIVE Verification (delete after use)
 * supabase/functions/sdos-verify-14e-temp/index.ts
 *
 * PURPOSE
 *   One-time live proof that the manual migration-73 cutover (sdos_service
 *   granted LOGIN + SDOS_DB_URL provisioned as an Edge Function secret,
 *   per that migration's "MANUAL DEPLOYMENT STEPS") actually works against
 *   the real Supabase Postgres instance — something sql/72b/73b/74b_verify.sql
 *   cannot prove (they impersonate the role via SET LOCAL ROLE as `postgres`
 *   in the Dashboard SQL Editor, never touching the real SDOS_DB_URL
 *   credential path) and scripts/sdos-runtime-caller-verify.js cannot run
 *   without a local Node terminal.
 *
 * THIS IS NOT A PERMANENT PART OF SMARTDOOR.
 *   Delete via Supabase Dashboard → Edge Functions → sdos-verify-14e-temp
 *   → Delete, once verification is complete. It makes zero schema/data
 *   changes, so there is nothing to roll back in the database.
 *
 * SAFETY / SCOPE (Golden Rules — SDOS may touch only its own two tables
 * plus a read of sdos_%-prefixed feature_flags; PRODUCTION_BOUNDARY.md):
 *   - Every query below is read-only. NO INSERT/UPDATE/DELETE is ever
 *     issued by this function against any table.
 *   - No production business table (users, orders, payments,
 *     subscriptions, customers, or any other) is queried for data. The
 *     "access outside SDOS scope" check reads Postgres's own grant
 *     catalog (information_schema.role_table_grants) — metadata about
 *     what sdos_service is allowed to touch — never actual business rows.
 *   - SDOS_DB_URL is read once from env, passed directly to the `postgres`
 *     driver, and NEVER included in any response, log line, or thrown
 *     error message returned to the caller. Catch blocks return only a
 *     fixed generic message + safe fields (Postgres error `code`, not
 *     `message`, since some driver error messages can echo connection
 *     details).
 *   - Requires a valid Supabase Authorization header (deployed WITHOUT
 *     --no-verify-jwt) — invoke only via Supabase Dashboard → Edge
 *     Functions → sdos-verify-14e-temp → Test/Invoke panel, using the
 *     project's service_role key as the Bearer token. Not meant to be
 *     called from any client app.
 *   - Does NOT read, write, or flip feature_flags.sdos_event_bus_enabled —
 *     only ever SELECTs it.
 *
 * DEPLOY (Dashboard-only, no terminal required):
 *   Supabase Dashboard → Edge Functions → New Function → name
 *   "sdos-verify-14e-temp" → paste this file → Deploy. Leave "Verify JWT"
 *   ON (default) — do not disable it.
 *
 * INVOKE (Dashboard-only):
 *   Edge Functions → sdos-verify-14e-temp → Test/Invoke tab → set
 *   Authorization: Bearer <service_role key from Project Settings → API>
 *   → Send. Method/body are irrelevant; this function ignores the body.
 *
 * REMOVE:
 *   Edge Functions → sdos-verify-14e-temp → Delete. No SQL cleanup needed.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-cache, no-store',
};

type CheckResult = {
  name: string;
  result: 'PASS' | 'FAIL' | 'ERROR';
  detail?: string;
};

function pass(name: string, detail?: string): CheckResult {
  return { name, result: 'PASS', detail };
}
function fail(name: string, detail?: string): CheckResult {
  return { name, result: 'FAIL', detail };
}
function errorResult(name: string, code?: string): CheckResult {
  // Only ever surface a Postgres error CODE (e.g. 42501), never .message —
  // some driver messages can include connection-string fragments.
  return { name, result: 'ERROR', detail: code ? `pg_error_code=${code}` : 'unexpected_error' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const dbUrl = Deno.env.get('SDOS_DB_URL');
  if (!dbUrl) {
    return Response.json(
      { status: 'ERROR', message: 'SDOS_DB_URL not configured as an Edge Function secret.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const checks: CheckResult[] = [];
  let sql: any = null;

  try {
    const { default: postgres } = await import('https://esm.sh/postgres@3');
    sql = postgres(dbUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });

    // ── Check 1: current_user / current_role = sdos_service ──────────
    try {
      const rows = await sql`SELECT current_user, current_setting('role', true) AS role`;
      const cu = rows[0]?.current_user;
      if (cu === 'sdos_service') {
        checks.push(pass('current_user_is_sdos_service', `current_user=${cu}`));
      } else {
        checks.push(fail('current_user_is_sdos_service', `current_user=${cu ?? 'unknown'}`));
      }
    } catch (e: any) {
      checks.push(errorResult('current_user_is_sdos_service', e?.code));
    }

    // ── Check 2: sdos_event_bus_enabled readable and FALSE ────────────
    try {
      const rows = await sql`SELECT enabled FROM feature_flags WHERE key = 'sdos_event_bus_enabled' LIMIT 1`;
      if (rows.length === 0) {
        checks.push(fail('event_bus_flag_readable_and_false', 'row not found'));
      } else if (rows[0].enabled === false) {
        checks.push(pass('event_bus_flag_readable_and_false', 'enabled=false'));
      } else {
        checks.push(fail('event_bus_flag_readable_and_false', `enabled=${rows[0].enabled}`));
      }
    } catch (e: any) {
      checks.push(errorResult('event_bus_flag_readable_and_false', e?.code));
    }

    // ── Check 3: intended access to sdos_events (SELECT, INSERT true) ─
    await checkPrivileges(sql, checks, 'sdos_events', { SELECT: true, INSERT: true, UPDATE: false, DELETE: false });

    // ── Check 4: intended access to sdos_event_lifecycle ──────────────
    await checkPrivileges(sql, checks, 'sdos_event_lifecycle', { SELECT: true, INSERT: true, UPDATE: false, DELETE: false });

    // ── Check 5: sdos_% feature flags readable ────────────────────────
    try {
      const rows = await sql`SELECT key FROM feature_flags WHERE key LIKE 'sdos_%'`;
      if (rows.length > 0) {
        checks.push(pass('sdos_prefixed_flags_readable', `${rows.length} row(s) visible`));
      } else {
        checks.push(fail('sdos_prefixed_flags_readable', 'zero rows visible'));
      }
    } catch (e: any) {
      checks.push(errorResult('sdos_prefixed_flags_readable', e?.code));
    }

    // ── Check 6: scope boundary — catalog-only, no business data touched
    // sdos_service must have grants on exactly: sdos_events, sdos_event_lifecycle
    // (SELECT/INSERT), feature_flags (SELECT). Anything else present = FAIL.
    try {
      const rows = await sql`
        SELECT table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE grantee = 'sdos_service' AND table_schema = 'public'
        ORDER BY table_name, privilege_type
      `;
      const allowed = new Set([
        'sdos_events:SELECT', 'sdos_events:INSERT',
        'sdos_event_lifecycle:SELECT', 'sdos_event_lifecycle:INSERT',
        'feature_flags:SELECT',
      ]);
      const outOfScope = rows
        .map((r: any) => `${r.table_name}:${r.privilege_type}`)
        .filter((k: string) => !allowed.has(k));
      if (outOfScope.length === 0) {
        checks.push(pass('scope_boundary_no_out_of_scope_grants', `${rows.length} grant(s), all within documented SDOS scope`));
      } else {
        checks.push(fail('scope_boundary_no_out_of_scope_grants', `unexpected grants: ${outOfScope.join(', ')}`));
      }
    } catch (e: any) {
      checks.push(errorResult('scope_boundary_no_out_of_scope_grants', e?.code));
    }

    const allPass = checks.every((c) => c.result === 'PASS');
    return Response.json(
      {
        status: allPass ? 'PASS' : 'FAIL',
        phase: '14E-live-verification',
        timestamp: new Date().toISOString(),
        checks,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (e: any) {
    // Connection-level failure (bad credential, network, etc). Never
    // surface e.message — it can include the connection string.
    return Response.json(
      {
        status: 'ERROR',
        phase: '14E-live-verification',
        timestamp: new Date().toISOString(),
        checks,
        connectionError: e?.code ? `pg_error_code=${e.code}` : 'connection_failed',
      },
      { status: 500, headers: corsHeaders }
    );
  } finally {
    if (sql) {
      try { await sql.end({ timeout: 5 }); } catch (_) { /* ignore */ }
    }
  }
});

/**
 * has_table_privilege() check for one table against an expected
 * {SELECT, INSERT, UPDATE, DELETE} boolean shape. Pushes one PASS/FAIL
 * CheckResult per table (not per privilege) — FAIL detail lists exactly
 * which privilege(s) didn't match expectation.
 */
async function checkPrivileges(
  sql: any,
  checks: CheckResult[],
  table: string,
  expected: { SELECT: boolean; INSERT: boolean; UPDATE: boolean; DELETE: boolean }
) {
  try {
    const rows = await sql`
      SELECT
        has_table_privilege('sdos_service', ${table}, 'SELECT') AS can_select,
        has_table_privilege('sdos_service', ${table}, 'INSERT') AS can_insert,
        has_table_privilege('sdos_service', ${table}, 'UPDATE') AS can_update,
        has_table_privilege('sdos_service', ${table}, 'DELETE') AS can_delete
    `;
    const r = rows[0];
    const actual = { SELECT: r.can_select, INSERT: r.can_insert, UPDATE: r.can_update, DELETE: r.can_delete };
    const mismatches = (Object.keys(expected) as Array<keyof typeof expected>).filter(
      (k) => actual[k] !== expected[k]
    );
    if (mismatches.length === 0) {
      checks.push(pass(
        `privileges_${table}`,
        `SELECT=${actual.SELECT} INSERT=${actual.INSERT} UPDATE=${actual.UPDATE} DELETE=${actual.DELETE}`
      ));
    } else {
      checks.push(fail(
        `privileges_${table}`,
        `mismatch on ${mismatches.join(',')} — actual: SELECT=${actual.SELECT} INSERT=${actual.INSERT} UPDATE=${actual.UPDATE} DELETE=${actual.DELETE}`
      ));
    }
  } catch (e: any) {
    checks.push(errorResult(`privileges_${table}`, e?.code));
  }
    }
