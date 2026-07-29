# ai/core/router

## Purpose

The contract for how a task or event finds its way to the right
executive — dispatch based on domain ownership already documented in
each executive's own `RESPONSIBILITIES.md`, not a new ownership model
invented here.

## Status

SDOS Phase 9. Architecture and contract only — no task or event has
ever been routed, because no runtime exists to route one.

## What Belongs Here

- The routing table concept (domain → executive) and how it's derived
- Conflict handling when more than one executive's domain plausibly
  applies
- What happens when no executive's domain applies

## What Does NOT Belong Here

- The task/event objects themselves (`ai/core/tasks/`,
  `ai/core/events/`)
- Any executive's actual domain boundaries — those are defined once,
  in each role's own `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md`;
  this folder only reads and dispatches against them
- Conflict *resolution* once a genuine cross-domain conflict is
  identified — that is `ai/executives/ceo/DECISION_FRAMEWORK.md`'s job,
  which this folder routes to rather than reimplements

## Files in This Folder

| File | Purpose |
|---|---|
| `TASK_ROUTING.md` | Routing table derivation and dispatch contract |
