# Integration: Groq

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. Extends an existing production integration — see below.

## Purpose

SmartDoor already uses Groq for its AI Product Consultant and AI
Receptionist widgets, proxied through `supabase/functions/groq-proxy/`
so the `GROQ_API_KEY` never reaches the browser. This integration would
give SDOS executives read-only visibility into that usage (session
volume, error rates, cost signals) — **not** a way for SDOS itself to
run inference through Groq on the business's behalf.

## Supported Capabilities (Future, Documented Only)

- Read aggregate usage metrics already implied by `groq-proxy`'s own
  request/response contract (`{success, content, model, usage}`) — e.g.
  token usage trends a future CFO cost-tracking capability could read.
- Read AI-session-token issuance volume/error rate
  (`ai-session-token/index.ts`) as an operational health signal for a
  future CTO capability.

## Read-Only Access Policy

Governed by `ai/integrations/READONLY_POLICY.md`. Critically: SDOS
never calls the Groq API directly with its own key, and never calls
`groq-proxy` to *generate* content on the business's behalf — both
would be a write/execution action (consuming a paid API call, producing
content someone might act on), not a read. Any future SDOS read is
against **usage/metadata already logged**, not a new inference request.

## Authentication Approach (Future)

If a future phase needs metadata `groq-proxy` doesn't already log
anywhere SDOS can read it via the `supabase/` integration, that is a
new, separately-scoped credential decision (per
`READONLY_INTEGRATION_POLICY.md` rule 2) — not an extension of the
existing `GROQ_API_KEY`, which stays exactly where it is today
(server-side, `groq-proxy` only).

## Inputs

`capability` (one of the items above), `requested_by`, `scope`
(date range / aggregation level only — never a raw prompt or session
transcript).

## Outputs

Aggregate counts/metrics only, per `DATA_CONTRACTS.md`. Never
individual conversation content — visitor/owner AI Receptionist and
Product Consultant transcripts are out of scope for this integration
entirely, both now and as a documented future capability, given their
sensitivity.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md`. No extension defined in
this phase.

## Error Handling

`INTEGRATION_ERROR` on any failed/timed-out read, per
`ERROR_HANDLING.md` — same as every other integration in this registry.

## Security Considerations

- `GROQ_API_KEY` is never read, referenced, or duplicated by SDOS —
  restated from `SECURITY_GUIDELINES.md` guideline 6: SDOS does not
  bypass `groq-proxy`'s existing AI-session-token + origin allow-list
  hardening by calling Groq directly.
- Conversation content (system prompts, visitor/owner messages) is
  explicitly excluded from this integration's scope, not just
  deprioritized — see Outputs above.

## Rate Limits

None defined (no client exists). Any future metadata read must not
compete with, or be mistaken for, the production rate limit already
enforced inside `groq-proxy` itself (per-IP and model-whitelist based).

## Future SDOS Capability

A future CFO-flavored capability could track Groq API cost trends
alongside `services/aiInsights.js`'s existing analytics. A future CTO
capability could monitor `groq-proxy` error rates as part of a broader
system-health view. Neither is built in Phase 10, and neither implies
SDOS ever generating content through Groq on the business's behalf —
that would be a fundamentally different, write-capable decision
requiring its own future phase and explicit approval.
