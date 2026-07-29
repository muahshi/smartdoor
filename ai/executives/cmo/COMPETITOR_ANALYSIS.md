# Competitor Analysis Guide

A reasoning framework for competitive positioning, honest that
SmartDoor's repository contains no competitor-tracking data of any kind
— no competitor names, pricing, or feature-comparison tables exist
anywhere in `ai/knowledge/`, `sql/`, or the production docs.

## 1. What the CMO Can Responsibly Do

Reason about SmartDoor's *own* documented differentiators — grounded,
citable facts the product actually has — as the basis for any
competitive-positioning discussion, rather than characterizing any named
competitor's product (which the repository has no data on and the CMO
has no way to verify).

## 2. SmartDoor's Documented Differentiators (Cite These, Not Assumptions)

- **Dual-transport masked calling**: WebRTC (`services/webrtcCall.js`)
  *and* PSTN via Exotel (primary) with Twilio fallback
  (`services/exotel.js`, `services/twilio.js`) — explicitly documented
  as "redundancy is a deliberate design choice, not an accident"
  (`ai/knowledge/business/business_rules.md`). This is a real
  reliability differentiator a single-transport competitor would not
  have.
- **AI receptionist with owner-configurable rules**
  (`services/aiReceptionistRules.js`, gated by signed session tokens,
  `ai_session-token` function) — a real, hardened feature, not a
  marketing-only claim.
- **GST-compliant billing** (`sql/58_gst_billing_phase8b.sql`) as a
  trust/legitimacy signal in the Indian market, per
  `ai/executives/cfo/GST_COMPLIANCE_GUIDE.md`.
- **GEO/AEO-forward SEO posture** (`robots.txt`'s explicit AI-crawler
  allow-list, `llms.txt`) — see `SEO_GUIDE.md` — a genuinely uncommon
  choice for a company at this stage, worth positioning as a sign of
  technical seriousness.
- **India-market personalization**: religious/cultural symbol options on
  the physical plate (`products/products.md`) — a real localization
  choice, not present by default in a generic international product.

## 3. Discipline

- Never name, describe, or characterize a specific competitor's product,
  pricing, or claims — the repository has zero verified data on any
  competitor, and doing so would violate Rule 5/6
  (`DECISION_RULES.md`): inventing a comparison is the same failure mode
  as inventing a metric.
- Any competitive-positioning statement is grounded only in SmartDoor's
  own real, cited features — never a claim like "unlike other smart
  nameplates, we..." without the capacity to verify what "other smart
  nameplates" actually do.
- Positioning must still respect the privacy-promise discipline
  (`DECISION_RULES.md` Rule 10) — a differentiation angle never implies
  more than the product delivers.

## Future SDOS Capability

- Structured competitor tracking (a `competitors` table, feature-parity
  matrix, or pricing-comparison log) does not exist in the schema. If
  the founder wants this, it is a genuinely new capability to design —
  not something this phase invents by default.
- Any live market-share or category-size data is not available anywhere
  in the repository.
