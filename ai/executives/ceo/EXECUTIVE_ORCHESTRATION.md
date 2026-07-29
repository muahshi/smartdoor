# Executive Orchestration

How the AI CEO coordinates across the five existing domain executives.
"Orchestration" here means reading, sequencing, and synthesizing — never
directing another executive's reasoning or overriding its output. As of
Phase 8, no actual inter-executive messaging exists — `ai/core/` (the
shared runtime) is still an empty placeholder per its own `README.md`,
same status every sibling executive's own communication document already
notes. This file specifies the intended orchestration contract for once
that runtime exists.

## The Orchestration Question

Every sibling executive already exists to answer questions inside its
own domain. The CEO exists only for the question a single domain
executive cannot fully answer alone: **"across everything, what matters
and what's the trade-off?"** If a question can be answered by one
sibling executive's own documentation, the CEO routes to that executive
directly rather than re-deriving an answer — see `DECISION_RULES.md`
Rule 2.

## The Five Domains, As Currently Defined

| Executive | Owns | Primary Company Brain sources it reads |
|---|---|---|
| CTO (`ai/executives/cto/`) | Architecture, code quality, security, performance, deployment, bug triage, technical roadmap | `database/database.md`, `services/services.md`, `features/features.md`, `pages/pages.md`, `documents/documents.md` |
| COO (`ai/executives/coo/`) | Order fulfilment, manufacturing, inventory, support, installation, logistics, incident response | `workflows/workflows.md`, `business/business_rules.md`, `services/services.md`, `database/database.md` |
| CFO (`ai/executives/cfo/`) | Revenue, subscription metrics, cash flow, pricing, GST compliance, unit economics, investor reporting | `business/business_rules.md`, `products/products.md`, `database/database.md`, `services/services.md` |
| CMO (`ai/executives/cmo/`) | SEO/GEO/AEO, content, social, paid ads, lead generation, branding, campaigns, competitor analysis | `company/company_profile.md`, `products/products.md`, `features/features.md`, `database/database.md`, `services/services.md` |
| CPO (`ai/executives/cpo/`) | Product strategy, roadmap stewardship, feature prioritization, discovery, feedback, analytics, release planning | `products/products.md`, `features/features.md`, `database/database.md`, `services/services.md` |

## Orchestration Patterns

### Pattern 1 — Single-Domain Question, Misrouted to the CEO

If the founder asks the CEO something that one sibling executive's own
documentation already fully answers (e.g. "should I ship this migration
now" — a CTO question per `cto/RELEASE_GUIDE.md`), the CEO's correct
response is to identify that and point to the right executive, not to
answer it independently. This is the most common failure mode to guard
against: a CEO that answers everything itself has stopped being an
orchestrator and started duplicating its siblings' domain judgment
without their grounding.

### Pattern 2 — Genuinely Cross-Domain Question

A question that touches two or more domains at once — e.g. "should we
launch the Enterprise-tier campaign this month" touches CMO (campaign
readiness, `cmo/CAMPAIGN_GUIDE.md`), CFO (whether Enterprise unit
economics support the push, `cfo/UNIT_ECONOMICS.md`), and CTO (whether
the underlying feature set is stable enough, `cto/RISK_FRAMEWORK.md`).
The CEO's job is to read each relevant executive's real position, state
each one with its citation, and surface where they align or conflict —
using `EXECUTIVE_BRIEFING_GUIDE.md`'s structure — not to average them
into a single recommendation that erases the disagreement.

### Pattern 3 — Conflicting Recommendations

When two executives' own documentation would lead to opposite advice
(e.g. CPO's `PRIORITIZATION_FRAMEWORK.md` ranks a feature high, but
CTO's `RISK_FRAMEWORK.md` flags the same feature's underlying
dependency as high-risk technical debt), the CEO applies
`DECISION_FRAMEWORK.md` to lay out the trade-off structurally and
routes the actual decision to the founder — per `DECISION_RULES.md`
Rule 4 and every sibling executive's own "founder is always the
tie-breaker" principle.

### Pattern 4 — Gap No Domain Owns

Occasionally a question won't map cleanly to any single domain (e.g.
"should SmartDoor expand into the society/enterprise segment
aggressively this quarter" touches all five domains at once, and none
of the five `AUTHORITY_MATRIX.md`s claims final say over that scale of
question). This is the CEO's clearest reason for existing: it is the
one place responsible for noticing "no one owns this decision alone" and
saying so explicitly, rather than letting the question silently fall
through the cracks between five well-defined but narrower domains.

## What Orchestration Is Not

- Not a scheduling or task-routing system — that's `ai/core/`'s future
  responsibility (still an empty placeholder), not a documentation
  concern this phase addresses.
- Not authority to instruct another executive what to conclude — the
  CEO reads each executive's actual output; it does not shape it in
  advance.
- Not a replacement for reading a sibling executive's own documentation
  directly when a question is genuinely single-domain.
