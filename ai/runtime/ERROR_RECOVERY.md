# Error Recovery

## Status

SDOS Phase 12. Extension, not a duplicate.
`ai/core/runtime/ERROR_HANDLING.md` (Phase 9) already fully specifies
error classes and the fail-closed default. This file specifies what
happens *after* a Groq-specific `EXECUTION_ERROR` or rate-limit
rejection is raised — the recovery path, not the classification, which
remains `ERROR_HANDLING.md`'s alone.

## Purpose

Give a future implementation one place to look for "now what?" after
`FAILOVER_STRATEGY.md` or `RATE_LIMITING.md` halts a turn — without
inventing a retry/backoff policy `ERROR_HANDLING.md` Rule 5 already
explicitly defers to a future phase with real failure data.

## Inputs

A `FailoverOutcome` (`FAILOVER_STRATEGY.md`) or a rejected
`RateLimitCheck` (`RATE_LIMITING.md`).

## Outputs

```
RecoveryAction:
  outcome:        enum   # INSTANCE_FAILED | AWAITING_RETRY_WINDOW
  founder_visible: boolean  # true whenever OBSERVABILITY.md would surface this
  next_step:       string   # human-readable, e.g. "session may re-attempt after retry_after_ms"
```

## Dependencies

- `ai/core/runtime/ERROR_HANDLING.md` (authoritative on classification
  and the fail-closed default — this file does not override either)
- `FAILOVER_STRATEGY.md`, `RATE_LIMITING.md` (the two upstream
  triggers)
- `AGENT_LIFECYCLE.md` (the `FAILED` state this file's outcomes feed)
- `OBSERVABILITY.md` (surfaces the recovery outcome to a founder)

## Sequence

1. An `EXECUTION_ERROR` (from `FAILOVER_STRATEGY.md`) moves the
   instance to `FAILED` per `AGENT_LIFECYCLE.md` — no automatic retry,
   restated from `ERROR_HANDLING.md` Rule 2.
2. A rate-limit rejection (from `RATE_LIMITING.md`) is not a `FAILED`
   instance — it is `AWAITING_RETRY_WINDOW`, since the executive itself
   did nothing wrong; the turn may be re-attempted once
   `retry_after_ms` elapses, at the calling context's discretion (a
   founder-triggered session, or a future scheduled trigger).
3. Either outcome is logged and emitted as an event, per
   `ERROR_HANDLING.md` Rule 3, and surfaced via `OBSERVABILITY.md`.

## Failure Modes

This file does not introduce a new error class — it routes the two
existing outcomes (`EXECUTION_ERROR`, rate-limit rejection) to their
appropriate next state. A recovery action that silently retried an
`EXECUTION_ERROR` into a different model or a mocked result would
itself violate `FAILOVER_STRATEGY.md`'s prohibition — this file does
not permit that path.

## Security

No recovery path here grants an executive authority beyond what it
already had before the failure — a retry after a rate-limit window is
the same authorized call attempted again, never an escalated or
different action.

## Future Implementation Notes

A bounded, explicit retry policy for `EXECUTION_ERROR` specifically
(distinct from the rate-limit case, which already has a natural retry
window) remains deliberately unspecified, per
`ERROR_HANDLING.md` Rule 5 — a future phase with real failure-rate data
should define it, not this one.

## Relationship to the Rest of SDOS

- The recovery layer sitting just after `FAILOVER_STRATEGY.md` and
  `RATE_LIMITING.md`, just before `AGENT_LIFECYCLE.md`'s `FAILED` state
  or a retry window.
- Never redefines `ERROR_HANDLING.md`'s classification.
