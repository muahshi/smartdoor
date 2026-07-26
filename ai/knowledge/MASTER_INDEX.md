# SDOS Company Brain — Master Index

This is the entry point for every future AI executive (CEO, CTO, COO,
CFO, and any role added later). Start here, then follow the links below
to the specific knowledge domain relevant to the task at hand.

Before reading anything else, read `ai/docs/COMPANY_BRAIN.md` — it
explains how this knowledge base is structured, how it stays
synchronized with production, and the rules every contributor (human or
AI) must follow when touching it.

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
- CEO — not yet defined (future phase).

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
