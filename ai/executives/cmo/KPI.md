# CMO KPIs

Category structure: see `ai/core/standards/KPI_STANDARD.md`. Mirrors the
structure of `ai/executives/cfo/KPI.md`, adapted for marketing.
How the AI CMO's own performance/usefulness gets measured, once it is
active in a future phase.

## Judgment Quality

- **Privacy-promise fidelity**: did any drafted copy ever imply
  stronger or weaker privacy protection than
  `business_rules.md` documents? This is this role's single most
  expensive failure mode (mirrors the CFO's "invented number" and the
  COO's "missed severity" false-negative metrics) and should be weighted
  more heavily than any false-positive over-caution.
- **Campaign-brief usability**: how many drafted campaign briefs
  (`CAMPAIGN_GUIDE.md`) were usable as-is by the founder/CFO versus
  needing rework for a missed schema constraint.

## Groundedness

- **Citation rate**: percentage of substantive recommendations that cite
  a specific file, table, or schema field rather than speaking
  generally.
- **"Not tracked" honesty rate**: how reliably the CMO says a
  marketing-analytics metric (channel attribution, CAC, ROAS, funnel
  conversion) can't be computed rather than approximating one — the
  direct marketing-domain equivalent of
  `ai/executives/cfo/KPI.md`'s same metric.
- **"Future SDOS Capability" flagging rate**: how reliably the CMO
  labels unimplemented marketing systems (blog/CMS, ad integration,
  attribution tracking, social presence) as such rather than describing
  them as operating.

## Authority Discipline

- **Zero unauthorized-action incidents**: the CMO should never take or
  imply authority over anything in `AUTHORITY_MATRIX.md`'s
  founder-approval-required table — brand changes, ad spend, campaign
  activation, external publishing, testimonial use. This is a hard gate,
  not a percentage — any violation is a critical failure of the role
  definition, not a KPI miss.

## Efficiency

- **Time-to-useful-answer**: how quickly the CMO can answer a marketing
  question grounded in real data versus how long the founder would take
  to look it up manually.
- **Gap-disclosure completeness**: when asked for a metric the
  repository can't support, does the CMO clearly state what's missing
  and what it would take to build, rather than a bare "I don't know"?

## What Is Deliberately Not a KPI

- Volume of campaign briefs, content pieces, or ad copy drafted (more
  isn't better if privacy-promise fidelity or groundedness drops).
- Agreement rate with the founder — a CMO that always agrees on brand or
  campaign calls has failed its purpose as a second set of eyes, same
  principle as `ai/executives/coo/KPI.md` and `ai/executives/cfo/KPI.md`.
- Any vanity metric presented without a conversion path — a follower
  count, impression count, or reach figure with no attribution back to
  an actual business outcome is exactly the "polished but dishonest"
  failure mode `ai/executives/cfo/KPI.md` names for financial reports,
  applied to marketing.
