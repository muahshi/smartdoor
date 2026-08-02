# ai/core/contracts

## Purpose

SDOS Phase 11 (Agent Runtime Contracts). Implementation-ready contracts
for the future SDOS agent runtime — the layer above Phase 9's runtime
foundation (`ai/core/runtime/`, `registry/`, `context/`, `events/`,
`tasks/`, `session/`, `permissions/`, `router/`) and Phase 10's
integration layer (`ai/integrations/`). This is **not implementation,
not runtime code, and not AI execution** — every file here is a
specification a future implementation phase must satisfy.

## Status

Documentation and contracts only. Nothing in this folder has ever run.

## Two Kinds of File in This Folder

Per this build's explicit "never duplicate work" instruction, this
folder contains two distinct kinds of document:

1. **Pointers** — for concepts Phase 9 already fully specified
   (agent registration, lifecycle/state machine, event schema, task
   schema, error handling) or Phase 9 already fully specified as a
   structural posture (security boundaries, extended here only for two
   new surfaces). These files redirect to the real source rather than
   restating it, in the same style `ai/core/standards/README.md`
   already established for its own path-resolution finding.
2. **Genuinely new contracts** — for concepts no prior phase
   specified at all: inter-agent messaging, memory persistence, the
   context object's concrete shape, a prompt registry, a tool
   registry, the concrete internals of the runtime's "reasoning" step,
   the founder-approval workflow end to end, observability content,
   a durable audit trail, and content-versioning discipline.

## Index

| File | Kind | Points to / Covers |
|---|---|---|
| `AGENT_REGISTRATION.md` | Pointer | `ai/core/registry/EXECUTIVE_REGISTRY.md` |
| `AGENT_LIFECYCLE.md` | Pointer | `ai/core/runtime/AGENT_LIFECYCLE.md` |
| `AGENT_STATE_MACHINE.md` | Pointer | `ai/core/runtime/AGENT_LIFECYCLE.md` |
| `MESSAGE_SCHEMA.md` | New | Directed agent-to-agent message shape |
| `EVENT_SCHEMA.md` | Pointer | `ai/core/events/EVENT_BUS.md` |
| `TASK_SCHEMA.md` | Pointer | `ai/core/tasks/TASK_MODEL.md` |
| `MEMORY_SCHEMA.md` | New | Durable cross-session memory record shape |
| `CONTEXT_SCHEMA.md` | New (extends `CONTEXT_LOADING.md`) | The assembled-context object shape |
| `PROMPT_REGISTRY.md` | New | Index of executives' `PROMPT_TEMPLATE.md` files |
| `TOOL_REGISTRY.md` | New | Registry of future invokable tools |
| `EXECUTION_PIPELINE.md` | New (extends `RUNTIME_ARCHITECTURE.md`) | The internals of the runtime's reasoning step |
| `APPROVAL_WORKFLOW.md` | New (extends `PERMISSION_MODEL.md`) | End-to-end approval request/decision workflow |
| `ERROR_HANDLING.md` | Pointer | `ai/core/runtime/ERROR_HANDLING.md` |
| `OBSERVABILITY.md` | New (extends `LOGGING_STRATEGY.md`) | Founder-facing observability content |
| `AUDIT_TRAIL.md` | New | Durable, accountability-focused record layer |
| `VERSIONING.md` | New | Version-identifier scheme for runtime artifacts |
| `SECURITY_BOUNDARIES.md` | Extension pointer | `SECURITY_MODEL.md` + two new-surface extensions |
| `INTER_AGENT_PROTOCOL.md` | New | When/why a `Message` is sent between executives |
| `FOUNDER_APPROVAL_FLOW.md` | New (extends `APPROVAL_WORKFLOW.md`) | Founder-facing presentation of a pending approval |

## What Belongs Here

- Implementation-ready contracts for a future agent runtime,
  specifically the concepts Phase 9's runtime foundation left
  unspecified: inter-agent messaging, memory, prompt/tool registries,
  the reasoning step's internals, and the founder-approval workflow's
  human-facing side.

## What Does NOT Belong Here

- Anything Phase 9 already specifies in full (see the Pointer rows
  above) — restated here.
- Executable code, an agent process, or a scheduler — none exists in
  this or any prior SDOS phase.
- Business logic belonging to SmartDoor.

## Relationship to the Rest of SDOS

- Builds directly on `ai/core/runtime/`, `registry/`, `context/`,
  `events/`, `tasks/`, `session/`, `permissions/`, `router/` (Phase 9)
  and `ai/integrations/` (Phase 10) — extends, never restates.
- See `ai/docs/adr/ADR-0005-Agent-Runtime-Contracts.md` and
  `ADR-0006-Agent-Communication.md` for why this folder exists and why
  it's structured as pointers-plus-extensions rather than nineteen
  independent documents.
- See `ai/docs/IMPLEMENTATION_READINESS_REPORT.md` for what a future
  implementation phase would still need to build against all of this.
