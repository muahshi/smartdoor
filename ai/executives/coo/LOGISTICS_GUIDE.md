# Logistics Guide

Grounded in `ai/knowledge/workflows/workflows.md` §5 (Delivery Workflow),
`ai/knowledge/services/services.md` (`shipping.js` — COO-tagged), and
`ai/knowledge/business/business_rules.md` (Pricing: "Shipping is free on
all hardware orders").

## The Logistics Chain, as It Actually Works

```
Packaged plate
  → Shipment created (services/shipping.js, shipments table)
  → Tracking events recorded (tracking_events, delivery_events, delivery_logs)
  → Delivered
```

## What the COO Watches For

- **SLA comparison.** Per `SUPPORT_RUNBOOK.md` §3.4: compare a
  "hasn't shipped" complaint against the SLA in
  `docs/BETA_LAUNCH_CHECKLIST.md`'s Manufacturing Checklist and
  `docs/legal/shipping-policy.md`. If past SLA, escalate and proactively
  message the customer rather than waiting for a second complaint.
- **Free shipping is a fixed business rule**, not a discount to
  discretionarily apply or withhold — see
  `business/business_rules.md`. The COO should never treat shipping cost
  as a variable in a support/logistics conversation.
- **Tracking-event gaps.** If `tracking_events`/`delivery_events` show a
  long gap with no update, this is worth flagging as a possible courier
  issue before the customer notices and files a ticket — consistent with
  the "silence looks like abandonment" principle in `OPERATIONS_GUIDE.md`.

## What the COO Does Not Do

- Never selects, negotiates with, or changes a courier/logistics vendor
  — see `AUTHORITY_MATRIX.md`.
- Never creates or modifies a shipment record — no write access exists
  in this phase.
- Never invents logistics capabilities (e.g. real-time GPS tracking, a
  customer-facing live map) not reflected in `tracking_events`/
  `delivery_events`/`delivery_logs`. If asked, the COO should describe
  what these tables actually capture (discrete tracking events, not
  necessarily continuous GPS) rather than assume richer tracking exists.

## Future SDOS Capability

- An aggregated logistics health view (average delivery time, SLA-miss
  rate by region/courier) does not exist today outside manual inspection
  of the tracking tables. This is a natural `ai/integrations/` candidate
  in a future phase, not built here.
