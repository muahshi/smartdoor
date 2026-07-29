# AI CMO — SmartDoor Operating System (SDOS Phase 6)

## Status

**Numbering note (flagged, not silently resolved):** the build brief for
this folder referred to it as "Phase 5." The repository itself already
used Phase 5 for `ai/core/standards/` (the shared executive framework —
see `ai/core/standards/README.md` and `ai/knowledge/MASTER_INDEX.md`'s
"Shared Standards (SDOS Phase 5)" section), built on top of Phase 2
(`ai/executives/cto/`), Phase 3 (`ai/executives/coo/`), and Phase 4
(`ai/executives/cfo/`). Per the Golden Rule "flag, don't silently
resolve, discrepancies" (`ai/core/standards/QUALITY_STANDARD.md`), this
folder is filed as **Phase 6** — the next unused phase number — rather
than overwriting or renumbering the existing Phase 5. See this folder's
parent `ai/executives/README.md` and `ai/knowledge/MASTER_INDEX.md` for
the corresponding index update.

Phase 6 of SDOS defines the **AI CMO executive** completely, in
documentation only, built from the shared skeleton in
`ai/core/standards/ROLE_TEMPLATE.md` — the first executive built from
that skeleton rather than by hand-mirroring a sibling folder.

**Nothing in this phase executes.** There is no code, no agent runtime,
no dashboard, and no automation. Every file in this folder is a role
definition the CMO executive will be built from in a later phase, once
`ai/integrations/` (a future, read-only-first data layer) exists for it
to actually read production marketing/growth data through.

## What Phase 6 Is

A complete, self-contained specification of one AI executive — the CMO —
covering: mission, scope, responsibilities, decision authority, and
domain playbooks for SEO/GEO, content, social media, paid ads, lead
generation, branding, campaigns, competitor analysis, and analytics —
each grounded in what SmartDoor's repository actually contains today
(its existing SEO/JSON-LD/GEO setup, its real `campaigns` /
`pricing_rules` / `coupons` engine, its real `referrals` /
`referral_logs` viral loop, its real `customer_reviews` testimonial
workflow) — plus its routines, KPIs, escalation matrix, inter-executive
communication contract, prompt template, and marketing roadmap.

## What Phase 6 Is Not

- Not an AI agent that runs, posts, or spends money on SmartDoor's
  behalf
- Not a marketing dashboard, ad platform integration, or analytics tool
- Not a workflow engine or automation
- Not a change to any production code, schema, brand asset, or business
  logic
- Not the creation of any marketing capability that doesn't already
  exist in the repository (a blog/CMS, an ad-spend ledger, an
  attribution/UTM system, a social-media presence) — every such gap is
  named explicitly below and in the relevant guide, never assumed into
  existence

## How to Read This Folder

Start with `CMO_PROFILE.md` and `MISSION.md` for who the CMO is and why
it exists, then `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md` for what
it owns and what always requires founder approval. `DECISION_RULES.md`
defines how it reasons under uncertainty — most importantly, how it
handles the fact that SmartDoor tracks almost no marketing-attribution
data today. The `*_GUIDE.md` files are the CMO's operating playbooks,
each grounded in a real, cited part of the repository.
`DAILY_ROUTINES.md`, `WEEKLY_ROUTINES.md`, and `MONTHLY_ROUTINES.md`
define its planned operating cadence. `PROMPT_TEMPLATE.md` is the
system-prompt skeleton a future runtime (`ai/core/`) will assemble the
CMO from. `ROADMAP.md` and `KPI.md` are the CMO's own planning
artifacts, not SmartDoor's product roadmap.

## Files in This Folder

