# CPO Roadmap

The AI CPO's own product-readiness roadmap — not SmartDoor's product
roadmap (see `PRODUCT_ROADMAP.md` for that), and not a commitment, per
`ai/core/standards/DOCUMENTATION_STANDARD.md`'s indicative-not-committed
principle.

## Near-Term (Documentation-Only, No New Systems)

1. **Add a `CPO` tag to `ai/knowledge/services/services.md`** for
   `customerGrowth.js`'s `assignBug()` / `resolveBug()` /
   `setFeaturePriority()` / `upvoteFeature()` functions, currently
   untagged. Not done in this phase — this folder was restricted to
   updating only `ai/knowledge/MASTER_INDEX.md` and
   `ai/executives/README.md`.
2. **Document the existing Android app in `ai/knowledge/`** —
   `android/` (`applicationId "in.mysmartdoor.app"`, 114 Kotlin files)
   has no entry in `features/features.md`, `pages/pages.md`, or
   `database/database.md` today. This is a real, present gap, not a
   future one — flagged here and in `README.md` per Golden Rule 5,
   not resolved in this phase (out of the stated scope for this
   build).
3. **Resolve the "Phase 7" naming collision**, flagged in `README.md`:
   `js/productCatalog.js`'s "Future Product Lines" section documents a
   "Phase 7 ecosystem" (doorbells, cameras, locks, sensors) — an
   unrelated product-catalog roadmap marker that happens to share a
   number with this SDOS build phase. Worth a deliberate decision later
   (rename one, or simply keep both documented as distinct, which this
   folder already does) — not resolved here.
4. **Resolve the `ai/core/standards/` path discrepancy** — inherited
   unchanged from `ai/executives/cmo/ROADMAP.md` item 3: every existing
   document (including this folder's own) references
   `ai/core/standards/`, but the folder physically lives at
   `/core/standards/` (repo root, outside `ai/`). Not resolved here,
   for the same reason the CMO folder didn't resolve it.
5. **Add a Product line to `ai/knowledge/company/company_profile.md`'s
   Departments list** distinct from the existing "Product/Hardware"
   line (which covers manufacturing/QC, not product-definition
   strategy) — flagged, not added, in this phase.

## Medium-Term (Real New Capability, CTO-Led)

6. **A lightweight per-feature adoption trend** — comparing successive
   `feature_usage_summary_view` snapshots over time would close the
   single biggest gap named throughout this folder
   (`PRODUCT_ANALYTICS.md`, `FEATURE_ADOPTION.md`): every
   month-over-month adoption question currently requires a manual
   re-query rather than a stored trend.
7. **An experiment-variant table** — the lowest-cost first step toward
   closing `EXPERIMENTATION_GUIDE.md`'s named gap, distinct from
   `feature_flags.js`'s existing kill-switch mechanism.
8. **A `priority`-backfill pass on aging `feature_requests` rows** —
   the lowest-cost, highest-confidence process gap identified in
   `FEATURE_PRIORITIZATION.md`.

## Longer-Term (Genuinely New Systems, Founder Decision Required)

9. **A dedicated roadmap-planning tool** — has no equivalent in the
   repository today (`PRODUCT_ROADMAP.md`).
10. **A user-research panel/recruitment system** — currently doesn't
   exist in any form (`USER_RESEARCH.md`).
11. **A full A/B-testing/experimentation platform** — no equivalent
   exists today (`EXPERIMENTATION_GUIDE.md`); establishing one is a
   standing engineering commitment, not a quick win.

## Suggestion for Phase 8: AI CEO Brain

Following this phase, the natural next phase is an **AI CEO**, built the
same way this folder was — from `ai/core/standards/ROLE_TEMPLATE.md`,
grounded in what already exists:

- **Real grounding already in the repository**: five executives
  (CTO, COO, CFO, CMO, CPO) now each define a domain but no role
  currently owns cross-domain tie-breaking — every sibling executive's
  `INTER_EXECUTIVE_COMMUNICATION.md` (including this one) names "no CEO
  executive exists yet" as an explicit, recurring gap.
- **Real boundary to define carefully**: where CEO company-wide
  prioritization authority ends and each existing executive's domain
  authority begins — the same boundary discipline every executive
  folder has maintained (`AUTHORITY_MATRIX.md`,
  `INTER_EXECUTIVE_COMMUNICATION.md`).
- **Real overlap to resolve upfront**: this folder's CPO↔CMO section
  resolves one shared-data overlap (`feature_usage_events`/
  `customer_segments`) explicitly — a CEO role should audit whether any
  further shared-data interpretation conflicts exist across all five
  executives before they compound.
- **Numbering**: should be filed as Phase 8, continuing the sequence,
  with the same explicit flag-don't-silently-resolve treatment if any
  future numbering conflict arises (as this phase did for its own
  "Phase 7" collision).
