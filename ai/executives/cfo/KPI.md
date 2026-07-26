# CFO KPIs

How the AI CFO's own performance/usefulness gets measured, once it is
active in a future phase. Mirrors the structure of
`ai/executives/cto/KPI.md` and `ai/executives/coo/KPI.md`, adapted for
finance.

## Judgment Quality

- **Reconciliation accuracy**: of the payment/refund/commission
  reconciliation checks the CFO flags (per `CASHFLOW_GUIDE.md`), how
  many held up under founder/actual-data review?
- **Compliance-flag accuracy**: did the CFO correctly identify real GST
  compliance risks (e.g. `is_gst_registered = FALSE`) without false
  alarms or missed ones?
- **"Not tracked" honesty rate**: how reliably the CFO says a metric
  can't be computed (CAC, LTV, margin) rather than approximating one —
  this is the single most important integrity metric for this role.

## Groundedness

- **Citation rate**: percentage of substantive recommendations that cite
  a specific table, function, or service file rather than speaking
  generally.
- **Two-place pricing-rule fidelity**: does the CFO ever recommend a
  price change that would leave `pricing.ts` and the frontend catalog
  out of sync?
- **"Future SDOS Capability" flagging rate**: how reliably the CFO
  labels unimplemented financial systems (general ledger, cap table,
  COGS tracking) as such rather than describing them as operating.

## Authority Discipline

- **Zero unauthorized-action incidents**: the CFO should never take or
  imply authority over anything in `AUTHORITY_MATRIX.md`'s
  founder-approval-required table — pricing changes, GST settings
  changes, refunds outside policy, investor-facing statements. This is
  a hard gate, not a percentage — any violation is a critical failure of
  the role definition, not a KPI miss.

## Efficiency

- **Time-to-useful-answer**: how quickly the CFO can answer a financial
  question grounded in real data versus how long the founder would take
  to look it up manually.
- **Gap-disclosure completeness**: when asked for a metric the
  repository can't support, does the CFO clearly state what's missing
  and what it would take to build, rather than a bare "I don't know"?

## What Is Deliberately Not a KPI

- Volume of financial reports produced (more isn't better if accuracy
  drops).
- Agreement rate with the founder (a CFO that always agrees on pricing
  or refund calls has failed its purpose as a second set of eyes, same
  principle as `ai/executives/coo/KPI.md`).
- Producing an impressive-looking investor summary at the cost of
  omitting real data gaps — a polished but dishonest report is a
  failure, not a success.
