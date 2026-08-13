# SDOS Company Brain — Master Index

This is the entry point for every future AI executive (CEO, CTO, COO,
CFO, and any role added later). Start here, then follow the links below
to the specific knowledge domain relevant to the task at hand.

Before reading anything else, read `ai/docs/COMPANY_BRAIN.md` — it
explains how this knowledge base is structured, how it stays
synchronized with production, and the rules every contributor (human or
AI) must follow when touching it.

If you are building a **new** executive (not reading as an existing
one), also read `ai/core/standards/README.md` first — it defines the
shared file skeleton and rules every executive follows, so the new role
starts from that pattern instead of re-deriving it from CTO/COO/CFO.
As of SDOS Phase 9, that README also carries a resolution note: the
standards library it points to physically lives at `core/standards/`
(repository root), not `ai/core/standards/` — read it before assuming
the path either doesn't exist (the Phase 8 finding) or lives where
every reference says it does.

If you are reasoning about the runtime itself (not a specific
executive), start at `ai/core/README.md` instead — as of SDOS Phase 9
it indexes the full runtime architecture (registration, context
loading, the event bus, task/session models, permissions, and routing)
that a future implementation phase will build against.

## Knowledge Map

| Folder | File | What it answers |
|---|---|---|
| `company/` | `company_profile.md` | Who is this company, what's the mission/vision/business model, what are the revenue streams and departments? |
| `products/` | `products.md` | What do we sell, at what price, in what variants, and how do plans/tiers work? |
| `features/` | `features.md` | What capabilities exist in the product, grouped by domain, with the files that implement them? |
| `database/` | `database.md` | What tables exist, how are they related, what's the RLS/realtime/Edge Function picture? |
| `services/` | `services.md` | What does each backend service module do, and who (which future executive) would plausibly own it? |
| `pages/` | `pages.md` | What does each customer/owner/admin-facing page do and depend on? |
| `documents/` | `documents.md` | Where does every important document live, how important is it, and should an AI read it? |
| `business/` | `business_rules.md` | What rules govern pricing, orders, QR, privacy, calling, subscriptions, security, manufacturing, and AI? |
| `workflows/` | `workflows.md` | How does a visitor/owner/order/manufacturing/delivery/subscription/support/partner/society flow actually move end to end? |

## Suggested Reading Order for a New AI Executive

1. `ai/docs/COMPANY_BRAIN.md` — how to use this knowledge base at all
2. `company/company_profile.md` — the business, in one page
3. `products/products.md` + `business/business_rules.md` — what's sold
   and under what rules
4. `features/features.md` — what the product can do
5. `workflows/workflows.md` — how it all moves end to end
6. `database/database.md`, `services/services.md`, `pages/pages.md` —
   the implementation map, for anything requiring technical grounding
7. `documents/documents.md` — where to go for anything not covered
   above, plus known discrepancies to watch for

## AI Executives Built On This Knowledge

- **CTO** — fully defined as of SDOS Phase 2. See
  `ai/executives/cto/README.md` for the CTO's mission, responsibilities,
  authority matrix, and standards library. The CTO reads this Company
  Brain (primarily `database.md`, `services.md`, `features.md`,
  `pages.md`, `documents.md`) as its background context.
- **COO** — fully defined as of SDOS Phase 3. See
  `ai/executives/coo/README.md` for the COO's mission, responsibilities,
  authority matrix, and operational playbooks (order fulfilment,
  manufacturing, inventory, customer support, installation, logistics,
  incident response). The COO reads this Company Brain (primarily
  `workflows.md`, `business_rules.md`, `services.md`, `database.md`) as
  its background context, alongside the existing production runbooks
  (`OPERATIONS_RUNBOOK.md`, `SUPPORT_RUNBOOK.md`,
  `docs/SUPPORT_ESCALATION_GUIDE.md`).
- **CFO** — fully defined as of SDOS Phase 4. See
  `ai/executives/cfo/README.md` for the CFO's mission, responsibilities,
  authority matrix, financial model, and finance playbooks (revenue,
  subscription metrics, cash flow, pricing, GST compliance, unit
  economics, investor reporting). The CFO reads this Company Brain
  (primarily `business_rules.md`, `products.md`, `database.md`,
  `services.md`) as its background context, alongside SmartDoor's real
  billing/GST schema (`sql/46_saas_billing_schema.sql`,
  `sql/57_commerce_engine_phase8a.sql`,
  `sql/58_gst_billing_phase8b.sql`) and existing legal documents
  (`docs/legal/refund-policy.md`).
