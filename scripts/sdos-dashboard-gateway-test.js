#!/usr/bin/env node
/**
 * SDOS Dashboard Gateway — Test Suite (Phase 17)
 * scripts/sdos-dashboard-gateway-test.js
 *
 * Follows the same check()/pass/fail runner convention as
 * scripts/sdos-events-reader-test.js, scripts/sdos-event-bus-test.js,
 * and scripts/sdos-permission-engine-test.js (no test framework
 * dependency exists in this repository).
 *
 * SCOPE OF WHAT THIS SUITE CAN EXERCISE UNDER NODE:
 *
 * `supabase/functions/sdos-dashboard-gateway/index.ts` is a Deno Edge
 * Function — it imports `https://deno.land/std@.../http/server.ts`
 * and `_shared/adminAuth.ts` (itself a `https://esm.sh/...` Deno-only
 * import), neither of which Node can import at all. This matches
 * every other authenticated admin Edge Function in this repository
 * (`admin-data`, `admin-analytics`, etc.) — none of them have a Node
 * unit test either, because their `verifyAdminSession()`/`adminCan()`
 * wrapper is inherently Deno+DB-session-shaped, not a pure function.
 * ADR-0017 records this as a deliberate, existing-convention-
 * following choice, not a coverage gap invented by this phase.
 *
 * What Phase 17 restructured for testability is
 * `supabase/functions/sdos-dashboard-gateway/gatewayLogic.js` — the
 * actual security-relevant surface (capability allow-list, field
 * validation, dispatch, error sanitization) — deliberately written as
 * a plain, dependency-injectable ESM module with no Deno-only import,
 * exactly like `sdosEventsReader.js` itself. This suite unit-tests
 * that module directly, using the same injected-fake-`deps.db`/
 * `deps.client` pattern `sdos-events-reader-test.js` already
 * established, and separately does static/structural source checks
 * (grep-style, matching `sdos-events-reader-test.js` scenarios 11/12/
 * 15) against both `gatewayLogic.js` and `index.ts` for the
 * auth-wiring guarantees that can't be exercised as pure function
 * calls under Node (unauthenticated/unauthorized rejection, no
 * credential in any response, no write surface, Event Bus untouched,
 * no Groq/executive import).
 *
 * Covers all 20 scenarios named in the Phase 17 brief — see the
 * per-check comments below for which of the 20 each maps to.
 *
 * Usage: node scripts/sdos-dashboard-gateway-test.js
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import {
  CAPABILITIES,
  ALLOWED_CAPABILITIES,
  validateCapabilityRequest,
  dispatchCapability,
  sanitizeResult,
} from '../supabase/functions/sdos-dashboard-gateway/gatewayLogic.js';
import { _resetReaderClientsForTests } from '../ai/integrations/supabase/sdosEventsReader.js';
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`  \u2705 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.log(`  \u274c ${name} \u2014 ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// Minimal fake of postgres.js's tagged-template client — identical
// shape to sdos-events-reader-test.js's own fakeDb(), reused here so
// dispatchCapability() can be exercised end-to-end through to a fake
// row set without ever touching a real credential or network call.
function fakeDb(handler) {
  const fn = (_strings, ..._values) => handler(_strings, _values);
  return fn;
}

const gatewaySource = readFileSync(new URL('../supabase/functions/sdos-dashboard-gateway/index.ts', import.meta.url), 'utf8');
const logicSource = readFileSync(new URL('../supabase/functions/sdos-dashboard-gateway/gatewayLogic.js', import.meta.url), 'utf8');

console.log('SDOS Dashboard Gateway \u2014 Phase 17 Test Suite\n');

// 7. unknown capability rejected
await check('validateCapabilityRequest rejects an unknown capability', async () => {
  const result = validateCapabilityRequest({ capability: 'sdos_events.all' });
  assert(result.ok === false, 'expected rejection');
  assert(result.status === 400, `expected 400, got ${result.status}`);
  return result.message;
});

await check('validateCapabilityRequest rejects a missing capability', async () => {
  const result = validateCapabilityRequest({ limit: 10 });
  assert(result.ok === false, 'expected rejection');
  assert(result.status === 400, `expected 400, got ${result.status}`);
});

// 8 / 9. arbitrary table / arbitrary SQL rejected — there is no field
// name on any capability's allow-list that could carry a table name
// or SQL fragment; both are structurally impossible, verified here by
// confirming any attempt to smuggle one in is rejected as an unknown
// field, and separately (below, scenario "structural") that no such
// field exists in the allow-list at all.
await check('unknown field carrying a table name is rejected (arbitrary table)', async () => {
  const result = validateCapabilityRequest({ capability: 'sdos_events.recent', table: 'admin_users' });
  assert(result.ok === false, 'expected rejection');
  assert(/Unknown field/.test(result.message), 'expected unknown-field message');
});

await check('unknown field carrying a SQL fragment is rejected (arbitrary SQL)', async () => {
  const result = validateCapabilityRequest({ capability: 'sdos_events.by_id', event_id: 'x', sql: 'DROP TABLE sdos_events;' });
  assert(result.ok === false, 'expected rejection');
  assert(/Unknown field/.test(result.message), 'expected unknown-field message');
});

// 10. invalid event_id rejected
await check('validateCapabilityRequest rejects empty/missing event_id', async () => {
  const empty = validateCapabilityRequest({ capability: 'sdos_events.by_id', event_id: '' });
  assert(empty.ok === false, 'expected rejection for empty string');
  const missing = validateCapabilityRequest({ capability: 'sdos_events.by_id' });
  assert(missing.ok === false, 'expected rejection for missing event_id');
  const wrongType = validateCapabilityRequest({ capability: 'sdos_event_lifecycle.by_event', event_id: 123 });
  assert(wrongType.ok === false, 'expected rejection for non-string event_id');
  return 'empty, missing, and non-string event_id all rejected';
});

// 11. invalid limit rejected
await check('validateCapabilityRequest rejects invalid limit', async () => {
  const zero = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 0 });
  assert(zero.ok === false, 'expected rejection for 0');
  const negative = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: -1 });
  assert(negative.ok === false, 'expected rejection for negative');
  const float = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 2.5 });
  assert(float.ok === false, 'expected rejection for float');
  const nonNumber = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 'ten' });
  assert(nonNumber.ok === false, 'expected rejection for non-numeric');
  return 'zero, negative, float, non-numeric limit all rejected';
});

// 12. limit cannot exceed maximum
await check('validateCapabilityRequest rejects limit > 200', async () => {
  const result = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 999999 });
  assert(result.ok === false, 'expected rejection');
  assert(/1 and 200/.test(result.message), 'expected max-bound message');
});

await check('validateCapabilityRequest accepts a valid limit at the boundary (200)', async () => {
  const result = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 200 });
  assert(result.ok === true, 'expected acceptance at boundary');
});

// 4. recent events capability succeeds
await check('dispatchCapability sdos_events.recent returns OK via injected fake reader', async () => {
  const validation = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 10 });
  assert(validation.ok, 'expected valid request');
  const fakeReader = async ({ limit }) => ({ outcome: 'OK', data: [{ event_id: 'e1' }], source: 'sdos_service', fetched_at: new Date().toISOString() });
  const result = await dispatchCapability(validation.capability, { capability: 'sdos_events.recent', limit: 10 }, { getRecentSdosEvents: fakeReader });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.data.length === 1, 'expected one fake row');
});

// 5. by-id capability succeeds
await check('dispatchCapability sdos_events.by_id returns OK via injected fake reader', async () => {
  const validation = validateCapabilityRequest({ capability: 'sdos_events.by_id', event_id: 'e1' });
  assert(validation.ok, 'expected valid request');
  const fakeReader = async ({ event_id }) => ({ outcome: 'OK', data: { event_id }, source: 'sdos_service', fetched_at: new Date().toISOString() });
  const result = await dispatchCapability(validation.capability, { capability: 'sdos_events.by_id', event_id: 'e1' }, { getSdosEventById: fakeReader });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.data.event_id === 'e1', 'expected matching event_id');
});

// 6. lifecycle capability succeeds
await check('dispatchCapability sdos_event_lifecycle.by_event returns OK via injected fake reader', async () => {
  const validation = validateCapabilityRequest({ capability: 'sdos_event_lifecycle.by_event', event_id: 'e1' });
  assert(validation.ok, 'expected valid request');
  const fakeReader = async ({ event_id }) => ({ outcome: 'OK', data: [{ event_id, stage: 'received' }], source: 'sdos_service', fetched_at: new Date().toISOString() });
  const result = await dispatchCapability(validation.capability, { capability: 'sdos_event_lifecycle.by_event', event_id: 'e1' }, { getSdosEventLifecycle: fakeReader });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.data[0].stage === 'received', 'expected lifecycle stage in fake row');
});

// 4 (real reader, no fakes) — full round trip through the actual
// sdosEventsReader.js using its own deps.db seam, proving the gateway
// really does call the unmodified Phase 16 reader, not a duplicate.
await check('dispatchCapability sdos_events.recent reaches the real sdosEventsReader.js via deps.db', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes('SELECT * FROM sdos_events'), 'expected real reader SQL literal');
    return [{ event_id: 'real-1' }];
  });
  const validation = validateCapabilityRequest({ capability: 'sdos_events.recent', limit: 5 });
  const result = await dispatchCapability(validation.capability, { capability: 'sdos_events.recent', limit: 5 }, { readerDeps: { db } });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.data[0].event_id === 'real-1', 'expected the real reader\u2019s row, proving no duplicate SQL exists in the gateway');
  _resetReaderClientsForTests();
});

// 16. dashboard handles EMPTY
await check('sanitizeResult passes EMPTY through unchanged (no error field)', async () => {
  const sanitized = sanitizeResult({ outcome: 'EMPTY', data: [], source: 'sdos_service', fetched_at: '2026-01-01T00:00:00Z' });
  assert(sanitized.outcome === 'EMPTY', 'expected EMPTY passthrough');
  assert(Array.isArray(sanitized.data) && sanitized.data.length === 0, 'expected empty array');
  assert(!('error' in sanitized), 'EMPTY result must not carry an error field');
});

// 13 / 17 / 14. database failure becomes safe INTEGRATION_ERROR; dashboard
// handles INTEGRATION_ERROR; credentials never appear in response
await check('sanitizeResult replaces a raw reader error with a fixed safe message (13, 17, 14)', async () => {
  const raw = { outcome: 'INTEGRATION_ERROR', error: 'connection to postgres://sdos_service:sup3rs3cr3t@db.internal failed', source: 'sdos_service', fetched_at: '2026-01-01T00:00:00Z' };
  const sanitized = sanitizeResult(raw);
  assert(sanitized.outcome === 'INTEGRATION_ERROR', 'expected INTEGRATION_ERROR passthrough');
  assert(!/postgres:\/\/|sup3rs3cr3t|SERVICE_ROLE_KEY|SDOS_DB_URL/i.test(sanitized.error), 'raw credential-shaped error string leaked to sanitized result');
  assert(sanitized.error === 'Read failed. See server-side function logs for details.', 'expected fixed generic message');
});

// 18. dashboard consumes real gateway response — full pipeline:
// validate -> dispatch (fake reader) -> sanitize, exactly the sequence
// index.ts runs, proving the three functions compose into one
// coherent response shape a browser can render.
await check('full validate \u2192 dispatch \u2192 sanitize pipeline produces a renderable OK response', async () => {
  const body = { capability: 'sdos_events.recent', limit: 3, event_type: 'task.created' };
  const validation = validateCapabilityRequest(body);
  assert(validation.ok, 'expected valid request');
  const fakeReader = async () => ({ outcome: 'OK', data: [{ event_id: 'e1', event_type: 'task.created' }], source: 'supabase', fetched_at: new Date().toISOString() });
  const raw = await dispatchCapability(validation.capability, body, { getRecentSdosEvents: fakeReader });
  const sanitized = sanitizeResult(raw);
  assert(sanitized.outcome === 'OK', 'expected OK');
  assert(sanitized.data[0].event_type === 'task.created', 'expected filtered event surfaced to the dashboard');
});

// 15. write operations impossible — structural: neither file contains
// any write-shaped call, and gatewayLogic.js's only reader imports are
// the three named read functions.
await check('neither gatewayLogic.js nor index.ts contains a write-shaped call (15)', async () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
  const logicCode = strip(logicSource);
  const gatewayCode = strip(gatewaySource);
  assert(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(logicCode), 'gatewayLogic.js contains a write-shaped call');
  assert(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(gatewayCode), 'index.ts contains a write-shaped call');
  return 'no .insert(/.update(/.delete(/.upsert( in either file';
});

await check('gatewayLogic.js imports only the three named Phase 16 read functions from the reader', async () => {
  const importLine = logicSource.match(/import \{([^}]+)\} from '\.\.\/\.\.\/\.\.\/ai\/integrations\/supabase\/sdosEventsReader\.js';/);
  assert(importLine, 'expected a single named import from sdosEventsReader.js');
  const imported = importLine[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert(imported.length === 3, `expected exactly 3 imports, got ${imported.length}: ${imported.join(', ')}`);
  for (const name of ['getRecentSdosEvents', 'getSdosEventById', 'getSdosEventLifecycle']) {
    assert(imported.includes(name), `missing expected import: ${name}`);
  }
});

// Structural check backing scenarios 7/8/9 fully: confirm the allow-list
// itself has no field capable of carrying a table/column/SQL parameter.
await check('capability allow-list contains no table/column/sql-shaped field name', async () => {
  const forbiddenFieldNames = ['table', 'sql', 'query', 'select', 'from', 'where', 'column'];
  for (const [name, spec] of Object.entries(CAPABILITIES)) {
    for (const f of forbiddenFieldNames) {
      assert(!spec.fields.has(f), `capability '${name}' unexpectedly allows a '${f}' field`);
    }
  }
  assert(ALLOWED_CAPABILITIES.length === 3, `expected exactly 3 capabilities, got ${ALLOWED_CAPABILITIES.length}`);
  return `capabilities: ${ALLOWED_CAPABILITIES.join(', ')}`;
});

// 1. unauthenticated request rejected / 2. unauthorized request rejected /
// 3. authenticated authorized request succeeds — structural: index.ts
// must call verifyAdminSession before ever touching req.json()/body,
// return adminAuthError(headers) when ctx is null, and gate on
// adminCan(ctx, 'system', 'read') before validateCapabilityRequest runs
// at all. (See file header for why this can't be exercised as a live
// HTTP call under Node — verifyAdminSession itself is Deno+DB-session
// shaped, matching every other admin Edge Function in this repo, none
// of which are Node-unit-tested either.)
await check('index.ts verifies the admin session and rejects when absent (1)', async () => {
  assert(/ctx = await verifyAdminSession\(req, db\)/.test(gatewaySource), 'expected verifyAdminSession call');
  assert(/if \(!ctx\) return adminAuthError\(headers\)/.test(gatewaySource), 'expected adminAuthError on missing/invalid session');
});

await check('index.ts gates on adminCan(ctx, \'system\', \'read\') before dispatch (2, 3)', async () => {
  assert(/adminCan\(ctx, 'system', 'read'\)/.test(gatewaySource), 'expected adminCan system:read gate');
  const authIdx = gatewaySource.indexOf("adminCan(ctx, 'system', 'read')");
  const validateIdx = gatewaySource.indexOf('validateCapabilityRequest(body)');
  assert(authIdx > -1 && validateIdx > -1 && authIdx < validateIdx, 'expected the authorization gate to run before capability validation/dispatch');
});

// 20. no Groq/executive path introduced
await check('neither file imports Groq or any executive module (20)', async () => {
  assert(!/groq/i.test(gatewaySource) && !/groq/i.test(logicSource), 'unexpected Groq reference');
  assert(!/executives\//.test(gatewaySource) && !/executives\//.test(logicSource), 'unexpected executive import');
});

// 19. Event Bus remains disabled — this gateway never READS, CHECKS,
// or WRITES the flag or the event bus module in executable code
// (reading history doesn't require the bus to be enabled — same as
// the Phase 16 reader). The flag's name legitimately appears in
// explanatory doc-comment prose in both files, so this checks for an
// actual code reference (an import, or the flag used as a value/key),
// not the literal string anywhere at all.
await check('neither file has executable code touching sdos_event_bus_enabled or eventBus.js (19)', async () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
  const gatewayCode = strip(gatewaySource);
  const logicCode = strip(logicSource);
  assert(!/sdos_event_bus_enabled/.test(gatewayCode) && !/sdos_event_bus_enabled/.test(logicCode), 'executable code references the feature flag');
  assert(!/from ['"].*eventBus\.js['"]/.test(gatewayCode) && !/from ['"].*eventBus\.js['"]/.test(logicCode), 'executable code imports eventBus.js');
  assert(!/isEventBusEnabled/.test(gatewayCode) && !/isEventBusEnabled/.test(logicCode), 'executable code calls isEventBusEnabled()');
});

// Method restriction (supports scenario 1/2 defense in depth): only
// POST is accepted; everything else, including GET, is rejected before
// any auth/body parsing runs.
await check('index.ts rejects non-POST methods before auth/body parsing', async () => {
  assert(/req\.method !== 'POST'/.test(gatewaySource), 'expected a POST-only method guard');
  const methodGuardIdx = gatewaySource.indexOf("req.method !== 'POST'");
  // Use the call site (`ctx = await verifyAdminSession(...)`), not the
  // import statement, which necessarily appears earlier in the file.
  const authCallIdx = gatewaySource.indexOf('ctx = await verifyAdminSession');
  assert(methodGuardIdx > -1 && authCallIdx > -1 && methodGuardIdx < authCallIdx, 'expected method guard to run before the verifyAdminSession call');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
process.exit(0);
