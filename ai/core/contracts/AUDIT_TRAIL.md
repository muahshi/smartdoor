# Audit Trail

## Status

SDOS Phase 11. Genuinely new. `ai/core/runtime/LOGGING_STRATEGY.md`
(Phase 9) specifies what an *operational* log records for debugging
and observability. This file is a distinct concept: the durable,
founder-reviewable record of every consequential decision and approval
— retained for accountability, not operations — that no prior phase
specified.

## Purpose

Define what must be permanently retrievable, in what shape, so that
any founder-approval decision, executive action, or escalation can be
reconstructed and reviewed after the fact — satisfying
`ai/docs/SDOS_ARCHITECTURE.md`'s Design Principle 4 at the
accountability level, not just the debugging level
`LOGGING_STRATEGY.md` already covers.

## Responsibilities

- Define which events constitute an audit-relevant record (a strict
  subset of everything `LOGGING_STRATEGY.md` logs).
- Define immutability and retention expectations distinct from
  operational logs, which a future implementation may rotate or
  truncate.

## Inputs

Every `approval.decided` event (`EVENT_BUS.md`), every
`ApprovalRequest` (`APPROVAL_WORKFLOW.md`), every `ESCALATED` task
resolution (`TASK_MODEL.md`), and every `DECISION` or
`ESCALATION_OUTCOME` `MemoryRecord` (`MEMORY_SCHEMA.md`).

## Outputs — Audit Entry Shape

```
AuditEntry:
  audit_id:             string
  entry_type:             enum      # APPROVAL_DECIDED | ESCALATION_RESOLVED | AUTHORITY_EXERCISED
  session_id:             string
  task_id:                string
  executive:               string
  decided_by:              string    # "founder", always, for APPROVAL_DECIDED entries
  reference:               string    # approval_id, escalation_ref, or memory_id this entry documents
  summary:                string
  recorded_at:             datetime
```

## Validation Rules

1. **An `AuditEntry` is never edited or deleted after creation.**
   Stronger than `EVENT_BUS.md`'s own append-only rule (which allows a
   correction as a new referencing event) — an audit entry's
   correction is itself a new `AuditEntry` with `entry_type` reflecting
   the correction, and the original remains, unaltered, as the record
   of what was originally decided and when.
2. **Every founder approval decision produces exactly one
   `AuditEntry`** — no `ApprovalRequest` reaching `APPROVED` or
   `DECLINED` (`APPROVAL_WORKFLOW.md`) is missing a corresponding
   audit record; this is the accountability-layer expression of that
   file's own Rule 1 ("only the founder may set `decision`").
3. **Retention is indefinite by default.** Unlike operational logs
   (`LOGGING_STRATEGY.md`), which a future implementation may rotate
   for storage reasons, no default retention limit is set for audit
   entries in this phase — shortening it is a founder-level policy
   decision a future phase would need to make explicitly, not an
   engineering default.
4. **No raw production/customer data ever appears in an entry** — same
   rule as `LOGGING_STRATEGY.md` and `EVENT_BUS.md`, restated for
   consistency across every SDOS record type.

## Failure Modes

A failed audit write must never silently allow the underlying
approval/escalation to proceed as if recorded — an audit-write failure
is itself an `error.raised` event and, per this file's own
accountability purpose, should be treated as blocking (fail closed) for
`APPROVAL_DECIDED` entries specifically, stricter than
`LOGGING_STRATEGY.md` Rule 2's general "logging failures never silently
swallow the underlying operation's own error" (which allows the
underlying operation to proceed even if logging fails) — because an
unrecorded founder decision is itself a compliance gap, not merely a
missed debug log line.

## Dependencies

- `ai/core/runtime/LOGGING_STRATEGY.md` (a sibling record type — audit
  entries are not operational logs, but both derive from the same
  underlying events)
- `ai/core/events/EVENT_BUS.md` (`approval.decided` events)
- `APPROVAL_WORKFLOW.md`, `MEMORY_SCHEMA.md` (this folder — the
  sources of audit-relevant records)

## Future Implementation Notes

No storage backend is chosen in this phase, consistent with every
other Phase 9–11 deferral of that decision. A future phase should
consider whether audit entries warrant a different (likely stricter)
storage guarantee than operational logs, given rule 3's indefinite
retention default.

## Relationship to the Rest of SDOS

- Distinct from `LOGGING_STRATEGY.md` (operational/debugging) and
  `EVENT_BUS.md` (live propagation) — this is the durable,
  accountability-focused record layer neither of those two files
  claims to be.
- Feeds `OBSERVABILITY.md`'s founder-facing view.
