# Executive Router

## Status

SDOS Phase 12. Genuinely new. Runs immediately after `AI_ROUTER.md`
returns `provider: "groq"`. Distinct from `TASK_ROUTING.md` (which
already assigned the task to an executive before the turn reached
`ACTIVE`) — this file resolves which of that already-assigned
executive's own configuration values apply to the specific call about
to be made.

## Purpose

Give each of the six executives (`cto`, `coo`, `cfo`, `cmo`, `cpo`,
`ceo`) its own resolvable Groq call configuration — model,
temperature, max-tokens ceiling — rather than one global default that
would ignore, for example, a CFO turn needing low-temperature precision
over financial figures versus a CMO turn needing higher-temperature
creative range.

## Inputs

The executive's `role_id` (from the already-routed
`Task.target_executive`, per `TASK_ROUTING.md`); that executive's
`PromptRegistryEntry` (`PROMPT_REGISTRY.md`); `MODEL_CONFIGURATION.md`'s
per-role table.

## Outputs

```
ExecutiveInvocationConfig:
  executive:      string
  model:          string   # resolved from MODEL_CONFIGURATION.md
  temperature:    number   # resolved from MODEL_CONFIGURATION.md
  max_tokens:     number   # bounded by TOKEN_BUDGETING.md, never above its ceiling
```

## Dependencies

- `MODEL_CONFIGURATION.md`, `TOKEN_BUDGETING.md` (this folder — the
  tables this router resolves against)
- `ai/core/router/TASK_ROUTING.md` (upstream — the executive is
  already decided by the time this file runs)
- `ai/executives/<role>/PROMPT_TEMPLATE.md` (each role's own template,
  which this router never overrides)

## Sequence

1. Read `Task.target_executive` (already set by `TASK_ROUTING.md`
   before this turn reached `ACTIVE`).
2. Look up that role's row in `MODEL_CONFIGURATION.md`.
3. Clamp the resolved `max_tokens` against `TOKEN_BUDGETING.md`'s
   ceiling for that role — the resolved value is never allowed to
   exceed it.
4. Return `ExecutiveInvocationConfig` to `REQUEST_PIPELINE.md`.

## Failure Modes

- A `role_id` with no row in `MODEL_CONFIGURATION.md` (should never
  occur — all six existing roles must have one, per that file's own
  validation rule) is a `REGISTRY_ERROR`-adjacent failure, fails
  closed, no default configuration is silently substituted.

## Security

This router never grants an executive a model or token ceiling beyond
what `MODEL_CONFIGURATION.md`/`TOKEN_BUDGETING.md` document for its
role — it resolves existing configuration, it does not author new
configuration values of its own at call time.

## Future Implementation Notes

If a future phase introduces per-task (not just per-role) configuration
overrides, that override table is a new, explicit addition to
`MODEL_CONFIGURATION.md` — this router would still resolve against a
single documented source, not accept an ad hoc override from the
calling code.

## Relationship to the Rest of SDOS

- Bridges `AI_ROUTER.md`'s provider decision and
  `PROMPT_LOADER.md`/`REQUEST_PIPELINE.md`'s assembly step.
- Reads, never writes, `TASK_ROUTING.md`'s prior ownership decision.
