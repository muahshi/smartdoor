# Observability (Groq Runtime)

## Status

SDOS Phase 12. Extension, not a duplicate.
`ai/core/contracts/OBSERVABILITY.md` (Phase 11) already specifies
founder-facing observability content in general. This file adds only
the Groq-call-specific signals that phase could not yet name, since no
invocation mechanism existed to observe.

## Purpose

Define exactly which Groq-call metadata is safe and useful to surface
to a founder (via a future `ai/dashboard/`), and restate — rather than
loosen — the existing rule that raw prompt/response content is never
logged.

## Inputs

`RESPONSE_PIPELINE.md`'s `usage` and `model_used` fields;
`PERFORMANCE_STRATEGY.md`'s stage timings; `FAILOVER_STRATEGY.md` and
`ERROR_RECOVERY.md` outcomes; `RATE_LIMITING.md` rejection counts.

## Outputs — Signal Set

```
GroqRuntimeSignal:
  session_id:       string
  executive:        string
  model_used:       string
  tokens_prompt:     integer   # from usage
  tokens_completion:  integer   # from usage
  latency_ms:        integer
  outcome:          enum      # RESULT_PRODUCED | TOOL_CALL_PROPOSED | FAILED | RATE_LIMITED
  error_class:       string    # null unless outcome is FAILED
```

Never included: raw `system` or `user` message content, raw model
`content`, any Company Brain excerpt, any memory record body — the
same content classes `ai/core/contracts/OBSERVABILITY.md` and
`LOGGING_STRATEGY.md` already exclude, restated here for the Groq case
specifically since it is the first concrete producer of this kind of
data.

## Dependencies

- `ai/core/contracts/OBSERVABILITY.md` (authoritative on general
  founder-facing observability principles — this file only adds the
  Groq-specific signal list)
- `ai/core/runtime/LOGGING_STRATEGY.md` (the redaction rules this file
  restates for this specific data source)
- `RESPONSE_PIPELINE.md`, `PERFORMANCE_STRATEGY.md`,
  `FAILOVER_STRATEGY.md`, `RATE_LIMITING.md` (the four producers)

## Sequence

1. After every `EXECUTION_FLOW.md` pass (success or failure), assemble
   one `GroqRuntimeSignal` record.
2. Emit it as an event per `EVENT_BUS.md`, and make it available to a
   future `ai/dashboard/` view, per `OBSERVABILITY.md`'s existing
   founder-facing intent.
3. Aggregate signals (token usage trend, error rate) are exactly the
   category `ai/integrations/groq/README.md` already named as a future
   CFO/CTO capability — this file is the source those aggregates would
   eventually read from, once both exist.

## Failure Modes

A signal that cannot be assembled (e.g. `usage` missing from a
malformed response) is logged with whatever fields are available and
`error_class` noting the gap — never silently skipped, since a missing
observability record for a failed turn is itself worth flagging.

## Security

This file's exclusion list is a hard boundary, not a preference — a
future implementation that logged raw prompt/response content to
satisfy a debugging convenience would violate
`ai/core/contracts/OBSERVABILITY.md` and `LOGGING_STRATEGY.md`
directly, not just this file's restatement of them.

## Future Implementation Notes

A future `ai/dashboard/` view consuming this signal set is out of
scope for this phase — `ai/dashboard/README.md` remains its own
future phase's responsibility to build.

## Relationship to the Rest of SDOS

- Extends `ai/core/contracts/OBSERVABILITY.md` with Groq-specific
  signal content only.
- Is the eventual data source for the CFO/CTO future capabilities
  `ai/integrations/groq/README.md` already named.
