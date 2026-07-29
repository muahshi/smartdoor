# Campaign Guide

How the AI CMO reasons within SmartDoor's real, already-built campaign
engine (`sql/57_commerce_engine_phase8a.sql`) — this is a playbook for
using an existing system, not a proposal for a new one.

## 1. The Real Engine

- **`campaigns`**: `name`, `slug` (unique), `description`,
  `campaign_type` (default `'launch_offer'`), `starts_at`/`ends_at`,
  `auto_enable`/`auto_disable` booleans, and a manual
  `status_override = 'disabled'` kill switch. Effective status
  (`scheduled` / `active` / `ended` / `disabled`) is *computed*, not
  stored, via `campaign_effective_status()` and exposed through the
  `campaigns_with_status` view — so a campaign's live status is always
  correct without a cron job.
- **`pricing_rules`**: linked to a campaign via `campaign_id`, with nine
  `rule_type` values: `launch_offer`, `festival_offer`,
  `referral_discount`, `dealer_discount`, `franchise_discount`,
  `bulk_discount`, `premium_customer_discount`, `renewal_discount`, and
  a generic `campaign`. Each rule has `priority` (lower evaluated
  first), a `stackable` flag, and JSONB `conditions` (product types,
  minimum quantity, plan keys, minimum order value, role names).
- **`coupons`**: can also link to a `campaign_id`, with its own
  `usage_limit_total` / `usage_limit_per_customer`, `discount_type`
  (`percentage` / `fixed` / `free_shipping`), and time window.

## 2. What This Means for Campaign Strategy

Nine pre-built campaign *types* already exist as first-class schema
values — this tells the CMO what kinds of campaigns the founder already
anticipated running (a launch offer, a festival offer, a referral push,
partner/dealer incentives, bulk-order incentives, a loyalty/renewal
discount) before any AI executive was defined. Campaign strategy work
should map to one of these existing types wherever it genuinely fits,
rather than inventing a tenth category.

## 3. The CMO's Actual Job Here

- Draft a full campaign brief for founder review: proposed `name`,
  `campaign_type` (from the real nine), target `starts_at`/`ends_at`
  window, which `conditions` it should target (product type, plan,
  minimum order), and whether it should be `stackable` with existing
  rules — fully specified, per Golden Rule 3 (no placeholder content).
- Flag `priority`/`stackable` conflicts conceptually (e.g. "a
  non-stackable festival offer would silently exclude the existing
  referral discount for the same order" ) — the CMO reasons about the
  *strategic* interaction; the CFO and founder confirm the actual
  discount-stacking math (`ai/executives/cfo/PRICING_GUIDE.md`).
- Time campaigns around real, citable moments already implicit in the
  schema's own `rule_type` vocabulary (festival/seasonal, launch,
  renewal) rather than generic retail calendar assumptions.

## 4. Discipline

- The CMO never creates, edits, or activates a `campaigns`,
  `pricing_rules`, or `coupons` row — always founder-approval-required
  (`AUTHORITY_MATRIX.md`).
- A campaign brief must state its full window and targeting — an
  open-ended "run a promotion" is not a usable recommendation.
- Any campaign copy is bound by the same privacy-promise discipline as
  all other marketing content (`DECISION_RULES.md` Rule 10).

## Future SDOS Capability

- Automated campaign-performance measurement (redemptions vs. revenue
  vs. campaign window) is not built — it would require joining
  `orders`/`invoices` data against `campaigns`/`coupons` through
  `ai/integrations/`, not available today.
- No dashboard shows live `campaigns_with_status` to a non-technical
  user — reading it today requires direct database access.
