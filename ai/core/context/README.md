# ai/core/context

## Purpose

The contract for what "context" means for an executive's turn, where it
comes from, in what order it's assembled, and what happens when sources
disagree.

## Status

SDOS Phase 9. Architecture and contract only — no context has ever been
programmatically loaded; every executive's `PROMPT_TEMPLATE.md`
describes an assembly order it assumes a runtime will one day perform.
This folder is that assumption's first concrete specification.

## What Belongs Here

- The context-loading order and precedence rules
- What counts as in-scope context for a given executive vs. out-of-scope
- How a context-source conflict (e.g. `ai/knowledge/` vs. live data, once
  `ai/integrations/` exists) is surfaced rather than silently resolved

## What Does NOT Belong Here

- The knowledge content itself (`ai/knowledge/`) — this folder loads it,
  never duplicates or forks it
- Any individual executive's own prompt assembly specifics — each
  role's own `PROMPT_TEMPLATE.md` remains the source for role-specific
  ordering nuance; this folder defines the shared mechanism underneath
- Persistent memory (`ai/memory/`) — context is per-turn; memory is
  cross-turn. This folder reads memory as a future input; it does not
  define how memory itself is stored

## Files in This Folder

| File | Purpose |
|---|---|
| `CONTEXT_LOADING.md` | Load order, precedence, and conflict-handling contract |