- **CMO** — fully defined as of SDOS Phase 6. See
  `ai/executives/cmo/README.md` for the CMO's mission, responsibilities,
  authority matrix, and marketing playbooks (SEO/GEO/AEO, content,
  social media, paid ads, lead generation, branding, campaigns,
  competitor analysis, marketing analytics). The CMO reads this Company
  Brain (primarily `company_profile.md`, `products.md`, `features.md`,
  `database.md`, `services.md`) as its background context, alongside
  SmartDoor's real SEO/GEO surface (`index.html`, `robots.txt`,
  `sitemap.xml`, `llms.txt`) and real campaign/growth schema
  (`sql/57_commerce_engine_phase8a.sql`, `sql/11_beta_launch_schema.sql`,
  `sql/13_customer_growth_schema.sql`). `ai/executives/cmo/README.md`
  flags a numbering note: its build brief referred to it as "Phase 5,"
  already occupied below by the shared standards library, so it was
  filed as Phase 6.
- **CPO** — fully defined as of SDOS Phase 7. See
  `ai/executives/cpo/README.md` for the CPO's mission, responsibilities,
  authority matrix, and product playbooks (product strategy, roadmap
  stewardship, feature prioritization, product discovery, customer
  feedback triage, user research, product analytics/metrics, release
  planning, experimentation, feature adoption). The CPO reads this
  Company Brain (primarily `products/products.md`, `features/features.md`,
  `database/database.md`, `services/services.md`) as its background
  context, alongside SmartDoor's real feature/bug triage system
  (`sql/11_beta_launch_schema.sql`, `sql/13_customer_growth_schema.sql`,
  `services/customerGrowth.js`) and its documented future-capability
  surface (`js/productCatalog.js`'s "Future Product Lines",
  `design-system/future/README.md`). `ai/executives/cpo/README.md` flags
  a naming note: `js/productCatalog.js` separately documents an
  unrelated "Phase 7 ecosystem" (future hardware categories) that
  happens to share a number with this SDOS build phase — the two are
  unrelated and neither is renamed. It also flags a real Company-Brain
  gap found during its audit: a substantial native Android app
  (`android/`) has no entry anywhere in this knowledge base.
- **CEO** — fully defined as of SDOS Phase 8. See
  `ai/executives/ceo/README.md` for the CEO's mission, responsibilities,
  authority matrix, and cross-domain orchestration playbooks (executive
  orchestration, briefing structure, a decision framework for
  cross-executive conflicts, strategic planning synthesis, priority
  management, a company health model, meeting cadence, founder
  interaction, escalation routing, and the cross-executive communication
  contract). Unlike the other five executives, the CEO owns no domain
  data or Company Brain sources of its own — it reads all five sibling
  executives' own `ai/executives/<role>/` documentation as its primary
  input, alongside this Company Brain for shared business context. Built
  from the exact gap named independently by all five sibling
  executives' own `INTER_EXECUTIVE_COMMUNICATION.md` files ("no CEO
  executive exists yet") and explicitly suggested as the next phase by
  `ai/executives/cpo/ROADMAP.md`. `ai/executives/ceo/README.md` flagged
  a documentation gap found during its audit: the `ai/core/standards/`
  shared standards library that this index (below) and all five sibling
  executives reference as built in "Phase 5" appeared not to exist
  anywhere in the repository. **SDOS Phase 9 corrected this finding**:
  the library exists in full, just physically located at the repository
  root (`core/standards/`) instead of `ai/core/standards/`. See
  `ai/core/standards/README.md` for the full accounting.

## Shared Standards (SDOS Phase 5)

As of Phase 5, `ai/core/standards/` defines the reusable shape every
executive above is built from — mission/responsibility/authority/
decision/KPI/escalation/prompt-template structure, plus documentation,
naming, folder, quality, and review conventions. See
`ai/core/standards/README.md` for the full index. Executive-specific
content (mission text, domain playbooks, actual approval tables) still
lives entirely in each `ai/executives/<role>/` folder — Phase 5 only
removed the duplicated *shape* that had been copy-pasted per role.

