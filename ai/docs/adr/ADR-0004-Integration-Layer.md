# ADR-0004: Integration Layer

## Status

Accepted (Phase 10).

## Context

`ai/integrations/` had existed as an empty, placeholder folder since
Phase 0, documented only as future intent ("Empty. Phase 0 does not
implement any integration"). Meanwhile, `ai/core/permissions/READONLY_INTEGRATION_POLICY.md`
(Phase 9) had already formalized the *policy* a future integration must
satisfy, and every executive's own documentation had already assumed
integrations would eventually exist. What remained undone was
documenting, per real vendor, what SDOS's eventual read-only access
would actually look like — without writing any of the code itself,
which remains gated behind the runtime foundation (ADR-0003) and an
explicit future implementation decision.

## Decision

Document **eight integration boundary points** —
`github/`, `supabase/`, `groq/`, `razorpay/`, `firebase/`,
`analytics/`, `notifications/`, `storage/` — each covering purpose,
supported capabilities, read-only access policy, authentication
approach, inputs, outputs, data contracts, error handling, security
considerations, rate limits, and a clearly-labeled future capability.
Four of these (`supabase/`, `groq/`, `razorpay/`, `firebase/`) plus
three more (`analytics/`, `notifications/`, `storage/`) each extend an
integration that already exists in SmartDoor's real production
codebase; `github/` is the one integration with no present-day
production counterpart, documented purely as forward-looking intent.
Alongside these, four cross-cutting documents —
`INTEGRATION_REGISTRY.md`, `DATA_CONTRACTS.md`, `READONLY_POLICY.md`,
`SECURITY_GUIDELINES.md` — establish the shared index, request/response
shape, access gate, and security posture every one of the eight follows.
No executable code, network call, or credential is introduced.

## Alternatives Considered

- **Build a working read-only client for one integration (e.g.
  Supabase) instead of documenting all eight.** Rejected for this
  phase: the task brief explicitly scoped Phase 10 as architecture and
  documentation only ("Do NOT write executable integration code"), and
  building one client ahead of the shared `DATA_CONTRACTS.md` envelope
  and `READONLY_POLICY.md` gate being documented would risk the same
  ad hoc-then-retrofit pattern ADR-0002 already corrected once for the
  executive model.
- **Treat `github/` as out of scope since it extends nothing in
  production.** Rejected: the task brief explicitly named it as one of
  the eight required folders, and documenting a future-only capability
  with an honest "no existing production path" label is more useful
  than silently omitting it — consistent with `QUALITY_STANDARD.md`'s
  "flag, don't silently resolve" discipline applied to scope itself.
- **Fold all eight vendors' documentation into one combined file**
  rather than one folder each. Rejected: the task brief explicitly
  requested one folder per integration, and per-vendor separation
  matches `INTEGRATION_REGISTRY.md`'s own per-row structure and lets
  each integration's real production footprint (different files,
  different Edge Functions, different risk profile) be described on
  its own terms rather than forced into a shared template that
  flattens real differences (e.g. Razorpay's money-movement risk vs.
  GitHub's read-only-by-default risk profile).

## Rationale

- Documenting the *shape* of a future integration before writing it
  lets every future implementation start from the same contract
  (`DATA_CONTRACTS.md`) and gate (`READONLY_POLICY.md`), rather than
  each vendor integration inventing its own request/response shape.
- Grounding each integration's documentation in the *actual* production
  file(s) it would extend (e.g. `razorpay/README.md` naming
  `services/payments.js` and the four real Razorpay Edge Functions)
  keeps the documentation traceable to the real repository, per
  `ai/docs/COMPANY_BRAIN.md` Rule 1 ("read the repository, don't
  assume") applied to integrations specifically.
- Explicitly excluding content/PII-bearing capabilities (visitor
  photos, voice messages, notification content, conversation
  transcripts) from every integration's scope — not just deprioritizing
  them — keeps the documented future capability narrow by design,
  matching `READONLY_INTEGRATION_POLICY.md` rule 3's "scoped, not
  blanket" requirement from the very first phase that could violate it.

## Consequences

- Positive: a future implementation phase for any one of the eight
  integrations has a complete specification to build against, without
  needing to re-derive read-only scope, auth approach, or security
  posture from first principles.
- Positive: `INTEGRATION_REGISTRY.md` gives any future contributor
  (human or AI) a single place to see which integrations extend real
  production systems vs. which (currently just `github/`) are purely
  aspirational.
- Negative / accepted tradeoff: none of the eight integrations are
  actually usable after this phase — a future phase must still decide,
  per integration, to implement it, which remains a founder-approval
  event under `AUTHORITY_STANDARD.md`'s "Any change to
  `ai/integrations/` scope" row.

## Future Impact

Any future phase implementing a real client for one of the eight
integrations must satisfy that integration's own README plus
`READONLY_POLICY.md`, `DATA_CONTRACTS.md`, and `SECURITY_GUIDELINES.md`
before a single read ships — this ADR is the record of why those
documents exist and were written before any client code, mirroring
ADR-0003's same discipline one layer up the stack. Write capability for
any integration remains explicitly out of scope for every phase this
ADR governs.

## Related Phases

Phase 10 (this decision). Built directly on Phase 9's runtime
contracts (`INTEGRATION_ERROR`, `integration.read` — see ADR-0003) and
Phase 9's `READONLY_INTEGRATION_POLICY.md` / `SECURITY_MODEL.md`, which
this phase extends per-integration rather than restates from scratch.
