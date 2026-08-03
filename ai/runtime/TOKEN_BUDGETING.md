# Token Budgeting

## Status

SDOS Phase 12. Genuinely new. Specifies request-shape limits for a
future SDOS Groq call — deliberately **not** a reuse of `groq-proxy`'s
existing numeric caps, for the reason explained below.

## Purpose

Bound message size and output length for an executive's reasoning
call, so `CONTEXT_BUILDER.md` and `PROMPT_LOADER.md` have a concrete
ceiling to check against, and so a future implementation cannot
silently balloon cost or latency.

## Why This Is Not a Reuse of `groq-proxy`'s Numbers

`groq-proxy`'s existing caps (`MAX_MESSAGE_CHARS=12000`,
`MAX_TOTAL_CHARS=24000`, `max_tokens` clamped to 800) were sized,
per that file's own comments, against the AI Product Consultant's
~6.2k-character system prompt and the AI Receptionist's ~1.6–2.8k-char
classification prompt — both short, narrow, single-purpose prompts.
An executive's context (`CONTEXT_BUILDER.md` serializing Company
Brain, role definition, standards, and memory together) is a
fundamentally larger payload by design. Reusing production's numbers
as-is would either reject every real executive call outright or force
an artificial, harmful truncation of Company Brain content. This phase
therefore proposes a **separately-scoped** budget, never a request
that reuses or competes with `groq-proxy`'s own numbers or its
per-IP rate bucket (see `RATE_LIMITING.md`).

## Inputs

`PROMPT_LOADER.md`'s `char_count`, `CONTEXT_BUILDER.md`'s
`total_chars`, `MEMORY_LOADER.md`'s loaded record count.

## Outputs — Proposed Budget (Not Yet Approved)

```
Budget:
  max_system_message_chars:  20000   # PROMPT_LOADER.md output ceiling
  max_context_chars:          60000   # CONTEXT_BUILDER.md output ceiling
  max_memory_records:          15      # MEMORY_LOADER.md selection cap
  max_total_request_chars:     90000   # hard ceiling across system+user messages
  max_output_tokens:           4000    # response ceiling, well above production's 800
```

These are a documented starting proposal sized to Company-Brain-scale
context, not a benchmarked production number — no SDOS call has ever
run to measure against.

## Dependencies

- `PROMPT_LOADER.md`, `CONTEXT_BUILDER.md`, `MEMORY_LOADER.md` (the
  three producers this budget bounds)
- `groq-proxy/index.ts` (read-only reference for why these numbers
  differ, not a shared constant)

## Sequence

1. `PROMPT_LOADER.md` checks its output against
   `max_system_message_chars` before returning.
2. `CONTEXT_BUILDER.md` checks its output against `max_context_chars`.
3. `MEMORY_LOADER.md` caps selection at `max_memory_records` before
   `CONTEXT_BUILDER.md` serializes it.
4. `REQUEST_PIPELINE.md` sums both message contents against
   `max_total_request_chars` immediately before the (future) call.

## Failure Modes

- Any ceiling exceeded is an `EXECUTION_ERROR` per
  `ai/core/runtime/ERROR_HANDLING.md` — the call is never sent
  truncated or over-budget; the turn fails closed and is flagged for a
  founder/CTO to reduce Company Brain scope or split the task.

## Security

Bounding request size is itself a cost-control and abuse-prevention
measure, mirroring the intent (if not the exact numbers) behind
`groq-proxy`'s own shape caps — an unbounded context assembly is a
denial-of-cost risk this file exists specifically to close off before
any implementation exists to exploit it.

## Future Implementation Notes

These numbers should be revisited once a future implementation phase
has real Company-Brain-scale prompts to measure, the same way
`groq-proxy`'s own comment documents having measured against real
production prompts before choosing its numbers.

## Relationship to the Rest of SDOS

- Bounds `PROMPT_LOADER.md`, `CONTEXT_BUILDER.md`, `MEMORY_LOADER.md`,
  and `REQUEST_PIPELINE.md`.
- Deliberately separate from, never a copy of, `groq-proxy`'s
  production constants.
