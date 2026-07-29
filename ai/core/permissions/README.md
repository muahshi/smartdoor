# ai/core/permissions

## Purpose

The runtime-enforcement layer over authority already documented per
executive. This folder does not invent new authority — every rule here
resolves to something `ai/core/standards/AUTHORITY_STANDARD.md` or a
specific executive's own `AUTHORITY_MATRIX.md` already states; this
folder defines how a future runtime *checks* those rules mechanically,
plus the security posture and read-only-first policy that bound SDOS as
a whole.

## Status

SDOS Phase 9. Architecture and contract only — no permission has ever
been checked, because no runtime exists to check one.

## What Belongs Here

- The mechanical permission-check contract (inputs, outputs, default
  behavior) that enforces existing authority matrices
- SDOS's overall security posture (secrets, network access, blast
  radius)
- The read-only-first policy that gates any future write capability

## What Does NOT Belong Here

- The actual founder-approval rules and role-specific authority tables —
  those remain entirely in `ai/core/standards/AUTHORITY_STANDARD.md` and
  each `ai/executives/<role>/AUTHORITY_MATRIX.md`; this folder checks
  them, never restates or overrides them
- Any actual credential, secret, or connection string — none exists in
  `ai/` and none is introduced by this phase
- `ai/integrations/`'s own eventual client implementation — this folder
  defines the *policy* that implementation must satisfy, not the
  implementation itself

## Files in This Folder

| File | Purpose |
|---|---|
| `PERMISSION_MODEL.md` | The mechanical permission-check contract |
| `SECURITY_MODEL.md` | SDOS's overall security posture |
| `READONLY_INTEGRATION_POLICY.md` | The read-before-write gate for any future `ai/integrations/` capability |
