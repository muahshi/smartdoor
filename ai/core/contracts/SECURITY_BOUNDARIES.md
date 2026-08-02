# Security Boundaries (Contract Layer)

## Status

SDOS Phase 11. **Mostly a pointer, with one genuinely new addition.**
The structural security posture (no direct network/DB access from
`ai/`, one-way dependency, no secrets in `ai/`, least privilege, every
action attributable) is already fully specified in
`ai/core/permissions/SECURITY_MODEL.md` (Phase 9), and the read-only
gate is fully specified in
`ai/core/permissions/READONLY_INTEGRATION_POLICY.md` (Phase 9). This
file does not restate either.

## Purpose

Phase 9's `SECURITY_MODEL.md` was written before this phase's two new
concepts — inter-agent messaging (`MESSAGE_SCHEMA.md`,
`INTER_AGENT_PROTOCOL.md`) and tool invocation (`TOOL_REGISTRY.md`) —
existed even as documentation. This file's only new content is
extending `SECURITY_MODEL.md`'s existing constraints to those two new
surfaces; it is not a parallel security model.

## Responsibilities

- Point to `SECURITY_MODEL.md` and `READONLY_INTEGRATION_POLICY.md` as
  the authoritative structural posture.
- State the two extensions below, additively.

## The Two Extensions

1. **Inter-agent messages are not a bypass of the integration
   boundary.** A `Message` (`MESSAGE_SCHEMA.md`) between two executive
   instances carries no more access than either instance already has
   under `PERMISSION_MODEL.md` — one executive cannot use a message to
   grant itself, or another executive, capability neither's own
   `AUTHORITY_MATRIX.md` documents. This is `SECURITY_MODEL.md`
   constraint 4 (least privilege) applied to the message layer
   specifically.
2. **A tool (`TOOL_REGISTRY.md`) is not a second path around
   `ai/integrations/`.** Per `SECURITY_MODEL.md` constraint 1, any
   future tool that reads or writes SmartDoor production data must
   itself be implemented as, or exclusively call through,
   `ai/integrations/` — a tool registry entry is a *reference* to an
   integration capability, never an independent access path with its
   own credential.

## Inputs / Outputs

N/A — see `SECURITY_MODEL.md`.

## Validation Rules

Both extensions above are enforced the same way `SECURITY_MODEL.md`'s
existing constraints are: structurally, by there being no other code
path, not by a runtime check that could be bypassed.

## Failure Modes

A tool or message that would violate either extension is a
`PERMISSION_ERROR` or `INTEGRATION_ERROR` per
`ai/core/runtime/ERROR_HANDLING.md` — not a new error class.

## Dependencies

- `ai/core/permissions/SECURITY_MODEL.md` (authoritative)
- `ai/core/permissions/READONLY_INTEGRATION_POLICY.md` (authoritative)
- `MESSAGE_SCHEMA.md`, `TOOL_REGISTRY.md` (this folder — the two new
  surfaces this file extends security posture to)

## Future Implementation Notes

Any future phase adding a new agent-facing surface not covered by
Phase 9's original four surfaces should add its own short extension
here, in the same additive style as the two above, rather than a new
top-level security document.
