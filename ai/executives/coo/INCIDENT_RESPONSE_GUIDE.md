# Incident Response Guide (Operational)

This guide covers **operational** incidents — stalled fulfilment, missed
SOS notifications, manufacturing batch defects, support-pattern spikes.
It is grounded in `OPERATIONS_RUNBOOK.md` §5 (Incident Documentation) and
`docs/SUPPORT_ESCALATION_GUIDE.md`. **Infrastructure incidents**
(deployment failures, database issues, integration outages) remain the AI
CTO's domain per `ai/executives/cto/BUG_TRIAGE_GUIDE.md` — see
`INTER_EXECUTIVE_COMMUNICATION.md` for how the two roles coordinate when
an incident spans both.

## What Counts as an Operational Incident

- SOS/emergency-related malfunction (visitor flow failed to fan out an
  alert, family member not notified) — always P0, per
  `docs/SUPPORT_ESCALATION_GUIDE.md`.
- Security concern reported by a customer (plate/QR accessed by someone
  unrecognized, deactivated plate still resolving, data exposure across
  accounts) — always P0/P1.
- Payment taken, product not delivered or not working, past the point of
  patience — escalate immediately per `SUPPORT_RUNBOOK.md` §2.
- Manufacturing or delivery defect affecting more than one customer —
  check for a batch-wide pattern before treating as isolated, per
  `docs/SUPPORT_ESCALATION_GUIDE.md`.
- Repeat issue: same customer, more than one ticket in 90 days — the
  first fix didn't hold; escalate for a second opinion rather than
  repeating the same fix.

## Incident Documentation Standard (from `OPERATIONS_RUNBOOK.md` §5)

For any P0/P1 operational incident:

1. Record: what happened, when detected, when resolved, root cause, fix
   applied.
2. Add to the running incident log (`docs/INCIDENT_LOG.md`).
3. If customer-impacting, prepare a brief customer communication for a
   human to send via Resend/WhatsApp — the COO drafts, per
   `AUTHORITY_MATRIX.md`.
4. Add a regression check or monitoring signal to catch it earlier next
   time — recommend to the CTO, don't implement directly.

## What "Escalate" Actually Means (from `docs/SUPPORT_ESCALATION_GUIDE.md`)

Escalating and leaving an issue in the same queue with a higher priority
tag accomplishes nothing. A real escalation:

1. Sets a real reason, not just "urgent" — explain what's actually
   wrong.
2. Is assigned to someone with authority to fix the root cause.
3. Considers whether it should also become a `bug_reports` entry — a
   single customer's symptom might be a wider product problem.
4. Is followed up with the customer directly once resolved — an
   escalated issue that closes silently teaches customers that
   complaining loudly is the only way to get attention.

## Weekly Health Signals (from `docs/SUPPORT_ESCALATION_GUIDE.md`)

Pull `getSupportHealthMetrics()` weekly and watch:

- **avgResolutionHours rising** → either volume outpaced staffing, or
  tickets are getting harder (usually a product problem, not a support
  problem).
- **escalatedTickets rising** → check if concentrated in one category
  (manufacturing, delivery, technical) before assuming it's random.
- **repeatIssueCustomers > 0** → each one is a customer whose first fix
  failed; call them, don't just close the second ticket the same way.

## What the COO Does Not Do

- Never declares an incident resolved or closes an incident log entry
  unilaterally — see `AUTHORITY_MATRIX.md`.
- Never contacts a customer directly during an incident — drafts only.
- Never performs the technical rollback described in
  `OPERATIONS_RUNBOOK.md` §2 — that is a CTO action; the COO's job is
  recognizing the operational symptom and routing it correctly.
