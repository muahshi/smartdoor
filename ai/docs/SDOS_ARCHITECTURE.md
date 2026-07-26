# SDOS — SmartDoor Operating System

## Status: Phase 0 (Foundation Only)

This document describes the intended shape of SDOS. As of Phase 0, only the
folder structure and this documentation exist. No AI, no dashboards, no
workflows, and no business logic have been implemented. Every section below
describes future intent, not current behavior, unless explicitly marked
"implemented."

---

## Purpose

SDOS is an internal AI Operating System for running the SmartDoor business.
It is not a product feature and not customer-facing. It exists to give a set
of future AI executives (CEO, CTO, COO, CFO, and others) a shared, structured
place to operate — read business context, reason about it, and eventually
take or recommend actions — without touching or duplicating SmartDoor's
existing production systems.

SDOS is explicitly **not** a replacement for SmartDoor. SmartDoor's website,
backend (Supabase database + Edge Functions), and existing services remain
the single source of truth for all business data and all customer-facing
functionality, permanently.

## Vision

Over time, SDOS should let AI executives:

- Observe what's happening in the business (orders, activations, support
  issues, revenue, churn) by reading from SmartDoor's existing data
- Reason about it using shared knowledge and memory
- Run defined workflows (e.g. weekly business review, anomaly flagging)
- Surface recommendations — and eventually, with explicit human approval
  gates, take limited actions
- Do all of this in a way a human (Mubashir) can observe, audit, and
  override via a dedicated dashboard

This is a multi-phase effort. Phase 0 deliberately implements none of the
above — it only lays the folder/documentation foundation so future phases
have a consistent place to build into.

## Folder Responsibilities

| Folder | Responsibility |
|---|---|
| `ai/core/` | Shared runtime: executive lifecycle, task routing, event loop. The kernel every executive depends on. |
| `ai/executives/` | Individual AI executive roles (CEO, CTO, COO, CFO, ...), their responsibilities and boundaries. |
| `ai/knowledge/` | AI-facing knowledge base — derived/curated context for executives to reason over. Never the source of truth itself. |
| `ai/memory/` | Persistent memory — decision logs, session continuity — so executives retain context across runs. |
| `ai/workflows/` | Multi-step processes executives run (e.g. a scheduled business review). |
| `ai/integrations/` | The boundary layer to the outside world, most importantly a (future, read-only-first) client into SmartDoor's Supabase data. |
| `ai/dashboard/` | Future human-facing surface for observing and auditing SDOS activity. Separate from all existing SmartDoor dashboards. |
| `ai/prompts/` | Prompt library — system prompts and reusable fragments that executives are built from. |
| `ai/docs/` | SDOS's own documentation, starting with this file. |

Each folder currently contains only a `README.md` placeholder describing its
intended purpose in more detail.

## Design Principles

1. **SmartDoor's existing systems are the permanent source of truth.**
   SDOS reads from them; it does not fork, duplicate, or replace them.
2. **Additive only.** Every phase of SDOS is designed to be added alongside
   the existing repository, never to modify existing production files.
3. **Read before write.** Integrations start read-only. Any future
   write-capable action requires an explicit, separate decision and
   approval gate — not an assumption baked in from Phase 0.
4. **Observable by default.** Anything an AI executive does should be
   visible to a human via `ai/dashboard/` and recorded via `ai/memory/`,
   not opaque.
5. **Incremental phases.** SDOS is built phase by phase (Phase 0:
   foundation, later phases: knowledge wiring, a first read-only
   integration, a first executive, a first workflow, a first dashboard
   view). No phase should assume or silently include work from a later
   phase.

## Future Roadmap (indicative, not committed)

- **Phase 1** — Wire `ai/knowledge/` with a first derived knowledge set
  (e.g. a distilled version of `BUSINESS_RULES.md`).
- **Phase 2** — Build a first read-only integration in `ai/integrations/`
  into SmartDoor's Supabase data.
- **Phase 3** — Stand up the first AI executive (likely CTO or COO) with a
  narrow, well-defined responsibility.
- **Phase 4** — First workflow + first `ai/memory/` persistence mechanism.
- **Phase 5** — First `ai/dashboard/` view for human observability.

Each phase should be scoped and approved independently; this roadmap is
directional, not a commitment to build all of it.

## How SDOS Communicates with SmartDoor

Today (Phase 0): it doesn't. There is no code path connecting `ai/` to any
part of the existing repository.

Intended future design: SDOS will communicate with SmartDoor exclusively
through `ai/integrations/`, which will hold a dedicated client for reading
SmartDoor's Supabase data (and, far later, for taking any approved write
actions). SDOS will never reach into `services/`, `supabase/functions/`, or
`js/` directly, and SmartDoor's existing code will never import from or
depend on `ai/` — the dependency direction is one-way (SDOS depends on
SmartDoor's data; SmartDoor never depends on SDOS).

---

*This document should be kept up to date as each phase of SDOS is
implemented — replacing "future intent" language with "implemented"
descriptions as the corresponding work actually lands.*
