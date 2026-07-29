# Runtime Architecture

Overall shape and umbrella definition: see
`ai/core/standards/EXECUTIVE_STANDARD.md` (see
`ai/core/standards/README.md` for this reference's current resolution
status) for what an executive *is*; this file defines the process that
will, in a future phase, host one.

## Status

Architecture and contracts only. No process described here runs today.
Every component below is documentation a future implementation phase
must satisfy without redesigning this shape.

## The Seven Components and How They Relate

```
                        ┌─────────────────────┐
                        │   ai/core/registry/  │
                        │  (who can run at all) │
                        └──────────┬───────────┘
                                   │ validates + admits
                                   ▼
┌───────────────┐        ┌─────────────────────┐        ┌───────────────┐
│ ai/core/context│◄──────┤   ai/core/runtime/   ├───────►│ai/core/session│
│ (what it reads)│        │   (the lifecycle)    │        │ (the run itself)│
└───────────────┘        └──────────┬───────────┘        └───────────────┘
                                   │ emits / consumes
                                   ▼
                        ┌─────────────────────┐
                        │   ai/core/events/    │
                        │  (what happened)      │
                        └──────────┬───────────┘
                                   │ triggers
                                   ▼
        ┌──────────────┐  ┌─────────────────────┐  ┌──────────────────┐
        │ ai/core/tasks/│◄─┤   ai/core/router/    ├─►│ai/core/permissions│
        │ (what to do)  │  │ (who should do it)    │  │ (what's allowed)  │
        └──────────────┘  └─────────────────────┘  └──────────────────┘
```

- **Registry** answers "does this executive exist and is it well-formed?"
  before anything else runs. See `ai/core/registry/EXECUTIVE_REGISTRY.md`.
- **Context** answers "what does this executive know for this run?" —
  Company Brain, its own folder, standards, memory (future). See
  `ai/core/context/CONTEXT_LOADING.md`.
- **Session** answers "what run is this, and who else is in it?" — the
  bounded, observable container a lifecycle executes inside. See
  `ai/core/session/SESSION_MODEL.md`.
- **Events** answer "what just happened?" — the append-only record every
  other component reacts to or emits into. See
  `ai/core/events/EVENT_BUS.md`.
- **Tasks** answer "what work is outstanding?" — the unit of work an
  executive is asked to address. See `ai/core/tasks/TASK_MODEL.md`.
- **Router** answers "which executive should handle this task or
  event?" — domain-ownership-based dispatch. See
  `ai/core/router/TASK_ROUTING.md`.
- **Permissions** answer "is this executive allowed to do this, right
  now?" — the runtime-enforcement layer over the authority already
  documented per-role. See `ai/core/permissions/PERMISSION_MODEL.md`.

None of these seven components currently executes. Each is a
self-contained contract so a future implementation phase can build any
one of them without redesigning the others.

## A Single Turn, Walked Through (Intended, Future Behavior)

This sequence describes what a future runtime implementation is
expected to do. Nothing below happens today.

1. **Admission** — the runtime asks the registry whether the requested
   executive (e.g. `cto`) is registered and well-formed. If not,
   the turn ends immediately with a registration error (see
   `ERROR_HANDLING.md`).
2. **Session attach** — the runtime attaches (or opens) a session per
   `ai/core/session/SESSION_MODEL.md`, so the turn is observable and
   attributable.
3. **Context load** — the runtime assembles context per
   `ai/core/context/CONTEXT_LOADING.md`: Company Brain, the executive's
   own folder, applicable standards, and (future phase) any relevant
   memory.
4. **Permission check** — before any action beyond read-and-reason is
   even considered, the runtime checks `ai/core/permissions/PERMISSION_MODEL.md`
   against the requested task. Per `AUTHORITY_STANDARD.md`, the default
   is founder-approval-required; nothing is granted by omission.
5. **Task intake** — if the turn was triggered by a task, the runtime
   reads it per `ai/core/tasks/TASK_MODEL.md`; if triggered by an event,
   the router (`ai/core/router/TASK_ROUTING.md`) determines whether a
   task should be created.
6. **Reasoning** — the executive (in a future phase, an actual model
   invocation assembled per each role's own `PROMPT_TEMPLATE.md`)
   reasons within the loaded context and produces a result: an answer,
   a recommendation, or an escalation. As of this phase, no such
   invocation exists — this step is the entire reason Phases 2–8 exist
   as pure documentation.
7. **Event emission** — the outcome (decision made, escalation raised,
   error hit) is emitted onto the event bus per
   `ai/core/events/EVENT_BUS.md`, so other components and, eventually,
   `ai/dashboard/` can observe it.
8. **Logging** — the runtime records the turn per
   `LOGGING_STRATEGY.md`.
9. **Session update / close** — the session is updated or closed per
   `SESSION_MODEL.md`, and, in a future phase, persisted context is
   handed to `ai/memory/`.

## Non-Goals of This Architecture (This Phase)

- No component here schedules, triggers, or automates anything —
  `ai/workflows/` remains the (future) home for multi-step automation,
  and it remains empty as of this phase.
- No component here grants an executive any authority beyond what its
  own `AUTHORITY_MATRIX.md` already documents — the runtime enforces
  existing authority; it never expands it.
- No component here reads or writes SmartDoor's production data —
  that access is exclusively mediated by `ai/integrations/`, which
  remains empty as of this phase (see
  `ai/core/permissions/READONLY_INTEGRATION_POLICY.md`).

## Relationship to the Rest of SDOS

- Depends on `ai/core/standards/EXECUTIVE_STANDARD.md` for what an
  executive fundamentally is.
- Is the runtime every one of the six existing executives'
  `PROMPT_TEMPLATE.md` files already assumes exists when they describe
  an "assembly order" — this phase is that assumption's first concrete
  specification, not its implementation.
- Feeds, in a future phase, `ai/dashboard/` (observability) and
  `ai/memory/` (persistence) — neither exists yet.
