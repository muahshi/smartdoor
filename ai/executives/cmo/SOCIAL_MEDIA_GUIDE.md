# Social Media Guide

How the AI CMO would reason about social media — honest, first, about
the fact that SmartDoor has no documented social presence today.

## 1. What the Repository Actually Shows

- `index.html` sets `twitter:card` (`summary_large_image`), `twitter:title`,
  `twitter:description`, and `twitter:image` — this makes any link to
  the site render well *if* shared on X/Twitter, but it is not evidence
  of an active account.
- `llms.txt`'s `sameAs` field for the founder lists exactly two links:
  a personal portfolio (`muahshidigital.vercel.app`) and GitHub
  (`github.com/muahshi`). The `Organization` JSON-LD's `sameAs` mirrors
  the same two links.
- No Instagram, Facebook, LinkedIn, YouTube, or WhatsApp Business
  channel link appears anywhere in the repository (`index.html`,
  `llms.txt`, `footer` content, or any config file).

**Conclusion, stated plainly:** SmartDoor has no documented social-media
presence as of this phase. Any social strategy the CMO proposes is a
plan for establishing a presence, not a plan for growing one that
exists — the two require different founder decisions (see
`AUTHORITY_MATRIX.md`: creating any social account is
founder-approval-required, not an incremental content update).

## 2. Founder-Scale Reasoning, If a Presence Is Established

If and when the founder decides to establish a channel, the CMO's
reasoning would draw on real, existing assets rather than needing new
production capability:

- **Product photography** already exists for the three material lines
  (`design-system/master-reference/acrylic.webp`, `teakwood.webp`,
  `stainless.webp`) and the OG image (`images/og-smartdoor.webp`) — a
  real starting asset library, not something to invent.
- **Testimonials**, subject to the same `public_consent = TRUE` +
  founder-approval discipline as `CONTENT_STRATEGY.md`.
- **Referral program visibility** — `services/customerGrowth.js`'s
  `getReferralLeaderboard()` is a genuine, real mechanism that a social
  channel could visibly reward, once a channel exists.

## 3. Discipline

- No platform account is created, and no content is posted, without
  explicit founder approval (`AUTHORITY_MATRIX.md`) — this is a hard
  gate given that establishing brand presence on a new platform is a
  standing commitment, not a reversible draft.
- Any social copy is held to the same privacy-promise discipline as all
  other marketing copy (`DECISION_RULES.md` Rule 10) — a shorter format
  makes overstatement easier, not more acceptable.

## Future SDOS Capability

- Social account creation and management does not exist and is
  explicitly founder-approval-required whenever it's decided.
- Social scheduling/analytics tooling does not exist in the repository.
- A documented brand voice guide for social specifically does not exist
  yet — `BRANDING_GUIDE.md` covers the general verbal identity this
  would extend from.
