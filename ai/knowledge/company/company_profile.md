# Company Profile — My Smart Door / SmartDoor

> Source-derived summary. Compiled from `llms.txt`, `README.md`,
> `SYSTEM_ARCHITECTURE.md`, `PROJECT_STATE.md`, and the codebase itself.
> This is a knowledge-layer document, not a new source of truth — if it
> ever disagrees with the actual repository, the repository wins.

## What the company is

My Smart Door (product/brand name; repository name `SmartDoor`) is a
QR-powered smart nameplate and visitor-communication platform for the
Indian residential and commercial market. A physical nameplate carries a
QR code; visitors scan it and reach the owner through masked calling,
voice notes, or text — without ever seeing the owner's real phone number.

Founded and built by Mubashir Hasan, who operates as an AI Systems
Architect and acts as CTO/primary developer, based in Bhopal, Madhya
Pradesh, India. Production domain: `mysmartdoor.in`.

## Mission

To give people in India a way to be reachable to delivery agents,
guards, guests, and strangers at their door — without exposing their
real phone number or personal contact details — while making the
visitor's experience feel premium rather than like a workaround.

## Vision

Per `README.md`'s stated long-term vision: SmartDoor should become a
complete smart access and visitor communication platform, extending
from individual homes to apartments, housing societies, offices, and
commercial buildings — architected to support tens of thousands of
active plates without a major redesign.

## Business Model

- **Hardware-led, subscription-attached.** The primary transaction is a
  one-time purchase of a physical smart nameplate (see
  `products/products.md`). Every hardware purchase includes a bundled
  privacy/communication subscription period.
- **Recurring SaaS layer on top of hardware.** A three-tier subscription
  system (Free / Premium / Enterprise — see `plan_catalog` in
  `sql/46_saas_billing_schema.sql`) governs which communication and AI
  features an owner keeps access to after the bundled period.
- **B2B2C expansion via partners.** A dealer/franchise/partner program
  (KYC, pricing tiers, commission engine — see `sql/58_partner_onboarding_kyc.sql`,
  `sql/59_partner_pricing_engine_phase8c2.sql`,
  `sql/60_partner_commission_settlement_engine_phase8c3.sql`) lets
  third parties sell and install plates.
- **Society/enterprise layer.** Property/society-level structures
  (organizations, properties, towers, floors, units, residents, society
  admins/guards) support multi-unit buildings rather than only
  single-owner homes.

## Revenue Streams

1. **Hardware sales** — Acrylic, Teakwood, and Stainless Steel nameplates
   at different price points and size/finish variants (see
   `products/products.md`).
2. **Subscription revenue** — Premium (₹29/mo or ₹299/yr) and Enterprise
   (₹999/mo or ₹9,999/yr) recurring plans, billed via Razorpay
   subscriptions.
3. **Partner/dealer commerce** — commission-based revenue share with
   dealers/franchises selling into new markets, governed by
   `commission_rules`, `dealer_commissions`, `commission_settlement_batches`.
4. **Replacement/warranty-adjacent transactions** — replacement and
   ownership-transfer flows (`services/replacementTransfer.js`) which may
   carry their own commercial terms.

## Departments (functional areas implied by the codebase, not a literal org chart)

- **Product/Hardware** — nameplate materials, QR generation, packaging,
  manufacturing and quality control (`manufacturing`, `qualityControl`,
  `packaging` services and their SQL tables).
- **Engineering** — the SmartDoor web app, Supabase backend, Edge
  Functions, WebRTC calling infrastructure.
- **AI/Receptionist** — the Groq-powered AI receptionist, AI voice
  receptionist, AI owner assistant, and AI sales consultant features.
- **Operations/Fulfilment** — shipping, delivery tracking, installation
  jobs, guard panel, society administration.
- **Customer Success/Support** — support tickets, customer health,
  retention, renewal engine, customer growth/interviews.
- **Finance/Billing** — GST invoicing, plan catalog, refunds, invoice
  numbering, payments via Razorpay.
- **Partnerships** — dealer/franchise onboarding, KYC, partner pricing
  and commission settlement.
- **Admin/Compliance** — admin roles/permissions, audit logs, security
  rules, legal document generation.

## Future Roadmap (as stated in the repository itself)

Per `PROJECT_STATE.md` / `CURRENT_STATUS.md` (note: these two files
describe the project as being at "Phase 12", while the SQL migration
history and service catalogue show work through at least a "Phase 13"-
equivalent partner/commerce buildout — see the discrepancy note in
`documents/documents.md`):

- Live Razorpay payment validation in production
- Forgot-PIN self-service flow
- Bulk plate provisioning
- Manufacturing print packs
- Dealer onboarding at scale
- Manufacturing dashboard

Per `README.md`'s stated long-term architecture goal: support for tens
of thousands of active plates across homes, societies, offices, and
commercial buildings without major redesign.

## Where SDOS fits

SDOS (this `/ai` directory) is an internal AI Operating System layered
on top of this business — it does not change any of the above. It exists
to let future AI executives read and reason about the business described
in this file and the rest of `ai/knowledge/`.