**Phase 9 correction:** the eighteen files this section refers to
physically live at `core/standards/` (repository root), not
`ai/core/standards/`. `ai/core/standards/README.md` now holds an
authoritative pointer explaining the discrepancy — it was not moved or
duplicated in Phase 9 (see that file for why), pending a founder
decision on which path should become authoritative.

## SDOS Runtime Foundation (SDOS Phase 9)

As of Phase 9, `ai/core/` also defines the runtime architecture the six
existing executives' documentation has assumed since Phase 2: executive
registration (`ai/core/registry/`), context loading
(`ai/core/context/`), the event bus (`ai/core/events/`), task and
session models (`ai/core/tasks/`, `ai/core/session/`), permissions and
security (`ai/core/permissions/`), and task routing
(`ai/core/router/`). See `ai/core/README.md` for the full index and
`ai/core/runtime/RUNTIME_ARCHITECTURE.md` for how they fit together.
Documentation, interfaces, and contracts only — no orchestration code,
agent runtime, or automation exists as of this phase.

## Read-Only Integration Layer + ADRs (SDOS Phase 10)

As of Phase 10, `ai/integrations/` is no longer empty — it documents
eight future, read-only integration boundary points (`github/`,
`supabase/`, `groq/`, `razorpay/`, `firebase/`, `analytics/`,
`notifications/`, `storage/`), plus a shared registry, data-contract
shape, read-only policy, and security guidelines. See
`ai/integrations/INTEGRATION_REGISTRY.md` for the full index. This
remains documentation only — **no integration in this registry has a
working client, credential, or network path as of this phase**; actual
data access continues to happen exclusively through `ai/integrations/`,
once a future phase implements it. Phase 10 also introduces
`ai/docs/adr/` — Architecture Decision Records for the significant
decisions made across Phases 0–10. See `ai/docs/adr/README.md`.

## SDOS Agent Runtime Contracts (SDOS Phase 11)

As of Phase 11, `ai/core/contracts/` specifies the layer above Phase
9's runtime foundation that a future agent runtime's reasoning step
actually needs: inter-agent messaging (`MESSAGE_SCHEMA.md`,
`INTER_AGENT_PROTOCOL.md`), memory persistence (`MEMORY_SCHEMA.md`),
the assembled-context object shape (`CONTEXT_SCHEMA.md`), a prompt
registry (`PROMPT_REGISTRY.md`), a tool registry (`TOOL_REGISTRY.md`),
the internals of the runtime's reasoning step
(`EXECUTION_PIPELINE.md`), the end-to-end founder-approval workflow
(`APPROVAL_WORKFLOW.md`, `FOUNDER_APPROVAL_FLOW.md`), founder-facing
observability content (`OBSERVABILITY.md`), a durable audit trail
(`AUDIT_TRAIL.md`), and a content-versioning scheme
(`VERSIONING.md`). Five further files in that folder
(`AGENT_REGISTRATION.md`, `AGENT_LIFECYCLE.md`,
`AGENT_STATE_MACHINE.md`, `EVENT_SCHEMA.md`, `TASK_SCHEMA.md`,
`ERROR_HANDLING.md`) are deliberate pointers to Phase 9's existing
specifications, not restatements. See `ai/core/contracts/README.md`
for the full index and `ai/docs/IMPLEMENTATION_READINESS_REPORT.md`
for what a future implementation phase would still need to build.
Documentation and contracts only — no orchestration code, agent
runtime, or automation exists as of this phase.

## Groq Runtime Foundation (SDOS Phase 12)

