# Feature Prioritization Guide

No standard — role-specific domain playbook. This file is the
**operational process** for working the real `feature_requests` queue.
The underlying **scoring rubric** it applies lives in
`PRIORITIZATION_FRAMEWORK.md` — this file doesn't restate that math, it
describes the workflow around it.

## The Real Queue

`feature_requests` (`sql/11_beta_launch_schema.sql`, extended by
`sql/13_customer_growth_schema.sql`): `status` (open / planned /
in_progress / shipped / declined), `upvotes`, `priority` (low / medium /
high / critical, added later), `admin_notes`. RLS lets any authenticated
user read the full table ("Anyone can read feature requests" —
`feat_owner_read` policy), so this queue is already semi-public.

## Process

1. **Pull the open queue.** `feature_requests WHERE status = 'open'`,
   ordered by `upvotes DESC` (mirrors the existing
   `idx_features_upvotes` index) as a starting signal, never the final
   word.
2. **Cross-check against qualitative discovery.** Does this request also
   show up in `customer_interviews.requested_features`? A request
   appearing in both the public queue and structured interviews is a
   stronger signal than either alone (`PRODUCT_DISCOVERY.md`).
3. **Cross-check against usage.** If the request is about an existing
   feature, check `feature_usage_summary_view` for whether that feature
   is already heavily or lightly used (`FEATURE_ADOPTION.md`) —
   context, not a veto.
4. **Score it.** Apply `PRIORITIZATION_FRAMEWORK.md`'s rubric to produce
   a recommended `priority` value.
5. **Draft, don't set.** Recommend the `priority` (and, if warranted, a
   `status` change to `planned`) with cited reasoning — the actual
   `setFeaturePriority()` / status-update call is founder/CTO-approved
   (`AUTHORITY_MATRIX.md`).
6. **Log the reasoning**, not just the score, so a founder reviewing
   later can see why (`DECISION_RULES.md` Rule 9).

## What Prioritization Is Not

- Not a guarantee of build order — capacity and technical feasibility
  are the CTO's call (`ai/executives/cto/RESPONSIBILITIES.md` §7).
- Not a popularity contest decided by raw `upvotes` alone — see
  `PRIORITIZATION_FRAMEWORK.md` for why segment concentration matters.
- Not authority to change `status` or `priority` directly —
  recommendation only.
