# Failover Strategy

## Status

SDOS Phase 12. Genuinely new. Addresses a specific, deliberate
divergence from the reused production pattern: `js/groq.js` falls back
to `_mockGroqResponse()` on any error, so a visitor or owner never sees
a broken UI. This file specifies why that exact behavior must **not**
be reused for an executive's own reasoning call, and what happens
instead.

## Purpose

Prevent a future implementation from copying `js/groq.js`'s mock
fallback verbatim into the executive runtime, where a plausible-looking
but fabricated "decision" would be indistinguishable from a real one —
directly contradicting Decision Standard Rule 9 ("never presenting an
invented number/fact as real") already binding on every executive.

## Why Production's Mock Fallback Does Not Transfer

`_mockGroqResponse()` exists so a visitor scanning a QR code still gets
a coherent, safe, pre-scripted response even if Groq is unreachable —
appropriate because the mock's job (classify a visitor, draft a status
message) has a bounded, low-stakes fallback space. An executive's
reasoning call has no equivalent safe fallback: a mocked "CTO
recommendation" or "CFO decision" would look identical in shape to a
real one, and nothing downstream (`EXECUTION_PIPELINE.md` step 5,
`AUDIT_TRAIL.md`) could tell the difference.

## Inputs

A `RESPONSE_PIPELINE.md` outcome of `FAILED` (from a Groq call
timeout, non-2xx, or malformed content).

## Outputs

```
FailoverOutcome:
  action:    "FAIL_CLOSED"   # the only value in this phase — no mock, no retry-into-different-model
  error_class: "EXECUTION_ERROR"
  logged:    boolean
```

## Dependencies

- `ai/core/runtime/ERROR_HANDLING.md` (`EXECUTION_ERROR` class and
  Rule 1, fail closed)
- `RESPONSE_PIPELINE.md` (the upstream failure detector)
- `ERROR_RECOVERY.md` (what happens after the fail-closed event is
  logged)

## Sequence

1. `RESPONSE_PIPELINE.md` reports `FAILED`.
2. This file's only response is `FAIL_CLOSED` — the turn's instance
   moves to `FAILED` per `AGENT_LIFECYCLE.md`, exactly as
   `EXECUTION_PIPELINE.md`'s own Failure Modes already specify for a
   failed invocation.
3. No mock content is substituted. No automatic retry into a different
   model or provider is attempted, consistent with
   `ERROR_HANDLING.md` Rule 2's prohibition on silently retrying into a
   different outcome for anything touching authority-adjacent
   decisions.
4. The failure is logged and emitted as an event, per
   `ERROR_HANDLING.md` Rule 3.

## Failure Modes

This document *is* the failure-mode specification for
`EXECUTION_PIPELINE.md`'s "failed invocation" case, applied to Groq
specifically — it does not introduce a new class beyond
`EXECUTION_ERROR`.

## Security

Fail-closed is itself the security posture here: never presenting a
degraded or fabricated result as if it were a genuine executive
decision closes off a path where a founder could unknowingly act on
content nothing actually reasoned about.

## Future Implementation Notes

A future phase could add a bounded, explicit retry (e.g. one retry
after a fixed backoff, still failing closed on a second failure) — but
that is a decision for whichever phase first has real failure-rate data
to design against, per `ERROR_HANDLING.md` Rule 5's existing deferral.
No such retry policy is invented here.

## Relationship to the Rest of SDOS

- Extends `EXECUTION_PIPELINE.md`'s and `ERROR_HANDLING.md`'s existing
  fail-closed posture to the Groq-specific case.
- Explicitly diverges from `js/groq.js`'s production mock-fallback
  pattern, and documents why.
