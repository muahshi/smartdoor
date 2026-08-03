# Groq Runtime Readiness

## Status

SDOS Phase 12. Assessment only — no implementation started.

## Purpose

Answer, plainly, "how close is SDOS to actually being able to invoke
Groq for an executive's own reasoning?" — synthesizing everything
`ai/runtime/` specifies in this phase against what already exists in
production and what Phase 9–11 already built.

## Current Readiness

**Not implementation-ready.** Every document in `ai/runtime/` is a
specification, not a build. No SDOS-scoped Groq credential, Edge
Function, or client exists. The following, however, are genuinely
ready as inputs to a future build:

| Layer | Ready? | Notes |
|---|---|---|
| Executive definitions | Ready | Six `PROMPT_TEMPLATE.md` files exist (Phase 2–8) |
| Prompt registry | Ready | `PROMPT_REGISTRY.md` (Phase 11) indexes all six |
| Context object shape | Ready | `CONTEXT_SCHEMA.md` (Phase 11) |
| Tool registry | Ready (read-only tools only) | `TOOL_REGISTRY.md` (Phase 11); no live tool implementations exist |
| Memory schema | Ready (schema only) | `MEMORY_SCHEMA.md` (Phase 11); no storage backend chosen |
| Execution pipeline shell | Ready | `EXECUTION_PIPELINE.md` (Phase 11) step 2 was the one unspecified gap |
| Groq invocation design | Ready (this phase) | `ai/runtime/` (Phase 12) fills step 2 fully at the specification level |
| Founder-approved scope expansion | **Not ready — the real gap** | See below |
| Live integrations (`ai/integrations/`) | Not ready | All eight remain documentation-only, read-only, per Phase 10 |
| Agent runtime process/scheduler | Not ready | No phase has built one; `ai/workflows/` remains empty |

## Existing Groq Capabilities (Production, Reused as Pattern)

- `js/groq.js` — client wrapper, mock fallback, task-typed calls.
- `supabase/functions/groq-proxy/index.ts` — hardened server-side
  proxy: origin allow-list, AI-session-token auth, per-IP rate limit,
  model whitelist, request-shape caps, 15s timeout.
- `supabase/functions/ai-session-token/index.ts` +
  `_shared/aiSessionAuth.ts` — session-token issuance/verification.
- `_shared/edgeRateLimit.ts`, `_shared/cors.ts` — shared limiter and
  CORS helper, reused by several Edge Functions beyond `groq-proxy`.

None of this is modified by Phase 12. All of it is reused as an
architectural template for a **separately-scoped** future SDOS path
(see `RATE_LIMITING.md`, `TOKEN_BUDGETING.md` for why "separately
scoped" rather than "shared").

## Missing Implementation Work (If a Future Phase Proceeds)

1. A founder decision formally expanding SDOS's Groq scope beyond
   Phase 10's read-only-metrics framing (`ADR-0007`).
2. A new, SDOS-only Edge Function (not `groq-proxy`) with its own
   credential, mirroring `groq-proxy`'s hardening but on its own
   allow-list/rate-limit bucket.
3. A concrete templating/assembly implementation for `PROMPT_LOADER.md`
   and `CONTEXT_BUILDER.md` (no library or format is chosen in this
   phase).
4. A concrete tool-calling mechanism satisfying `TOOL_SELECTION.md`
   and `EXECUTION_PIPELINE.md` step 3 (function-calling API or
   equivalent).
5. A memory storage backend satisfying `MEMORY_SCHEMA.md` and
   `MEMORY_LOADER.md` (no backend chosen).
6. At least one live, read-only `ai/integrations/` implementation
   (e.g. Supabase), since `CONTEXT_SCHEMA.md`'s `live_data` field
   depends on one existing.
7. A founder-approval UI/flow satisfying `APPROVAL_WORKFLOW.md` and
   `FOUNDER_APPROVAL_FLOW.md` (Phase 11), since any executive action
   beyond read-and-reason still requires it regardless of invocation
   mechanism.

## Engineering Risks

- **Scope creep risk**: reusing `groq-proxy`'s literal endpoint or
  credential (rather than the pattern) would silently violate
  `ai/integrations/groq/README.md`'s existing read-only boundary and
  compete with production's own rate-limit budget — `RATE_LIMITING.md`
  and `TOKEN_BUDGETING.md` exist specifically to prevent this.
- **Fabricated-output risk**: reusing `js/groq.js`'s mock-fallback
  pattern for executive reasoning would produce plausible-looking but
  fabricated "decisions" indistinguishable from real ones —
  `FAILOVER_STRATEGY.md` exists specifically to close this off.
- **Cost risk**: an executive's Company-Brain-scale context is far
  larger than production's existing prompts; without
  `TOKEN_BUDGETING.md`'s separately-tuned ceilings, cost per call could
  be substantially higher than production's per-call cost.
- **Authority risk**: nothing in this phase grants any executive new
  authority — a future implementation must still route every eventual
  action through `PERMISSION_MODEL.md` and `APPROVAL_WORKFLOW.md`
  exactly as documented; a model call producing a recommendation is not
  itself an authorized action.

## Suggested Implementation Order

1. Founder decision on scope expansion (`ADR-0007`'s subject).
2. Live read-only `ai/integrations/supabase/` (smallest, most useful
   integration to unblock `live_data`).
3. SDOS-scoped Groq proxy (mirroring `groq-proxy`'s hardening, on its
   own credential/bucket).
4. `PROMPT_LOADER.md` + `CONTEXT_BUILDER.md` concrete implementation
   for one executive (CTO, given it has the most existing playbooks)
   as a pilot.
5. `TOOL_SELECTION.md` + at least one real, read-only tool.
6. `MEMORY_SCHEMA.md` storage backend.
7. Extend the pilot to all six executives once the CTO pilot's real
   token/latency/cost numbers are measured against
   `TOKEN_BUDGETING.md`/`PERFORMANCE_STRATEGY.md`'s proposed figures.

## Relationship to the Rest of SDOS

- Synthesizes `ai/runtime/` (Phase 12) against `ai/core/contracts/`
  (Phase 11) and `ai/integrations/` (Phase 10).
- Read alongside `ai/docs/IMPLEMENTATION_READINESS_REPORT.md`
  (Phase 11), which this file extends with the Groq-specific view.
