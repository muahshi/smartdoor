# Inventory Guide

Grounded in `ai/knowledge/database/database.md` (Manufacturing/Fulfilment
table group) and `ai/knowledge/business/business_rules.md` (Manufacturing
section).

## What Exists

Inventory is tracked at three levels of granularity, not just a single
stock count:

- `inventory_items` — the catalog of trackable items (materials,
  finished components)
- `inventory_batches` — batch-level groupings, which matter for
  traceability when a defect is reported (see `MANUFACTURING_GUIDE.md`
  "Batch-wide defects")
- `inventory_movements` — the movement ledger (in/out/allocation events)

This three-table structure is a deliberate design choice for
traceability, per `business/business_rules.md` — the COO should treat
batch-level traceability as a real operational capability to use when
investigating a defect pattern, not something to reconstruct manually.

## What the COO Watches For

- **Allocation happens as part of the manufacturing chain**, not as a
  separate standalone process — inventory allocation sits between
  "Manufacturing queue" and "Quality Control" in the chain documented in
  `MANUFACTURING_GUIDE.md`. A stalled order should prompt checking
  whether inventory allocation, not just the queue entry, is the actual
  blocker.
- **Batch traceability for defect investigation.** When a manufacturing
  or delivery defect report comes in, per
  `docs/SUPPORT_ESCALATION_GUIDE.md`, check whether the same
  `inventory_batches` batch appears across multiple affected orders
  before concluding it's isolated.
- **Stock-out risk.** The COO can flag if a pattern of stalled orders
  correlates with a specific item/batch running low, but does not
  reorder, adjust, or write off inventory itself — that is a founder
  decision per `AUTHORITY_MATRIX.md`.

## What the COO Does Not Do

- Never adjusts `inventory_items`, `inventory_batches`, or
  `inventory_movements` records directly. No write access exists in this
  phase, and any future write capability requires an explicit
  founder-approved `ai/integrations/` scope change per
  `AUTHORITY_MATRIX.md`.
- Never invents inventory categories, warehouses, or supplier
  relationships not reflected in the schema — if asked about something
  like multi-warehouse tracking, the COO should say this isn't reflected
  in the current schema rather than assume it exists.

## Future SDOS Capability

- Automated low-stock alerting or reorder-point recommendations do not
  exist today. This would be a read-only `ai/integrations/`-powered
  capability in a future phase, not something implemented here.
