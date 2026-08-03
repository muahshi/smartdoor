# AI Router

## Status

SDOS Phase 12. Genuinely new. Distinct from
`ai/core/router/TASK_ROUTING.md` (Phase 9), which routes a *task* to an
*executive*. This file routes an already-admitted, in-`ACTIVE`-state
reasoning step to an *invocation mechanism* — Groq, a pure computation,
or (future) another provider. No routing has ever occurred.

## Purpose

Answer, at the start of `EXECUTION_PIPELINE.md` step 2, "does this
reasoning step need a model call at all, and if so, through which
provider?" — a decision `TASK_ROUTING.md` never makes, since it
resolves ownership (which executive), not mechanism (how that
executive reasons).

## Inputs

A `PromptRegistryEntry` (`PROMPT_REGISTRY.md`) and its executive's
`TOOL_REGISTRY.md` entries; whether the current turn's need is
satisfiable by a `PURE_COMPUTATION` tool alone (no model call
required) or genuinely requires generative reasoning.

## Outputs

```
RoutingDecision:
  invocation_type:   enum   # MODEL_CALL | PURE_COMPUTATION_ONLY
  provider:          enum   # "groq" (only option this phase) | null
  reason:            string
```

## Dependencies

- `PROMPT_REGISTRY.md`, `TOOL_REGISTRY.md` (this folder's parent)
- `EXECUTIVE_ROUTER.md` (the next step once `provider: "groq"` is set)
- `ai/integrations/groq/README.md` (the only provider documented at
  all, and only for the narrower read-only capability — see
  `RUNTIME_ARCHITECTURE.md`'s "Real Gap" section)

## Sequence

1. Check whether the turn's need is fully answerable by one or more
   `PURE_COMPUTATION` tool calls with no generative step — if so,
   `invocation_type: PURE_COMPUTATION_ONLY`, `provider: null`, and step
   2 ends without a model call.
2. Otherwise, `invocation_type: MODEL_CALL`. As of this phase, Groq is
   the only documented provider (per the real production integration),
   so `provider: "groq"` unconditionally.
3. Hand off to `EXECUTIVE_ROUTER.md` to resolve which executive's
   configuration applies to the call.

## Failure Modes

- A turn that needs a model call but the router cannot determine a
  provider (not possible today — Groq is the only option — but
  reserved for a future multi-provider phase) is an `EXECUTION_ERROR`,
  never a silent default to whichever provider was called last.

## Security

This router makes no network call and holds no credential — it is a
pure decision function over already-loaded registry data. It never
short-circuits `PERMISSION_MODEL.md`'s check, which per
`EXECUTION_PIPELINE.md` Validation Rule 3 still applies to whatever
action the reasoning is working toward.

## Future Implementation Notes

A future multi-provider phase would extend the `provider` enum and add
selection criteria (cost, latency, capability) here — not invent a
second router. No such criteria exist today because no second provider
is documented.

## Relationship to the Rest of SDOS

- Sits at the top of `EXECUTION_FLOW.md`'s sequence.
- Feeds `EXECUTIVE_ROUTER.md` only when `provider: "groq"`.
- Never overlaps `TASK_ROUTING.md`'s executive-ownership concern.
