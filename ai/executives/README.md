# ai/executives

## Purpose
Home for individual AI executive roles — CEO, CTO, COO, CFO, and any future
roles — that will eventually run on top of SDOS to help manage the SmartDoor
business.

## Status
Empty. Phase 0 does not implement any executive. No CEO/CTO/COO/CFO agents,
personas, or decision logic exist yet.

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
