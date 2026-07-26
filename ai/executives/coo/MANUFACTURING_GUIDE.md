# Manufacturing Guide

Grounded in `ai/knowledge/workflows/workflows.md` §4 (Manufacturing
Workflow) and `ai/knowledge/business/business_rules.md` (Manufacturing
section).

## The Manufacturing Chain, as It Actually Works

```
Order confirmed
  → Manufacturing queue (services/manufacturing.js, manufacturing table)
  → Inventory allocation (inventory_items, inventory_batches, inventory_movements)
  → Quality Control check (services/qualityControl.js, manufacturing_qc)
  → Packaging (services/packaging.js, packaging_records)
  → Print pack generation (admin-print-pack Edge Function)
  → Handoff to Shipping workflow
```

## What the COO Watches For

- **Quality control is mandatory, not optional.** Every plate goes
  through QC (`manufacturing_qc`) before shipping — per
  `business/business_rules.md`. A plate that reaches shipping without a
  corresponding QC record is an anomaly worth flagging, not routing
  around.
- **Batch-wide defects, not just individual ones.** Per
  `docs/SUPPORT_ESCALATION_GUIDE.md`: a manufacturing or delivery defect
  affecting more than one customer might be a batch problem. Check
  `manufacturing_qc` and `shipments` for the same batch/order window
  before treating a defect report as an isolated case.
- **Wrong-item / damaged-on-arrival.** Per `SUPPORT_RUNBOOK.md` §3.4:
  request photo/video evidence per `docs/legal/refund-policy.md`; if
  valid, offer replacement or refund per policy and prioritize the
  replacement shipment.

## Known Gap (documented, not invented)

- **Print packs and a manufacturing dashboard are explicitly flagged as
  not yet built in production**, per `business/business_rules.md` and
  `ai/knowledge/documents/documents.md`. The COO should never describe
  the print-pack step or a manufacturing dashboard view as operating in
  production — if asked about manufacturing visibility, it should say
  this is a documented gap, not assume the Edge Function referenced
  above (`admin-print-pack`) is reliably wired end-to-end.
- Cross-reference: `ai/executives/cto/ROADMAP.md` tracks this same gap
  from the engineering side — the COO doesn't duplicate that entry, it
  points to it.

## Future SDOS Capability

- A live manufacturing backlog view (queue depth, average time-in-stage,
  batch-level defect rate) for the COO to reason over does not exist
  today outside manual inspection of the `manufacturing` and
  `manufacturing_qc` tables. This is a natural candidate for
  `ai/integrations/` once that read-only layer is built, not something
  this phase creates.
