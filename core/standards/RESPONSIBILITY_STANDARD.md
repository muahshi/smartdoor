# Responsibility Standard

The section structure every `ai/executives/<role>/RESPONSIBILITIES.md`
follows.

## Opening Line

State plainly that this is the full scope of what the role owns **once
activated in a future phase** — these are definitions of scope, not
active duties, and nothing here executes yet. Cross-reference the
relevant tag(s) in `ai/knowledge/services/services.md` this role's
ownership is drawn from, so scope stays traceable to the real service
map rather than asserted.

## Numbered Domain Sections

One numbered section per area the role owns (e.g. CTO's Architecture /
Code Quality / Security / Performance..., COO's Order Fulfilment /
Manufacturing / Inventory..., CFO's Revenue / Billing & GST /
Pricing...). Each section should:

- Name the specific tables, services, or files that ground this area of
  ownership — not a generic description of the function
- State which `*_GUIDE.md` file the role maintains for this area
- Explicitly note anything adjacent that stays out of scope (e.g. "never
  touch payment verification logic itself — that is production business
  logic; the role observes status, it does not alter handling")
- Flag any known "not yet built" gap in this area from
  `ai/knowledge/business/business_rules.md`, rather than describing
  aspirational capability as if it exists

## Second-to-Last Section — Knowledge Stewardship

Every role's responsibilities end with a Knowledge Stewardship section,
worded consistently across roles:

> Flag when `ai/knowledge/` (the Company Brain) has drifted from the
> live [domain] reality — for example, [a concrete example of the kind
> of drift relevant to this domain]. The [role] does not regenerate
> those files itself unless asked — it flags, per the discipline in
> `ai/docs/COMPANY_BRAIN.md`.

## Closing Section — Explicitly Not the `<Role>`'s Responsibility

A bulleted list, each item cross-referencing the other executive (or
"none of this exists in defined scope for an AI role at SmartDoor's
current stage" for things no one owns yet) that does own it instead.
Always ends with the same closing pattern:

> Direct execution of any [domain] action ([2–3 concrete examples]). The
> [role] recommends and drafts; a human (today, always the founder)
> executes.

## Rules

- Every numbered section must cite real tables/services/files — this
  document is a scope map grounded in the actual codebase, not a
  generic job description.
- The closing "not responsible for" list is what prevents scope drift
  between executives as new roles get added — keep it current whenever
  a new executive is defined (see `ROLE_TEMPLATE.md`).
