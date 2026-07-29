# Lead Generation Guide

How the AI CMO reasons about lead generation — grounded entirely in
mechanisms that already exist and work, rather than proposed channels.

## 1. The Referral Loop (Real, Working)

- **Schema**: `referrals` (one row per owner, `referral_code`,
  `total_referrals`, `successful_referrals`, `reward_earned`) and
  `referral_logs` (one row per referred signup, `status`: `pending` /
  `converted` / `expired`) — `sql/11_beta_launch_schema.sql`.
- **Service**: `services/customerGrowth.js`'s `buildReferralLink(code,
  baseUrl)` generates a shareable referral URL, and
  `getReferralLeaderboard(limit)` surfaces top referrers — both real,
  callable functions.
- **Signal**: `nps_responses.category = 'referral_likelihood'`
  (`sql/11_beta_launch_schema.sql`) and `pmf_metrics_view`'s
  `avg_referral_intent` (`sql/13_customer_growth_schema.sql`) already
  measure willingness-to-refer — a genuine leading indicator the CMO can
  read, not invent.
- **CMO's job**: reason about how to *surface* the existing referral
  program more visibly (e.g. in owner-facing communication, on the
  homepage), and interpret leaderboard/NPS-referral-intent trends for
  the founder — never propose a parallel referral mechanism when this
  one already works.

## 2. The Testimonial/Review Funnel (Real, Semi-Manual)

- `customer_reviews` (`sql/13_customer_growth_schema.sql`) plus
  `requestReview()` / `submitReview()` / `getReviewsSummary()`
  (`services/customerGrowth.js`) implement a real post-activation review
  request workflow across `whatsapp` / `sms` / `email` channels.
- A high `product_rating` + `public_consent = TRUE` review is a
  legitimate lead-gen asset (social proof) once used with founder
  approval — see `CONTENT_STRATEGY.md`.

## 3. The Partner Channel (Real, B2B Lead Gen)

- `partner-apply.html` → `services/partnerOnboarding.js` →
  `partner_applications` is SmartDoor's actual dealer/franchise
  acquisition funnel (`features/features.md` §7). This is a genuine
  B2B2C lead-generation surface — the CMO's role is reasoning about how
  prospective partners discover `partner-apply.html` in the first place
  (an SEO/content question, per `SEO_GUIDE.md`), not the KYC/onboarding
  process itself, which stays the COO's (`ai/executives/coo/RESPONSIBILITIES.md`
  §7).

## 4. What Does NOT Exist

- No landing-page-per-channel infrastructure, no lead-capture form
  distinct from the purchase flow itself, and no CRM/lead-scoring system
  beyond `customer_segments` (which segments existing owners, not
  pre-purchase leads) exist in the repository.
- No newsletter/email-capture mechanism for pre-purchase visitors exists
  — the only owner-linked email touchpoints are transactional
  (`services/email.js`).

## 5. Discipline

- Referral rewards (`referrals.reward_earned`) are a financial
  commitment — any change to the reward structure is the CFO's/founder's
  call jointly, per `INTER_EXECUTIVE_COMMUNICATION.md`.
- No lead-gen recommendation implies a pre-purchase capture mechanism
  that doesn't exist — see `DECISION_RULES.md` Rule 6.

## Future SDOS Capability

- A dedicated pre-purchase lead-capture/CRM layer does not exist.
- Automated referral-leaderboard-to-owner-communication (e.g.
  proactively notifying top referrers) does not exist — today it's a
  read function only.
