# Integration: Razorpay

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. Extends an existing production integration — see below.

## Purpose

SmartDoor's real payment processing already runs entirely through
Razorpay: `services/payments.js` (frontend bridge) and
`supabase/functions/create-razorpay-order/`, `razorpay-webhook/`,
`razorpay-refund/`, `verify-razorpay-payment/`,
`verify-subscription-payment/` (server-side, secret-key-holding). This
integration would give a future CFO-flavored SDOS capability read-only
visibility into payment/subscription **status** — never order creation,
capture, or refund, which remain exclusively Razorpay-secret-key
operations inside the existing Edge Functions.

## Supported Capabilities (Future, Documented Only)

- Read payment status for a specific order (paid / pending / failed),
  mirroring what `payment_status` already stored in `orders` (readable
  via the `supabase/` integration, not a second path to Razorpay
  directly) already tells production code.
- Read subscription renewal/grace-period status already computed by
  `services/renewalEngine.js` and `services/gracePeriod.js`.
- Read refund status (not initiate one) for a specific order, mirroring
  `razorpay-refund`'s own recorded outcome.

## Read-Only Access Policy

Governed by `ai/integrations/READONLY_POLICY.md`. This is the
integration where the read/write boundary matters most, given real
money is involved. A future SDOS Razorpay read:
- Never creates an order (`create-razorpay-order`'s exclusive job).
- Never captures or verifies a payment (`verify-razorpay-payment`'s
  exclusive job).
- Never issues a refund (`razorpay-refund`'s exclusive job).
- Never receives or processes the raw webhook (`razorpay-webhook`'s
  exclusive job as the payment source-of-truth callback).

In practice, most of what a future CFO capability needs (payment/
subscription status) is **already persisted in Supabase** by these
existing Edge Functions — so the primary future read path here likely
routes through the `supabase/` integration reading `orders` /
`subscriptions` tables, not a direct Razorpay API call at all. A direct,
read-scoped Razorpay API key is a secondary, only-if-needed future
option, not assumed necessary by this phase.

## Authentication Approach (Future)

If a direct read-scoped Razorpay API key is ever needed (see above), it
is a distinct, minimally-scoped key — never the same secret key
`create-razorpay-order` and `razorpay-refund` use to move money — held
in environment configuration only, per `SECURITY_GUIDELINES.md`
guideline 2.

## Inputs

`capability`, `requested_by`, `scope` (a specific order/subscription
ID, never an unbounded date-range payment export).

## Outputs

Status fields only (`payment_status`, `subscription_status`,
`refund_status`) — never full payment method details, card/UPI
identifiers, or raw Razorpay payload.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md`. No extension defined in
this phase.

## Error Handling

`INTEGRATION_ERROR` on any failed/timed-out read, per
`ERROR_HANDLING.md`. Given the financial sensitivity, a future
implementation should additionally never silently retry a Razorpay-
bound write-shaped call as a "recovery" from a read failure — recovery
here is always "re-attempt the read," never "attempt the adjacent
write instead."

## Security Considerations

- Read-scoped credential, distinct from the production secret key —
  restated from `SECURITY_GUIDELINES.md` guideline 2.
- No card numbers, UPI VPAs, or full payment instrument data ever
  enters SDOS's scope, matching guideline 3.
- The existing HMAC-SHA256 webhook signature verification
  (`razorpay-webhook`) is untouched and unreferenced by this
  integration — SDOS reads *results* of that verification already
  persisted, never the webhook itself.

## Rate Limits

None defined (no client exists). Razorpay's own API rate limits apply
to any future direct-API-key path; the Supabase-mediated path (reading
already-persisted status) is preferred specifically because it avoids
adding load to Razorpay's API for read-only business-intelligence
purposes.

## Future SDOS Capability

A future CFO capability could surface payment-failure or
subscription-churn trends as part of `ai/executives/cfo/`'s existing
financial-model playbooks. This is documented intent only — Phase 10
builds no code, and any future phase implementing it must satisfy every
constraint above before a single read ships.
