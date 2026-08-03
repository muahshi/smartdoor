# Rate Limiting

## Status

SDOS Phase 12. Genuinely new. Adapts, without reusing directly,
`groq-proxy`'s per-IP sliding-window limiter
(`_shared/edgeRateLimit.ts`, `PER_IP_MAX=12`/60s) to a runtime context
where "per-IP" is meaningless — SDOS calls, if they exist, originate
server-side, not from a visitor's browser.

## Purpose

Bound how often any one executive (or the runtime overall) can invoke
Groq, for the same cost/abuse-prevention reason `groq-proxy` already
rate-limits production traffic — dimensioned by executive/session
instead of caller IP, since that is the dimension that actually varies
in this context.

## Why This Is Not `groq-proxy`'s Limiter, Reused

`groq-proxy`'s limiter keys on `callerIp(req)` because its callers are
many different visitor/owner browsers. A future SDOS runtime has a
small, fixed set of callers (six executives, plus CEO synthesis) with
an entirely different traffic shape — bursty during a founder-triggered
session, otherwise idle. Sharing `groq-proxy`'s bucket would either
starve production traffic during an executive session or let an
executive session get starved by unrelated visitor traffic — neither
is acceptable, so this file specifies an independent bucket.

## Inputs

`role_id`, `session_id` (per `SESSION_MODEL.md`).

## Outputs

```
RateLimitCheck:
  allowed:      boolean
  window_ms:    60000
  max_per_window: 20   # proposed, per executive — not shared across executives, not shared with production's bucket
  retry_after_ms: integer  # if allowed is false
```

## Dependencies

- `_shared/edgeRateLimit.ts` (read-only reference for the sliding-
  window pattern reused, not the bucket itself)
- `SESSION_MODEL.md` (the `session_id` this file keys on)
- `REQUEST_PIPELINE.md` (checks this immediately before send)

## Sequence

1. `REQUEST_PIPELINE.md` calls this check with `role_id` and
   `session_id` before assembling the final request.
2. If the executive's own window is within `max_per_window`, allow and
   increment.
3. If exceeded, reject with `retry_after_ms`, and the turn's instance
   moves toward `AWAITING_APPROVAL` or a retry per whatever the calling
   context (a founder-triggered session vs. a scheduled future
   automation) deems appropriate — this file does not decide that
   downstream behavior itself.

## Failure Modes

- A rejected call due to rate limiting is not an `EXECUTION_ERROR`
  (that class is for invocation failures) — it is a distinct,
  expected-and-recoverable state, logged the same way
  `groq-proxy`'s own 429 responses already are for production traffic.

## Security

An independent bucket, keyed away from IP, prevents a future SDOS
runtime from either exhausting or being exhausted by production's
own `groq-proxy` limiter — each system's cost and abuse exposure stays
contained to itself.

## Future Implementation Notes

The `max_per_window: 20` figure is a starting proposal, not a
benchmarked number — no SDOS call volume has ever been observed. A
future phase should tune this once real executive session cadence is
known (per each role's own `DAILY_ROUTINES.md`/`WEEKLY_ROUTINES.md`
cadence, which already implies an upper bound on how often a session
would even trigger a call).

## Relationship to the Rest of SDOS

- Checked by `REQUEST_PIPELINE.md` immediately before send.
- Deliberately independent of, never sharing state with,
  `groq-proxy`'s production rate-limit bucket.
