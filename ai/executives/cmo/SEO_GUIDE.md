# SEO Guide

How the AI CMO reasons about SmartDoor's search, generative-engine, and
answer-engine visibility. This is a playbook for extending an already
deliberate setup, not a generic SEO checklist.

## 1. What Already Exists (Read Before Recommending Anything)

- **Meta tags** (`index.html`): a real `<meta name="description">`, a
  `<link rel="canonical">` to `https://mysmartdoor.in/`, and a `<title>`
  — "My Smart Door — India's 1st Smart Nameplate System."
- **Open Graph / Twitter Card**: `og:title`, `og:description`, and
  `twitter:card` (`summary_large_image`) with a real image
  (`images/og-smartdoor.webp`) are set.
- **Structured data**: two `application/ld+json` blocks on `index.html`
  — an `Organization` block (name, url, logo, founder as a `Person`
  with `sameAs` links) and a `Product` block. A third `<script
  type="application/ld+json">` also appears later in the page (line
  ~942) — worth confirming its type/content matches intent before
  proposing anything that assumes only two blocks exist.
- **`robots.txt`**: allows all crawlers on public pages, explicitly
  disallows `/app.html`, `/admin.html`, `/login.html`, `/p/` (visitor
  QR pages), `/config/`, `/services/`, `/sql/`, `/supabase/`, `/docs/`
  — and carries a dedicated, explicit **GEO/AEO section** allow-listing
  `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `Claude-User`,
  `anthropic-ai`, `PerplexityBot`, `Perplexity-User`, and
  `Google-Extended` — a deliberate choice to be visible to AI answer
  engines, not an oversight.
- **`sitemap.xml`**: 11 URLs as of this phase, including `/`,
  `/products`, `/products/acrylic`, `/products/wood`, `/products/steel`,
  and the legal pages.
- **`llms.txt`**: a machine-readable summary (product, pricing, core
  features, founder, key pages, contact) built specifically for LLM
  consumption — pairs directly with the `robots.txt` GEO allow-list.

## 2. What This Means for the CMO's Job

SmartDoor isn't starting SEO from zero — it's starting from an unusually
GEO-forward baseline for its size. The CMO's job is to find the gaps in
an already-good setup, not to propose a generic "add meta tags" plan.

## 3. Concrete Gaps to Flag (Not Fixed Here — Flagged for CTO/Founder)

- `index.html` visibly contains FAQ content (per `pages/pages.md`'s
  description: "product overview, pricing, FAQ, founder info") but
  neither `application/ld+json` block described above is an `FAQPage`
  schema — a real, low-cost structured-data opportunity to flag.
- `sitemap.xml` lists 11 URLs; `pages/pages.md` documents 14 root HTML
  pages plus legal pages. Confirm which pages are intentionally excluded
  (e.g. `visitor.html`, `app.html`, `admin.html` correctly should be, per
  `robots.txt`) versus which are simply missing from the sitemap by
  omission (e.g. `partner-apply.html`, a public page, is not in
  `robots.txt`'s disallow list but should be checked against
  `sitemap.xml`).
- `llms.txt` lists `/app` as "Live Demo" — confirm this still matches
  production intent, since `robots.txt` disallows `/app.html` /`/app`
  for crawlers even though `llms.txt` links it for LLM readers; this is
  a deliberate distinction (crawler-indexing vs. LLM-readable) worth the
  founder confirming is intentional, not a contradiction to silently fix.
- `Product` JSON-LD has no `review` or `aggregateRating` field. Once
  `customer_reviews` (with `public_consent = TRUE`) has enough submitted
  reviews, this becomes a real, groundable structured-data addition —
  not before, since inventing a rating from partial data would violate
  Rule 5 (`DECISION_RULES.md`).

## 4. GEO/AEO Discipline (Extending the Existing Bet)

- Any new public page should be evaluated for whether it belongs in both
  `sitemap.xml` (search engines) and, where it states a durable product
  fact, `llms.txt` (answer engines) — treat these as two audiences with
  overlapping but not identical content needs.
- `llms.txt` should stay a precise, current subset of what's on the
  actual pages it summarizes — the CMO's job is to flag drift (a price,
  feature, or page listed in `llms.txt` that no longer matches
  `js/productCatalog.js` or the live page), never to expand `llms.txt`
  with claims the pages themselves don't make.

## 5. What This Guide Does Not Cover

- Actual keyword rank tracking, backlink analysis, or search-console
  data — none of this is wired into the repository; any number here
  would violate `DECISION_RULES.md` Rule 5.
- Any content-marketing angle for driving organic traffic — see
  `CONTENT_STRATEGY.md`.

## Future SDOS Capability

- An automated sitemap-freshness check against the actual page inventory
  in `pages/pages.md` does not exist today and would need
  `ai/integrations/`.
- Search-console or rank-tracking integration is not built.
