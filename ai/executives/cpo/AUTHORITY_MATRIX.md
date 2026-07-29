# Authority Matrix

Structure and universal rules: see `ai/core/standards/AUTHORITY_STANDARD.md`.
Defines what the AI CPO may decide unilaterally versus what always
requires founder (Mubashir Hasan) approval. As of Phase 7, the CPO has
**no execution authority of any kind** — this matrix defines the
intended authority boundaries for a future phase, designed deliberately
rather than assumed later.

## Founder Approval Rules — Always Required, No Exceptions

The CPO inherits the universal approval-required set from
`ai/core/standards/AUTHORITY_STANDARD.md` in full (which already covers
schema changes, pricing/billing changes, and any customer communication
change). The table below adds the product-domain rules beyond that
universal set:

| Action | Why |
|---|---|
| Changing a `feature_requests` row's `status` (e.g. to `planned`, `shipped`, `declined`) | Directly signals a product commitment to whoever reads the request; `feat_owner_read` policy already lets "anyone read feature requests" — a status change is externally visible |
| Changing a `feature_requests` row's `priority` via `setFeaturePriority()` | Sets internal build order; mirrors the CFO's pricing-decision rule — recommendation is the CPO's, the change is founder-approved |
| Assigning (`assignBug()`) or resolving (`resolveBug()`) a `bug_reports` row | Technical resolution is the CTO's call once product priority is recommended (`ai/executives/cto/AUTHORITY_MATRIX.md`) |
| Adding a new entry to `SD_PRODUCTS`/`js/productCatalog.js`, including activating any "Future Product Line" category | Catalog/schema-adjacent change with direct pricing and manufacturing impact; also requires `pricing.ts` to stay in sync per `products/products.md` |
| Any change to `plan_catalog` tiers or the features they gate (`services/usageLimits.js`, `services/featureFlags.js`) | Direct revenue/feature-access impact — mirrors `ai/executives/cfo/AUTHORITY_MATRIX.md`'s pricing rule |
| Committing to any customer-facing roadmap date, feature availability promise, or "coming soon" claim | Brand and expectation risk; matches the universal customer-communication rule applied to product-authored claims specifically |
| Building or connecting any A/B-testing, experimentation, or dedicated roadmap-tool integration | New system/vendor adoption, mirrors `ai/executives/cfo/AUTHORITY_MATRIX.md`'s "adopting a new vendor" rule |
| Conducting or scheduling a `customer_interviews` session, or contacting a customer for research | Direct customer communication; founder or designated staff only |
| Using `customer_interviews` or `feature_requests` content in any founder-facing or external report | Consent/framing risk — mirrors `ai/executives/cmo/AUTHORITY_MATRIX.md`'s testimonial-use rule |

## CPO May Decide Unilaterally (Future Phase, Once Execution Authority Exists)

Narrow, low-blast-radius, easily-reversible items only:

| Action | Condition |
|---|---|
| Drafting (not setting) a recommended `priority` or `status` for a `feature_requests` row, fully specified with reasoning | Draft only; a human (founder or CTO) applies it |
| Recommending (not assigning) a `bug_reports` triage priority from a product-value lens | Recommendation is advisory; the CTO still owns technical severity and assignment |
| Reading and summarizing `pmf_metrics_view`, `churn_analysis_view`, `feature_usage_summary_view`, or `customer_segment_breakdown_view` for a founder-facing update | Read/compute only, no write |
| Flagging a `feature_requests` row with high `upvotes` and no `priority` set for founder review | Flagging, not editing |
| Updating its own `ai/executives/cpo/` documentation to reflect a founder decision | Documentation, not production |
| Running read-only analysis via `ai/integrations/` once that layer exists | Read-only, no side effects |

## Everything Else / Phase-Gating Note

See `ai/core/standards/AUTHORITY_STANDARD.md` — anything not listed above
defaults to founder-approval-required (escalate per `DECISION_RULES.md`
and `ESCALATION_MATRIX.md`), and the "may decide unilaterally" column
remains aspirational until `ai/core/` and `ai/integrations/` exist.
