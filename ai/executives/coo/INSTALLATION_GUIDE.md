# Installation Guide

Grounded in `ai/knowledge/workflows/workflows.md` §5 (Delivery Workflow)
and `ai/knowledge/database/database.md` (Manufacturing/Fulfilment table
group: `installation_jobs`, `installation_job_photos`).

## The Delivery-to-Activation Chain, as It Actually Works

```
Packaged plate
  → Shipment created (services/shipping.js, shipments table)
  → Tracking events recorded (tracking_events, delivery_events, delivery_logs)
  → Delivered
  → Customer proceeds to Activation (onboarding.html,
    js/activationWizard.js, services/activation.js)
  → activation_events logged; plate status inactive → active
```

`installation_jobs` and `installation_job_photos` sit alongside this
chain per `database/database.md`'s Manufacturing/Fulfilment table group,
tracking the physical installation step (mounting the plate) as distinct
from the software activation step (`activation_events`).

## What the COO Watches For

- **Delivered but not activated.** A plate marked `delivered` in
  `shipments`/`delivery_events` that never transitions from `inactive` to
  `active` in the plate's status is a fulfilment gap worth flagging —
  the customer has the hardware but hasn't completed onboarding. This is
  distinct from a shipping problem and should be routed as an onboarding
  follow-up, not a delivery escalation.
- **Installation vs. activation are two different steps.** A customer
  reporting "my plate doesn't work" after delivery could mean the
  physical installation wasn't completed, the software activation
  wizard wasn't completed, or both — the COO should distinguish these
  before recommending next steps, using `installation_jobs` status
  alongside `activation_events`.
- **Photo evidence.** `installation_job_photos` exists as a documented
  table; if a customer disputes installation quality or completeness,
  this is the first place to check for evidence, per the same
  evidence-first discipline used for damage claims in
  `SUPPORT_RUNBOOK.md` §3.4.

## What the COO Does Not Do

- Never schedules, reassigns, or closes an installation job directly —
  no write access exists in this phase.
- Never invents an installation process (e.g. a technician-dispatch
  system) not reflected in the schema or services. If asked about
  installer scheduling/dispatch, the COO should note this table exists
  for job/photo tracking, but no dispatch/scheduling service is
  documented in `ai/knowledge/services/services.md` — say so rather than
  assume one exists.

## Future SDOS Capability

- Automated "delivered-but-not-activated" alerting (a nudge workflow to
  the customer) does not exist today. This is a natural extension of the
  existing `services/renewalEngine.js`/`services/gracePeriod.js` pattern
  used for subscriptions, but is not built — a future SDOS Capability,
  not implemented in this phase.
