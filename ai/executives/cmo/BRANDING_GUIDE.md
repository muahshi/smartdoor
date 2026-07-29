# Branding Guide

The visual and verbal identity as actually implemented — this guide
describes what exists, it does not propose a rebrand.

## 1. Verbal Identity

- **Name**: "My Smart Door" (product/brand name); repository/legal name
  "SmartDoor" (`ai/knowledge/company/company_profile.md`).
- **Tagline**: "India's 1st Smart Nameplate System" —
  used consistently across `<title>`, `og:title`, and `twitter:title` in
  `index.html`.
- **Core promise, verbatim across sources**: phone-number masking /
  privacy protection — `index.html`'s meta description ("Protect your
  privacy. Secure your home. Mask your number from visitors."), `llms.txt`
  ("100% phone number masking"), and `business_rules.md`. This exact
  promise is the one line that must never be paraphrased into something
  weaker or stronger (`DECISION_RULES.md` Rule 10).
- **Founder identity as a brand asset**: "Mubashir Hasan, AI Systems
  Architect & Founder," Bhopal, Madhya Pradesh — present in the
  `Person` JSON-LD on `index.html` and `company_profile.md`. This is
  already a public-facing part of the brand, not a private fact.

## 2. Visual Identity

- **Typography**: `Inter` (400–800 weight), `Space Grotesk` (400–800),
  and `Syne` (700–800) — the three Google Fonts loaded in `index.html`'s
  `<head>`. `Space Grotesk` is also the body/caption font used on the
  physical plate itself (`design-system/tokens/typography.js`), giving
  the digital site and the physical product a shared typographic thread
  — a real, citable brand-consistency detail, not a coincidence to
  overlook.
- **Product materials as a visual/brand tier system**: Acrylic
  (`₹1,499`, entry), Teakwood (`₹2,499`, premium/natural), Stainless
  (`₹2,999`, premium/modern) — each with its own reference render
  (`design-system/master-reference/*.webp`) and its own finish options
  (`products/products.md`). Marketing materials should treat these as
  three distinct visual tiers, not a single generic "the product."
- **Primary digital asset**: `images/og-smartdoor.webp`, used
  consistently as the `og:image` and `twitter:image`.
- **Iconography**: religious/cultural symbol options (Om, Ganesha,
  Cross, Crescent & Star, Khanda, Lotus — `products/products.md`) are a
  real, India-market-specific personalization feature worth reflecting
  in brand imagery that shows product diversity, handled with the same
  care the product configurator already gives it (optional, owner-
  selected, never assumed).

## 3. Structured Brand Identity (as machine-readable fact)

- The `Organization` JSON-LD on `index.html` is the canonical
  machine-readable statement of brand identity today (name, URL, logo,
  founder, `areaServed: "IN"`, `foundingLocation`). Any brand-identity
  recommendation should be checked against this block for consistency
  before being proposed.

## 4. Discipline

- No brand element (name, tagline, promise, logo, color/type system) is
  ever changed by the CMO directly — always founder-approval-required
  (`AUTHORITY_MATRIX.md`), and any implementation is the CTO's.
- Every brand claim in any marketing material must trace to something
  actually true in the product (`business_rules.md`, `products.md`) —
  never an aspirational claim about a "Future Product Line" category.

## Future SDOS Capability

- A formal, standalone brand style guide (color palette, logo usage
  rules, voice-and-tone document) does not exist in the repository
  today — this guide describes the identity as implemented across
  `index.html`, `llms.txt`, and `design-system/`, not a dedicated brand
  book.
