#!/usr/bin/env node
/**
 * SDOS Event Store — Credential Path Test (Phase 14E)
 * scripts/sdos-credential-path-test.js
 *
 * Covers the branching logic Phase 14E added to
 * ai/integrations/supabase/sdosEventsStore.js: the direct-Postgres
 * (sdos_service / SDOS_DB_URL) path used by insertEvent(),
 * appendLifecycleStage(), and isEventBusEnabled(), and its fail-closed
 * contract. None of this is exercised by scripts/sdos-event-bus-test.js,
 * which only calls sdosEventsStore.js via eventBus.js's deps.store seam
 * (a full store substitute) — it never reaches getDbClient() or the
 * new deps.db branch at all.
 *
 * This suite injects deps.db directly (a fake postgres.js tagged-template
 * client) — it never sets SDOS_DB_URL or imports the real `postgres`
 * driver, so it makes no network call and cannot reach a real database.
 * It verifies STRUCTURE (which branch runs, what it returns on success/
 * failure) — NOT that a live sdos_service credential actually works
 * against the real Supabase project, which requires live verification
 * this sandbox has no network path to perform (see Phase 14E report).
 *
 * Usage: node scripts/sdos-credential-path-test.js
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import {
  insertEvent,
  appendLifecycleStage,
  isEventBusEnabled,
  _resetDbClientForTests,
} from '../ai/integrations/supabase/sdosEventsStore.js';

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
  if (!cond) throw new Error(msg);
}

// Minimal fake of postgres.js's tagged-template client: `db\`...\`` calls
// db(strings, ...values). We don't parse SQL — each fake just returns/
// throws whatever the test scenario needs.
function fakeDb(handler) {
  const fn = (_strings, ..._values) => handler(_strings, _values);
  fn.json = (v) => v; // postgres.js's db.json() helper, used by insertEvent
  return fn;
}

const sampleEvent = {
  event_id: 'evt-cred-test-0001',
  event_type: 'task.created',
  source: 'sdos-system',
  session_id: null,
  correlation_id: 'corr-0001',
  priority: 'normal',
  payload: { note: 'credential path test' },
};

console.log('SDOS Event Store — Phase 14E Credential Path Test Suite\n');

await check('insertEvent uses deps.db when provided, returns OK', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes('INSERT INTO sdos_events'), 'expected sdos_events INSERT');
    return [{ event_id: sampleEvent.event_id, event_type: sampleEvent.event_type }];
  });
  const result = await insertEvent(sampleEvent, { db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.source === 'sdos_service', `expected source sdos_service, got ${result.source}`);
  return 'direct-Postgres branch reached, OK returned';
});

await check('insertEvent duplicate (23505) via deps.db returns DUPLICATE, not a second row', async () => {
  let insertCalls = 0;
  const db = fakeDb((strings) => {
    if (strings[0].includes('INSERT INTO sdos_events')) {
      insertCalls++;
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505';
      throw err;
    }
    if (strings[0].includes('SELECT * FROM sdos_events')) {
      return [{ event_id: sampleEvent.event_id }];
    }
    throw new Error('unexpected query: ' + strings[0]);
  });
  const result = await insertEvent(sampleEvent, { db });
  assert(result.outcome === 'DUPLICATE', `expected DUPLICATE, got ${result.outcome}`);
  assert(insertCalls === 1, 'insert should only be attempted once');
  return 'DUPLICATE outcome, exactly one insert attempt';
});

await check('insertEvent fails closed on deps.db error (no service_role fallback)', async () => {
  const db = fakeDb(() => {
    throw new Error('connection refused');
  });
  const result = await insertEvent(sampleEvent, { db });
  assert(result.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${result.outcome}`);
  assert(result.source === 'sdos_service', `expected source sdos_service (fail-closed, not a fallback), got ${result.source}`);
  return 'INTEGRATION_ERROR, source remains sdos_service — confirms no silent fallback';
});

await check('appendLifecycleStage uses deps.db when provided, returns OK', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes('INSERT INTO sdos_event_lifecycle'), 'expected sdos_event_lifecycle INSERT');
    return [{ event_id: sampleEvent.event_id, stage: 'persisted' }];
  });
  const result = await appendLifecycleStage(
    { event_id: sampleEvent.event_id, stage: 'persisted', detail: null, correlation_id: sampleEvent.correlation_id },
    { db }
  );
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.source === 'sdos_service', `expected source sdos_service, got ${result.source}`);
  return 'direct-Postgres branch reached, OK returned';
});

await check('appendLifecycleStage fails closed on deps.db error', async () => {
  const db = fakeDb(() => {
    throw new Error('permission denied for table sdos_event_lifecycle');
  });
  const result = await appendLifecycleStage(
    { event_id: sampleEvent.event_id, stage: 'persisted' },
    { db }
  );
  assert(result.outcome === 'INTEGRATION_ERROR', `expected INTEGRATION_ERROR, got ${result.outcome}`);
  assert(result.source === 'sdos_service', 'fail-closed result should still report sdos_service as the attempted source');
  return 'INTEGRATION_ERROR, no fallback';
});

await check('isEventBusEnabled reads true via deps.db', async () => {
  const db = fakeDb((strings) => {
    assert(strings[0].includes("FROM feature_flags"), 'expected feature_flags SELECT');
    return [{ enabled: true }];
  });
  const result = await isEventBusEnabled({ db });
  assert(result === true, `expected true, got ${result}`);
  return 'true read through sdos_service path';
});

await check('isEventBusEnabled reads false (flag off) via deps.db', async () => {
  const db = fakeDb(() => [{ enabled: false }]);
  const result = await isEventBusEnabled({ db });
  assert(result === false, `expected false, got ${result}`);
  return 'false read through sdos_service path';
});

await check('isEventBusEnabled fails safe to false (never throws) on deps.db error', async () => {
  const db = fakeDb(() => {
    throw new Error('relation "feature_flags" does not exist for role sdos_service');
  });
  const result = await isEventBusEnabled({ db });
  assert(result === false, `expected false (fail-safe), got ${result}`);
  return 'false on error — never throws, matches existing fail-safe contract';
});

await check('isEventBusEnabled fails safe to false on missing row via deps.db', async () => {
  const db = fakeDb(() => []);
  const result = await isEventBusEnabled({ db });
  assert(result === false, `expected false, got ${result}`);
  return 'false on empty result set';
});

await check('deps.client (test seam) still takes priority over deps.db / SDOS_DB_URL', async () => {
  let dbCalled = false;
  const db = fakeDb(() => { dbCalled = true; return [{}]; });
  const fakeSupabaseClient = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { event_id: sampleEvent.event_id }, error: null }),
        }),
      }),
    }),
  };
  const result = await insertEvent(sampleEvent, { client: fakeSupabaseClient, db });
  assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
  assert(result.source === 'supabase', `expected source supabase (deps.client path), got ${result.source}`);
  assert(dbCalled === false, 'deps.db must not be touched when deps.client is provided — Phase 14A/14B test seam is unchanged');
  return 'deps.client path taken, deps.db untouched — existing Phase 14A suite is unaffected';
});

_resetDbClientForTests(null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