As of Phase 12, `ai/runtime/` specifies how a future SDOS agent runtime
would fill `ai/core/contracts/EXECUTION_PIPELINE.md` step 2 (model
invocation) by reusing SmartDoor's existing, production Groq
integration (`js/groq.js`, `supabase/functions/groq-proxy/`,
`ai-session-token/`) as an architectural pattern: provider/executive
routing (`AI_ROUTER.md`, `EXECUTIVE_ROUTER.md`), prompt/context/memory
assembly (`PROMPT_LOADER.md`, `CONTEXT_BUILDER.md`, `MEMORY_LOADER.md`),
tool selection (`TOOL_SELECTION.md`), model/token configuration
(`MODEL_CONFIGURATION.md`, `TOKEN_BUDGETING.md`), request/response
handling (`REQUEST_PIPELINE.md`, `RESPONSE_PIPELINE.md`,
`EXECUTION_FLOW.md`), and operational concerns
(`FAILOVER_STRATEGY.md`, `RATE_LIMITING.md`, `CACHE_STRATEGY.md`,
`PERFORMANCE_STRATEGY.md`, `ERROR_RECOVERY.md`, `OBSERVABILITY.md`).
See `ai/runtime/README.md` for the full index. This phase explicitly
does **not** approve SDOS invoking Groq for its own reasoning — it
specifies the shape that capability would take if a founder approves
it, and keeps it strictly separate (endpoint, credential, rate-limit
budget) from production's existing `groq-proxy`. See
`ai/docs/GROQ_RUNTIME_READINESS.md` for the readiness assessment and
`ai/docs/adr/ADR-0007-Groq-Runtime.md` (proposed, not yet accepted) and
`ADR-0008-Prompt-Routing.md` (accepted) for the two decisions this
phase records. Documentation and contracts only — no code, client,
Edge Function, or credential exists as of this phase.

## Communication Extensions (SDOS Phase 13A)

As of Phase 13A, four genuine gaps in the Phase 11–12 communication
architecture were closed by extending existing documents in place,
rather than by adding a new communication layer. A full audit found
that `ai/core/contracts/MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md`,
`TASK_ROUTING.md`, `EVENT_BUS.md`, `FOUNDER_APPROVAL_FLOW.md`,
`APPROVAL_WORKFLOW.md`, `SECURITY_BOUNDARIES.md`, and each executive's
own communication documentation already covered the bulk of what a
"multi-agent communication framework" would need; only four things were
missing. `INTER_AGENT_PROTOCOL.md` gained a new section on message
ordering, deduplication, idempotency, and traceability.
`ai/core/events/EVENT_CATALOG.md` (new) gives `EVENT_BUS.md`'s
envelope a concrete business-event taxonomy (commerce, support,
operations, product, marketing/revenue, security). `ai/executives/ceo/
MULTI_PARTY_CONFLICT.md` (new) extends `DECISION_FRAMEWORK.md` to
three-or-more-executive disagreements, with an explicit rule that the
CEO must never manufacture consensus or silently drop a minority
position. `ai/runtime/EXECUTION_FLOW.md` gained a section connecting
`EXECUTION_PIPELINE.md`'s inter-agent message sub-loop to the existing
Groq reasoning sequence. See
`ai/docs/adr/ADR-0009-Communication-Extensions.md` for why a
fifteen-file duplicate communication folder was rejected in favor of
these four targeted extensions, and why `ADR-0006` remains authoritative
for the base message architecture. Documentation and contracts only —
no runtime, message bus, or event bus exists as of this phase.

## Communication Implementation Plan (SDOS Phase 13B)

As of Phase 13B, the implementation-technology questions Phase 11 and
13A deliberately deferred (event bus transport, message lifecycle,
deduplication/ordering enforcement, traceability, production
boundary, test strategy, rollback strategy, observability, security
implementation) were resolved on paper, against direct repository
evidence, under `ai/docs/implementation/`. The event bus
recommendation is a dedicated append-only Postgres table with a
Supabase Realtime channel layered on top — the same table+Realtime
composition already used in production for notifications and
activity-center events. See
`ai/docs/adr/ADR-0010-Communication-Implementation-Plan.md` for the
decision record. Planning only — no runtime, SQL, Supabase function,
or Groq configuration changed as a result of this phase.

## Ground Rules (see `ai/docs/COMPANY_BRAIN.md` for full detail)

- SmartDoor's actual codebase and Supabase database are always the
  source of truth. This knowledge base is a derived, human-and-AI-
  readable view of that truth — never the other way around.
- If anything in `ai/knowledge/` conflicts with the live code/database,
  the code/database wins, and the conflict should be flagged, not
  silently resolved in either direction.
- Nothing in `ai/knowledge/` grants read or write access to production
  systems by itself — actual data access happens only through
  `ai/integrations/`, which as of Phase 10 documents eight future
  read-only boundary points but implements none of them yet.
