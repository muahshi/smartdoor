# Error Handling

The contract every future runtime implementation must satisfy for how a
failure is classified, contained, and surfaced. Distinct from any
executive's own `ESCALATION_MATRIX.md` (which handles business
escalations, e.g. a P0 incident) — this file covers *runtime-level*
failures: a malformed executive folder, a context load that can't
complete, a permission check that can't resolve.

## Status

Architecture only. No error described below has ever occurred, because
no runtime exists yet to raise one.

## Error Classes

| Class | Example | Where raised | Default behavior |
|---|---|---|---|
| `REGISTRY_ERROR` | Requested executive not found, or missing a required file per `ROLE_TEMPLATE.md` | Admission step | Turn never starts; no partial state created |
| `CONTEXT_ERROR` | A required Company Brain or standards file is missing or unreadable | Context load | Turn never reaches `ACTIVE`; treated as `REGISTRY_ERROR`-adjacent (fail closed, not partial) |
| `PERMISSION_ERROR` | A permission check per `PERMISSION_MODEL.md` cannot be resolved (not "denied" — genuinely ambiguous) | Permission check | Treated as `AWAITING_APPROVAL`, per Decision Standard Rule 4 (escalate on ambiguity, never guess) — **not** silently denied and **not** silently allowed |
| `ROUTING_ERROR` | A task or event has no matching executive in `TASK_ROUTING.md`'s ownership table | Router | Falls through to founder escalation, per every executive's own "founder is always the tie-breaker" principle |
| `EXECUTION_ERROR` | (Future phase only — no execution exists today) A reasoning step itself fails | `ACTIVE` state | Instance moves to `FAILED`; session/event log records the failure; no retry is attempted automatically (see Rules below) |
| `INTEGRATION_ERROR` | (Future phase only — `ai/integrations/` is empty) A data read fails or times out | Context load or reasoning | Same as `CONTEXT_ERROR` — fails closed, never substitutes stale or invented data |

## Rules

1. **Fail closed, never fail open.** Every error class above defaults to
   *stopping* the turn, never to proceeding with partial, stale, or
   invented information. This is Decision Standard Rule 9 ("never
   presenting an invented number/fact as real") applied at the runtime
   level, not just the reasoning level.
2. **No automatic retries across error classes that touch
   `AUTHORITY_STANDARD.md`'s always-required rows.** A `PERMISSION_ERROR`
   is never silently retried into a different outcome — it is either
   resolved by an explicit founder decision or it stays
   `AWAITING_APPROVAL`.
3. **Every error is an event.** Once `ai/core/events/EVENT_BUS.md` is
   implemented, every error above is emitted with its class, the
   executive and task/session involved, and a human-readable reason —
   never swallowed silently.
4. **Errors are attributed, not aggregated away.** A `ROUTING_ERROR`
   caused by a genuine gap in ownership (no executive covers a domain)
   must be distinguishable from one caused by a malformed task — the
   former is a Company-Brain/ownership gap worth flagging (per Golden
   Rule 5, `QUALITY_STANDARD.md`); the latter is a data-quality issue.
5. **This file does not define retry/backoff policy for
   `EXECUTION_ERROR` or `INTEGRATION_ERROR`.** Both are future-phase-only
   concerns (no reasoning execution and no integration exist today);
   inventing a retry policy for a component that doesn't exist would
   violate Golden Rule 3 (no placeholder content) by dressing up a guess
   as a decided policy. A future phase defines this once `ai/integrations/`
   and actual execution exist to have real failure modes to design
   against.

## Relationship to the Rest of SDOS

- `PERMISSION_ERROR`'s "fails to `AWAITING_APPROVAL`, not to denial or
  silent allowance" behavior is the runtime-level expression of
  `AUTHORITY_STANDARD.md`'s closing rule: "no executive is ever granted
  authority by omission."
- Feeds `LOGGING_STRATEGY.md` (every error is logged) and, in a future
  phase, an executive's own `ESCALATION_MATRIX.md` where a runtime error
  has a genuine business-escalation dimension (e.g. a `ROUTING_ERROR`
  that reveals no executive owns a domain the founder expected covered).
