# Versioning

## Status

SDOS Phase 11. Genuinely new. `core/standards/NAMING_STANDARD.md`
governs file and folder *naming* conventions across `ai/`; no phase
before this one specifies how a runtime artifact's *content* —
prompts, schemas, contracts themselves — is versioned as it changes
over time.

## Purpose

Define how versioning works for the artifacts this and prior phases
introduced that a future runtime will load and depend on: prompt
templates (`PROMPT_REGISTRY.md`), schemas
(`MESSAGE_SCHEMA.md`/`TASK_SCHEMA.md`/etc.), and the contracts in this
folder themselves — so a future implementation can detect drift
between what it was built against and what currently exists.

## Responsibilities

- Define a version-identifier format every registry entry
  (`PromptRegistryEntry`, `ToolRegistryEntry`, a future
  `RegistryEntry.standards_version`) can carry consistently.
- Define what counts as a breaking vs. non-breaking change to a schema
  or contract in this folder.

## Inputs

Any change to a file in `ai/core/contracts/`, an executive's
`PROMPT_TEMPLATE.md`, or `core/standards/`.

## Outputs — Version Identifier Format

```
version: "<major>.<minor>"
```

- **Major** increments on any change that would invalidate an existing
  registry entry built against the prior version (e.g. a required
  field added to `TaskRegistryEntry`, a `Message` field renamed).
- **Minor** increments on additive, backward-compatible change (e.g. a
  new optional field, a new event type per `EVENT_BUS.md`'s own "new
  event types are additive" rule).

## Validation Rules

1. **A major version bump to any schema in this folder requires every
   existing registry entry built against it to be re-validated**, not
   silently assumed still compatible — this is
   `PROMPT_REGISTRY.md`'s own "an entry's `standards_version` must be
   resolvable... flagged as stale" rule, generalized to every schema
   in `contracts/`.
2. **This folder's own files follow ADR discipline for major
   decisions, not silent edits.** Per `ai/docs/adr/README.md` Rule 4,
   a materially different version of a contract here (e.g. redefining
   `Message`'s shape) is a new ADR, not an in-place edit that erases
   why the prior shape was chosen.
3. **Non-breaking (minor) changes may be edited in place**, with the
   file's own version identifier bumped — this keeps the discipline
   proportionate: not every clarifying edit needs a new ADR, only
   ones that change what a future implementation must satisfy.

## Failure Modes

A future implementation that loads a registry entry whose
`standards_version` (or equivalent) doesn't resolve to any version this
file's history recognizes is a `CONTEXT_ERROR`-adjacent case — treated
as stale/unresolvable, never silently assumed compatible with current
behavior.

## Dependencies

- `core/standards/NAMING_STANDARD.md` (file/folder naming — this file
  covers content versioning specifically, a distinct concern)
- `ai/docs/adr/README.md` (the discipline major contract changes must
  follow)
- `PROMPT_REGISTRY.md`, `TOOL_REGISTRY.md` (registries whose entries
  carry a version this file's format applies to)

## Future Implementation Notes

No automated version-compatibility checker is built in this phase —
this file defines the format and discipline; enforcing it
mechanically is a future runtime's job.

## Relationship to the Rest of SDOS

- Gives every registry entry format introduced in Phase 9–11
  (`RegistryEntry.standards_version`, `PromptRegistryEntry`,
  `ToolRegistryEntry`) one consistent version scheme to reference,
  rather than each inventing its own.
- Ties this folder's own future evolution back to
  `ai/docs/adr/README.md`'s existing discipline.
