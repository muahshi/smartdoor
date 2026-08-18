#!/usr/bin/env node
/**
 * SDOS Events Reader — Test Suite (Phase 16)
 * scripts/sdos-events-reader-test.js
 *
 * Follows the same check()/pass/fail runner convention already used by
 * scripts/sdos-event-bus-test.js and scripts/sdos-credential-path-test.js
 * (no jest/mocha/vitest dependency exists in this repository — see
 * package.json). Every scenario injects deps.client (a fake
 * @supabase/supabase-js-shaped client) or deps.db (a fake postgres.js
 * tagged-template client) — this suite never sets SDOS_DB_URL, never
 * imports the real `postgres` or `@supabase/supabase-js` package, and
 * makes no network call.
 *
 * Covers the 15 scenarios named in the Phase 16 brief.
 *
 * Usage: node scripts/sdos-events-reader-test.js
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import {
  getRecentSdosEvents,
  getSdosEventById,
  getSdosEventLifecycle,
  _resetReaderClientsForTests,
  default as readerDefault,
} from '../ai/integrations/supabase/sdosEventsReader.js';
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

// Minimal fake of postgres.js's tagged-template client: `db\`...\`` calls
// db(strings, ...values). We don't parse SQL — each fake returns/throws
// whatever the test scenario needs.
function fakeDb(handler) {
  const fn = (_strings, ..._values) => handler(_strings, _values);
  fn.json = (v) => v;
  return fn;
}

// Minimal fake of the @supabase/supabase-js query-builder chain used by
// this reader (.from().select().order().limit().eq()... / .maybeSingle()).
function fakeSupabaseClient({ rows = [], error = null } = {}) {
  const builder = {
    _eqCalls: [],
    _orderCalls: [],
    _limitCalls: [],
    from() { return builder; },
    select() { return builder; },
    order(col, opts) { builder._orderCalls.push({ col, opts }); return builder; },
    limit(n) { builder._limitCalls.push(n); return builder; },
    eq(col, val) { builder._eqCalls.push({ col, val }); return builder; },
    async maybeSingle() {
      if (error) return { data: null, error };
      return { data: rows[0] || null, error: null };
    },
    then(resolve) {
      // Allows `await query` where query is the builder itself (no
      // maybeSingle() call) — matches how getRecentSdosEvents and
      // getSdosEventLifecycle await the builder directly.
      resolve({ data: error ? null : rows, error });
    },
  };
  return { from: () => builder, _builder: builder };
}

const sampleEventId = 'evt-reader-test-0001';

console.log('SDOS Events Reader — Phase 16 Test Suite\n');

// 1. recent events returns OK
await check('getRecentSdosEvents returns OK with rows (deps.db)', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes('SELECT * FROM sdos_events'), 'expected sdos_events SELECT');
    return [{ event_id: sampleEventId, event_type: 'task.created' }];
  });
  const result = await getRecentSdosEvents({ limit: 10 }, { db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(Array.isArray(result.data) && result.data.length === 1, 'expected one row');
  assert(result.source === 'sdos_service', `expected source sdos_service, got ${result.source}`);
  assert(typeof result.fetched_at === 'string', 'expected fetched_at ISO string');
  return 'OK with one row via deps.db';
});

// 2. empty result returns EMPTY
await check('getRecentSdosEvents returns EMPTY when no rows match', async () => {
  const db = fakeDb(() => []);
  const result = await getRecentSdosEvents({ limit: 5 }, { db });
  assert(result.outcome === 'EMPTY', `expected EMPTY, got ${result.outcome}`);
  assert(Array.isArray(result.data) && result.data.length === 0, 'expected empty array');
  return 'EMPTY with zero rows';
});

// 3. by-id returns OK
await check('getSdosEventById returns OK when found', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes('SELECT * FROM sdos_events WHERE event_id'), 'expected by-id SELECT');
    return [{ event_id: sampleEventId }];
  });
  const result = await getSdosEventById({ event_id: sampleEventId }, { db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.data.event_id === sampleEventId, 'expected matching event_id');
  return 'OK, matching row returned';
});

// 4. lifecycle returns OK
await check('getSdosEventLifecycle returns OK with ordered rows', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes('SELECT * FROM sdos_event_lifecycle'), 'expected lifecycle SELECT');
    return [
      { lifecycle_id: 'l1', event_id: sampleEventId, stage: 'received' },
      { lifecycle_id: 'l2', event_id: sampleEventId, stage: 'persisted' },
    ];
  });
  const result = await getSdosEventLifecycle({ event_id: sampleEventId }, { db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.data.length === 2, 'expected two lifecycle rows');
  return 'OK, two-stage lifecycle trace';
});

// 5. invalid event_id is rejected
await check('getSdosEventById rejects empty/invalid event_id', async () => {
  const resultEmpty = await getSdosEventById({ event_id: '' }, {});
  assert(resultEmpty.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${resultEmpty.outcome}`);
  const resultMissing = await getSdosEventById({}, {});
  assert(resultMissing.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${resultMissing.outcome}`);
  const resultWrongType = await getSdosEventById({ event_id: 12345 }, {});
  assert(resultWrongType.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${resultWrongType.outcome}`);
  return 'empty string, missing, and non-string event_id all rejected';
});

// 6. invalid limit is rejected
await check('getRecentSdosEvents rejects invalid limit', async () => {
  const zero = await getRecentSdosEvents({ limit: 0 }, {});
  assert(zero.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR for 0, got ${zero.outcome}`);
  const negative = await getRecentSdosEvents({ limit: -5 }, {});
  assert(negative.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR for negative, got ${negative.outcome}`);
  const float = await getRecentSdosEvents({ limit: 3.5 }, {});
  assert(float.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR for float, got ${float.outcome}`);
  const nonNumber = await getRecentSdosEvents({ limit: 'ten' }, {});
  assert(nonNumber.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR for non-number, got ${nonNumber.outcome}`);
  return 'zero, negative, float, and non-numeric limit all rejected';
});

// 7. limit is bounded
await check('getRecentSdosEvents bounds an over-large limit to MAX_LIMIT (200)', async () => {
  let capturedLimit = null;
  const db = fakeDb((strings, values) => {
    // Last interpolated value in the no-filter branch is the LIMIT value.
    capturedLimit = values[values.length - 1];
    return [];
  });
  await getRecentSdosEvents({ limit: 999999 }, { db });
  assert(capturedLimit === 200, `expected bounded limit 200, got ${capturedLimit}`);
  return 'requested limit 999999 bounded to 200';
});

// 8. event_type filtering works
await check('getRecentSdosEvents filters by event_type', async () => {
  const db = fakeDb((strings, values) => {
    assert(strings[0].includes('WHERE event_type ='), 'expected event_type filter in query');
    assert(values.includes('task.created'), 'expected event_type value bound');
    return [{ event_id: sampleEventId, event_type: 'task.created' }];
  });
  const result = await getRecentSdosEvents({ limit: 10, event_type: 'task.created' }, { db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  return 'event_type filter reaches the query';
});

// 9. correlation_id filtering works
await check('getRecentSdosEvents filters by correlation_id', async () => {
  const db = fakeDb((strings, values) => {
    assert(strings[0].includes('correlation_id ='), 'expected correlation_id filter in query');
    assert(values.includes('corr-9999'), 'expected correlation_id value bound');
    return [{ event_id: sampleEventId, correlation_id: 'corr-9999' }];
  });
  const result = await getRecentSdosEvents({ limit: 10, correlation_id: 'corr-9999' }, { db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  return 'correlation_id filter reaches the query';
});

// 10. DB failure returns INTEGRATION_ERROR
await check('getRecentSdosEvents fails closed on deps.db error (no service_role fallback)', async () => {
  const db = fakeDb(() => {
    throw new Error('connection refused');
  });
  const result = await getRecentSdosEvents({ limit: 10 }, { db });
  assert(result.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${result.outcome}`);
  assert(result.source === 'sdos_service', `expected source sdos_service (fail-closed, not a fallback), got ${result.source}`);
  assert(!('client' in result), 'result must not carry a raw client/credential reference');
  return 'INTEGRATION_ERROR, source remains sdos_service — confirms no silent fallback';
});

await check('getSdosEventById fails closed on deps.client error', async () => {
  const client = fakeSupabaseClient({ error: { message: 'network error' } });
  const result = await getSdosEventById({ event_id: sampleEventId }, { client });
  assert(result.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${result.outcome}`);
  return 'INTEGRATION_ERROR via deps.client error path';
});

// 11. no write method exists
await check('module exports contain no write method', async () => {
  const source = readFileSync(new URL('../ai/integrations/supabase/sdosEventsReader.js', import.meta.url), 'utf8');
  const exportNames = Object.keys(readerDefault);
  const forbidden = ['insertEvent', 'appendLifecycleStage', 'broadcastEvent', 'insert', 'update', 'delete', 'upsert', 'write'];
  for (const name of forbidden) {
    assert(!exportNames.includes(name), `forbidden export found: ${name}`);
  }
  assert(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n')), 'no write-shaped call present in executable code');
  return `exports are: ${exportNames.join(', ')} — none are write methods`;
});

// 12. no dynamic table parameter exists
await check('no function accepts a table/column name parameter', async () => {
  const source = readFileSync(new URL('../ai/integrations/supabase/sdosEventsReader.js', import.meta.url), 'utf8');
  assert(!/\.from\(\s*[a-zA-Z_]+\s*\)/.test(source.replace(/\.from\('sdos_events'\)|\.from\('sdos_event_lifecycle'\)/g, '')), 'a .from() call uses a variable table name');
  assert(!source.includes('function query(') && !source.includes('function read(') && !source.includes('function select(') && !source.includes('function get('), 'a generic query/read/select/get function exists');
  return 'only .from(\'sdos_events\') / .from(\'sdos_event_lifecycle\') literals present; no generic accessor function';
});

// 13. unsupported capability cannot be requested
await check('no dynamic capability dispatch exists (only 3 named exports)', async () => {
  const exportNames = Object.keys(readerDefault).filter((k) => typeof readerDefault[k] === 'function' && k !== '_resetReaderClientsForTests');
  assert(exportNames.length === 3, `expected exactly 3 capability functions, got ${exportNames.length}: ${exportNames.join(', ')}`);
  assert(exportNames.includes('getRecentSdosEvents'), 'missing getRecentSdosEvents');
  assert(exportNames.includes('getSdosEventById'), 'missing getSdosEventById');
  assert(exportNames.includes('getSdosEventLifecycle'), 'missing getSdosEventLifecycle');
  return '3 capability functions only — no capability string dispatch to request an unsupported one';
});

// 14. credentials are not included in returned errors
await check('DB failure error message never includes credential-shaped strings', async () => {
  const db = fakeDb(() => {
    throw new Error('connection refused');
  });
  const result = await getRecentSdosEvents({ limit: 10 }, { db });
  assert(!/postgres:\/\/|SDOS_DB_URL|SERVICE_ROLE_KEY|password/i.test(result.error), 'error message leaked a credential-shaped string');
  return 'error message is a plain failure reason, no credential content';
});

// 15. reader cannot access any table outside the two SDOS tables
await check('source file references no table other than the two SDOS tables', async () => {
  const source = readFileSync(new URL('../ai/integrations/supabase/sdosEventsReader.js', import.meta.url), 'utf8');
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  const fromCalls = [...codeOnly.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]);
  const fromSql = [...codeOnly.matchAll(/FROM (\w+)/g)].map((m) => m[1]);
  const allTables = new Set([...fromCalls, ...fromSql]);
  for (const t of allTables) {
    assert(t === 'sdos_events' || t === 'sdos_event_lifecycle', `unexpected table referenced: ${t}`);
  }
  assert(allTables.size > 0, 'expected at least one table reference to exist and be validated');
  return `tables referenced in executable code: ${[...allTables].join(', ')}`;
});

_resetReaderClientsForTests();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
process.exit(0);
