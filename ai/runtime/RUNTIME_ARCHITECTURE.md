# Groq Runtime Architecture

## Status

SDOS Phase 12 (Groq Runtime Foundation). Documentation and contract
only — no code, client, Edge Function, or credential is created by
this phase. This file specifies how a future SDOS agent runtime would
fill `ai/core/contracts/EXECUTION_PIPELINE.md` step 2 ("Invocation —
a future model call... Not specified further in this phase") using
SmartDoor's existing, production Groq integration as the reused
pattern. Steps 1, 3, 4, and 5 of `EXECUTION_PIPELINE.md` are not
restated here.

## Purpose

Give a future implementation phase one concrete, non-conflicting
answer to "which model, called how" for the reasoning step every
executive's `PROMPT_TEMPLATE.md` has assumed exists since Phase 2 —
without inventing a new inference path, and without disturbing the
real, live Groq integration that already serves the AI Product
Consultant and AI Receptionist.

## Existing Groq Components Found (Reused, Not Redesigned)

- `js/groq.js` — `GroqService` IIFE. Client-side wrapper: builds the
  message array, calls the proxy, falls back to a mock intelligence
  engine on error or missing config. Already carries `task` typing
  (`intent`, `status`, `summarize`, `general`) and per-call
  `maxTokens`/`temperature` overrides.
- `supabase/functions/groq-proxy/index.ts` — the only code path that
  ever holds `GROQ_API_KEY`. Enforces origin allow-list, per-IP rate
  limiting (`PER_IP_MAX=12`/60s), an AI-session-token check
  (`x-ai-session-token`), a model whitelist, and message-shape caps
  (`MAX_MESSAGES=40`, `MAX_MESSAGE_CHARS=12000`,
  `MAX_TOTAL_CHARS=24000`, one system message, `max_tokens` clamped to
  800, `temperature` clamped to 1.5), then calls
  `https://api.groq.com/openai/v1/chat/completions` server-side.
- `supabase/functions/ai-session-token/index.ts` +
  `_shared/aiSessionAuth.ts` — issues and verifies the short-lived
  token `groq-proxy` requires, scoped to an allowed origin.
- `_shared/edgeRateLimit.ts`, `_shared/cors.ts` — the shared sliding-
  window limiter and restricted-CORS helper `groq-proxy` and its
  siblings (`send-sms`, `send-whatsapp`, `send-email`) already use.
- Consumers: `services/aiReceptionist.js`, `services/aiOwnerAssistant.js`,
  `services/aiVoiceReceptionist.js`, `js/aiProductConsultant.js`,
  `js/aiSessionClient.js` — all call `GroqService`, never Groq
  directly.

Every architectural decision below reuses this pattern (hardened
server-side proxy, session-token gate, model whitelist, shape caps,
graceful client fallback) as a **template**, not as a shared runtime
path — see "Real Gap" below for why the two must not share a path.

## The Real Gap This Phase Resolves

`ai/integrations/groq/README.md` (Phase 10) scoped Groq strictly to
future **read-only visibility into production usage metrics** and was
explicit: SDOS "never calls the Groq API directly with its own key,
and never calls `groq-proxy` to *generate* content on the business's
behalf." `EXECUTION_PIPELINE.md` (Phase 11) reaffirmed that this
boundary "continues to apply in full to whatever invocation mechanism
a future phase chooses for step 2." Phase 12's own brief — "designs
how SDOS will use the existing Groq integration" for the runtime's own
reasoning step — is a **different, wider capability** than either of
those two documents scoped: an SDOS executive actually invoking an LLM
to reason, not SDOS reading metrics about SmartDoor's own product
features. That capability was never approved. This phase does not
approve it either — approving new authority is a founder decision, not
a documentation phase's to grant. What this phase does is specify,
in full, the shape that capability would take **if and when** a
founder approves it, split into a proxy the business's production
traffic never shares (see `RATE_LIMITING.md`, `TOKEN_BUDGETING.md`) —
see `ADR-0007-Groq-Runtime.md` for the formal record of this
decision boundary.

## Components (This Phase)

```
PROMPT_LOADER ──┐
CONTEXT_BUILDER ─┼─► REQUEST_PIPELINE ─► AI_ROUTER ─► EXECUTIVE_ROUTER ─►[future: SDOS Groq proxy]
MEMORY_LOADER ──┘                                                              │
TOOL_SELECTION ─────────────────────────────────────────────────────────────────┤
                                                                                ▼
                                                                     RESPONSE_PIPELINE ─► EXECUTION_FLOW
```

- `AI_ROUTER.md` — decides *whether* step 2 is a Groq call, a pure
  computation, or (future) another provider.
- `EXECUTIVE_ROUTER.md` — once Groq is selected, resolves which
  executive's model/config applies.
- `PROMPT_LOADER.md`, `CONTEXT_BUILDER.md`, `MEMORY_LOADER.md` —
  assemble the message array from `PROMPT_REGISTRY.md`,
  `CONTEXT_SCHEMA.md`, `MEMORY_SCHEMA.md`.
- `TOOL_SELECTION.md` — exposes `TOOL_REGISTRY.md` entries to the
  model per turn.
- `MODEL_CONFIGURATION.md`, `TOKEN_BUDGETING.md` — model choice and
  request-shape limits, scoped separately from production's.
- `REQUEST_PIPELINE.md` / `RESPONSE_PIPELINE.md` — outbound/inbound
  shape either side of the network call.
- `EXECUTION_FLOW.md` — the full sequence, tying the above into
  `EXECUTION_PIPELINE.md` step 2.
- `FAILOVER_STRATEGY.md`, `RATE_LIMITING.md`, `CACHE_STRATEGY.md`,
  `PERFORMANCE_STRATEGY.md`, `ERROR_RECOVERY.md`, `OBSERVABILITY.md` —
  operational concerns, each scoped separately from production's.

## Inputs

`EXECUTION_PIPELINE.md` step 6's need for an invocation mechanism;
`PROMPT_REGISTRY.md`, `CONTEXT_SCHEMA.md`, `MEMORY_SCHEMA.md`,
`TOOL_REGISTRY.md` (Phase 11 contracts); the real
`js/groq.js` / `groq-proxy` / `ai-session-token` production
architecture (read-only, for pattern reuse).

## Outputs

Eighteen documents under `ai/runtime/` (this folder) specifying every
sub-concern of a future Groq-backed reasoning step, plus
`ai/docs/GROQ_RUNTIME_READINESS.md`, `ADR-0007-Groq-Runtime.md`, and
`ADR-0008-Prompt-Routing.md`. No executable artifact.

## Dependencies

- `ai/core/contracts/EXECUTION_PIPELINE.md`, `PROMPT_REGISTRY.md`,
  `TOOL_REGISTRY.md`, `CONTEXT_SCHEMA.md`, `MEMORY_SCHEMA.md`,
  `SECURITY_BOUNDARIES.md`
- `ai/core/runtime/ERROR_HANDLING.md`
- `ai/integrations/groq/README.md`, `READONLY_POLICY.md`,
  `SECURITY_GUIDELINES.md`
- Real production files: `js/groq.js`, `supabase/functions/groq-proxy/index.ts`,
  `supabase/functions/ai-session-token/index.ts`,
  `supabase/functions/_shared/aiSessionAuth.ts`,
  `supabase/functions/_shared/{cors,edgeRateLimit}.ts`

## Sequence

See `EXECUTION_FLOW.md` for the full step-by-step sequence. At this
umbrella level: registry/context/permission checks
(`RUNTIME_ARCHITECTURE.md` steps 1–5, Phase 9) complete first; only
then does this folder's content apply, entirely inside step 6; step 7
(event emission) onward is unchanged.

## Failure Modes

Any failure inside this folder's scope is an `EXECUTION_ERROR` per
`ai/core/runtime/ERROR_HANDLING.md`, unless it is specifically an
integration/read failure (`INTEGRATION_ERROR`) — see each individual
document's own Failure Modes section; this file does not add a new
error class.

## Security

- `GROQ_API_KEY` is never read, referenced, duplicated, or made
  reachable from `ai/` by this phase — restated from
  `ai/integrations/groq/README.md` and `SECURITY_MODEL.md` constraint 1.
- Any future SDOS invocation of Groq is a **separately-scoped
  credential and endpoint**, never the production `groq-proxy` URL,
  its anon-key/session-token budget, or its per-IP rate-limit bucket —
  see `RATE_LIMITING.md` and `TOKEN_BUDGETING.md`.
- No document in this folder grants an executive authority beyond its
  own `AUTHORITY_MATRIX.md` — a Groq call is the *mechanism* of
  reasoning, never a new authority grant.

## Future Implementation Notes

No implementation phase is started or authorized by this document. A
future phase would need: (1) a founder decision formalizing the scope
expansion this phase names (`ADR-0007`), (2) a new, separately-scoped
Edge Function (not `groq-proxy`) and its own `GROQ_API_KEY`-equivalent
credential, and (3) every contract in `ai/core/contracts/` satisfied
first, per `IMPLEMENTATION_READINESS_REPORT.md`.

## Relationship to the Rest of SDOS

- Fills `EXECUTION_PIPELINE.md` step 2 specifically; does not touch
  steps 1, 3–5.
- Extends, never restates, `ai/integrations/groq/README.md`.
- Feeds `ai/docs/GROQ_RUNTIME_READINESS.md`'s readiness assessment.
