# Product Roadmap Guide

No standard — role-specific domain playbook. Distinct from this
folder's own `ROADMAP.md` (the CPO's *self*-readiness plan) and from
`PRODUCT_STRATEGY.md` (the *why* behind the product) — this file catalogs
the real, documented **what's-next surface** SmartDoor's own repository
already lays out, and how the CPO reasons about it.

## What's Actually Documented as "Next," Today

1. **`js/productCatalog.js`'s "Future Product Lines"** — non-`nameplate`
   categories (doorbells, cameras, locks, sensors) are explicitly
   reserved slots, designed so a new entry can be pushed into
   `SD_PRODUCTS` without touching other files, as long as it reuses the
   nameplate booking/checkout flow (`products/products.md`). No such
   product exists in the repository today.
2. **`design-system/future/README.md`'s five extension seams**:
   - Master SVG/Figma-exported templates (would replace `renderMarkup()`'s
     generation step in `js/plateRenderer.js`, not the data model)
   - A print-ready PDF export (`services/pdfExport.js`, not yet built,
     using `dimensions.js`'s already-defined `safeAreaInsetFrac`)
   - A manufacturing/CNC job-ticket export (`services/manufacturingExport.js`,
     not yet built, from the same `template-data/*.json`)
   - A mobile port (the fractional layout model in `template-data` is
     already framework-agnostic)
   - AR/camera preview (`js/cameraPreview.js` already exists and
     `renderMarkup()` is already documented as reusable for this)
3. **A real Android app already exists** (`android/`,
   `applicationId "in.mysmartdoor.app"`) but is undocumented anywhere in
   `ai/knowledge/` — this is not a "future" item, it's a present,
   unflagged one. See `README.md`'s "A Real Company-Brain Gap" note and
   `ROADMAP.md`.
4. **`feature_requests`** is the crowd-sourced complement to the above —
   customer-submitted ideas that may or may not map to the reserved
   categories or documented seams above.

## How the CPO Reasons About Roadmap Sequencing

- A documented seam (design-system/future) or reserved category
  (productCatalog.js) is treated as **pre-approved direction, not a
  scheduled commitment** — sequencing which one to pursue next is a
  founder decision informed by `feature_requests` demand and
  `customer_interviews` signal, never assumed by the CPO.
- Before recommending a roadmap item, check it against
  `PRIORITIZATION_FRAMEWORK.md`'s scoring rubric — a documented seam
  existing doesn't automatically make it the highest-value next step.
- Any roadmap note produced by the CPO is explicitly indicative, not
  committed, per `ai/core/standards/DOCUMENTATION_STANDARD.md`'s
  indicative-not-committed principle (already applied to
  `ai/docs/SDOS_ARCHITECTURE.md`'s own roadmap section).

## What This Guide Is Not

- Not a commitment to build any of the above.
- Not a substitute for `AUTHORITY_MATRIX.md` — recommending a roadmap
  sequence is not the same as approving a new catalog entry, which
  always requires founder approval.
- Not a description of the reserved "Phase 7 ecosystem" hardware
  categories as though they are this SDOS phase's output — see
  `README.md`'s naming-collision flag.
