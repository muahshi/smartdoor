# CMO Roadmap

The AI CMO's own marketing-readiness roadmap — not SmartDoor's product
roadmap (see `ai/knowledge/products/products.md`'s "Future Product
Lines" for that), and not a commitment, per
`ai/core/standards/DOCUMENTATION_STANDARD.md`'s indicative-not-committed
principle already applied to `ai/docs/SDOS_ARCHITECTURE.md`.

## Near-Term (Documentation-Only, No New Systems)

1. **Add a `CMO` tag to `services/services.md`** for `analytics.js`,
   `adminAnalytics.js` (alongside existing `CFO / COO`), and consider
   whether `customerGrowth.js` should be re-tagged `CMO / COO / Growth`
   given its referral/review functions are now explicitly in CMO scope
   (`RESPONSIBILITIES.md` §5, §9). Not done in this phase — this folder
   was restricted to updating only `ai/knowledge/MASTER_INDEX.md` and
   `ai/executives/README.md`.
2. **Add a Marketing line to `ai/knowledge/company/company_profile.md`'s
   Departments list** — currently absent entirely; flagged, not added,
   in this phase for the same reason.
3. **Resolve the `ai/core/standards/` path discrepancy** — every
   existing document (including this folder's own) references
   `ai/core/standards/`, but the folder physically lives at `/core/standards/`
   (repo root, outside `ai/`). Worth a deliberate decision: move it into
   `ai/core/standards/` to match every reference, or correct every
   reference to the real path. Not resolved here — flagged per
   `DECISION_RULES.md` Rule 3.

## Medium-Term (Real New Capability, CTO-Led)

4. **Channel-attribution field** — a `referral_source`/`utm_source`
   column on `orders` (or a lightweight `lead_source` table) would close
   the single biggest gap named throughout this folder
   (`ANALYTICS_GUIDE.md`, `PAID_ADS_GUIDE.md`): every marketing-ROI
   question currently ends in "not tracked."
5. **`FAQPage` structured data** for the FAQ content already on
   `index.html` — the lowest-cost, highest-confidence SEO gap identified
   in `SEO_GUIDE.md`.
6. **Sitemap completeness audit** — reconcile `sitemap.xml`'s 11 URLs
   against `ai/knowledge/pages/pages.md`'s full page inventory.

## Longer-Term (Genuinely New Systems, Founder Decision Required)

7. **A CMS/blog publishing pipeline** — has no equivalent in the
   repository today (`CONTENT_STRATEGY.md`).
8. **An ad-platform integration and ad-spend ledger** — has no
   equivalent in the repository today (`PAID_ADS_GUIDE.md`).
9. **A first social-media presence** — currently doesn't exist in any
   form (`SOCIAL_MEDIA_GUIDE.md`); establishing one is a standing
   commitment, not a quick win, and is explicitly founder-approval-gated.
10. **Structured competitor tracking** — no equivalent exists today
   (`COMPETITOR_ANALYSIS.md`).

## Suggestion for Phase 7: AI CPO (Chief Product Officer)

Following this phase's numbering correction (Phase 6 = CMO, not Phase
5), the natural next phase is an **AI CPO**, built the same way this
folder was — from `ai/core/standards/ROLE_TEMPLATE.md`, grounded in what
already exists rather than invented:

- **Real grounding already in the repository**: `products/products.md`'s
  "Future Product Lines" section (doorbells, cameras, locks, sensors —
  explicitly reserved category slots, not yet built), `feature_requests`
  (`ai/knowledge/database/database.md`'s Support domain — real,
  customer-submitted product input), and `bug_reports` as a real product-
  quality signal distinct from the COO's support-ticket handling.
- **Real boundary to define carefully**: where CPO product-definition
  authority ends and CTO implementation authority begins — the same
  boundary discipline this folder maintained between CMO strategy and
  CTO/CFO execution throughout (`AUTHORITY_MATRIX.md`,
  `INTER_EXECUTIVE_COMMUNICATION.md`).
- **Real overlap to resolve**: `customer_segments`/`feature_usage_events`
  (used by this CMO folder for growth signals) would also be core CPO
  data for product-market-fit and feature-prioritization reasoning —
  worth deciding up front which executive owns interpreting them for
  which purpose, rather than letting both claim the same view
  independently.
- **Numbering**: should be filed as Phase 7, continuing the corrected
  sequence, with the same explicit flag-don't-silently-resolve treatment
  if any future numbering conflict arises.
