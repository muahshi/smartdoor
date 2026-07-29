# Task Routing

The contract for dispatching a `Task` (`ai/core/tasks/TASK_MODEL.md`) or
an `Event` (`ai/core/events/EVENT_BUS.md`) to the executive whose
documented domain owns it. No routing has ever occurred in SDOS; this is
its first specification.

## Status

Architecture and contract only.

## Routing Table (Derived, Not Invented)

The router does not invent domain ownership — it derives a lookup table
from what already exists:

| Domain signal | Owning executive | Source |
|---|---|---|
| Architecture, deployment, security, code review, bug triage, performance | `cto` | `ai/executives/cto/RESPONSIBILITIES.md` |
| Order fulfilment, manufacturing, inventory, customer support, installation, logistics, incidents | `coo` | `ai/executives/coo/RESPONSIBILITIES.md` |
| Revenue, subscriptions, cash flow, pricing, GST, unit economics, fundraising | `cfo` | `ai/executives/cfo/RESPONSIBILITIES.md` |
| SEO/GEO/AEO, content, social, paid ads, lead gen, branding, campaigns | `cmo` | `ai/executives/cmo/RESPONSIBILITIES.md` |
| Product strategy, roadmap, feature prioritization, discovery, feedback, research, analytics, release planning | `cpo` | `ai/executives/cpo/RESPONSIBILITIES.md` |
| Cross-domain synthesis, conflicts between the above, company-wide health | `ceo` | `ai/executives/ceo/RESPONSIBILITIES.md` |

This table is a derived index, not a new source of truth — if a role's
own `RESPONSIBILITIES.md` changes, this table is stale until
regenerated from it, never authoritative over it.

## Dispatch Contract

1. **Single-domain match** — the task's `domain_hint` matches exactly
   one row above; the router sets `target_executive` and the task moves
   to `ROUTED`.
2. **Multi-domain match** — more than one row plausibly applies (e.g.
   a pricing change with a technical implementation component touches
   both `cfo` and `cto`). The router does **not** pick one arbitrarily;
   it routes to `ceo`, whose `DECISION_FRAMEWORK.md` already defines how
   genuine cross-domain trade-offs are evaluated — this is precisely the
   gap every sibling executive's own `INTER_EXECUTIVE_COMMUNICATION.md`
   named before the CEO role existed.
3. **No match** — the task moves to `UNROUTABLE` (`TASK_MODEL.md`) and
   then `ESCALATED` directly to the founder, per Decision Standard
   Rule 4. An unroutable task is itself worth flagging as a possible
   Company-Brain/ownership gap (Golden Rule 5), not just an error to
   dismiss.
4. **Events route the same way tasks do**, when an event should trigger
   a new task (e.g. an `error.raised` event whose class suggests a
   genuine ownership gap) — the router applies the same table and the
   same multi-/no-match handling.

## Rules

1. **The router never grants authority.** Determining *who* should
   handle a task is entirely separate from whether they're *allowed* to
   act on it — every routed task still passes
   `ai/core/permissions/PERMISSION_MODEL.md` before anything happens.
2. **Routing is re-derived, not hand-maintained, once implemented.** A
   future implementation should generate the table above from the six
   executives' own `RESPONSIBILITIES.md` files programmatically where
   feasible, so it can't silently drift out of sync the way the
   `ai/core/standards/` path reference did (see
   `ai/core/standards/README.md`).
3. **A multi-domain match is never resolved by the router itself
   guessing which domain "matters more."** That judgment belongs to
   `ai/executives/ceo/DECISION_FRAMEWORK.md` exclusively.

## Relationship to the Rest of SDOS

- Reads `RESPONSIBILITIES.md` from all six executive folders as its
  source of truth for the table above.
- Sets `Task.target_executive` per `ai/core/tasks/TASK_MODEL.md`.
- Multi-domain and no-match cases both terminate in
  `ai/executives/ceo/` — the CEO's decision framework and escalation
  routing, respectively.
- Emits `task.assigned` events per `ai/core/events/EVENT_BUS.md`.
