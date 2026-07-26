# Cash Flow Guide

How the AI CFO reasons about cash moving through SmartDoor, grounded in
`services/payments.js`, `services/webhooks.js`, `refund_ledger`, and the
commission settlement engine.

## Inbound: Payment Capture

```
Checkout (hardware or subscription)
  → create-razorpay-order / create-subscription-order Edge Function
    (server-authoritative pricing, per pricing.ts / plan_catalog)
  → Razorpay checkout (customer pays)
  → verify-razorpay-payment confirms payment server-side
  → orders / subscriptions row updated
  → razorpay-webhook reconciles asynchronously as a safety net,
    independent of the client-side flow (payment.captured,
    subscription.charged)
```

Per `ai/knowledge/business/business_rules.md`: never trust a
client-reported payment status alone — the webhook is the authoritative
reconciliation source. The CFO applies this same rule when reasoning
about "did we actually get paid."

## Outbound: Refunds

```
Refund approved (per docs/legal/refund-policy.md, or founder exception)
  → razorpay-refund Edge Function
  → refund.created webhook event
  → refund_ledger entry (auditable — not just a status flag)
  → dealer_commissions reversal trigger, if the refunded order had an
    attributed commission (sql/60_partner_commission_settlement_engine_phase8c3.sql)
```

The CFO's role here is to verify a refund is fully reconciled — a
`refund_ledger` entry exists, and any related commission was correctly
reversed — not to approve the refund itself (see `AUTHORITY_MATRIX.md`).

## Outbound: Partner Commission Settlement

```
Order paid → commission calculated (commission_rules trigger on orders)
  → dealer_commissions entry (status: pending)
  → periodic review → approved → settlement batch
    (commission_settlement_batches) → paid
  → if the underlying order is later refunded: commission entry is
    reversed/cancelled, not left standing
```

## Reconciliation Checklist (What the CFO Would Verify)

- Every `orders` row with `payment_status = 'paid'` has a corresponding
  `webhook_events` entry for `payment.captured`.
- Every `refund_ledger` entry traces back to a `razorpay-refund` call
  and a `refund.created` webhook.
- No `dealer_commissions` row remains `approved` or `paid` against an
  order that was subsequently refunded without a reversal entry.
- `webhook_events` shows no unprocessed/failed events older than the
  5-second response window Razorpay expects (a stuck webhook is a
  reconciliation risk, not just an infra concern — coordinate with the
  CTO per `INTER_EXECUTIVE_COMMUNICATION.md`).

## What This Guide Is Not

- Not a bank-reconciliation or accounting-close process — SmartDoor has
  no general ledger (see `FINANCIAL_MODEL.md`); this guide covers
  transactional reconciliation only.
- Not evidence of any live bank or Razorpay dashboard access — the CFO
  reasons from the schema and existing service code, and (in a future
  phase) `ai/integrations/`.

## Future SDOS Capability

- Automated daily reconciliation report (paid vs. webhook-confirmed vs.
  refunded, with any mismatch flagged).
- A cash-position view combining Razorpay settlement timing with
  commission payout schedules — not built today.
