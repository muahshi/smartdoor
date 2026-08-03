# Request Pipeline

## Status

SDOS Phase 12. Genuinely new. The outbound half of
`EXECUTION_PIPELINE.md` step 2 ("Invocation... using the assembled
prompt. Not specified further in this phase") — this file is that
specification, for the Groq case.

## Purpose

Define the exact sequence from a resolved `ExecutiveInvocationConfig`
plus assembled prompt/context to a single outbound request shape,
mirroring `js/groq.js`'s `callGroq()` structure (merge options, build
message array, call proxy) applied to SDOS's own, separately-scoped
call path.

## Inputs

`ExecutiveInvocationConfig` (`EXECUTIVE_ROUTER.md`), `LoadedPrompt`
(`PROMPT_LOADER.md`), `BuiltContext` (`CONTEXT_BUILDER.md`),
`SelectedTools` (`TOOL_SELECTION.md`).

## Outputs

```
GroqRequest:
  model:        string
  messages:      list    # [system message, one or more user messages]
  max_tokens:    integer  # from TOKEN_BUDGETING.md, never the caller's own guess
  temperature:   number
  tools:         list    # SelectedTools.tool_ids, shaped per whatever function-calling schema a future phase adopts
```

## Dependencies

- `EXECUTIVE_ROUTER.md`, `PROMPT_LOADER.md`, `CONTEXT_BUILDER.md`,
  `TOOL_SELECTION.md` (every producer this pipeline assembles)
- `TOKEN_BUDGETING.md` (final size check before the request is
  considered ready)
- `RATE_LIMITING.md` (checked immediately before send, not after
  assembly)

## Sequence

1. Merge `ExecutiveInvocationConfig`'s `model`/`temperature`/
   `max_tokens` — mirrors `js/groq.js`'s `mergedOptions` step, applied
   to SDOS's own config source instead of a caller-supplied override.
2. Assemble `messages` as `[LoadedPrompt, ...BuiltContext.messages]`.
3. Attach `SelectedTools.tool_ids` if non-empty.
4. Run `TOKEN_BUDGETING.md`'s final total-size check.
5. Run `RATE_LIMITING.md`'s check for this executive/session.
6. Hand the resulting `GroqRequest` to the (future) network call —
   this file specifies everything up to, but not including, the actual
   HTTP call, which remains an implementation decision.

## Failure Modes

- Any of steps 4 or 5 failing halts the pipeline before any network
  call is attempted — an `EXECUTION_ERROR` (budget) or a rate-limit
  rejection (`RATE_LIMITING.md`), never a request sent anyway "to see
  what happens."
- A missing producer output (e.g. `EXECUTIVE_ROUTER.md` never ran) is
  a sequencing bug, not a case this pipeline silently works around by
  substituting a default.

## Security

This pipeline never attaches a credential itself — per
`RUNTIME_ARCHITECTURE.md`'s Security section, `GROQ_API_KEY` (or its
future SDOS-scoped equivalent) lives exclusively server-side in
whatever future proxy handles the actual call, never in this
assembly step.

## Future Implementation Notes

No transport (fetch, SDK, streaming vs. non-streaming) is chosen here
— this file specifies the request object's contents, not how it is
sent, matching `EXECUTION_PIPELINE.md`'s own deferral on "which model,
which API."

## Relationship to the Rest of SDOS

- The assembly point where every upstream `ai/runtime/` document's
  output converges into one request.
- Paired with `RESPONSE_PIPELINE.md` on the inbound side.
