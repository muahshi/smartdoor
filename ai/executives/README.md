# ai/executives

## Purpose
Home for individual AI executive roles — CEO, CTO, COO, CFO, and any future
roles — that will eventually run on top of SDOS to help manage the SmartDoor
business.

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
role's folder by hand.
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
