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
As of SDOS Phase 8, `ceo/` fully defines the CEO executive's role,
authority, and cross-domain orchestration playbooks (executive
orchestration, briefing structure, a decision framework for
cross-executive conflicts, strategic planning synthesis, priority
management, a company health model, meeting cadence, founder
interaction, escalation routing, and the cross-executive communication
contract) — documentation only, no agent runtime or execution logic.
Unlike every other executive, the CEO owns no domain of its own; its
entire function is reading and synthesizing what `cto/`, `coo/`,
`cfo/`, `cmo/`, and `cpo/` already define, per the gap each of those
five folders' own `INTER_EXECUTIVE_COMMUNICATION.md` independently
named ("no CEO executive exists yet"). See `ai/executives/ceo/README.md`
(that file also flags a documentation gap found during its audit: the
`ai/core/standards/` shared standards library referenced by all six
executives as built in "Phase 5" appeared not to exist anywhere in the
repository). As of SDOS Phase 9, that finding has been corrected, not
just flagged further: the standards library exists in full, physically
located at the repository root (`core/standards/`) rather than
`ai/core/standards/` — see `ai/core/standards/README.md` for the
complete accounting. Phase 9 also builds out `ai/core/` itself, which
until this phase contained only its own placeholder `README.md`: it now
defines the runtime architecture — executive registration, context
loading, the event bus, task/session models, permissions, and task
routing — that every one of the six executives' own `PROMPT_TEMPLATE.md`
and `AUTHORITY_MATRIX.md` files has assumed exists since Phase 2. See
`ai/core/README.md` for the full index. No agents, personas, or
decision logic execute for any role yet, and nothing in Phase 9 changes
that — it is architecture and contracts only, exactly like every phase
before it.
As of SDOS Phase 10, `ai/integrations/` — the boundary every executive
above will eventually read live data through — is documented for eight
vendors (`github/`, `supabase/`, `groq/`, `razorpay/`, `firebase/`,
`analytics/`, `notifications/`, `storage/`), each scoped to the
specific, narrow reads that role's own domain would plausibly need
(e.g. a future CFO capability reading `razorpay/`'s and `analytics/`'s
documented payment/revenue status; a future COO capability reading
`notifications/`'s and `firebase/`'s documented delivery health). This
is documentation only — no executive gains any actual data access in
this phase, and every one of the six roles' own `AUTHORITY_MATRIX.md`
and `PERMISSION_MODEL.md` resolution (`AWAITING_APPROVAL` for
everything, per Phase 9) is unchanged by it. Phase 10 also formalizes
Phases 0–10's key architectural decisions as ADRs in `ai/docs/adr/`,
including `ADR-0002-Executive-Model.md`, which records why this
six-role, shared-skeleton structure was chosen in the first place.

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
