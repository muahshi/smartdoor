# Customer Support Guide

This guide does not replace `SUPPORT_RUNBOOK.md` — it is the authoritative,
production support reference and remains the single source of truth for
channels, SLAs, and issue-category workflows. This file defines how the
AI COO uses it.

## Channels & SLAs (from `SUPPORT_RUNBOOK.md` §1 — reference, not duplicated)

| Channel | Use For | SLA Target |
|---|---|---|
| In-app ticket system | All issue types (primary) | First response < 4h business hours |
| support@mysmartdoor.in | Email fallback | First response < 24h |
| WhatsApp | Urgent/active issues | First response < 1h |
| Phone | Critical escalations only | Immediate during business hours |

## Severity Classification (from `SUPPORT_RUNBOOK.md` §2)

- **P0 (Critical)** — payment lost, security breach, total outage →
  Super Admin immediately, any hour
- **P1 (High)** — single customer payment issue, masked call not working
  → Ops Manager same business day
- **P2 (Medium)** — UI bug, slow response, minor confusion → Support
  Agent, standard SLA
- **P3 (Low)** — feature request, cosmetic issue → Logged for backlog
  review

## Issue Category Workflows (from `SUPPORT_RUNBOOK.md` §3 — apply, don't reinvent)

- **3.1 Billing/Payment** — check `payment_status` before assuming the
  category; never ask a customer to "just pay again" without confirming
  the first payment's true status in Razorpay.
- **3.2 Communication/Call** — check Exotel logs, confirm Twilio
  fallback engaged; SOS-button failures are always treated as P0
  regardless of root cause.
- **3.3 Account/Access** — always route PIN resets through the secure
  reset flow, never read out or set a PIN over the phone; unauthorized
  access reports are P0/P1 and require force-expiring active sessions.
- **3.4 Shipping/Manufacturing** — check manufacturing queue status
  against SLA before escalating; request photo/video evidence for
  damage claims per `docs/legal/refund-policy.md`.
- **3.5 Technical/App** — check Sentry and `health-check` before
  assuming a customer-side issue; AI receptionist oddities are logged
  for review but not urgent unless the response was offensive or
  factually harmful.

## The COO's Role in Support

- **Draft, don't send.** The COO may draft a response using the tone
  reference in `SUPPORT_RUNBOOK.md` §4 (warm, direct, Hinglish-matching)
  for a human to review and send — it does not message customers
  directly, per `AUTHORITY_MATRIX.md`.
- **Classify, don't resolve.** The COO can apply the P0–P3 classification
  to a described situation, but the actual resolution action (refund,
  session revocation, PIN reset trigger) is executed by a human.
- **Watch for patterns.** Per `SUPPORT_RUNBOOK.md` §5: always flag a
  pattern across multiple customers (3+ tickets, same symptom, short
  window) as likely systemic rather than treating each as isolated.
- **Never promise a fix timeline** without a confirmed ETA from
  Ops/Engineering — only promise an update timeline, per `SUPPORT_RUNBOOK.md`
  §4.

## Relationship to `docs/SUPPORT_ESCALATION_GUIDE.md`

`SUPPORT_RUNBOOK.md` covers day-to-day ticket handling; the escalation
guide covers when a ticket shouldn't sit in the normal queue. See
`ESCALATION_MATRIX.md` in this folder for how the COO applies both
together.

## What This Guide Is Not

- Not a new support process. It is a pointer and application layer over
  the existing `SUPPORT_RUNBOOK.md` and `docs/SUPPORT_ESCALATION_GUIDE.md`.
- Not permission for the COO to access, modify, or close real support
  tickets in this phase.
