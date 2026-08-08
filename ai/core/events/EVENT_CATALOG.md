# Event Catalog

## Status

SDOS Phase 13A. **Extension, not a duplicate.** `EVENT_BUS.md` (Phase 9)
already fully specifies the event envelope (`event_id`, `event_type`,
`source`, `session_id`, `correlation_id`, `timestamp`, `payload`), the
delivery contract, and the five foundational event types this phase's
runtime components emit (`lifecycle.transition`, `task.*`,
`permission.checked`, `error.raised`, `approval.*`). This file does not
restate any of that. It adds the concrete, business-facing event
taxonomy `EVENT_BUS.md` named as a future extension point ("new event
types are additive and should follow this same schema shape") but never
enumerated. Architecture and contract only — no event below has ever
been emitted, because no runtime exists to emit one.

## Purpose

Give every future SDOS component one canonical list of business-domain
event types, so `order.created` (for example) means the same thing and
carries the same minimum payload regardless of which executive or
integration emits or consumes it.

## How to Read This Catalog

Every event below uses `EVENT_BUS.md`'s existing envelope unchanged.
Only `event_type` and `payload` differ per event; `event_id`,
`source`, `session_id`, `correlation_id`, and `timestamp` are always
present as that file already specifies. Where an event participates in
a multi-message exchange, it also carries the `conversation_id` /
`sequence_number` / `idempotency_key` fields `INTER_AGENT_PROTOCOL.md`'s
Phase 13A extension defines.

**Every event in this catalog is a Future SDOS Capability.** None of
the source systems below (Supabase tables, edge functions, Razorpay,
Twilio/Exotel) currently emit anything onto an SDOS event bus, because
no SDOS event bus is implemented. Listing an event here documents an
intended future contract; it does not create a trigger, webhook, or
listener in production today.

## Commerce Events

### `order.created`
- **Source:** Future SDOS integration reading SmartDoor's order/commerce
  tables (`ai/knowledge/database/database.md`), never a direct write path.
- **Business meaning:** A new customer order was placed.
- **Minimum payload:** order id reference, plan/product reference, amount
  band (not exact figures — see `SECURITY_BOUNDARIES.md`), timestamp.
- **Priority:** Normal.
- **Intended recipients:** COO (fulfilment), CFO (revenue).
- **Optional recipients:** CMO (campaign attribution, if tagged).
- **Required permissions:** Read-only order-domain access per
  `PERMISSION_MODEL.md`; no recipient may write back to commerce tables.
- **Expected reaction:** COO logs into fulfilment tracking context; CFO
  logs into revenue context. Neither takes automated action — Founder
  Approval Rules (`AUTHORITY_MATRIX.md`, per executive) govern anything
  beyond read/log.
- **Escalation conditions:** None by default; see `revenue.anomaly`
  below for pattern-level escalation.
- **Audit requirements:** Per `AUDIT_TRAIL.md` — every consumption
  logged, never the raw customer/order data itself in the event payload.

### `payment.received`
- **Source:** Future SDOS integration reading Razorpay-derived records.
- **Business meaning:** A payment cleared successfully.
- **Minimum payload:** order reference, payment status, amount band.
- **Priority:** Normal.
- **Intended recipients:** CFO.
- **Optional recipients:** COO (if fulfilment is gated on payment).
- **Required permissions:** Read-only financial-domain access.
- **Expected reaction:** CFO logs into cashflow context.
- **Escalation conditions:** None by default.
- **Audit requirements:** Per `AUDIT_TRAIL.md`; payment instrument
  details never appear in the payload (`SECURITY_BOUNDARIES.md`
  financial-information boundary).

### `payment.failed`
- **Source:** Same as `payment.received`.
- **Business meaning:** A payment attempt did not clear.
- **Minimum payload:** order reference, failure reason category
  (not raw gateway error text), amount band.
- **Priority:** Normal, elevated to High if the same order accumulates
  repeated failures (threshold left to a future implementation phase).
- **Intended recipients:** CFO.
- **Optional recipients:** COO, CMO (if failure pattern suggests a
  campaign-driven pricing or checkout issue).
- **Required permissions:** Read-only financial-domain access.
- **Expected reaction:** CFO logs; repeated-failure pattern is a
  `revenue.anomaly` candidate, not auto-escalated by this event alone.
- **Escalation conditions:** Repeated failures on one order/customer →
  candidate `revenue.anomaly` emission by CFO's own future reasoning,
  not by this event automatically.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

### `refund.requested`
- **Source:** Future SDOS integration reading refund-request records.
- **Business meaning:** A customer or support agent requested a refund.
- **Minimum payload:** order reference, requested amount band, reason
  category.
- **Priority:** Normal, High if amount band exceeds a founder-set
  threshold (threshold defined in a future implementation phase, per
  `FOUNDER_APPROVAL_FLOW.md`'s existing pattern for threshold-gated
  approval).
- **Intended recipients:** CFO, COO.
- **Optional recipients:** CPO (if reason category is product-quality).
- **Required permissions:** Read-only financial/operational access.
  Refund **execution** is never triggered by this event — that remains
  an existing production path, per `EVENT_BUS.md` Rule 4 ("the bus has
  no side effects on SmartDoor's production systems").
- **Expected reaction:** CFO/COO log and, if above threshold, this
  becomes a founder-approval-required matter per each executive's own
  `AUTHORITY_MATRIX.md` — never resolved by the event itself.
- **Escalation conditions:** Amount above threshold → `approval.requested`
  (`EVENT_BUS.md`, existing type).
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

### `refund.completed`
- **Source:** Same as `refund.requested`.
- **Business meaning:** A refund was actually processed (by the
  existing production system — this event only records that it
  happened).
- **Minimum payload:** order reference, amount band, completion
  timestamp.
- **Priority:** Normal.
- **Intended recipients:** CFO.
- **Optional recipients:** COO.
- **Required permissions:** Read-only.
- **Expected reaction:** CFO logs closure of the corresponding
  `refund.requested` (same `correlation_id`).
- **Escalation conditions:** None.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

## Customer & Support Events

### `customer.complaint`
- **Source:** Future SDOS integration reading support/messaging records
  (`ai/knowledge/documents/documents.md`, unified messaging).
- **Business meaning:** A customer expressed dissatisfaction through a
  support channel.
- **Minimum payload:** complaint category, severity self-report (if
  any), channel.
- **Priority:** Normal, High if severity or repeat-complaint pattern.
- **Intended recipients:** COO.
- **Optional recipients:** CPO (product-quality complaints), CMO
  (brand/reputation-risk complaints).
- **Required permissions:** Read-only; never carries the customer's
  raw message text in the event payload (`SECURITY_BOUNDARIES.md`
  customer-data boundary) — a reference the recipient can look up
  through the existing `ai/integrations/` read-only gate, not the
  content itself.
- **Expected reaction:** COO logs into support-response context.
- **Escalation conditions:** Repeated complaints on the same theme →
  `support.escalation`.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

### `support.escalation`
- **Source:** COO's own future reasoning (per `INTER_EXECUTIVE_COMMUNICATION.md`
  patterns already documented for COO), never a raw integration read.
- **Business meaning:** A support matter has crossed COO's own
  threshold for needing cross-executive or founder attention.
- **Minimum payload:** originating `customer.complaint` correlation
  id, escalation reason.
- **Priority:** High.
- **Intended recipients:** CEO (orchestration), relevant domain
  executive per `TASK_ROUTING.md`.
- **Optional recipients:** Founder-facing, per `FOUNDER_APPROVAL_FLOW.md`,
  if COO's own `AUTHORITY_MATRIX.md` requires it at this severity.
- **Required permissions:** Same as `customer.complaint`.
- **Expected reaction:** CEO applies `EXECUTIVE_ORCHESTRATION.md`
  Pattern 3 or `MULTI_PARTY_CONFLICT.md` if multiple domains disagree
  on response.
- **Escalation conditions:** Already an escalation; further escalation
  is `approval.requested` if founder sign-off is required.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

## Operations Events

### `manufacturing.delay`, `shipping.delay`, `installation.delay`
- **Source:** Future SDOS integration reading operational/logistics
  records COO already owns per `LOGISTICS_GUIDE.md` / `MANUFACTURING_GUIDE.md`
  / `INSTALLATION_GUIDE.md`.
- **Business meaning:** A stage in the order-fulfilment pipeline is
  behind its expected timeline.
- **Minimum payload:** affected stage, delay reason category, affected
  order-count band (not individual customer identities in the event
  itself).
- **Priority:** Normal, High if delay affects a threshold count of
  orders (threshold left to future implementation).
- **Intended recipients:** COO.
- **Optional recipients:** CFO (cashflow impact), CMO (if customer
  communication is needed), CPO (if root cause is a product/hardware
  defect rather than logistics).
- **Required permissions:** Read-only operational access.
- **Expected reaction:** COO logs; cross-domain notification only if
  optional-recipient criteria met.
- **Escalation conditions:** Threshold count exceeded → `support.escalation`
  candidate.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

## Product Events

### `product.bug`
- **Source:** Future SDOS integration reading bug-tracking references
  CTO already owns per `BUG_TRIAGE_GUIDE.md`.
- **Business meaning:** A defect was identified in the production
  system.
- **Minimum payload:** severity classification, affected area
  category (never a stack trace, credential, or raw log line —
  `SECURITY_BOUNDARIES.md` technical-secrets boundary).
- **Priority:** Follows CTO's own `BUG_TRIAGE_GUIDE.md` severity scale.
- **Intended recipients:** CTO.
- **Optional recipients:** COO (if customer-facing impact), CPO (if
  affects a recently shipped feature).
- **Required permissions:** Read-only technical-domain access.
- **Expected reaction:** CTO logs into its own existing triage process
  — this event never triggers automated remediation, per `EVENT_BUS.md`
  Rule 4.
- **Escalation conditions:** Per `BUG_TRIAGE_GUIDE.md`'s own severity
  escalation path — this catalog does not add a second one.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

### `feature.requested`
- **Source:** Future SDOS integration reading customer-feedback
  references CPO already owns per `CUSTOMER_FEEDBACK_GUIDE.md`.
- **Business meaning:** A customer or internal stakeholder requested
  new product capability.
- **Minimum payload:** request category, source (customer vs.
  internal).
- **Priority:** Normal.
- **Intended recipients:** CPO.
- **Optional recipients:** CTO (feasibility), CMO (market-demand
  signal).
- **Required permissions:** Read-only.
- **Expected reaction:** CPO logs into `FEATURE_PRIORITIZATION.md`
  context.
- **Escalation conditions:** None by default.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

## Marketing & Revenue Events

### `marketing.campaign.result`
- **Source:** Future SDOS integration reading CMO's own analytics
  references per `ANALYTICS_GUIDE.md`.
- **Business meaning:** A campaign concluded or hit a reporting
  checkpoint.
- **Minimum payload:** campaign reference, outcome category (not raw
  ad-spend figures in the event itself — see `revenue.anomaly` for the
  financial-magnitude case).
- **Priority:** Normal.
- **Intended recipients:** CMO.
- **Optional recipients:** CFO (spend/return context).
- **Required permissions:** Read-only marketing-domain access.
- **Expected reaction:** CMO logs.
- **Escalation conditions:** Materially underperforming result →
  candidate `revenue.anomaly` (CFO- or CMO-initiated, not automatic).
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

### `revenue.anomaly`
- **Source:** CFO's own future reasoning over `payment.failed` /
  `refund.requested` / `marketing.campaign.result` patterns — never a
  raw integration read on its own.
- **Business meaning:** Revenue is behaving outside CFO's own expected
  range per `FINANCIAL_MODEL.md`.
- **Minimum payload:** anomaly category, affected time window,
  magnitude band.
- **Priority:** High.
- **Intended recipients:** CEO, CFO.
- **Optional recipients:** Any domain executive whose area the
  anomaly's evidence implicates.
- **Required permissions:** Read-only; magnitude is a band, never an
  exact figure, in the event payload itself (`SECURITY_BOUNDARIES.md`
  financial-information boundary) — exact figures remain in CFO's own
  domain context, accessible only per `PERMISSION_MODEL.md`.
- **Expected reaction:** CEO applies `EXECUTIVE_ORCHESTRATION.md`
  Pattern 3 (two-party) or `MULTI_PARTY_CONFLICT.md` (three or more)
  if the anomaly's cause is contested across domains.
- **Escalation conditions:** Founder-approval-required per CFO's own
  `AUTHORITY_MATRIX.md` financial-threshold rules.
- **Audit requirements:** Per `AUDIT_TRAIL.md`; this is exactly the
  kind of decision `AUDIT_TRAIL.md` exists to make durably reviewable.

### `cashflow.risk`
- **Source:** CFO's own future reasoning, same basis as `revenue.anomaly`.
- **Business meaning:** Projected cash position breaches CFO's own
  `CASHFLOW_GUIDE.md` threshold.
- **Minimum payload:** risk category, projected window, magnitude band.
- **Priority:** High.
- **Intended recipients:** CEO, CFO.
- **Optional recipients:** COO (if operational spend is implicated).
- **Required permissions:** Read-only; same magnitude-banding rule as
  `revenue.anomaly`.
- **Expected reaction:** Same as `revenue.anomaly`.
- **Escalation conditions:** Founder-approval-required per
  `FOUNDER_APPROVAL_FLOW.md` — cashflow risk is exactly the class of
  decision that file's founder-notification content is built for.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

## Security & System Events

### `security.incident`
- **Source:** Any component, per `EVENT_BUS.md`'s existing
  `error.raised` pattern — `security.incident` is a distinct type
  because it carries different recipient and escalation rules than a
  generic error, not because its envelope differs.
- **Business meaning:** A security-relevant event occurred (attempted
  unauthorized access, a permission-model violation, an exposed-secret
  signal).
- **Minimum payload:** incident category, affected component category
  — never the secret, credential, or exploit detail itself.
- **Priority:** Critical, always.
- **Intended recipients:** CTO, CEO.
- **Optional recipients:** None — this event type is never optional-
  recipient-gated.
- **Required permissions:** Read-only; this event is itself exempt
  from normal domain-scoping, per `SECURITY_BOUNDARIES.md`'s existing
  "every action attributable" principle — every executive with any
  runtime presence receives a `security.incident` regardless of domain.
- **Expected reaction:** Immediate CTO triage; CEO notified in
  parallel, not sequentially after CTO.
- **Escalation conditions:** Always escalates to founder notification
  per `FOUNDER_APPROVAL_FLOW.md`'s emergency-escalation content — no
  threshold gate, unlike `revenue.anomaly` or `refund.requested`.
- **Audit requirements:** Per `AUDIT_TRAIL.md`, retained without the
  normal magnitude-banding exception — a security incident's audit
  record is never summarized away.

### `system.incident`
- **Source:** Any component.
- **Business meaning:** A non-security operational failure affecting
  SDOS's own runtime (not SmartDoor production — per `EVENT_BUS.md`
  Rule 4, SDOS has no production side effects to fail) — e.g. the
  event bus itself failing to deliver, or a runtime component stuck in
  a lifecycle state.
