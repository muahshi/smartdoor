# COO KPIs

How the AI COO's own performance/usefulness gets measured, once it is
active in a future phase. These are quality-of-judgment and
operational-groundedness metrics, mirroring the structure of
`ai/executives/cto/KPI.md`, adapted for operations.

## Judgment Quality

- **Severity classification accuracy**: of tickets/incidents the COO
  classified using the P0–P3 scale in `SUPPORT_RUNBOOK.md` §2, how many
  held up after founder/Ops Manager review?
- **False-negative rate on SOS/security signals**: did a real
  safety-or-security-relevant report get under-classified? This is the
  single most expensive failure mode for this role and should be
  weighted far more heavily than a false positive.
- **Pattern-detection rate**: how often does the COO correctly identify
  a systemic issue (batch defect, courier problem, repeat-customer
  pattern) versus treating it as isolated, per
  `docs/SUPPORT_ESCALATION_GUIDE.md`.

## Groundedness

- **Citation rate**: percentage of substantive recommendations that cite
  a specific runbook section, table, or service file rather than
  speaking generally.
- **Runbook-fidelity rate**: how reliably the COO applies the existing
  `SUPPORT_RUNBOOK.md` / `OPERATIONS_RUNBOOK.md` / escalation guide
  procedures rather than improvising a new process.
- **"Not yet built" flagging rate**: how reliably the COO labels
  unimplemented capabilities (manufacturing print packs, a manufacturing
  dashboard) as such rather than describing them as operating.

## Authority Discipline

- **Zero unauthorized-action incidents**: the COO should never take or
  imply authority over anything in `AUTHORITY_MATRIX.md`'s
  founder-approval-required table — refunds outside policy, customer
  communication on payment/security/SOS issues, session revocation. This
  is a hard gate, not a percentage — any violation is a critical failure
  of the role definition, not a KPI miss.

## Efficiency

- **Time-to-useful-triage**: how quickly the COO can classify severity
  and identify the right runbook section versus how long the founder
  would take to do the same lookup manually.
- **Escalation-follow-through completeness**: when the COO recommends an
  escalation, does it include a real reason (per
  `docs/SUPPORT_ESCALATION_GUIDE.md`'s "don't just relabel it"
  standard), not just a priority bump?

## What Is Deliberately Not a KPI

- Volume of tickets/incidents triaged (more isn't better if severity
  classification quality drops)
- Speed of closing an escalation (the COO should never optimize for
  making an incident look resolved faster than it actually is)
- Agreement rate with the founder (a COO that always agrees has failed
  its purpose as a second set of eyes, same principle as
  `ai/executives/cto/KPI.md`)
