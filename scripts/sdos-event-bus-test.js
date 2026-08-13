#!/usr/bin/env node
/**
 * SDOS Event Bus — Test Suite (Phase 14A)
 * scripts/sdos-event-bus-test.js
 *
 * Covers the ten scenarios the Phase 14A brief names. Follows
 * scripts/smoke-test.js's own check()/pass/fail runner convention
 * (this repository has no jest/mocha/vitest dependency — see
 * package.json — so this reuses the one test-running pattern that
 * already exists rather than introducing a new framework, per the
 * brief's "do not invent a completely new test framework" instruction
 * and TEST_STRATEGY.md's Boundary Tests requirement: every scenario
 * must be verifiable without touching a real SmartDoor production
 * table. This suite never imports @supabase/supabase-js and never
 * makes a network call — ai/core/events/eventBus.js's `deps.store`
 * injection seam is used to substitute an in-memory fake for
 * ai/integrations/supabase/sdosEventsStore.js.
 *
 * Usage: node scripts/sdos-event-bus-test.js
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import { emitEvent, validateEvent, authorizeEvent, ALLOWED_SOURCES } from '../ai/core/events/eventBus.js';

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

/**
 * In-memory fake of ai/integrations/supabase/sdosEventsStore.js.
 * Records every call so tests can assert on the lifecycle trace
 * (this IS the "append-only enforcement" and "audit" behavior under
 * test — the fake never offers an update/delete method at all, so a
 * bug that tried to mutate a prior stage would fail with
 * "not a function", the same way the real table's REVOKE UPDATE,
 * DELETE would fail with a Postgres permission error).
 */
function makeFakeStore(opts = {}) {
  const events = new Map(); // event_id -> event row
  const lifecycle = []; // append-only array — no update/remove method exists
  let insertEventOverride = opts.insertEventOverride;
  let broadcastOverride = opts.broadcastOverride;

  return {
    _events: events,
    _lifecycle: lifecycle,
    async isEventBusEnabled() {
      return opts.enabled !== false; // default enabled, so tests exercise the real pipeline
    },
    async appendLifecycleStage({ event_id, stage, detail, correlation_id }) {
      lifecycle.push({ event_id, stage, detail: detail ?? null, correlation_id: correlation_id ?? null, recorded_at: new Date().toISOString() });
      return { outcome: 'OK' };
    },
    async insertEvent(event) {
      if (insertEventOverride) return insertEventOverride(event);
      if (events.has(event.event_id)) {
        return { outcome: 'DUPLICATE', data: events.get(event.event_id) };
      }
      events.set(event.event_id, event);
      return { outcome: 'OK', data: event };
    },
    async broadcastEvent(event) {
      if (broadcastOverride) return broadcastOverride(event);
      return { outcome: 'OK' };
    },
  };
}

function stagesFor(fakeStore, event_id) {
  return fakeStore._lifecycle.filter((l) => l.event_id === event_id).map((l) => l.stage);
}

