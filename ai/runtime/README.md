# ai/runtime

## Purpose

SDOS Phase 12 (Groq Runtime Foundation). Specifies how a future SDOS
agent runtime would fill `ai/core/contracts/EXECUTION_PIPELINE.md`
step 2 (model invocation) by reusing SmartDoor's existing, production
Groq integration (`js/groq.js`, `supabase/functions/groq-proxy/`,
`ai-session-token/`) as an architectural pattern — never as a shared
code path or shared credential.

## Status

Documentation and contracts only. No code, client, Edge Function, or
credential exists in this folder or is created by it. Nothing here
executes.

## Index

| File | Covers |
|---|---|
| `RUNTIME_ARCHITECTURE.md` | Umbrella shape; existing Groq components found; the real scope-expansion gap this phase names |
| `AI_ROUTER.md` | Provider-level routing (model call vs. pure computation) |
| `EXECUTIVE_ROUTER.md` | Per-executive model/config resolution |
| `PROMPT_LOADER.md` | Assembling `PROMPT_REGISTRY.md` entries into a system message |
| `CONTEXT_BUILDER.md` | Serializing `CONTEXT_SCHEMA.md`'s `AssembledContext` into user messages |
| `MEMORY_LOADER.md` | Selecting bounded `MEMORY_SCHEMA.md` records for context |
| `TOOL_SELECTION.md` | Filtering `TOOL_REGISTRY.md` per executive per turn |
| `MODEL_CONFIGURATION.md` | Per-role model/temperature table |
| `TOKEN_BUDGETING.md` | Request-shape limits, separately scoped from `groq-proxy`'s |
| `REQUEST_PIPELINE.md` | Outbound request assembly |
| `RESPONSE_PIPELINE.md` | Inbound response parsing |
| `EXECUTION_FLOW.md` | The full ordered sequence tying the above together |
| `FAILOVER_STRATEGY.md` | Why production's mock fallback does not transfer; fail-closed instead |
| `RATE_LIMITING.md` | Per-executive/session rate limit, independent of `groq-proxy`'s per-IP bucket |
| `CACHE_STRATEGY.md` | What may (prompt templates) and may never (context, responses) be cached |
| `PERFORMANCE_STRATEGY.md` | Per-stage timeout budget |
| `ERROR_RECOVERY.md` | What happens after a Groq-specific error is raised |
| `OBSERVABILITY.md` | Groq-specific founder-facing signal set, extending `OBSERVABILITY.md` (Phase 11) |

## What Belongs Here

Documentation specifying how a future implementation would invoke Groq
on behalf of an SDOS executive's own reasoning — the one invocation
mechanism `EXECUTION_PIPELINE.md` step 2 left unspecified.

## What Does NOT Belong Here

- Executable code, an Edge Function, or a credential.
- Any change to SmartDoor's production Groq integration
  (`js/groq.js`, `groq-proxy`, `ai-session-token`) — read-only
  references only.
- A claim that this capability is approved — see
  `ai/docs/adr/ADR-0007-Groq-Runtime.md` for the actual decision
  record and its status.

## Relationship to the Rest of SDOS

- Fills `ai/core/contracts/EXECUTION_PIPELINE.md` step 2 for the Groq
  case specifically.
- Extends `ai/integrations/groq/README.md` without contradicting its
  existing read-only scope — see `RUNTIME_ARCHITECTURE.md`'s "Real
  Gap" section and `ADR-0007`.
- See `ai/docs/GROQ_RUNTIME_READINESS.md` for the overall readiness
  assessment and `ai/docs/adr/ADR-0007-Groq-Runtime.md` and
  `ADR-0008-Prompt-Routing.md` for the two decisions this phase
  records.
