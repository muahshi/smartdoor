# Agent Lifecycle

The states a single executive *instance* (e.g. one running turn of
`cto`) moves through. Distinct from `ai/core/session/SESSION_MODEL.md`,
which defines the container a lifecycle runs inside — one session may
contain lifecycles for more than one executive (e.g. a CEO synthesis
that reads CTO and CFO context in the same session).

## Status

Architecture only. No lifecycle described below executes today; no
executive has ever been spawned by a runtime, because no runtime exists
to spawn one.

## States

| State | Meaning | Entered from | Exits to |
|---|---|---|---|
| `REGISTERED` | The executive exists in `ai/core/registry/` and is well-formed | (registry validation, not a lifecycle state itself) | `SPAWNING` |
| `SPAWNING` | Runtime is assembling context and checking permissions for a specific turn | `REGISTERED` (new turn requested) | `ACTIVE` or `FAILED` |
| `ACTIVE` | Executive is reasoning within its loaded context for the current turn | `SPAWNING` | `AWAITING_APPROVAL`, `EMITTING`, or `FAILED` |
| `AWAITING_APPROVAL` | Executive's proposed action requires founder approval per `ai/core/permissions/PERMISSION_MODEL.md` | `ACTIVE` | `ACTIVE` (approved, resumes) or `RETIRED` (declined) |
| `EMITTING` | Executive's result is being written to the event bus and logs | `ACTIVE` | `RETIRED` |
| `FAILED` | An unrecoverable error occurred; see `ERROR_HANDLING.md` | `SPAWNING` or `ACTIVE` | `RETIRED` |
| `RETIRED` | The turn is complete; instance state is discarded (session/memory persist separately) | `EMITTING`, `AWAITING_APPROVAL` (declined), or `FAILED` | (terminal) |

## Rules

1. **No instance skips `SPAWNING`.** Context load and the initial
   permission check always happen before any reasoning step, without
   exception — this is what makes Golden Rule 1 (`QUALITY_STANDARD.md`:
   audit before touching) a runtime-enforced property, not just a
   documented convention.
2. **`AWAITING_APPROVAL` is not a failure.** An executive proposing
   something that needs founder sign-off (per its own
   `AUTHORITY_MATRIX.md`) is the system working as designed, not an
   error condition — it must be distinguishable from `FAILED` in every
   log and event.
3. **An instance never re-enters `ACTIVE` after `RETIRED`.** A follow-up
   turn is a new instance, even within the same session — this keeps
   each instance's reasoning auditable as a single, bounded unit.
4. **`RETIRED` discards instance state, not session or memory state.**
   What the executive decided and why is preserved (in a future phase)
   via `ai/core/events/EVENT_BUS.md` and, eventually, `ai/memory/` — the
   lifecycle itself is ephemeral by design.
5. **Every state transition is an event.** Once
   `ai/core/events/EVENT_BUS.md` is implemented, every arrow in the
   table above corresponds to an emitted event, so the full lifecycle of
   any instance is reconstructable after the fact.

## Health-Check (Future Capability)

`ai/core/README.md`'s original Phase 0 placeholder text named
"start/stop/health-check an AI executive" as an eventual runtime
responsibility. As of this phase, "health" has no defined meaning beyond
"is this executive's folder well-formed per the registry" (a
`REGISTERED`-time check, not a running-process check, since no process
runs continuously). A future phase may define liveness/health for an
actual running process; that is out of this phase's scope and is not
invented here to fill the gap.

## Relationship to the Rest of SDOS

- Every state above maps to the single-turn walkthrough in
  `RUNTIME_ARCHITECTURE.md`.
- `AWAITING_APPROVAL` is the lifecycle-level enforcement point for
  `ai/core/permissions/PERMISSION_MODEL.md` and, ultimately,
  `AUTHORITY_STANDARD.md`'s universal founder-approval rows.
- `FAILED` routes to `ERROR_HANDLING.md`.
