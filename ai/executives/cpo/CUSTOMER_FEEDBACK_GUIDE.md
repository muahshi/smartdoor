# Customer Feedback Guide

No standard — role-specific domain playbook. The triage playbook for
`feature_requests`, `bug_reports`, and `feedback_logs` — and, critically,
the boundary between the CPO's product-value lens and the CTO's/COO's
adjacent ownership of the same or related tables.

## The Real Tables and Functions

- **`feature_requests`** (`status`, `upvotes`, `priority`,
  `admin_notes`) — triaged today via `setFeaturePriority()` and
  `upvoteFeature()` in `services/customerGrowth.js`.
- **`bug_reports`** (`severity`: low/medium/high/critical; `status`:
  open/investigating/fixed/wontfix; `assigned_to`; `resolved_at`;
  `admin_notes`; `device_info` JSONB) — triaged today via `assignBug()`
  and `resolveBug()` in `services/customerGrowth.js`.
- **`feedback_logs`** — general star-rating feedback, read by
  `first_100_dashboard_view`'s `avg_product_satisfaction`.

## The Boundary (Explicit, Because Three Roles Touch Adjacent Tables)

| Table/Function | CPO's Role | Who Else Touches It, and How |
|---|---|---|
| `feature_requests` | Recommends `priority`/`status` from a product-value lens (demand, segment fit, strategic alignment) | CTO estimates technical feasibility once a feature is prioritized (`ai/executives/cto/RESPONSIBILITIES.md` §7) |
| `bug_reports` | Recommends a *product-priority* ranking (customer/business impact) | CTO owns `severity`/technical triage and the actual fix (`ai/executives/cto/RESPONSIBILITIES.md` §6, Bug Triage) — the CPO never overrides a CTO severity call |
| `support_tickets` (adjacent, not owned by CPO) | Reads for context only (a support pattern might reveal an unfiled feature gap) | COO owns ticket resolution end-to-end (`ai/executives/coo/RESPONSIBILITIES.md` §4) |
| `feedback_logs` | Reads as a general satisfaction signal | Shared background context; no single owner claims it exclusively |

## Triage Flow (CPO's Recommendation-Only Steps)

1. Pull new/unreviewed rows from `feature_requests` and `bug_reports`.
2. For `feature_requests`: apply `PRIORITIZATION_FRAMEWORK.md`, draft a
   recommended `priority`.
3. For `bug_reports`: draft a recommended *product-priority* ranking
   (separate from `severity`, which stays the CTO's field to set) —
   e.g. "low technical severity, but affects the onboarding flow every
   new customer sees first, so recommend addressing before the next
   release."
4. Route both drafts to the founder/CTO for approval — never execute
   directly (`AUTHORITY_MATRIX.md`).

## What This Guide Is Not

- Not authority to call `assignBug()`, `resolveBug()`,
  `setFeaturePriority()`, or `upvoteFeature()` directly.
- Not a redefinition of `bug_reports.severity`'s meaning — that field
  stays the CTO's technical-severity scale.