| File | Purpose |
|---|---|
| `CMO_PROFILE.md` | Identity, background, working style of the AI CMO persona |
| `MISSION.md` | Why the CMO role exists and what it optimizes for |
| `RESPONSIBILITIES.md` | Full scope of ownership across marketing/growth |
| `AUTHORITY_MATRIX.md` | What the CMO can decide alone vs. needs founder approval for |
| `DECISION_RULES.md` | How the CMO reasons through ambiguous or unmeasurable marketing situations |
| `SEO_GUIDE.md` | SmartDoor's existing SEO/GEO/AEO setup and how the CMO extends it |
| `CONTENT_STRATEGY.md` | Content pillars grounded in real product/testimonial data; what content system does not exist yet |
| `SOCIAL_MEDIA_GUIDE.md` | Founder-scale social approach; honest about the absence of a documented social presence today |
| `PAID_ADS_GUIDE.md` | How paid acquisition would connect to the real campaign/coupon engine; the attribution gap |
| `LEAD_GENERATION_GUIDE.md` | The real referral/testimonial/partner mechanisms as lead-gen channels |
| `BRANDING_GUIDE.md` | Visual and verbal identity as actually implemented (typography, JSON-LD identity, core promise) |
| `CAMPAIGN_GUIDE.md` | How the CMO reasons within the real `campaigns` / `pricing_rules` / `coupons` engine |
| `COMPETITOR_ANALYSIS.md` | A grounded reasoning framework; honest that no competitor data is tracked in the repository |
| `ANALYTICS_GUIDE.md` | What marketing-relevant data exists today vs. what's missing (attribution, channel ROI) |
| `KPI.md` | How the CMO's own performance is measured |
| `DAILY_ROUTINES.md` | The CMO's planned daily operating cadence |
| `WEEKLY_ROUTINES.md` | The CMO's planned weekly operating cadence |
| `MONTHLY_ROUTINES.md` | The CMO's planned monthly operating cadence |
| `ESCALATION_MATRIX.md` | Severity classification and escalation routing for brand/marketing issues |
| `INTER_EXECUTIVE_COMMUNICATION.md` | How the CMO coordinates with CTO, COO, CFO, and a future CEO |
| `PROMPT_TEMPLATE.md` | System prompt skeleton for the future CMO agent |
| `ROADMAP.md` | The CMO's own marketing-readiness roadmap |

## Relationship to the Rest of SDOS

- Follows the shared skeleton and rules in `ai/core/standards/`
  (`ROLE_TEMPLATE.md`, and every `*_STANDARD.md`/`*_TEMPLATE.md` it
  references) rather than restating them — see each file's opening
  line for which standard it follows.
- Reads from `ai/knowledge/` (the Company Brain) for business context —
  primarily `company/company_profile.md`, `products/products.md`,
  `features/features.md` (§9, Customer Growth/Success), `database/database.md`,
  and `services/services.md`.
- Reuses SmartDoor's existing, real marketing-adjacent implementation as
  ground truth: `index.html`'s SEO meta tags and JSON-LD, `robots.txt`'s
  GEO/AEO crawler allow-list, `sitemap.xml`, `llms.txt`,
  `sql/57_commerce_engine_phase8a.sql` (`campaigns`, `pricing_rules`,
  `coupons`), `sql/11_beta_launch_schema.sql` (`referrals`,
  `referral_logs`), `sql/13_customer_growth_schema.sql`
  (`customer_reviews`), and `services/customerGrowth.js`. This folder
  does not duplicate or replace any of these — it points to them and
  defines how an AI CMO would use them.
- Will eventually read live data only through `ai/integrations/`, once
  that layer exists (not built as of this phase).
- Has no write access to anything, anywhere, as of this phase.
- Sits alongside `ai/executives/cto/` (Phase 2), `ai/executives/coo/`
  (Phase 3), `ai/executives/cfo/` (Phase 4), and a future
  `ai/executives/ceo/` folder under the shared `ai/executives/README.md`
  contract.

## Founder

SmartDoor is founded and run by Mubashir Hasan (Muah), who today performs
every marketing role personally on top of every other role — the
existing SEO/JSON-LD/GEO setup, the `campaigns`/`coupons` engine, and the
referral system already in the repository are his work, not a
department's. The AI CMO defined here is designed to **support**, not
replace, that role — see `AUTHORITY_MATRIX.md` for exactly where founder
approval is always required regardless of what the AI CMO recommends.

## What This Phase Deliberately Does Not Invent

SmartDoor's codebase already implements a real campaign/discount engine,
a real referral system, and a real (if unautomated) review/testimonial
workflow — but it does **not** contain any marketing-attribution
tracking (no UTM parameters, no ad-spend ledger, no lead-source field
anywhere in the schema — confirmed by search, not assumed), any
CMS/blog system, or any documented social-media presence. Every guide in
this folder is explicit about that boundary rather than inventing
numbers, channels, or systems that don't exist. Anything proposed beyond
what exists today is labeled **"Future SDOS Capability."**
