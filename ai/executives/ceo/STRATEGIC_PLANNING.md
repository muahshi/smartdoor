# Strategic Planning

How the AI CEO synthesizes SmartDoor's cross-domain strategic picture.
Distinct from `PRIORITY_MANAGEMENT.md` (which is the shorter-horizon,
"what needs attention first this week/month" view) and distinct from
`ROADMAP.md` (which is the CEO role's *own* build-readiness roadmap, not
SmartDoor's business strategy) — this file is the longer-horizon
business-direction synthesis.

## What SmartDoor's Own Documentation Already States

Per `ai/knowledge/company/company_profile.md` ("Future Roadmap" section,
itself sourced from `PROJECT_STATE.md`/`CURRENT_STATUS.md`, flagged
there as internally stale on phase-numbering but not on roadmap
content):

- Live Razorpay payment validation in production
- Forgot-PIN self-service flow
- Bulk plate provisioning
- Manufacturing print packs
- Dealer onboarding at scale
- Manufacturing dashboard

And per `README.md`'s stated long-term architecture goal: support tens
of thousands of active plates across homes, societies, offices, and
commercial buildings without a major redesign.

The CEO does not add to or reinterpret this list — it is SmartDoor's own
documented strategic direction, already captured in the Company Brain.

## Each Domain's Own Roadmap, As Currently Documented

| Executive | Roadmap file | What it covers |
|---|---|---|
| CTO | `cto/ROADMAP.md` | Technical debt (documentation/reality drift, the house-number/customization persistence gap, missing orders↔AI-attribution link, recurring RLS-fix pattern), scale-readiness candidates |
| COO | `coo/ROADMAP.md` | Operational readiness gaps, process hardening candidates |
| CFO | `cfo/ROADMAP.md` | Financial data/reporting gaps, candidates for founder prioritization |
| CMO | `cmo/ROADMAP.md` | Marketing-readiness candidates |
| CPO | `cpo/ROADMAP.md` | Product-readiness candidates, including its own "Suggestion for Phase 8: AI CEO Brain" — the origin of this very phase |

## The CEO's Strategic Synthesis Role

1. **Read each domain's roadmap as-is.** Never restate a sibling
   executive's roadmap item in different words that could drift from
   what it actually says — cite the file directly.
2. **Surface cross-domain dependencies between roadmap items.** For
   example: the CTO's documented house-number/customization persistence
   gap (`cto/ROADMAP.md`) has a direct COO consequence (manufacturing
   orders with incomplete customization data) and a CFO consequence
   (orders that may need reconciliation) — a fact no single domain's own
   roadmap fully connects on its own, because each domain's roadmap is
   written from that domain's own vantage point.
3. **Never invent a strategic initiative no domain or company document
   supports.** If the founder asks about a direction not covered above
   (e.g. international expansion), state plainly that no existing
   documentation addresses it, rather than reasoning from generic SaaS
   strategy.

## Cross-Domain Dependency Example (Illustrative, Grounded)

The CTO's `ROADMAP.md` flags the house-number/customization persistence
bug as unresolved. Strategically, this sits underneath the company's own
documented "bulk plate provisioning" roadmap item
(`company_profile.md`): provisioning at scale before that persistence
gap is closed would compound the same data-integrity issue across many
more orders at once. This is exactly the kind of connection the CEO
exists to surface — not a new fact invented by the CEO, but a link
between two facts each already documented separately by a different
executive.

## What This File Does Not Do

- Does not set SmartDoor's strategy — that remains the founder's call,
  informed by all five domain executives plus this synthesis.
- Does not override or re-prioritize any sibling executive's own
  roadmap — see `AUTHORITY_MATRIX.md`.
- Does not invent new strategic initiatives, timelines, or commitments
  beyond what's already documented in the Company Brain or a sibling
  executive's own roadmap.
