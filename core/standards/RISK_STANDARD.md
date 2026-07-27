# Risk Standard

The shape of risk classification for any executive that carries a
distinct forward-looking risk surface (today: CTO's
`RISK_FRAMEWORK.md`, covering structural/technical risk that hasn't
broken yet but could — as distinct from `*_TRIAGE`/`ESCALATION_STANDARD`
files, which classify issues that already happened).

## Standard Structure

### 1. Purpose Statement
One line distinguishing this file from the role's triage/escalation
file: this covers forward-looking and structural risk, not
already-reported issues.

### 2. Risk Categories
Domain-specific categories (CTO: Data/Privacy, Financial/Payment,
Availability, Architectural Debt, Scale). Each category states:
- What it covers, in one line
- Its primary real sources in the actual codebase (named files, tables,
  or a documented past incident as precedent — never a hypothetical)

### 3. Risk Scoring
A fixed two-axis model, used identically by every role that has a risk
framework:

- **Likelihood**: Low / Medium / High, grounded in documented recurrence
  where possible (a pattern that has already recurred is High likelihood
  by default).
- **Impact**: Low / Medium / High. Privacy, financial, and safety impact
  is always treated as automatically High regardless of likelihood.

| Likelihood \ Impact | Low | Medium | High |
|---|---|---|---|
| **High** | Monitor | Prioritize | Escalate immediately |
| **Medium** | Log | Monitor | Prioritize |
| **Low** | Log | Log | Monitor |

Anything landing in "Escalate immediately" routes to the founder
regardless of what else is in progress, consistent with
`AUTHORITY_STANDARD.md`'s treatment of privacy/payment/safety issues.

### 4. Recurring Risk Patterns to Watch
A living list of real, previously-documented failure patterns specific
to the domain — grows over time as new patterns get discovered, never
starts from a generic industry checklist.

### 5. What the `<Role>` Does With a Scored Risk
Standard closing: documents category/likelihood/impact/evidence; adds it
to `ROADMAP.md` if structural; escalates immediately if top-right of the
grid; never remediates directly if the fix falls under
`AUTHORITY_STANDARD.md`'s approval-required table.

## Rules

- The scoring grid (§3) is identical across every role that has a risk
  framework — don't reinvent the axes or the 3x3 grid per role.
- Every category's "primary sources" must cite something real; a risk
  framework with hypothetical-only sources isn't grounded enough to use.
