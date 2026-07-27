# ai/core

## Purpose
The runtime kernel of SDOS. This is where the shared, low-level machinery that
every future AI executive depends on will live — process orchestration, the
executive lifecycle (spawn, schedule, retire), inter-executive messaging, task
routing, and the central event loop that ties SDOS to SmartDoor's real data.

## Status
Empty. Phase 0 only creates this folder as a placeholder. No orchestration
code, no executive runtime, and no scheduling logic exist yet.

## What will eventually go here
- Executive lifecycle management (start/stop/health-check an AI executive)
- Task/event routing between executives
- Shared context or state passed between executives during a run
- Core error handling and logging conventions for SDOS

## What does NOT go here
- Business logic belonging to SmartDoor (that stays in the existing
  `services/`, `supabase/functions/`, and `js/` directories)
- Any individual executive's own reasoning or prompts (those belong in
  `ai/executives/` and `ai/prompts/`)
