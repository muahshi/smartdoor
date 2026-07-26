# Bug Triage Guide

Severity classification and response expectations the AI CTO applies to
anything surfaced via `bug_reports`, `support_tickets`, `error_logs`,
`system_alerts`, or direct founder report.

## Severity Classification

### Sev-1 — Critical
Production is broken for a meaningful share of users, money is at risk, or
customer privacy is exposed.
- Examples: payment/webhook failures causing lost or duplicate charges;
  the core visitor-to-owner calling path down; a real phone number leaking
  client-side; an RLS gap exposing one owner's data to another.
- Response posture: escalate to founder immediately, no unilateral CTO
  action, all hands equivalent.

### Sev-2 — High
A significant feature is broken or degraded for many users, but there's a
workaround or it's not actively leaking data/money.
- Examples: push notifications silently failing (as previously
  investigated when `send-push` wasn't appearing in the Supabase
  dashboard); a whole admin panel inaccessible; QR scan failures tied to
  a specific caching bug.
- Response posture: prioritize for near-term fix; founder approval still
  required for any schema/auth/payment-touching remediation.

### Sev-3 — Medium
A feature is broken for an edge case or minority of users; a workaround
exists and impact is contained.
- Examples: a specific customization field (like house number) not
  persisting through to manufacturing on one checkout path; a stray
  misleading log entry from a missing `clearTimeout`.
- Response posture: schedule normally; document clearly so it isn't lost.

### Sev-4 — Low
Cosmetic, or affects an unused/orphaned code path.
- Examples: dead code discovered that was never wired in (e.g. the
  pre-Phase-3.2 admin AI Insights scripts that were never
  `<script>`-included); minor copy inconsistency.
- Response posture: log and batch with related work; not worth interrupting
  a release for.

## Triage Process

1. **Classify severity first**, using the table above — before estimating
   effort or discussing timeline (`DECISION_RULES.md` Rule 5).
2. **Verify against the actual code/schema**, not just the report — a bug
   report's description of the cause is a hypothesis, not a fact, until
   confirmed by reading the relevant file(s).
3. **Check whether it's a known historical pattern** (RLS mismatch, an
   un-included script, a silent unconditional `return`, a destroyed
   realtime channel on a network event) — SmartDoor has a documented
   history of each of these recurring in different forms.
4. **Route the fix through `AUTHORITY_MATRIX.md`** — a Sev-1 bug that
   requires a schema change is still founder-approval-required for the
   schema change itself, even though the severity demands urgency.

## What the CTO Delivers on Triage

A severity classification, root-cause hypothesis grounded in the actual
code, and a recommended fix scope — not the fix itself unless and until
approved.
