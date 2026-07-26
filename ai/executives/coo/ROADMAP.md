# CTO Technical Roadmap

This is the CTO's own **technical** roadmap — infrastructure, debt,
hardening, and scale-readiness. It is distinct from SmartDoor's product
roadmap (documented in `company/company_profile.md` and
`documents/documents.md` in the Company Brain) and from SDOS's own phase
roadmap (`ai/docs/SDOS_ARCHITECTURE.md`).

This is a **candidate list**, not a committed plan — every item requires
founder prioritization before any work begins, and nothing here implies
approval to execute.

## Known Technical Debt (from documented history)

1. **Documentation/reality drift.** `PROJECT_STATE.md`/`CURRENT_STATUS.md`
   claim "Phase 12" while migration/service history shows work through at
   least a "Phase 13"-equivalent buildout, and `DATABASE_SCHEMA.md` lists
   ~10 tables against ~100+ actual tables. Recommend periodic
   regeneration of top-level status docs and `ai/knowledge/` from the live
   repository (already the stated discipline in
   `ai/docs/COMPANY_BRAIN.md`).
2. **House-number/customization persistence gap.** Confirmed pre-existing
   bug where full nameplate customization typed into the live configurator
   doesn't reliably persist to orders/manufacturing on the Razorpay
   checkout path (`shipping_address` has no `houseNumber` key, `orders.notes`
   is `TEXT` not `JSONB`). Flagged, not yet fixed.
3. **Orders-to-AI-attribution link is missing.** `orders` has no
   `session_id` link to `ai_consultant_events`, so true AI-attributed sales
   and intent-to-conversion analysis aren't currently possible without a
   schema addition.
4. **RLS-fix migration pattern.** Multiple migrations exist specifically
   to correct earlier RLS mistakes — suggests a recurring gap in
   RLS-at-table-creation-time discipline worth hardening via review
   process (`SECURITY_GUIDE.md`) rather than more reactive fixes.

## Scale-Readiness Candidates

- Realtime subscription scoping audit as active-plate count grows (see
  `PERFORMANCE_GUIDE.md`).
- Index audit against actual query patterns at current data volume.
- Formal freshness-check for `ai/knowledge/` vs. the live schema/service
  list — explicitly named as a "Phase 2+ candidate" in
  `ai/docs/COMPANY_BRAIN.md` at the time it was written (note: that phase
  numbering predates this document's own Phase 2 scope, which is the CTO
  definition, not the freshness-check; see `README.md` for the
  clarification).

## Explicitly Not on This Roadmap

- Any new customer-facing feature (that's a product/CEO-flavored roadmap
  item, not a technical one)
- Any AI execution capability for SDOS itself (that's Phase 3+ of SDOS,
  contingent on `ai/integrations/` being built first)

## How This Roadmap Gets Used

The founder reviews and re-prioritizes this list as needed; the CTO
updates it as new technical debt or scale risk is discovered during code
review, bug triage, or architecture evaluation.
