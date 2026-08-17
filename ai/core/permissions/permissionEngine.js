/**
 * SDOS — Permission Engine (Phase 15)
 * ai/core/permissions/permissionEngine.js
 *
 * The first runtime implementation of ai/core/permissions/PERMISSION_MODEL.md's
 * mechanical contract. Scoped exactly to Part A of the Phase 15 brief:
 * a pure function that resolves a PermissionCheck to a PermissionResult
 * by citing an actual row in core/standards/AUTHORITY_STANDARD.md or a
 * role's own AUTHORITY_MATRIX.md (via authorityData.js) — never a
 * runtime judgment call.
 *
 * Hard constraints (PERMISSION_MODEL.md + Phase 15 brief), all true of
 * every code path below:
 *   - No database access. No network access. No credentials. No LLM
 *     calls. This module imports nothing outside ai/core/permissions/.
 *   - No side effects. checkPermission() reads its inputs and the
 *     static authority data and returns a plain object. It does not
 *     emit an event, write a log, or call ai/core/events/eventBus.js
 *     (emitting `permission.checked` / `approval.requested` from a
 *     future *caller* of this module is an explicit later seam, not
 *     something this file does itself — see the note at the bottom).
 *   - No executive is granted authority by omission. Every branch that
 *     isn't an explicit rule match resolves to AWAITING_APPROVAL, never
 *     ALLOWED, per AUTHORITY_STANDARD.md's closing rule and
 *     DECISION_STANDARD.md Rule 4.
 *   - ALLOWED is real but phase-gated. PERMISSION_MODEL.md's Default
 *     Behavior table says a matched "may decide unilaterally" row only
 *     resolves to ALLOWED once ai/core/ + ai/integrations/ both exist
 *     as real, runtime-ready components — a condition this repository
 *     does not meet today. That gate is modeled explicitly as the
 *     `integrationsReady` flag below (default false, matching current
 *     reality) rather than hard-coded as a permanent impossibility, so
 *     the engine doesn't need new code the day that condition is
 *     actually met — a future caller flips the flag, it does not
 *     patch this file.
 *   - DENIED is mechanically supported but unreachable from the real
 *     authority data shipped in authorityData.js today, because no
 *     ai/executives/<role>/AUTHORITY_MATRIX.md currently contains an
 *     explicit DENIED/prohibited row (Phase 15 audit finding — see
 *     ADR-0014). This file does not invent one. Tests exercise the
 *     DENIED code path via an injected, clearly-synthetic authority
 *     dataset (see the second argument below), never via
 *     authorityData.js.
 */

import { UNIVERSAL_APPROVAL_ROWS, EXECUTIVES, SOURCE_DOCS } from './authorityData.js';

