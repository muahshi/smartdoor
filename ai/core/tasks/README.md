# ai/core/tasks

## Purpose

The contract for what a "task" is in SDOS — the unit of outstanding
work an executive is asked to address, distinct from an event (`ai/core/events/`,
which records that something happened) and from a workflow
(`ai/workflows/`, a future multi-step sequence that may create several
tasks).

## Status

SDOS Phase 9. Architecture and contract only — no task has ever been
created, assigned, or resolved, because no runtime exists to process
one.

## What Belongs Here

- The task object's shape and its lifecycle states
- What can create a task (founder request, another executive, a future
  workflow) and what a task's resolution looks like

## What Does NOT Belong Here

- Which executive should handle a given task — that's routing logic,
  defined in `ai/core/router/TASK_ROUTING.md`
- Multi-step process definitions — `ai/workflows/` (still empty)
- SmartDoor's own operational task/ticket concepts (e.g. support
  tickets in `services/customerGrowth.js`) — those remain exactly where
  they are; an SDOS task is an internal SDOS-executive unit of work,
  never a duplicate of a production ticket system

## Files in This Folder

| File | Purpose |
|---|---|
| `TASK_MODEL.md` | Task object shape and lifecycle states |
