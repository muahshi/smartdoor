# Escalation Matrix

This matrix combines the escalation path already defined in
`SUPPORT_RUNBOOK.md` §2 with the specific triggers in
`docs/SUPPORT_ESCALATION_GUIDE.md`. It does not introduce a new path — it
is the COO's reference for applying the existing one consistently.

## The Escalation Path (from `SUPPORT_RUNBOOK.md` §2)

```
Support Agent
    ↓ (cannot resolve in 30 min, or customer-impacting bug)
Ops Manager
    ↓ (requires code/infra change, security concern, or payment dispute > ₹5,000)
Super Admin / Founder
```

## Severity → Routing (from `SUPPORT_RUNBOOK.md` §2)

| Severity | Examples | Routes To | Timing |
|---|---|---|---|
| P0 — Critical | Payment lost, security breach, total outage | Super Admin/Founder | Immediately, any hour |
| P1 — High | Single customer payment issue, masked call not working | Ops Manager | Same business day |
| P2 — Medium | UI bug, slow response, minor confusion | Support Agent | Standard SLA |
| P3 — Low | Feature request, cosmetic issue | Backlog | Logged for review |

## Escalate Immediately (Same Hour) — from `docs/SUPPORT_ESCALATION_GUIDE.md`

- SOS/emergency-related malfunction
- Security concern (unrecognized plate/QR access, deactivated plate
  still resolving)
- Payment taken, product not delivered/working, customer past patience
- Data exposure concern (one customer able to see another's data)

Action: `escalateTicket(ticketId, reason)` sets `priority = critical` and
logs `escalated_reason`; notify whoever owns production issues directly
— don't wait for queue review.

## Escalate Within 24 Hours — from `docs/SUPPORT_ESCALATION_GUIDE.md`

- Repeat issue: same customer, 2+ tickets in 90 days
  (`support_health_view.repeat_issue_customers`)
- Resolution time exceeding 48 hours on a `high` priority ticket with no
  comment in the last 12 hours
- Customer explicitly requests a refund or threatens to cancel (route to
  retention owner, not just next-in-queue)
- Manufacturing or delivery defect affecting more than one customer
  (check `manufacturing_qc` and `shipments` for a batch pattern first)

## What Is NOT an Escalation — from `docs/SUPPORT_ESCALATION_GUIDE.md`

- A rude or impatient customer on a low-priority issue — handle calmly,
  don't reward tone by jumping the queue
- A feature request, however urgent-sounding — route to
  `feature_requests`
- A question you don't immediately know the answer to — that's a normal
  ticket, not an escalation

## The COO's Role at Each Level

- **Support Agent level**: the COO may draft a classification and a
  response for a human agent to review/send.
- **Ops Manager level**: the COO may flag that a ticket meets the
  criteria to escalate and draft the `escalated_reason`, but a human
  performs the actual `escalateTicket()` call and reassignment.
- **Super Admin/Founder level**: the COO surfaces the situation with full
  context and evidence — it never attempts to resolve a P0 itself.

## Cross-Reference

See `INCIDENT_RESPONSE_GUIDE.md` for what happens after an escalation
(documentation, customer communication draft, regression follow-up) and
`INTER_EXECUTIVE_COMMUNICATION.md` for when an escalation should also
route to the CTO (infrastructure root cause) in parallel.
