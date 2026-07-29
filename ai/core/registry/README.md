# ai/core/registry

## Purpose

The contract for how an AI executive becomes known to the runtime at
all — the admission gate every executive passes through before
`ai/core/runtime/AGENT_LIFECYCLE.md` can spawn an instance of it.

## Status

SDOS Phase 9. Architecture and contract only — no registration has ever
happened, because no runtime exists to register an executive into.

## What Belongs Here

- The executive registry's data shape (what a registry entry contains)
- The registration flow: how an executive folder becomes a valid
  registry entry, and what's validated along the way
- The relationship between registration and `ROLE_TEMPLATE.md` /
  `EXECUTIVE_STANDARD.md` compliance

## What Does NOT Belong Here

- Any individual executive's actual content (mission, authority,
  playbooks) — those stay in `ai/executives/<role>/`
- Runtime lifecycle states once an executive is registered and spawned
  (`ai/core/runtime/AGENT_LIFECYCLE.md`)
- Permission enforcement (`ai/core/permissions/`) — the registry answers
  "does this executive exist and is it well-formed," not "is it allowed
  to do this specific thing"

## Files in This Folder

| File | Purpose |
|---|---|
| `EXECUTIVE_REGISTRY.md` | Registry entry shape and the registration flow |
