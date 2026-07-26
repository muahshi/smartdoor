# COO Operations Roadmap

This is the COO's own **operations** roadmap — fulfilment, support,
manufacturing, logistics process health. It is distinct from SmartDoor's
product roadmap (`ai/knowledge/company/company_profile.md`,
`ai/knowledge/documents/documents.md`), the AI CTO's technical roadmap
(`ai/executives/cto/ROADMAP.md`), and SDOS's own phase roadmap
(`ai/docs/SDOS_ARCHITECTURE.md`).

This is a **candidate list**, not a committed plan — every item requires
founder prioritization before any work begins, and nothing here implies
approval to execute.

## Known Operational Gaps (from documented history)

1. **Manufacturing print packs and manufacturing dashboard are not yet
   built**, per `business/business_rules.md` and
   `ai/knowledge/documents/documents.md`. Until built, manufacturing
   visibility depends on manual inspection of `manufacturing` and
   `manufacturing_qc`.
2. **House-number/customization persistence gap** affects order
   fulfilment (`ORDER_FULFILMENT_GUIDE.md`) — already tracked on
   `ai/executives/cto/ROADMAP.md` as a technical item; listed here as an
   operational risk to watch for in support tickets until fixed.
3. **`verify-pin` reliability is under investigation**
   (`business/business_rules.md`, Authentication section) — an
   operational risk for the "I'm locked out" support category
   (`SUPPORT_RUNBOOK.md` §3.3) until resolved.
4. **No automated stalled-order or delivered-but-not-activated
   alerting** exists — currently depends on the COO's manual daily/weekly
   routines rather than a system signal.

## Operational Readiness Candidates

- A read-only `ai/integrations/` view over `manufacturing`,
  `manufacturing_qc`, `inventory_batches`, `shipments`, and
  `support_tickets` — the prerequisite for most of the "Future SDOS
  Capability" items named throughout this folder's guides.
- Batch-level defect-rate tracking surfaced automatically rather than
  discovered reactively per `docs/SUPPORT_ESCALATION_GUIDE.md`.
- A delivered-but-not-activated nudge, extending the existing renewal
  reminder pattern (`services/renewalEngine.js`) to onboarding.

## Explicitly Not on This Roadmap

- Any pricing, refund-policy, or billing-logic change (CFO/founder
  territory).
- Any AI execution capability for SDOS itself — the COO reasoning about
  operations does not imply the COO can act on operations; that remains
  gated by `AUTHORITY_MATRIX.md` and contingent on `ai/integrations/`
  being built first.
- Any new customer-facing feature (a product/CEO-flavored roadmap item).

## How This Roadmap Gets Used

The founder reviews and re-prioritizes this list as needed; the COO
updates it as new operational risk or process gap is discovered during
support triage, fulfilment monitoring, or incident response.
