# Paid Ads Guide

How the AI CMO would reason about paid acquisition — grounded in the
real destination system it would drive traffic to, and honest about the
absence of any attribution mechanism to measure it with.

## 1. What Exists That Paid Traffic Would Land On

- The real purchase flow: `index.html` → `products.html` / `product.html`
  → Razorpay checkout (`ai/knowledge/business/business_rules.md`'s
  Orders section).
- The real campaign/discount engine: `campaigns`, `pricing_rules`,
  `coupons` (`sql/57_commerce_engine_phase8a.sql`) — `coupons.code` is
  the one mechanism in the schema that could plausibly serve as a
  trackable proxy for a paid-campaign landing page (e.g. a
  platform-specific coupon code), since no dedicated ad-click tracking
  exists.
- `pricing_rules.rule_type` already includes a generic `'campaign'`
  value alongside `'launch_offer'` / `'festival_offer'` — the schema was
  evidently built with paid/promotional campaigns in mind, even though
  no ad platform is wired in.

## 2. What Does NOT Exist (Confirmed, Not Assumed)

- No ad platform (Google Ads, Meta Ads, or any other) is integrated into
  the repository — no API keys, no conversion-pixel code, no ad-spend
  table.
- No UTM parameter handling anywhere in `index.html`, `js/`, or
  `services/` — a visitor arriving from a paid ad and one arriving
  organically are indistinguishable in the data today.
- No `ad_spend`, `campaign_source`, or equivalent ledger exists in the
  schema — this is the same gap `ai/executives/cfo/UNIT_ECONOMICS.md`
  names for CAC calculation, from the marketing side.

## 3. What the CMO Can Responsibly Do Today

- Draft ad copy and campaign concepts for founder review, strictly
  bound by the privacy-promise discipline (`DECISION_RULES.md` Rule 10)
  and grounded in real product facts (`llms.txt`, `products/products.md`).
- Recommend a coupon-per-channel naming convention (e.g. a distinct
  `coupons.code` per platform/campaign) as the minimum viable
  attribution proxy available in the current schema — explicitly framed
  as an imperfect proxy (it tracks conversion-with-code-applied, not
  attribution back to ad click), not a real attribution system.
- Flag, never estimate, ROAS/CAC-by-channel questions — always answer
  with what data would need to exist first.

## 4. Discipline

- No ad spend is ever committed by the CMO — `AUTHORITY_MATRIX.md` marks
  this founder-approval-required with no exception, mirroring
  `ai/executives/cfo/AUTHORITY_MATRIX.md`'s "new vendor" rule.
- No ad claims the product's privacy/security properties beyond what
  `business_rules.md` documents.

## Future SDOS Capability

- Any ad-platform integration, conversion pixel, or UTM-capture
  mechanism does not exist and would be a CTO-led build, with
  corresponding schema additions the CFO and CMO would both need to
  review for financial and attribution implications.
- An ad-spend ledger, and any resulting CAC/ROAS calculation, does not
  exist — see `ai/executives/cfo/UNIT_ECONOMICS.md`'s equivalent gap.
