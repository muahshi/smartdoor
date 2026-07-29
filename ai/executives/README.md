# ai/executives

## Purpose
Home for individual AI executive roles — CEO, CTO, COO, CFO, CMO, and any
future roles — that will eventually run on top of SDOS to help manage the
SmartDoor business.

## Status
As of SDOS Phase 2, `cto/` fully defines the CTO executive's role,
authority, and standards — documentation only, no agent runtime or
execution logic. As of SDOS Phase 3, `coo/` fully defines the COO
executive's role, authority, and operational playbooks (order
fulfilment, manufacturing, inventory, customer support, installation,
logistics, incident response) — documentation only, no agent runtime or
execution logic. See `ai/executives/coo/README.md`. As of SDOS Phase 4, `cfo/` fully
defines the CFO executive's role, authority, and financial playbooks
(revenue, subscription metrics, cash flow, pricing, GST compliance,
unit economics, investor reporting, fundraising) — documentation only,
no agent runtime or execution logic. See `ai/executives/cfo/README.md`.
As of SDOS Phase 5, the file skeleton and shared rules each of the
above three follows are standardized in `ai/core/standards/` (see
`ai/core/standards/README.md`) — a future executive should be built
from that skeleton rather than by copying and adapting an existing
role's folder by hand. As of SDOS Phase 6, `cmo/` fully defines the CMO
executive's role, authority, and marketing playbooks (SEO/GEO/AEO,
content, social media, paid ads, lead generation, branding, campaigns,
competitor analysis, marketing analytics) — documentation only, no
agent runtime or execution logic, and the first executive built from
the Phase 5 skeleton rather than by hand. See `ai/executives/cmo/README.md`
(that file also flags a numbering note: the build brief that produced
`cmo/` referred to it as "Phase 5," which the Phase 5 standards library
above already occupies — `cmo/` was filed as Phase 6 instead of
overwriting that number).
As of SDOS Phase 7, `cpo/` fully defines the CPO executive's role,
authority, and product playbooks (product strategy, roadmap stewardship,
feature prioritization, product discovery, customer feedback triage,
user research, product analytics/metrics, release planning,
experimentation, feature adoption) — documentation only, no agent
runtime or execution logic, built from the Phase 5 skeleton per the
suggestion in `ai/executives/cmo/ROADMAP.md`. See
`ai/executives/cpo/README.md` (that file flags a naming note: this SDOS
build phase shares the number "Phase 7" with an unrelated "Phase 7
ecosystem" of future hardware categories already documented in
`js/productCatalog.js` — the two are coincidental and neither is
renumbered — and flags a real Company-Brain gap found during its audit:
a native Android app in `android/` with no entry anywhere in
`ai/knowledge/`).
`ceo/` remains empty; no agents, personas, or decision logic execute for
any role yet.

## What will eventually go here
- One subfolder per executive (e.g. `ceo/`, `cto/`, `coo/`, `cfo/`)
- Each executive's role definition, responsibilities, and decision boundaries
- Executive-specific configuration (which knowledge sources it reads, which
  workflows it can trigger, which integrations it can call)

## What does NOT go here
- Shared runtime/orchestration code (that's `ai/core/`)
- Raw prompts (those live in `ai/prompts/`, referenced by executives here)
- Business data itself (SmartDoor's Supabase database remains the single
  source of truth; executives read from it via `ai/integrations/`)
