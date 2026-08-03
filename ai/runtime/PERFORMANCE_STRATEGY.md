# Performance Strategy

## Status

SDOS Phase 12. Genuinely new. Specifies latency expectations and
timeout budgets for a future SDOS Groq call, referencing (but not
reusing) production's existing timeout constants.

## Purpose

Give a future implementation a documented timeout budget per stage of
`EXECUTION_FLOW.md`'s sequence, so a slow context assembly or a slow
model response has a defined ceiling rather than an unbounded wait
that could stall an entire executive session.

## Inputs

`js/groq.js`'s client-side `CONFIG.timeout = 10000` and `groq-proxy`'s
server-side `GROQ_FETCH_TIMEOUT_MS = 15000` (read-only references, for
proportion, not reuse — production's timeouts are sized for a single
short classification/status call, not a full Company-Brain-scale
executive turn).

## Outputs — Proposed Budget (Not Yet Approved)

```
StageBudget:
  prompt_load_ms:       500     # PROMPT_LOADER.md, a file read
  context_build_ms:     2000    # CONTEXT_BUILDER.md, in-memory assembly
  memory_load_ms:       1000    # MEMORY_LOADER.md, once ai/memory/ exists
  network_call_ms:      30000   # larger than groq-proxy's 15000, sized for a longer Company-Brain-scale prompt and larger max_tokens ceiling
  tool_call_iteration_ms: 5000   # per EXECUTION_PIPELINE.md step 3 iteration
  total_turn_ceiling_ms:  60000   # hard stop across one full EXECUTION_FLOW.md pass, tool-loop included
```

## Dependencies

- `EXECUTION_FLOW.md` (the sequence these budgets attach to)
- `TOKEN_BUDGETING.md` (a larger `max_output_tokens` than production
  directly implies a longer expected `network_call_ms`)
- `RATE_LIMITING.md` (a separate concern — this file bounds duration,
  that file bounds frequency)

## Sequence

1. Each stage in `EXECUTION_FLOW.md` runs against its own ceiling
   above.
2. If any single stage exceeds its ceiling, that stage's own Failure
   Modes apply (mirroring `groq-proxy`'s own `AbortController` +
   timeout pattern, applied per stage rather than only at the network
   call).
3. If the cumulative turn exceeds `total_turn_ceiling_ms` even with
   every individual stage within budget (e.g. several tool-call
   iterations each individually fast but numerous), the turn is halted
   and treated as a timeout, per `FAILOVER_STRATEGY.md`.

## Failure Modes

- A stage exceeding its ceiling is an `EXECUTION_ERROR` (network call)
  or a `CONTEXT_ERROR`/`INTEGRATION_ERROR` (context/memory load),
  routed per each producing document's own Failure Modes — this file
  adds timing thresholds, not new error classes.

## Security

Bounding total turn duration limits exposure of any one executive
session monopolizing runtime resources — a performance concern with a
secondary abuse-prevention benefit, complementing `RATE_LIMITING.md`'s
frequency bound.

## Future Implementation Notes

All figures above are proportional estimates against production's
known-good numbers, not measurements — no SDOS call has ever run. A
future phase should replace these with measured p50/p95 figures once
real calls exist.

## Relationship to the Rest of SDOS

- Attaches timing ceilings to every stage of `EXECUTION_FLOW.md`.
- Complements, never duplicates, `RATE_LIMITING.md`'s frequency bound.
