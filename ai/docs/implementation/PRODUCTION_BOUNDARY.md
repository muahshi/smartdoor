# Production Boundary

## Status

Planning only. Documents the boundary a future implementation must
respect. This document itself reads no production data and writes
nothing.

## Contract This Plan Implements

`ai/core/permissions/SECURITY_MODEL.md` and
`ai/core/permissions/READONLY_INTEGRATION_POLICY.md` (Phase 9,
authoritative), extended by `SECURITY_BOUNDARIES.md`'s two Phase 11
additions. `EVENT_BUS.md` Delivery Contract Rule 4 ("the bus has no
side effects on SmartDoor's production systems") and `EVENT_CATALOG.md`'s
per-event "Required permissions" columns are the concrete instances of
this boundary already specified per event type. None of these are
redefined below — this document only collects the boundary into one
place for Phase 13B's implementation-planning purpose.

## What SDOS May Eventually Read

Exclusively through `ai/integrations/`'s existing read-only gate
(`READONLY_INTEGRATION_POLICY.md`), never a direct database or API
connection from `ai/`:

- Order/commerce table references (for `order.created`,
  `payment.received`/`failed`, `refund.*` events per `EVENT_CATALOG.md`)
- Support/messaging table references (for `customer.complaint`)
- Operational/logistics references (for `manufacturing.delay`,
  `shipping.delay`, `installation.delay`)
- Bug-tracking references (for `product.bug`)
- Customer-feedback references (for `feature.requested`)
- Analytics references (for `marketing.campaign.result`)

Every read above is already marked, in `EVENT_CATALOG.md`, as a
**Future SDOS Capability** — none of these read paths exist today, and
this document does not create them.

## What SDOS May Eventually Write

A future SDOS-owned event/message table (per
`EVENT_BUS_IMPLEMENTATION_PLAN.md`'s Option E recommendation) — and
nothing else. SDOS never writes to any existing SmartDoor production
table (orders, subscriptions, plates, users, admin_users, or any table
in `sql/01_schema.sql` through the current highest-numbered migration).
This is not a new restriction — it restates `EVENT_BUS.md` Delivery
Contract Rule 4 and `SECURITY_MODEL.md` constraint 1, applied
concretely to this phase's proposed table.

## What Requires Founder Approval

Per `APPROVAL_WORKFLOW.md` and `FOUNDER_APPROVAL_FLOW.md`, unchanged:
any action an executive's own `AUTHORITY_MATRIX.md` marks as requiring
approval, resolved through the existing `AWAITING_APPROVAL` →
`ApprovalRequest` → founder-decision flow those two documents already
specify in full. This document adds no new approval-required category
— every category that would apply to a future SDOS action is already
enumerated in the six executives' own authority matrices and
`AUTHORITY_STANDARD.md`'s universal rows.

## What Must Never Be Modified Automatically

- Any existing SmartDoor production table (customer, order, payment,
  subscription, admin, auth data)
- Any existing Supabase Edge Function's deployed code
- Any existing SQL migration file (per `NAMING_STANDARD.md`'s
  never-edited-after-landing convention — a future SDOS-related change
  is always a new, additive migration, never an edit to
  `sql/01_schema.sql` through the current highest number)
- `groq-proxy`'s existing rate-limit bucket, credential, or endpoint
  (per `RATE_LIMITING.md`'s explicit independent-bucket requirement)
- Any Razorpay, Twilio, Exotel, or Groq credential or webhook
  configuration
- Any existing Supabase Realtime channel currently carrying
  customer-facing traffic (WebRTC signaling, presence, notifications)
  — a future SDOS event channel is additive and separate, never a
  reuse of an existing channel

## What Production Systems Remain Source of Truth

Per `ai/knowledge/MASTER_INDEX.md`'s existing Ground Rules: "SmartDoor's
actual codebase and Supabase database are always the source of truth.
This knowledge base is a derived, human-and-AI-readable view of that
truth — never the other way around." Applied to this phase
specifically: any future SDOS event or message record is a *reference*
to production state at the time it was read, never an independent copy
production must reconcile against. If a future SDOS event payload and
the live production data it references ever disagree, production wins,
and the disagreement is itself worth a future `system.incident` or
`error.raised` event — never silently resolved in either direction.

## Dependencies

- `ai/core/permissions/SECURITY_MODEL.md`,
  `READONLY_INTEGRATION_POLICY.md` (authoritative)
- `SECURITY_BOUNDARIES.md`, `EVENT_BUS.md`, `EVENT_CATALOG.md`
- `EVENT_BUS_IMPLEMENTATION_PLAN.md` (the one future write path this
  document authorizes in principle, not in detail)
- `SECURITY_IMPLEMENTATION_PLAN.md` (this folder — how this boundary
  is enforced structurally, not just documented)
- `ROLLBACK_STRATEGY.md` (this folder — confirms every system listed
  under "must never be modified automatically" is unaffected by
  disabling SDOS entirely)