export const OUTCOMES = Object.freeze({
  ALLOWED: 'ALLOWED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  DENIED: 'DENIED',
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function findByCategory(rows, category) {
  return (rows || []).find(row => row.category === category) || null;
}

function result(outcome, rule_cited, reason) {
  return Object.freeze({ outcome, rule_cited, reason });
}

/**
 * Resolve a PermissionCheck against documented SDOS authority.
 *
 * @param {object} request - PermissionCheck: { executive, action, action_category }
 * @param {object} [options]
 * @param {Record<string, object>} [options.executives] - Override for
 *   EXECUTIVES (test-only — production callers must omit this and let
 *   the real authorityData.js apply).
 * @param {ReadonlyArray<object>} [options.universalApprovalRows] -
 *   Override for UNIVERSAL_APPROVAL_ROWS (test-only, same reasoning).
 * @param {boolean} [options.integrationsReady=false] - Models
 *   PERMISSION_MODEL.md's phase-gating condition ("ai/core/ +
 *   ai/integrations/ both exist as real, runtime-ready components").
 *   Defaults to false, matching this repository's current, real state
 *   (ai/integrations/ is empty). Only a future phase that actually
 *   builds that layer has any legitimate reason to pass true.
 * @returns {{outcome: 'ALLOWED'|'AWAITING_APPROVAL'|'DENIED', rule_cited: string, reason: string}}
 */
export function checkPermission(request, options = {}) {
  const executives = options.executives || EXECUTIVES;
  const universalApprovalRows = options.universalApprovalRows || UNIVERSAL_APPROVAL_ROWS;
  const integrationsReady = options.integrationsReady === true;

  // ── Malformed request: fail loud, not quiet. A structurally invalid
  // PermissionCheck is a programmer/caller error, not an authority
  // question — resolving it to a PermissionResult would imply the
  // engine successfully evaluated something it never actually received.
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    throw new TypeError('checkPermission: request must be a PermissionCheck object with executive, action, and action_category string fields.');
  }
  const { executive, action, action_category } = request;
  if (!isNonEmptyString(executive) || !isNonEmptyString(action) || !isNonEmptyString(action_category)) {
    throw new TypeError('checkPermission: PermissionCheck.executive, .action, and .action_category must all be non-empty strings.');
  }

  const role = executives[executive];

  // ── Unknown executive: no matrix exists at all for this role_id.
  // Per AUTHORITY_STANDARD.md's closing rule, this is never implicit
  // permission — it resolves the same as any other unmatched case.
  if (!role) {
    return result(
      OUTCOMES.AWAITING_APPROVAL,
      `${SOURCE_DOCS.authorityStandard} — closing rule: "No executive is ever granted authority by omission"`,
      `"${executive}" is not a registered SDOS executive (expected one of: ${Object.keys(executives).join(', ')}). ` +
      `Per ${SOURCE_DOCS.decisionStandard} Rule 4 (escalate on ambiguity, don't guess), an unrecognized executive is never read as having any authority.`,
    );
  }

  // ── 1. Explicit DENIED rows on the role's own matrix, if any exist.
  // authorityData.js ships deniedRows: [] for every real executive as
  // of Phase 15 (see that file's header note + ADR-0014) — this branch
  // is mechanically live but not reachable from real data today.
  const deniedMatch = findByCategory(role.deniedRows, action_category);
  if (deniedMatch) {
    return result(
      OUTCOMES.DENIED,
      `${deniedMatch.source}: "${deniedMatch.action}"`,
      deniedMatch.why || `${role.label}'s own AUTHORITY_MATRIX.md explicitly rules this action out.`,
    );
  }

  // ── 2. Universal founder-approval rows (inherited by every role).
  const universalMatch = findByCategory(universalApprovalRows, action_category);
  if (universalMatch) {
    return result(
      OUTCOMES.AWAITING_APPROVAL,
      `${universalMatch.source}: "${universalMatch.action}"`,
      universalMatch.why,
    );
  }

  // ── 3. Role-specific founder-approval rows.
  const roleApprovalMatch = findByCategory(role.approvalRows, action_category);
  if (roleApprovalMatch) {
    return result(
      OUTCOMES.AWAITING_APPROVAL,
      `${roleApprovalMatch.source}: "${roleApprovalMatch.action}"`,
      roleApprovalMatch.why,
    );
  }

  // ── 4. Role-specific "may decide unilaterally" rows — phase-gated.
  const unilateralMatch = findByCategory(role.unilateralRows, action_category);
  if (unilateralMatch) {
    if (integrationsReady) {
      return result(
        OUTCOMES.ALLOWED,
        `${unilateralMatch.source}: "${unilateralMatch.action}"`,
        `Condition met (${unilateralMatch.condition}) and ai/core/ + ai/integrations/ are both real, runtime-ready components, per ${SOURCE_DOCS.permissionModel}'s Default Behavior table.`,
      );
    }
    return result(
      OUTCOMES.AWAITING_APPROVAL,
      `${unilateralMatch.source}: "${unilateralMatch.action}" (phase-gated per ${SOURCE_DOCS.permissionModel} Default Behavior)`,
      `This row exists on ${role.label}'s "may decide unilaterally" list, but ai/integrations/ is not yet a real, runtime-ready component. ` +
      `${SOURCE_DOCS.permissionModel} states every check in this phase resolves to AWAITING_APPROVAL or DENIED, never ALLOWED.`,
    );
  }

  // ── 5. Uncategorized: no row anywhere matches.
  return result(
    OUTCOMES.AWAITING_APPROVAL,
    `${SOURCE_DOCS.permissionModel} — Default Behavior: "uncategorized"; ${SOURCE_DOCS.decisionStandard} Rule 4`,
    `action_category "${action_category}" matches no row in ${SOURCE_DOCS.authorityStandard} or ${role.source}. ` +
    `An uncategorized action is treated as ambiguous, never as implicitly permitted.`,
  );
}

/*
 * Future integration seam (not implemented in this phase, per the
 * Phase 15 brief's "no autonomous behavior" / "do not wire any
 * executive" constraints): a future ai/core/runtime/ caller may wrap
 * checkPermission() and forward its PermissionResult to
 * ai/core/events/eventBus.js as a `permission.checked` event (and
 * `approval.requested`/`approval.decided` for AWAITING_APPROVAL
 * outcomes), per PERMISSION_MODEL.md's "Relationship to the Rest of
 * SDOS" section and EVENT_BUS.md's event-type table. That wiring is
 * deliberately out of scope here — it would require this module to
 * depend on ai/integrations/supabase/sdosEventsStore.js, which
 * contradicts the "no database access" constraint this phase must
 * hold.
 */
