# ai/core/session

## Purpose

The contract for a "session" — the bounded, observable container one or
more executive lifecycles run inside, so a founder can always answer
"what happened during this run, and who was involved."

## Status

SDOS Phase 9. Architecture and contract only — no session has ever been
opened, because no runtime exists to open one.

## What Belongs Here

- The session object's shape
- What starts and ends a session
- How a session differs from an individual executive's lifecycle
  (`ai/core/runtime/AGENT_LIFECYCLE.md`) and from persistent memory
  (`ai/memory/`)

## What Does NOT Belong Here

- An individual executive instance's own states — those are
  `ai/core/runtime/AGENT_LIFECYCLE.md`
- Cross-session persistence — that is `ai/memory/`'s eventual role, not
  this folder's; a session is explicitly bounded and does not itself
  define how (or whether) its content survives into a future session

## Files in This Folder

| File | Purpose |
|---|---|
| `SESSION_MODEL.md` | Session object shape and boundary rules |
