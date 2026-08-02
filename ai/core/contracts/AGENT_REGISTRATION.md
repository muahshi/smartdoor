# Agent Registration (Contract Layer)

## Status

SDOS Phase 11. This file is a **pointer, not a duplicate**. Agent
registration is already fully specified in
`ai/core/registry/EXECUTIVE_REGISTRY.md` (Phase 9) — the registry
entry shape, the five-step registration flow, and what registration
deliberately does not do (grant authority, validate content, spawn
anything). Per this build's explicit "never duplicate work" rule and
the same discipline `ai/core/standards/README.md` already applied to
its own path-resolution finding, this document does not restate that
content.

## Purpose

To give `ai/core/contracts/` — the Phase 11 index of every contract a
future SDOS agent runtime must satisfy — a complete table of contents,
this file exists so a reader starting from `contracts/` (rather than
`ai/core/README.md`) is redirected to the real source rather than
finding a gap.

## Responsibilities

- Point to `ai/core/registry/EXECUTIVE_REGISTRY.md` as the single
  source of truth for registration.
- Flag, for a future implementation phase, that "agent" (this phase's
  and the wider industry's usual term) and "executive" (SDOS's existing
  term since ADR-0002) refer to the same concept — see
  `ai/docs/adr/ADR-0005-Agent-Runtime-Contracts.md` for why Phase 11
  keeps "executive" as the canonical term rather than introducing a
  parallel vocabulary.

## Inputs / Outputs

None — this file performs no function itself; see
`EXECUTIVE_REGISTRY.md`'s own Inputs/Outputs (`RegistryEntry` shape).

## Validation Rules

N/A — see `EXECUTIVE_REGISTRY.md` Registration Flow, step 2 (template
validation).

## Failure Modes

N/A — see `ai/core/runtime/ERROR_HANDLING.md`'s `REGISTRY_ERROR` class.

## Dependencies

- `ai/core/registry/EXECUTIVE_REGISTRY.md` (authoritative)
- `core/standards/ROLE_TEMPLATE.md` (via `ai/core/standards/README.md`'s
  resolution note)

## Future Implementation Notes

A future implementation phase building an actual registration process
builds directly against `EXECUTIVE_REGISTRY.md` — this pointer file is
not itself a target to implement against.
