# ai/core

## Purpose

The runtime kernel of SDOS — the shared, low-level architecture that
every future AI executive depends on: executive registration, context
loading, the event bus, task/session models, task routing, permissions,
and the runtime lifecycle that ties them together.

## Status

SDOS Phase 9 (SDOS Runtime Foundation). Built on top of Phase 0
(`ai/docs/SDOS_ARCHITECTURE.md`), Phase 1 (Company Brain), Phase 2–4 and
6–8 (all six executives: CTO, COO, CFO, CMO, CPO, CEO — see
`ai/executives/README.md`). **This phase contains no executable code, no
agent runtime, and no automation.** Every file under this folder is an
architecture, interface, or contract document that a future
implementation phase must satisfy without redesigning it — exactly the
boundary every prior SDOS phase has held to.

This folder is no longer empty, but it is still entirely
documentation. The Phase 0 placeholder text this file previously
carried ("Empty. Phase 0 only creates this folder as a placeholder")
described this folder correctly for eight phases; it stopped being
accurate the moment this phase defined the nine subfolders below, so it
is replaced here rather than left stale (per Golden Rule 5 — flag,
don't silently resolve — applied to this file's own status line).

## Subfolders (All SDOS Phase 9)

| Folder | Answers | Key file(s) |
|---|---|---|
| `runtime/` | How does one turn actually run, end to end, and what happens on failure? | `RUNTIME_ARCHITECTURE.md`, `AGENT_LIFECYCLE.md`, `ERROR_HANDLING.md`, `LOGGING_STRATEGY.md` |
| `registry/` | Does this executive exist and is it well-formed? | `EXECUTIVE_REGISTRY.md` |
| `context/` | What does this executive know for this run? | `CONTEXT_LOADING.md` |
| `events/` | What just happened, and who needs to know? | `EVENT_BUS.md` |
| `tasks/` | What work is outstanding? | `TASK_MODEL.md` |
| `session/` | What run is this, and who's in it? | `SESSION_MODEL.md` |
| `permissions/` | Is this executive allowed to do this, right now? | `PERMISSION_MODEL.md`, `SECURITY_MODEL.md`, `READONLY_INTEGRATION_POLICY.md` |
| `router/` | Which executive should handle this? | `TASK_ROUTING.md` |
| `standards/` | Where does the Phase 5 shared standards library actually live? | `README.md` (resolution note — see below) |

See `runtime/RUNTIME_ARCHITECTURE.md` for how these nine pieces fit
together into one coherent architecture, including a full single-turn
walkthrough.

## A Real Gap Found and Corrected During This Phase

`ai/executives/ceo/README.md` and `ai/executives/ceo/ROADMAP.md` (Phase
8) reported that `ai/core/standards/` — the shared standards library
five executives already cite — "does not exist anywhere in the
repository." A full repository read for this phase (Golden Rule 1:
audit before touching) found that finding was based on a search scoped
only to `ai/core/`; the library in fact exists in full, eighteen files,
at the repository root (`core/standards/`), one level outside `ai/`.
See `ai/core/standards/README.md` for the complete accounting, why this
phase corrects rather than duplicates or silently relocates it, and the
founder-level decision (move vs. re-point every reference) this phase
flags for a later one to make.

## What Belongs Here

- Architecture, interfaces, and contracts for executive registration,
  context loading, the event bus, task and session models, permissions,
  and task routing — see the subfolder table above
- Documentation of the runtime lifecycle and its error/logging
  conventions

## What Does NOT Belong Here

- Business logic belonging to SmartDoor (that stays in the existing
  `services/`, `supabase/functions/`, and `js/` directories — untouched
  by this or any SDOS phase)
- Any individual executive's own reasoning, persona, or domain playbooks
  (`ai/executives/<role>/`)
- Any executable runtime code, agent process, or scheduler — none
  exists in this or any prior SDOS phase; every file here is
  architecture a future implementation phase must build to, not
  something this phase builds
