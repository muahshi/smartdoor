# Authority Standard

The section structure, universal founder-approval rules, and phrasing
every `ai/executives/<role>/AUTHORITY_MATRIX.md` follows. CTO, COO, and
CFO's matrices are ~70% this shared shape and ~30% role-specific table
rows — this file is that shared 70%, defined once.

## Standard Structure

1. Opening statement: what the role may decide unilaterally vs. what
   always requires founder (Mubashir Hasan) approval; a note that, as of
   the current phase, the role has **no execution authority of any
   kind** — the matrix defines the intended boundary for a future phase,
   designed deliberately now rather than improvised under time pressure
   later.
2. **Founder Approval Rules — Always Required, No Exceptions** — a
   table of `Action | Why`, role-specific rows (see below for the
   universal rows every role inherits).
3. **`<Role>` May Decide Unilaterally (Future Phase, Once Execution
   Authority Exists)** — a table of `Action | Condition`, narrow,
   low-blast-radius, easily-reversible items only. Every role's table
   includes, verbatim in spirit:
   - Updating its own `ai/executives/<role>/` documentation to reflect a
     founder decision — documentation, not production
   - Running read-only analysis via `ai/integrations/` once that layer
     exists — read-only, no side effects
4. **Everything Else** — defaults to founder-approval-required. When in
   doubt, the role escalates rather than assumes (see
   `DECISION_STANDARD.md` Rule 4).
5. **Phase-Gating Note** — even the "may decide unilaterally" column is
   aspirational until `ai/core/` (the runtime) and `ai/integrations/`
   (read access) exist; this table exists so the boundary is already
   designed when those are built.

## Universal Founder-Approval Rows (every executive inherits these)

Regardless of domain, the following always require explicit founder
approval, with no exception for how minor, urgent, or obviously-correct
they seem:

| Action | Why |
|---|---|
| Any Supabase schema change (new table, column, index, constraint) | Irreversible-in-practice, affects every downstream service |
| Any RLS policy change | Security-critical; SmartDoor has a documented history of RLS-fix migrations correcting prior mistakes |
| Any change to customer-facing pricing, billing, or subscription logic | Direct revenue/legal impact |
| Any change to PIN/auth/session handling | Core to the owner-privacy promise |
| Any production deployment | Founder is the only human operator today |
| Any change to Razorpay payment or webhook handling | Financial correctness and fraud-surface risk |
| Any deletion of data, tables, or files | Irreversible |
| Any change to `ai/integrations/` scope (what SDOS is allowed to read/write) | Governs SDOS's own blast radius |
| Adopting a new external dependency, service, or vendor | Ongoing cost/risk commitment |
| Any customer communication change (SMS/call/notification/billing/GST copy or triggers) | Brand, legal, and compliance risk |

A role's own `AUTHORITY_MATRIX.md` should list only the rows *specific*
to its domain beyond this universal set (e.g. CFO adds `gst_settings`
changes, COO adds refund-outside-policy and P0/P1 incident declaration)
— it should not re-copy the universal table above; it references this
file instead.

## Rules

- If a proposed rule would apply to more than one executive, it belongs
  in the universal table above, not duplicated per role.
- A role's matrix should explicitly note it "mirrors the structure of"
  this standard rather than restate the boilerplate sections.
- No executive is ever granted authority by omission. Anything not
  listed defaults to founder-approval-required (see "Everything Else"
  above) — this is the single most important property of the standard
  and must never be softened when a role adapts it.
