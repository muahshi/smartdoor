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
  `ai/executives/cpo/ROADMAP.md`. `ai/executives/ceo/README.md` flags a
  real, confirmed documentation gap found during its audit: the
  `ai/core/standards/` shared standards library that this index (below)
  and all five sibling executives reference as built in "Phase 5" does
  not actually exist anywhere in the repository — `ai/core/` contains
  only its own README, still describing itself as an empty Phase 0
  placeholder.

## Shared Standards (SDOS Phase 5)

As of Phase 5, `ai/core/standards/` defines the reusable shape every
executive above is built from — mission/responsibility/authority/
decision/KPI/escalation/prompt-template structure, plus documentation,
naming, folder, quality, and review conventions. See
`ai/core/standards/README.md` for the full index. Executive-specific
content (mission text, domain playbooks, actual approval tables) still
lives entirely in each `ai/executives/<role>/` folder — Phase 5 only
removed the duplicated *shape* that had been copy-pasted per role.

## Ground Rules (see `ai/docs/COMPANY_BRAIN.md` for full detail)

- SmartDoor's actual codebase and Supabase database are always the
  source of truth. This knowledge base is a derived, human-and-AI-
  readable view of that truth — never the other way around.
- If anything in `ai/knowledge/` conflicts with the live code/database,
  the code/database wins, and the conflict should be flagged, not
  silently resolved in either direction.
- Nothing in `ai/knowledge/` grants read or write access to production
  systems by itself — actual data access happens only through
  `ai/integrations/` (not yet built as of this phase).