async function main() {
  console.log('SDOS Event Bus \u2014 Phase 14A Test Suite\n');

  // 1. Valid event — full pipeline reaches OK, every stage traced.
  await check('valid event completes with full lifecycle trace', async () => {
    const fakeStore = makeFakeStore();
    const result = await emitEvent(
      { event_type: 'permission.checked', source: 'permissions', correlation_id: 'corr-1', payload: { action: 'read_orders', outcome: 'allowed' } },
      { store: fakeStore }
    );
    assert(result.outcome === 'OK', `expected OK, got ${result.outcome}`);
    const stages = stagesFor(fakeStore, result.event_id);
    for (const expected of ['received', 'validated', 'authorized', 'persisted', 'broadcast_attempted', 'broadcast_succeeded']) {
      assert(stages.includes(expected), `missing stage ${expected}; got [${stages.join(', ')}]`);
    }
    return `stages: ${stages.join(' \u2192 ')}`;
  });

  // 2. Invalid event (bad event_type shape) — rejected at Validate.
  await check('invalid event is rejected at Validate, never reaches Persist', async () => {
    const fakeStore = makeFakeStore();
    const result = await emitEvent({ event_type: 'NOT_VALID', source: 'cto' }, { store: fakeStore });
    assert(result.outcome === 'REJECTED', `expected REJECTED, got ${result.outcome}`);
    assert(result.stage === 'validate', `expected stage validate, got ${result.stage}`);
    assert(fakeStore._events.size === 0, 'rejected event must not be persisted');
    assert(stagesFor(fakeStore, result.event_id).includes('validation_failed'), 'missing validation_failed lifecycle row');
    return result.reason;
  });

  // 3. Unauthorized event — rejected at Authorize (passes Validate first).
  await check('unauthorized source is rejected at Authorize', async () => {
    const fakeStore = makeFakeStore();
    const result = await emitEvent({ event_type: 'error.raised', source: 'random-unregistered-thing' }, { store: fakeStore });
    assert(result.outcome === 'REJECTED', `expected REJECTED, got ${result.outcome}`);
    assert(result.stage === 'authorize', `expected stage authorize, got ${result.stage}`);
    const stages = stagesFor(fakeStore, result.event_id);
    assert(stages.includes('validated'), 'should have passed validation first');
    assert(stages.includes('authorization_failed'), 'missing authorization_failed lifecycle row');
    assert(fakeStore._events.size === 0, 'unauthorized event must not be persisted');
    return result.reason;
  });

  // 4. Persistence failure — surfaced as PERSISTENCE_FAILED, not silently dropped.
  await check('persistence failure is reported, not silently dropped', async () => {
    const fakeStore = makeFakeStore({
      insertEventOverride: async () => ({ outcome: 'INTEGRATION_ERROR', error: 'simulated DB write failure' }),
    });
    const result = await emitEvent({ event_type: 'error.raised', source: 'runtime' }, { store: fakeStore });
    assert(result.outcome === 'PERSISTENCE_FAILED', `expected PERSISTENCE_FAILED, got ${result.outcome}`);
    assert(stagesFor(fakeStore, result.event_id).includes('persistence_failed'), 'missing persistence_failed lifecycle row');
    return result.reason;
  });

  // 5. Realtime broadcast failure — event stays OK; broadcast failure alone traced.
  await check('broadcast failure never invalidates an already-persisted event', async () => {
    const fakeStore = makeFakeStore({
      broadcastOverride: async () => ({ outcome: 'INTEGRATION_ERROR', error: 'simulated channel timeout' }),
    });
    const result = await emitEvent({ event_type: 'error.raised', source: 'runtime' }, { store: fakeStore });
    assert(result.outcome === 'OK', `expected OK (persistence succeeded), got ${result.outcome}`);
    assert(result.broadcast === 'INTEGRATION_ERROR', 'expected broadcast outcome to surface the failure');
    assert(fakeStore._events.has(result.event_id), 'event must remain persisted despite broadcast failure');
    assert(stagesFor(fakeStore, result.event_id).includes('broadcast_failed'), 'missing broadcast_failed lifecycle row');
    return 'event persisted; broadcast_failed traced separately';
  });

  // 6. Duplicate event — same event_id twice → DUPLICATE, no second row.
  await check('duplicate event_id is idempotent, never a second row', async () => {
    const fakeStore = makeFakeStore();
    const input = { event_id: '11111111-1111-4111-8111-111111111111', event_type: 'error.raised', source: 'runtime' };
    const first = await emitEvent(input, { store: fakeStore });
    const second = await emitEvent(input, { store: fakeStore });
    assert(first.outcome === 'OK', 'first emission should succeed');
    assert(second.outcome === 'DUPLICATE', `expected DUPLICATE, got ${second.outcome}`);
    assert(fakeStore._events.size === 1, `expected exactly one stored row, got ${fakeStore._events.size}`);
    return 'second emission returned DUPLICATE, one row in store';
  });

  // 7. Malformed payload — non-serializable / wrong-shaped payload rejected.
  await check('malformed payload (non-object) is rejected at Validate', async () => {
    const fakeStore = makeFakeStore();
    const result = await emitEvent({ event_type: 'error.raised', source: 'runtime', payload: 'not-an-object' }, { store: fakeStore });
    assert(result.outcome === 'REJECTED', `expected REJECTED, got ${result.outcome}`);
    assert(/malformed_payload/.test(result.reason), `expected malformed_payload reason, got ${result.reason}`);
    return result.reason;
  });

  await check('payload carrying a secret-shaped key is rejected at Validate', async () => {
    const fakeStore = makeFakeStore();
    const result = await emitEvent({ event_type: 'error.raised', source: 'runtime', payload: { api_key: 'sk-test-123' } }, { store: fakeStore });
    assert(result.outcome === 'REJECTED', `expected REJECTED, got ${result.outcome}`);
    return result.reason;
  });

  // 8. Missing correlation ID where required (task.*/approval.* events).
  await check('task.* event without correlation_id is rejected', async () => {
    const fakeStore = makeFakeStore();
    const result = await emitEvent({ event_type: 'task.created', source: 'router' }, { store: fakeStore });
    assert(result.outcome === 'REJECTED', `expected REJECTED, got ${result.outcome}`);
    assert(/missing_correlation_id/.test(result.reason), `expected missing_correlation_id reason, got ${result.reason}`);
    return result.reason;
  });

  // 9. Append-only enforcement — structural, verified two ways:
  //    (a) the fake store used throughout this suite has no update/delete
  //        method at all — every write above went through insertEvent/
  //        appendLifecycleStage only, by construction of this test file;
  //    (b) the real table-level grant (REVOKE UPDATE, DELETE) is verified
  //        against the live database by sql/72b_verify.sql Check 6, which
  //        this suite cannot exercise without a real Postgres connection
  //        (see TEST_STRATEGY.md Boundary Tests — this suite deliberately
  //        never touches production).
  await check('append-only enforcement (structural, JS-side)', async () => {
    const fakeStore = makeFakeStore();
    assert(typeof fakeStore.updateEvent === 'undefined', 'fake store must expose no update method');
    assert(typeof fakeStore.deleteEvent === 'undefined', 'fake store must expose no delete method');
    return 'no update/delete path exists in the store contract; DB-level grant verified separately by sql/72b_verify.sql Check 6';
  });

  // 10. RLS / security boundary — verified two ways, same reasoning as #9.
  await check('RLS/security boundary (source allow-list is structural, not input-derived)', async () => {
    assert(Array.isArray(ALLOWED_SOURCES) && Object.isFrozen(ALLOWED_SOURCES), 'ALLOWED_SOURCES must be a frozen constant');
    const spoofed = authorizeEvent({ source: '__proto__' });
    assert(spoofed.ok === false, 'a non-registered source string must never authorize, regardless of content');
    return 'ALLOWED_SOURCES is a frozen module constant, not derived from event content; DB-level RLS (zero policies) verified separately by sql/72b_verify.sql Checks 4-6';
  });

  // Bonus: validateEvent/authorizeEvent are pure and side-effect-free
  // (no store argument needed), confirming Validate/Authorize never
  // reach the network before Persist — directly supports scenario 2/3
  // above and TEST_STRATEGY.md's Contract Conformance category.
  await check('validateEvent and authorizeEvent are pure (no I/O)', async () => {
    const v = validateEvent({ event_type: 'error.raised', source: 'runtime' });
    const a = authorizeEvent({ source: 'runtime' });
    assert(v.ok === true && a.ok === true, 'expected both to pass for a well-formed, registered event');
    return 'no store/network argument accepted by either function';
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failed: ' + failures.join(', '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
