# Response Pipeline

## Status

SDOS Phase 12. Genuinely new. The inbound half of
`EXECUTION_PIPELINE.md` step 2, paired with `REQUEST_PIPELINE.md`.

## Purpose

Define how a Groq-shaped response is parsed back into
`EXECUTION_PIPELINE.md`'s step 3 (tool-call sub-loop) or step 5
(result production) — reusing the exact response contract `groq-proxy`
already returns (`{success, content, model, usage}`), since that shape
is what any future SDOS-scoped proxy would also return if it mirrors
the same hardened pattern.

## Inputs

A response in `groq-proxy`'s existing contract shape:
`{success, content, model, usage}` (or its error shape, `{error}`).

## Outputs

```
ParsedResponse:
  outcome:          enum   # TOOL_CALL_PROPOSED | RESULT_PRODUCED | FAILED
  content:           string   # raw model content, if RESULT_PRODUCED
  tool_calls:        list    # parsed proposals, if TOOL_CALL_PROPOSED
  usage:            object   # token counts, forwarded to OBSERVABILITY.md
  model_used:        string
```

## Dependencies

- `EXECUTION_PIPELINE.md` steps 3 and 5 (the two destinations this
  pipeline routes to)
- `TOOL_SELECTION.md` (to validate any proposed tool call is actually
  in-scope, per that file's own step 4)
- `OBSERVABILITY.md` (the consumer of `usage`)

## Sequence

1. Check `success`. If `false`, route to `FAILOVER_STRATEGY.md`
   immediately — never attempt to parse `content` from a failed
   response.
2. If `true`, inspect `content` (or a structured tool-call field, once
   a future phase adopts a specific function-calling schema) for a
   tool-call proposal.
3. If a tool call is proposed, validate it against
   `TOOL_SELECTION.md`'s `SelectedTools` before forwarding to
   `EXECUTION_PIPELINE.md` step 3 — an out-of-scope proposal is a
   `PERMISSION_ERROR`, not silently executed or silently dropped.
4. If no tool call is proposed, treat `content` as the turn's result
   and forward to `EXECUTION_PIPELINE.md` step 5.
5. Forward `usage` and `model_used` to `OBSERVABILITY.md` regardless
   of outcome.

## Failure Modes

- Malformed or non-JSON `content` when a structured result was
  expected is an `EXECUTION_ERROR` — mirrors `js/groq.js`'s own
  `_parseIntentFallback` pattern in spirit (never crash the caller),
  but unlike that production fallback, this pipeline does **not**
  substitute a plausible-looking guessed result for an executive's
  reasoning output — see `FAILOVER_STRATEGY.md` for why a mock/guessed
  fallback is inappropriate here even though it is appropriate for
  production's visitor-facing widgets.
- A tool call proposing a `tool_id` outside `SelectedTools` is a
  `PERMISSION_ERROR`.

## Security

`usage` and `model_used` are the only fields this pipeline forwards to
observability — raw `content` is never logged wholesale, consistent
with `LOGGING_STRATEGY.md`'s and `OBSERVABILITY.md`'s (Phase 11) rules
against logging raw reasoning content.

## Future Implementation Notes

No specific tool-call detection mechanism (JSON mode, native
function-calling, regex-based extraction) is chosen — depends on
whichever schema `TOOL_SELECTION.md`'s future implementation adopts.

## Relationship to the Rest of SDOS

- Routes into `EXECUTION_PIPELINE.md` steps 3 and 5.
- Feeds `FAILOVER_STRATEGY.md` on any `success: false`.
- Feeds `OBSERVABILITY.md` with usage/model metadata only.
