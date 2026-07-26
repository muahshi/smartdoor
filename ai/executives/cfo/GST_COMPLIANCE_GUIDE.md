# GST Compliance Guide

Grounded entirely in `sql/58_gst_billing_phase8b.sql` (Phase 8B — GST
Billing & Invoicing Platform), `services/invoices.js`, and
`services/gstInvoicePdf.js`. This is the CFO's playbook for the GST
mechanism as actually implemented — not a substitute for a chartered
accountant or tax advisor.

## The `gst_settings` Singleton

One configurable row (`id = 1`) holds every GST-relevant company
setting, specifically so a rate change is "a data UPDATE, not a deploy"
(the migration's own stated design goal):

- `seller_legal_name`, `seller_trade_name`, `seller_gstin`,
  `seller_pan`, full address fields, `seller_state_code` (defaults `23`
  / Madhya Pradesh)
- `hardware_hsn_code` (default `8310` — metal/plastic nameplates),
  `hardware_gst_rate` (default 18.00%)
- `saas_sac_code` (default `998319` — other IT/software services),
  `saas_gst_rate` (default 18.00%)
- `invoice_prefix` (default `SD/INV`), `credit_note_prefix`
  (`SD/CN`), `debit_note_prefix` (`SD/DN`)
- `is_gst_registered` — **defaults `FALSE`** until a real `seller_gstin`
  is set and verified via the admin panel

## Compliance Check #1 — Registration Status

The single most important flag the CFO can raise: if
`is_gst_registered` is `FALSE` while the business is actually issuing
GST-inclusive priced invoices and charging GST amounts, that is a
compliance question for the founder to resolve with an actual tax
advisor — the CFO surfaces it, it does not resolve it or assume either
way.

## Compliance Check #2 — Intrastate vs. Interstate Routing

`compute_gst_breakup()` splits a GST-inclusive amount into either
CGST+SGST (intrastate — buyer and seller in the same state, using
`seller_state_code` vs. the buyer's state derived via
`gst_state_codes`) or IGST (interstate). The CFO verifies this routing
logic is being applied correctly per transaction rather than assuming a
flat CGST+SGST split for every sale nationwide.

## Compliance Check #3 — Invoice Numbering & Types

- Sequential prefixed numbering (`SD/INV`, `SD/CN`, `SD/DN`) tracked via
  `invoice_number_counters`.
- `invoice_type` distinguishes tax invoice / credit note / debit note —
  the CFO checks that refunds generate credit notes (not a silent
  invoice edit), per the `reference_invoice_id` linkage.

## Compliance Check #4 — HSN/SAC Correctness

- Hardware sales: HSN `8310` (configurable).
- SaaS/subscription sales: SAC `998319` (configurable).
- If SmartDoor's actual product classification changes (e.g. a new
  hardware category), the CFO flags that the HSN code should be
  reviewed with a tax advisor, not silently left at the nameplate
  default.

## What This Guide Is Not

- Not tax advice. GST rate applicability, HSN/SAC classification
  correctness, and filing obligations are legal/compliance questions
  for a qualified chartered accountant — this guide describes what the
  code does, not what the law requires SmartDoor to do.
- Not evidence that SmartDoor is currently GST-registered — that is a
  live setting to check, not an assumption to make either way.

## Future SDOS Capability

- Automated GST return-ready export (GSTR-1/GSTR-3B format) — not built
  today; `invoices` has the underlying data but no export function
  exists.
- Automated alerting the moment `is_gst_registered` flips or a rate
  changes — not built; would require `ai/integrations/`.
