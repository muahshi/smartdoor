# Support Escalation Guide

Scope: when and how to escalate a `support_tickets` row using `escalateTicket()` in `services/customerGrowth.js`. This complements `SUPPORT_RUNBOOK.md` — that file covers day-to-day ticket handling; this file covers the cases that shouldn't sit in the normal queue.

---

## Escalate immediately (same hour) if:

- **SOS / emergency-related malfunction** — visitor flow failed to fan out an alert, family member didn't get notified during an actual emergency. This is a safety issue, not a support issue.
- **Security concern** — customer reports their plate or QR code appears to have been accessed by someone they don't recognize, or a deactivated plate is still resolving.
- **Payment taken, product not delivered or not working**, and the customer is past the point of patience (use judgment — tone in the ticket usually tells you).
- **Data exposure concern** — anything suggesting one customer can see another customer's family members, visitor logs, or subscription details.

For all of these: call `escalateTicket(ticketId, reason)` immediately, which sets `priority = critical` and logs `escalated_reason`. Then notify whoever owns production issues directly — don't wait for them to check the queue.

## Escalate within 24 hours if:

- **Repeat issue** — same customer has filed more than one ticket in 90 days (`support_health_view.repeat_issue_customers` flags this). The first fix didn't hold; a second attempt at the same fix usually won't either. Get a second person to look at it.
- **Resolution time exceeding 48 hours** on a `high` priority ticket with no comment added in the last 12 hours. Silence on an open ticket is itself a failure.
- **Customer explicitly asks for a refund or threatens to cancel** — these are renewal-risk signals, route to whoever owns retention, not just whoever is next in the queue.
- **Manufacturing or delivery defect** affecting more than one customer — this might be a batch problem, not an isolated case. Check `manufacturing_qc` and `shipments` for the same batch/order window before treating it as one-off.

## What "escalate" actually means — don't just relabel it

Escalating a ticket and leaving it in the same queue with a higher priority tag accomplishes nothing. When you escalate:

1. Set `escalated = true` and write a real `escalated_reason` — not "urgent," explain what's actually wrong.
2. Assign it to someone with the authority to fix the root cause, not just someone with time available.
3. If it's a product or manufacturing defect, also check whether it should become a `bug_reports` entry — a single customer's symptom might be a wider problem.
4. Follow up directly with the customer once resolved. An escalated ticket that closes silently teaches the customer that complaining loudly is the only way to get attention — which trains exactly the behavior you don't want.

## Things that are NOT escalations

- A customer being rude or impatient on a low-priority issue — handle it calmly, don't reward the tone by jumping the queue.
- A feature request, even an urgent-sounding one — route to `feature_requests`, set priority there, don't use the support escalation path to fast-track product decisions.
- A question you don't immediately know the answer to — that's a normal ticket. Escalation is for risk and repeat failure, not for "I need to look this up."

## Weekly review

Pull `getSupportHealthMetrics()` every week:

- **avgResolutionHours** rising → either ticket volume outpaced staffing, or tickets are getting harder (which usually means a product problem, not a support problem)
- **escalatedTickets** rising → check if it's concentrated in one category (manufacturing, delivery, technical) before assuming it's random
- **repeatIssueCustomers** > 0 → each one is a customer whose first fix failed. Call them, don't just close the second ticket the same way as the first.

