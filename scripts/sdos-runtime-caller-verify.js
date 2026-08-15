#!/usr/bin/env node
/**
 * SDOS Runtime Caller — Manual Verification (Phase 14B)
 * scripts/sdos-runtime-caller-verify.js
 *
 * Operator-run only. NOT wired into CI, a cron job, or any request
 * path. This is the one script in the repository that lets
 * ai/core/runtime/runtimeCaller.js reach the REAL
 * ai/integrations/supabase/sdosEventsStore.js (real Supabase
 * read/write) instead of the in-memory fake
 * scripts/sdos-event-bus-test.js uses — the actual end-to-end proof
 * Objective 4 asks for: Runtime → Event Bus → Validate → Authorize →
 * Persist → Broadcast → Audit, for real, once, on demand.
 *
 * SAFE BY CONSTRUCTION:
 *   - If feature_flags.sdos_event_bus_enabled is FALSE (the default —
 *     see migration 72), emitEvent() short-circuits before any write;
 *     this script prints outcome: DISABLED and exits 0. Running this
 *     script with the flag off is a no-op, not a partial write.
 *   - The only row this can ever write is one sdos_events row (event_type
 *     'lifecycle.transition', source 'sdos-system') plus its
 *     sdos_event_lifecycle trace — never any other table, per
 *     runtimeCaller.js's own fixed, non-input-derived payload.
 *   - Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the
 *     SDOS_-prefixed override) already documented in
 *     sdosEventsStore.js — no new secret is introduced by this script.
 *
 * Usage:
 *   node scripts/sdos-runtime-caller-verify.js
 *
 * Exit code 0 on any well-formed EmitResult (including DISABLED or
 * REJECTED — those are correct, traceable outcomes, not script
 * failures). Exit code 1 only if the call itself throws (e.g. missing
 * env vars, network failure) — a genuine inability to verify.
 */

import { invoke } from '../ai/core/runtime/runtimeCaller.js';

async function main() {
  console.log('SDOS Runtime Caller — Manual Verification (Phase 14B)\n');
  console.log('Invoking ai/core/runtime/runtimeCaller.js#invoke() against the real event store...\n');

  try {
    const result = await invoke();
    console.log('EmitResult:', JSON.stringify(result, null, 2));

    switch (result.outcome) {
      case 'DISABLED':
        console.log('\nOutcome: DISABLED — feature_flags.sdos_event_bus_enabled is FALSE.');
        console.log('No row was written to sdos_events or sdos_event_lifecycle. This is the');
        console.log('correct, expected result until an operator explicitly enables the flag.');
        break;
      case 'OK':
        console.log('\nOutcome: OK — full pipeline verified end to end.');
        console.log(`event_id: ${result.event_id}`);
        console.log(`broadcast: ${result.broadcast}`);
        console.log('Check sdos_event_lifecycle for this event_id to see the full trace');
        console.log('(received → validated → authorized → persisted → broadcast_*).');
        break;
      case 'REJECTED':
      case 'DUPLICATE':
      case 'PERSISTENCE_FAILED':
        console.log(`\nOutcome: ${result.outcome} — see reason above. This is a traceable,`);
        console.log('correctly-reported failure mode, not a script error.');
        break;
      default:
        console.log(`\nOutcome: ${result.outcome} (unrecognized — report this).`);
    }
    process.exit(0);
  } catch (err) {
    console.error('\nVerification call threw — genuine failure, not a traceable EmitResult:');
    console.error(err);
    process.exit(1);
  }
}

main();
