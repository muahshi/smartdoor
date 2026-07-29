# ai/core/runtime

## Purpose

The architectural definition of the SDOS runtime kernel — what a future
executive-hosting process actually does, in what order, and how it fails
safely. This folder documents the shape every future runtime
implementation must satisfy; it does not implement it.

## Status

SDOS Phase 9 (SDOS Runtime Foundation). Built on top of Phase 0
(`ai/docs/SDOS_ARCHITECTURE.md`), Phase 1 (Company Brain), Phases 2–4 and
6–8 (the six executives), and the Phase 5 shared standards (see
`ai/core/standards/README.md` for their current location status).
**This phase contains no executable code.** Every file here is an
architecture, interface, or contract document describing intended
runtime behavior for a future implementation phase.

## What Belongs Here

- The overall runtime architecture: how `ai/core/registry/`,
  `ai/core/context/`, `ai/core/events/`, `ai/core/tasks/`,
  `ai/core/session/`, `ai/core/permissions/`, and `ai/core/router/` fit
  together into one coherent process model
- The executive lifecycle (spawn → load → register → operate → retire)
- Error-handling contracts: what counts as a failure, how it's
  classified, and how it propagates without crashing the whole runtime
- Logging conventions: what must be recorded, where, and in what shape

## What Does NOT Belong Here

- Any individual executive's own reasoning, persona, or domain playbooks
  (`ai/executives/<role>/`)
- Business logic belonging to SmartDoor (`services/`,
  `supabase/functions/`, `js/` — untouched by this or any SDOS phase)
- The registry, context-loading, event-bus, task, session, permission,
  and routing *contracts themselves* — those are defined in their own
  sibling folders and only referenced, not restated, here
- Actual scheduling, orchestration, or agent-execution code — none
  exists in this or any prior SDOS phase

## Files in This Folder

| File | Purpose |
|---|---|
| `RUNTIME_ARCHITECTURE.md` | The overall shape: components, their relationships, and a single-turn walkthrough |
| `AGENT_LIFECYCLE.md` | The states an executive instance moves through, spawn to retire |
| `ERROR_HANDLING.md` | Failure classification and propagation contract |
| `LOGGING_STRATEGY.md` | What gets logged, where, and in what shape |