- **Minimum payload:** incident category, affected component.
- **Priority:** High.
- **Intended recipients:** CTO.
- **Optional recipients:** CEO (if incident affects orchestration
  itself).
- **Required permissions:** Read-only.
- **Expected reaction:** CTO triage per its own existing runtime
  troubleshooting context.
- **Escalation conditions:** Sustained or repeated → `security.incident`-
  level treatment if root cause is later found to be security-relevant.
- **Audit requirements:** Per `AUDIT_TRAIL.md`.

## Rules

1. **Every event type here follows `EVENT_BUS.md`'s existing envelope
   shape exactly** — this catalog adds `event_type` values and their
   payload/recipient meaning, never a second envelope format.
2. **No event in this catalog authorizes any action by itself** — an
   event is information propagation only, per `EVENT_BUS.md` Rule 4
   and `PERMISSION_MODEL.md`'s existing authority model. Any resulting
   action still passes its own permission check.
3. **Magnitude and identity fields are banded or referenced, never
   exact or raw, inside the event payload itself**, per
   `SECURITY_BOUNDARIES.md`'s existing data-minimization principle —
   this catalog does not loosen that rule for any event type listed
   above.
4. **This list is not exhaustive.** New event types are additive and
   must follow this same per-event documentation shape (source,
   meaning, payload, priority, recipients, permissions, reaction,
   escalation, audit) — consistent with `EVENT_BUS.md`'s own closing
   note that new types should follow its schema shape rather than
   inventing one.

## Dependencies

- `EVENT_BUS.md` (the envelope and delivery contract this catalog's
  every entry uses unchanged)
- `INTER_AGENT_PROTOCOL.md` (Phase 13A extension — conversation/sequence
  identifiers for multi-message event-triggered exchanges)
- `SECURITY_BOUNDARIES.md`, `AUDIT_TRAIL.md`, `PERMISSION_MODEL.md`
- `MULTI_PARTY_CONFLICT.md` (Phase 13A — the escalation path when an
  event's expected reaction surfaces a three-or-more-way disagreement)

## Relationship to the Rest of SDOS

- Sits directly on top of `EVENT_BUS.md`, in the same way
  `INTER_AGENT_PROTOCOL.md` sits on top of `MESSAGE_SCHEMA.md`.
- Every "Intended recipients" entry above should agree with
  `TASK_ROUTING.md`'s existing domain-ownership table; a mismatch
  between the two is a documentation bug to fix, not a reason to
  duplicate ownership logic here.
