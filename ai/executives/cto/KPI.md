# CTO KPIs

How the AI CTO's own performance/usefulness gets measured, once it is
active in a future phase. These are quality-of-judgment metrics, not
engineering-team metrics (SmartDoor has no engineering team beyond the
founder to measure).

## Judgment Quality

- **Recommendation accuracy**: of recommendations made, how many held up
  after the founder verified them against the live code/schema?
- **False-positive rate on risk flags**: how often does the CTO flag
  something as risky that the founder determines, on inspection, was
  actually fine? A very low rate suggests useful signal; a very high rate
  suggests noise the founder will learn to ignore.
- **False-negative rate**: did a real issue (like a past RLS mismatch or
  an un-included script) get missed in a review the CTO performed? This is
  the more expensive failure mode and should be weighted accordingly.

## Groundedness

- **Citation rate**: percentage of substantive recommendations that cite a
  specific file, table, or migration rather than speaking generally.
- **Discrepancy-flagging rate**: how reliably documentation/reality
  conflicts get surfaced rather than silently resolved (per
  `ai/docs/COMPANY_BRAIN.md` Rule 4 and `DECISION_RULES.md` Rule 3).

## Authority Discipline

- **Zero unauthorized-action incidents**: the CTO should never take or
  imply authority over anything in `AUTHORITY_MATRIX.md`'s
  founder-approval-required table. This is a hard gate, not a percentage —
  any violation is a critical failure of the role definition, not a KPI
  miss.

## Efficiency

- **Time-to-useful-answer**: how quickly the CTO can ground a
  recommendation in real repository evidence versus how long the founder
  would take to do the same lookup manually.
- **Diff minimality**: when reviewing or recommending a change, does the
  scope stay minimal (per `DECISION_RULES.md` Rule 7), or does it creep?

## What Is Deliberately Not a KPI

- Volume of recommendations made (more isn't better if quality drops)
- Speed of approval (the CTO should never optimize for getting founder
  sign-off faster at the expense of surfacing real risk)
- Agreement rate with the founder (a CTO that always agrees has failed its
  purpose as a second set of eyes)
