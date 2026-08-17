#!/usr/bin/env node
/**
 * SDOS Permission Engine — Test Suite (Phase 15)
 * scripts/sdos-permission-engine-test.js
 *
 * Covers the eight scenarios ai/core/permissions/PERMISSION_MODEL.md's
 * brief names, following scripts/sdos-event-bus-test.js's own
 * check()/assert() runner convention (no jest/mocha/vitest dependency
 * exists in this repo — see package.json). Never imports
 * @supabase/supabase-js and never makes a network call:
 * permissionEngine.js takes no store/network argument at all, by
 * design (PERMISSION_MODEL.md: "no database access required for the
 * basic permission decision").
 *
 * Scenario 8's DENIED-mechanism test uses a synthetic, clearly-labeled
 * authority-data override passed as checkPermission()'s second
 * argument — never authorityData.js itself, which ships deniedRows: []
 * for every real executive (Phase 15 audit: no ai/executives/<role>/
 * AUTHORITY_MATRIX.md currently contains an explicit DENIED row; see
 * ADR-0014's "DENIED ambiguity" section and the founder decision it
 * records). This mirrors the existing repo convention of injecting a
 * fake dependency (sdos-event-bus-test.js's makeFakeStore()) to test a
 * code path in isolation without fabricating real production data.
 *
 * Usage: node scripts/sdos-permission-engine-test.js
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import { checkPermission, OUTCOMES } from '../ai/core/permissions/permissionEngine.js';
import { EXECUTIVES, UNIVERSAL_APPROVAL_ROWS } from '../ai/core/permissions/authorityData.js';

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

async function main() {
  console.log('SDOS Permission Engine \u2014 Test Suite (Phase 15)\n');

  // 1. Founder-approval category (universal row) ─────────────────────
  await check('universal founder-approval category resolves to AWAITING_APPROVAL', () => {
    const r = checkPermission({ executive: 'cto', action: 'Add a column to visitors table', action_category: 'schema_change' });
    assert(r.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL, got ${r.outcome}`);
    assert(r.rule_cited.includes('AUTHORITY_STANDARD.md'), 'rule_cited must point at AUTHORITY_STANDARD.md');
    assert(r.rule_cited.includes('schema change'), 'rule_cited must name the actual matched row');
    return r.outcome;
  });

  // Role-specific founder-approval row (beyond the universal set)
  await check('role-specific founder-approval category resolves to AWAITING_APPROVAL', () => {
    const r = checkPermission({ executive: 'cfo', action: 'Change GSTIN on file', action_category: 'cfo_gst_settings_change' });
    assert(r.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL, got ${r.outcome}`);
    assert(r.rule_cited.includes('ai/executives/cfo/AUTHORITY_MATRIX.md'), 'rule_cited must point at the CFO matrix');
    return r.rule_cited;
  });

  // 2. Explicitly allowed role action when conditions are met ────────
  // PERMISSION_MODEL.md is explicit that this condition ("ai/core/ +
  // ai/integrations/ both exist as real, runtime-ready components")
  // cannot be satisfied in the current phase. So this scenario has two
  // required halves: (a) with the phase gate held at its true,
  // current-repo default (integrationsReady omitted/false), a matched
  // unilateral row must NOT resolve to ALLOWED; (b) the engine must
  // still be mechanically capable of ALLOWED once that gate is
  // explicitly opened by a caller — proving the contract's ALLOWED
  // outcome is a real, reachable code path, not dead code.
  await check('matched unilateral row stays AWAITING_APPROVAL while integrations gate is closed (current repo default)', () => {
    const r = checkPermission({ executive: 'cto', action: 'Flag a bug as P1', action_category: 'cto_flag_bug_severity' });
    assert(r.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL (phase-gated), got ${r.outcome}`);
    assert(r.rule_cited.includes('May Decide Unilaterally'), 'rule_cited must name the matched unilateral row');
    assert(/phase-gated|ai\/integrations/i.test(r.reason), 'reason must explain the phase gate, not just say no');
    return r.outcome;
  });

  await check('matched unilateral row resolves to ALLOWED once integrationsReady is explicitly true', () => {
    const r = checkPermission(
      { executive: 'cto', action: 'Flag a bug as P1', action_category: 'cto_flag_bug_severity' },
      { integrationsReady: true },
    );
    assert(r.outcome === OUTCOMES.ALLOWED, `expected ALLOWED, got ${r.outcome}`);
    assert(r.rule_cited.includes('ai/executives/cto/AUTHORITY_MATRIX.md'), 'rule_cited must still point at the real matrix row');
    return r.outcome;
  });

  // 3. DENIED outcome behavior at the engine level ────────────────────
  // Synthetic, test-only authority override — see file header. This
  // never touches ai/core/permissions/authorityData.js.
  await check('DENIED mechanism resolves correctly given an explicit denied row (synthetic test fixture only)', () => {
    const SYNTHETIC_EXECUTIVES = {
      'test-role-synthetic': {
        label: 'Synthetic Test Role (not a real SDOS executive)',
        source: 'scripts/sdos-permission-engine-test.js — synthetic fixture, not ai/executives/',
        approvalRows: [],
        unilateralRows: [],
        deniedRows: [
          {
            category: 'synthetic_prohibited_action',
            action: 'Synthetic prohibited action used only to exercise the DENIED code path',
            why: 'Test fixture only — no real AUTHORITY_MATRIX.md currently contains an explicit DENIED row (Phase 15 audit finding, ADR-0014).',
            source: 'scripts/sdos-permission-engine-test.js — synthetic fixture',
          },
        ],
      },
    };
    const r = checkPermission(
      { executive: 'test-role-synthetic', action: 'do the prohibited thing', action_category: 'synthetic_prohibited_action' },
      { executives: SYNTHETIC_EXECUTIVES },
    );
    assert(r.outcome === OUTCOMES.DENIED, `expected DENIED, got ${r.outcome}`);
    assert(r.rule_cited.includes('synthetic fixture'), 'rule_cited must clearly mark this as a synthetic, non-production rule');
    return r.outcome;
  });

  await check('DENIED is unreachable from the real authorityData.js today (no executive ships a deniedRows entry)', () => {
    const allEmpty = Object.values(EXECUTIVES).every(role => Array.isArray(role.deniedRows) && role.deniedRows.length === 0);
    assert(allEmpty, 'expected every real executive to have an empty deniedRows array as of Phase 15');
    return `${Object.keys(EXECUTIVES).length} executives checked, all deniedRows: []`;
  });

  // 4. Uncategorized action ───────────────────────────────────────────
  await check('uncategorized action_category resolves to AWAITING_APPROVAL, never ALLOWED or DENIED', () => {
    const r = checkPermission({ executive: 'cto', action: 'Do something nobody documented', action_category: 'uncategorized' });
    assert(r.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL, got ${r.outcome}`);
    assert(r.rule_cited.includes('PERMISSION_MODEL.md'), 'rule_cited must point at the Default Behavior table');
    assert(r.rule_cited.includes('Rule 4'), 'rule_cited must reference DECISION_STANDARD.md Rule 4');
    return r.outcome;
  });

  await check('a category that matches no row anywhere (arbitrary string) is treated identically to "uncategorized"', () => {
    const r = checkPermission({ executive: 'coo', action: 'Invent a new kind of action', action_category: 'totally_made_up_category_xyz' });
    assert(r.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL, got ${r.outcome}`);
    return r.outcome;
  });

  // 5. Unknown executive ───────────────────────────────────────────────
  await check('unknown executive resolves to AWAITING_APPROVAL, citing "no authority by omission"', () => {
    const r = checkPermission({ executive: 'cxo-does-not-exist', action: 'Do anything', action_category: 'schema_change' });
    assert(r.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL, got ${r.outcome}`);
    assert(r.rule_cited.includes('no executive is ever granted authority by omission') || r.rule_cited.toLowerCase().includes('authority by omission'), 'rule_cited must cite the omission rule');
    return r.outcome;
  });

  // 6. Malformed permission request ───────────────────────────────────
  await check('malformed request (missing fields) throws rather than silently resolving', () => {
    let threw = false;
    try {
      checkPermission({ executive: 'cto' }); // missing action, action_category
    } catch (err) {
      threw = err instanceof TypeError;
    }
    assert(threw, 'expected a TypeError for a missing-field PermissionCheck');
    return 'threw TypeError as expected';
  });

  await check('malformed request (non-object) throws rather than silently resolving', () => {
    let threw = false;
    try {
      checkPermission('not-an-object');
    } catch (err) {
      threw = err instanceof TypeError;
    }
    assert(threw, 'expected a TypeError for a non-object PermissionCheck');
    return 'threw TypeError as expected';
  });

  await check('malformed request (wrong field types) throws rather than silently resolving', () => {
    let threw = false;
    try {
      checkPermission({ executive: 'cto', action: 123, action_category: null });
    } catch (err) {
      threw = err instanceof TypeError;
    }
    assert(threw, 'expected a TypeError for wrong-typed PermissionCheck fields');
    return 'threw TypeError as expected';
  });

  // 7. Rule citation ───────────────────────────────────────────────────
  await check('every resolvable outcome carries a non-empty rule_cited traceable to a real source doc', () => {
    const cases = [
      { executive: 'cto', action: 'x', action_category: 'schema_change' },
      { executive: 'cfo', action: 'x', action_category: 'cfo_gst_settings_change' },
      { executive: 'cto', action: 'x', action_category: 'cto_flag_bug_severity' },
      { executive: 'cto', action: 'x', action_category: 'uncategorized' },
      { executive: 'nope', action: 'x', action_category: 'schema_change' },
    ];
    for (const c of cases) {
      const r = checkPermission(c);
      assert(typeof r.rule_cited === 'string' && r.rule_cited.length > 0, `rule_cited missing for ${JSON.stringify(c)}`);
      assert(/\.md/.test(r.rule_cited), `rule_cited must reference a real .md source doc, got: ${r.rule_cited}`);
    }
    return `${cases.length} cases, all carried a traceable rule_cited`;
  });

  // 8. No implicit authority ──────────────────────────────────────────
  await check('no code path returns ALLOWED unless integrationsReady is explicitly true', () => {
    const categoriesToTry = [
      ...UNIVERSAL_APPROVAL_ROWS.map(r => r.category),
      'uncategorized',
      'totally_made_up_category_xyz',
      ...Object.values(EXECUTIVES).flatMap(role => role.approvalRows.map(r => r.category)),
      ...Object.values(EXECUTIVES).flatMap(role => role.unilateralRows.map(r => r.category)),
    ];
    for (const executive of Object.keys(EXECUTIVES)) {
      for (const action_category of categoriesToTry) {
        const r = checkPermission({ executive, action: 'probe', action_category });
        assert(r.outcome !== OUTCOMES.ALLOWED, `unexpected ALLOWED with integrationsReady unset for ${executive}/${action_category}`);
      }
    }
    return `${Object.keys(EXECUTIVES).length} executives \u00d7 ${categoriesToTry.length} categories, zero implicit ALLOWED`;
  });

  await check('unrecognized executive never inherits any real role\'s authority', () => {
    const real = checkPermission({ executive: 'cto', action: 'x', action_category: 'cto_flag_bug_severity' });
    const fake = checkPermission({ executive: 'cto-imposter', action: 'x', action_category: 'cto_flag_bug_severity' });
    assert(fake.outcome === OUTCOMES.AWAITING_APPROVAL, `expected AWAITING_APPROVAL for unknown executive, got ${fake.outcome}`);
    assert(fake.rule_cited !== real.rule_cited, 'unknown executive must not resolve via a real role\'s matrix rows');
    return 'confirmed distinct resolution paths';
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
