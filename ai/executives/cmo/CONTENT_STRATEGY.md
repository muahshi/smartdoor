# Content Strategy Guide

How the AI CMO reasons about content — grounded in what SmartDoor
actually has to say and actually has to publish it with, both of which
are more limited than a typical content-marketing playbook assumes.

## 1. What Exists to Draw Content From

- **`customer_reviews`** (`sql/13_customer_growth_schema.sql`): a real
  post-activation review workflow with `product_rating`,
  `manufacturing_rating`, `delivery_rating`, a free-text `testimonial`,
  and — critically — a `public_consent` boolean. Only rows with
  `public_consent = TRUE` are eligible source material for any public
  content; `status` must be `submitted`, not merely `requested`.
- **`llms.txt`**: the current canonical, condensed statement of what
  SmartDoor is, its pricing, and its core features — the closest thing
  the repository has to an "elevator pitch" content asset.
- **The founder's documented identity**
  (`ai/knowledge/company/company_profile.md`,
  `index.html`'s `Person` JSON-LD): Mubashir Hasan, AI Systems Architect,
  Bhopal-based — a real founder-story angle already partially expressed
  in structured data, not invented for marketing purposes.
- **The product's real mechanics** as documented in
  `ai/knowledge/business/business_rules.md` and `features/features.md`
  — dual-transport masked calling (WebRTC + Exotel/Twilio), the AI
  receptionist, QR-based visitor logging — genuine "how it works"
  content material, not invented capability.

## 2. What Does NOT Exist (State This Plainly, Every Time)

- **No CMS or blog system** exists anywhere in the repository. There is
  no `blog.html`, no markdown-to-page pipeline for articles, and no
  content-publishing Edge Function. Any "content calendar" or "blog
  strategy" the CMO proposes is a plan for infrastructure that would
  first need to be built (CTO's domain) — never described as if it
  already runs.
- **No email marketing or newsletter system** — `services/email.js`
  exists but per `services/services.md` it's infra-tagged (transactional
  `send-email` Edge Function support), not a marketing newsletter
  platform.
- **No video, podcast, or other media production capability** — nothing
  in the repository implies one.

## 3. Content Pillars (Grounded, Not Aspirational)

Given the above, realistic content pillars for when a publishing surface
exists are:

1. **Privacy education** — explaining *why* number-masking matters
   (delivery-agent harassment, spam calls, safety for women/elderly
   living alone) grounded strictly in the actual mechanism
   (`business_rules.md`'s Privacy section) — never overstating it.
2. **Real testimonials** — sourced only from `customer_reviews` rows
   with `public_consent = TRUE`, never a composited or invented quote.
3. **Founder story** — grounded in the real, already-public founder
   identity (Bhopal-based AI Systems Architect building a bootstrapped
   hardware+SaaS product) — a genuine differentiator for a India-market
   physical-product company, not a generic "founder journey" template.
4. **How it works** — the real purchase → QR generation → activation
   flow (`ai/knowledge/business/business_rules.md`'s Orders section),
   written for a prospective buyer who's never seen a smart nameplate.

## 4. Discipline

- Every testimonial used publicly requires `public_consent = TRUE` *and*
  founder approval for the specific use (`AUTHORITY_MATRIX.md`) — consent
  on file is necessary, not sufficient.
- No content may claim a capability from `products/products.md`'s
  "Future Product Lines" section (doorbells, cameras, locks, sensors) as
  available today — those are explicitly reserved-but-unbuilt category
  slots.
- No content may soften or embellish the privacy promise (see
  `DECISION_RULES.md` Rule 10).

## Future SDOS Capability

- A CMS/blog publishing pipeline does not exist and would be a CTO-led
  build.
- Automated testimonial-sourcing (querying `customer_reviews` for
  consented, high-rated reviews) does not exist and would need
  `ai/integrations/`.
- Email/newsletter marketing infrastructure does not exist.
