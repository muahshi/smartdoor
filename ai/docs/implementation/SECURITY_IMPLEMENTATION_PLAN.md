# Security Implementation Plan

## Status

Planning only. No agent identity, permission check, or data boundary
described below has ever been enforced in code, because no runtime
exists.

## Contract This Plan Implements

`ai/core/permissions/SECURITY_MODEL.md`, `READONLY_INTEGRATION_POLICY.md`
(Phase 9, authoritative), and `SECURITY_BOUNDARIES.md`'s two Phase 11
extensions (messages carry no more access than either instance already
has; a tool is never a second path around `ai/integrations/`). None
are redefined below — this plan states how each future implementation
surface enforces what those documents already require.

## Agent Identity

A future implementation's `role_id` (the identifier every contract
document already uses — `MESSAGE_SCHEMA.md`'s `from_executive`/
`to_executive`, `EVENT_BUS.md`'s `source`) must be assigned once per
executive at a structural level (e.g. a fixed, non-runtime-editable
constant per executive), never derived from message content or
runtime-supplied input — this is the concrete implementation of
`SECURITY_MODEL.md`'s "every action attributable" constraint applied
to identity specifically: an attributable action requires an identity
that cannot be spoofed by the content being attributed.

## Agent Authorization

Every action an executive instance takes — whether reached via task
intake or via message-triggered reasoning
(`EXECUTION_FLOW.md` Phase 13A) — passes `PERMISSION_MODEL.md`'s check
independently, per `EXECUTION_PIPELINE.md` Validation Rule 3
("A permission check... still happens before that action, not skipped
because reasoning already completed"). A future implementation must
not cache or short-circuit this check across messages in the same
`conversation_id` — each action is checked on its own merits, even
within an otherwise-trusted ongoing exchange.

## Least Privilege

Per `SECURITY_MODEL.md` constraint 4, restated by
`SECURITY_BOUNDARIES.md` extension 1 for the message layer
specifically: a future implementation must structurally prevent one
executive's `Message` from expanding another executive's own
`AUTHORITY_MATRIX.md`. Concretely, this means a `RESPONSE`'s payload
is treated as *information*, never as a capability grant — the
receiving executive's permission check (above) never branches on "did
a sibling executive say this was okay."

## Founder-Only Actions

Per `APPROVAL_WORKFLOW.md` Rule 1 and `AUTHORITY_STANDARD.md`'s
universal rows: a future implementation must structurally prevent any
executive — including CEO — from setting an `ApprovalRequest`'s
`decision` field. The concrete implementation requirement: whatever
future write path updates that field must itself be reachable only by
a founder-authenticated action, never by any executive-instance code
path, mirroring the same "no other code path exists" enforcement
principle `SECURITY_BOUNDARIES.md`'s own Validation Rules section
already states for its two extensions.

## Financial Data

Per `EVENT_CATALOG.md`'s repeated banding rule (`payment.received`,
`payment.failed`, `refund.requested`, `revenue.anomaly`,
`cashflow.risk` all specify "amount band, never exact figure, in the
event payload"): a future implementation's event-emission code must
band financial magnitudes before they ever reach an event payload —
not band them for display while storing exact figures underneath. The
banding is a data-minimization step applied at write time, not a
read-time redaction that could be bypassed by a future consumer
querying the underlying table directly.

## Customer Data

Per `EVENT_CATALOG.md`'s `customer.complaint` entry ("never carries
the customer's raw message text... a reference the recipient can look
up through the existing `ai/integrations/` read-only gate, not the
content itself") and `SECURITY_BOUNDARIES.md`'s customer-data
boundary: a future implementation must emit references (IDs, category
labels), never raw customer content, in any event or message payload.

## Technical Secrets

Per `EVENT_CATALOG.md`'s `product.bug` entry and `security.incident`
entry (both explicitly exclude stack traces, credentials, exploit
detail, and raw log lines from payloads): a future implementation's
error-handling path that produces `error.raised` or `security.incident`
events must sanitize before emission — category and severity only, per
those events' own documented minimum payloads.

## Production Credentials

Per `PRODUCTION_BOUNDARY.md`: no future SDOS component ever holds a
Razorpay, Twilio, Exotel, or `groq-proxy` credential. Any future SDOS
Groq path (per `TOKEN_BUDGETING.md`'s and `RATE_LIMITING.md`'s own
explicit "never a request that reuses... `groq-proxy`'s own numbers"
principle) requires its own separately-provisioned credential, never a
shared one — this is the concrete implementation of least-privilege
applied to secrets specifically.

## Read-Only Integrations

Per `READONLY_INTEGRATION_POLICY.md` (authoritative) and
`SECURITY_BOUNDARIES.md` extension 2: any future tool
(`TOOL_REGISTRY.md`) that reads SmartDoor production data must itself
be implemented as, or exclusively call through, `ai/integrations/` —
a future implementation must not give a tool its own direct database
connection string or API credential; the tool registry entry is a
reference to an integration capability, never an independent access
path.

## Write Operations

Per `PRODUCTION_BOUNDARY.md`'s "What SDOS May Eventually Write"
section: the only write path a future implementation may build in
this phase's scope is to SDOS's own isolated event/message table
(`EVENT_BUS_IMPLEMENTATION_PLAN.md` Option E). Structural enforcement:
that table's write grant should be scoped to a role that has no grant
on any existing production table — the same "structural, not policy"
principle `SECURITY_BOUNDARIES.md`'s Validation Rules section already
requires, applied concretely via database-level permission grants
rather than application-code discipline alone.

## What This Plan Does Not Do

- Does not choose a specific RLS policy syntax, IAM role name, or
  secret-storage mechanism — those are implementation-phase decisions.
- Does not add a new security boundary beyond the two
  `SECURITY_BOUNDARIES.md` already specifies — every item above is an
  implementation of an existing boundary, not a new one.

## Dependencies

- `SECURITY_MODEL.md`, `READONLY_INTEGRATION_POLICY.md` (authoritative)
- `SECURITY_BOUNDARIES.md`
- `EVENT_CATALOG.md` (per-event payload minimization rules)
- `PRODUCTION_BOUNDARY.md` (this folder)
- `APPROVAL_WORKFLOW.md`, `FOUNDER_APPROVAL_FLOW.md`
- `RATE_LIMITING.md`, `TOKEN_BUDGETING.md`
