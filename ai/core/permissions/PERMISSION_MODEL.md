# Permission Model

The mechanical contract a future runtime uses to check whether an
executive may take a proposed action, right now. This folder enforces
authority; it does not define it — the actual rules always resolve to
`ai/core/standards/AUTHORITY_STANDARD.md` (see
`ai/core/standards/README.md` for this reference's current resolution
status) plus the requesting executive's own `AUTHORITY_MATRIX.md`.

## Status

Architecture and contract only. No check described below has ever run.

## Check Input / Output

```
PermissionCheck (input):
  executive:         string   # role_id making the request
  action:            string   # what it proposes to do
  action_category:    enum     # matches a row in AUTHORITY_STANDARD.md's universal table,
                                # or a role-specific row in that executive's own AUTHORITY_MATRIX.md,
                                # or "uncategorized"

PermissionResult (output):
  outcome:            enum     # ALLOWED | AWAITING_APPROVAL | DENIED
  rule_cited:         string   # which AUTHORITY_STANDARD.md row or role-specific row applied
  reason:             string
```

## Default Behavior

Per `AUTHORITY_STANDARD.md`'s closing rule ("no executive is ever
granted authority by omission"):

| `action_category` | Default `outcome` |
|---|---|
| Matches a universal founder-approval row (`AUTHORITY_STANDARD.md`'s ten universal rows — schema/RLS, pricing/billing, PIN/auth, deployment, Razorpay, deletion, `ai/integrations/` scope, new vendor, customer communication) | `AWAITING_APPROVAL`, always, regardless of executive or urgency |
| Matches a role's own "may decide unilaterally" row **and** that row's stated condition is met **and** `ai/core/` + `ai/integrations/` both exist as real, runtime-ready components | `ALLOWED` — but note this condition cannot be satisfied in this phase, since `ai/integrations/` remains empty; every check in this phase resolves to `AWAITING_APPROVAL` or `DENIED`, never `ALLOWED` |
| `uncategorized` (no matching row anywhere) | `AWAITING_APPROVAL` — an uncategorized action is treated as ambiguous, per Decision Standard Rule 4, never as implicitly permitted |

**As of this phase, every permission check's `outcome` is
`AWAITING_APPROVAL`.** No executive has execution authority yet
(`EXECUTIVE_STANDARD.md`'s own statement, true of all six today), so
`ALLOWED` is not a reachable outcome until a future phase makes an
executive's "may decide unilaterally" column actually load-bearing.

## Rules

1. **The check is mechanical, not judgment-based.** It cites a specific
   row from `AUTHORITY_STANDARD.md` or a role's own matrix — it never
   substitutes a runtime "this seems fine" judgment for an explicit rule.
2. **A `DENIED` outcome is reserved for actions a role's own
   `AUTHORITY_MATRIX.md` explicitly rules out** (e.g. CEO's matrix being
   "deliberately the narrowest of the six" per its own README) — absence
   of a rule is `AWAITING_APPROVAL`, never `DENIED`, per the default
   table above.
3. **No check result is cached across sessions.** A prior approval for
   one task does not silently authorize a similar future task — each
   check is evaluated fresh (though a future phase may let a founder
   pre-approve a class of action explicitly, which would itself be
   recorded as a rule, not an implicit inference).
4. **A check's `rule_cited` must be traceable to an actual file and
   row/line** — this is what makes `REVIEW_STANDARD.md`-style review of
   a runtime's behavior possible after the fact.

## Relationship to the Rest of SDOS

- Enforces `ai/core/standards/AUTHORITY_STANDARD.md` and every
  `ai/executives/<role>/AUTHORITY_MATRIX.md`.
- Drives the `AWAITING_APPROVAL` state in
  `ai/core/runtime/AGENT_LIFECYCLE.md` and `ai/core/tasks/TASK_MODEL.md`.
- Emits `permission.checked` and `approval.requested`/`approval.decided`
  events per `ai/core/events/EVENT_BUS.md`.
