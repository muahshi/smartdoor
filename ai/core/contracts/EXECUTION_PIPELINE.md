# Execution Pipeline

## Status

SDOS Phase 11. **Extension, not a duplicate.**
`ai/core/runtime/RUNTIME_ARCHITECTURE.md` (Phase 9) already fully
specifies the nine-step single-turn walkthrough (admission → session
attach → context load → permission check → task intake → reasoning →
event emission → logging → session update/close). Its own step 6
("Reasoning") is explicitly left unspecified: "As of this phase, no
such invocation exists — this step is the entire reason Phases 2–8
exist as pure documentation." This file's only job is to specify what
step 6 actually contains, now that this phase adds `MESSAGE_SCHEMA.md`,
`TOOL_REGISTRY.md`, and `PROMPT_REGISTRY.md` for it to be built from.
Steps 1–5 and 7–9 are not restated here.

## Purpose

Define the internal shape of `RUNTIME_ARCHITECTURE.md` step 6 — what a
future model invocation, tool-call loop, and inter-agent message
exchange actually look like inside one `ACTIVE` lifecycle instance.

## Responsibilities

- Specify the sub-steps within `ACTIVE`, without touching the
  surrounding lifecycle states themselves (`AGENT_LIFECYCLE.md`
  remains authoritative for those).
- Tie together, for the first time, the three genuinely new Phase 11
  artifacts (`PROMPT_REGISTRY.md`, `TOOL_REGISTRY.md`,
  `MESSAGE_SCHEMA.md`) into one coherent execution sequence.

## Inputs

An `AssembledContext` (`CONTEXT_SCHEMA.md`) and a resolved
`PromptRegistryEntry` (`PROMPT_REGISTRY.md`), for an executive instance
that has just entered `ACTIVE` (`AGENT_LIFECYCLE.md`).

## Outputs

Sub-steps within `ACTIVE`, before the instance transitions to
`AWAITING_APPROVAL`, `EMITTING`, or `FAILED`:

1. **Prompt assembly** — resolve the executive's `PromptRegistryEntry`
   and compose it with the `AssembledContext`, per
   `PROMPT_REGISTRY.md`'s own deferral of exact assembly mechanism.
2. **Invocation** — a future model call, using the assembled prompt.
   Not specified further in this phase (which model, which API — those
   are implementation, not architecture, decisions).
3. **Tool-call sub-loop (optional, zero or more iterations)** — if the
   invocation's result proposes using a registered tool
   (`TOOL_REGISTRY.md`), each call: (a) validates against that tool's
   `allowed_executives` and `input_schema`, (b) executes (in a future
   phase) exclusively through the cited `integration_ref`, (c) returns
   `output_schema`-shaped data back into the reasoning step. Every
   iteration is bounded by `TOOL_REGISTRY.md`'s own validation rules —
   this file adds no new tool-authorization logic of its own.
4. **Inter-agent message sub-loop (optional, zero or more messages)** —
   if the invocation's result determines another executive's input is
   needed, a `Message` is sent per `INTER_AGENT_PROTOCOL.md`, and the
   pipeline either waits for the `RESPONSE` or proceeds per that
   protocol's Rule 2.
5. **Result production** — the executive produces an answer,
   recommendation, or escalation, feeding `RUNTIME_ARCHITECTURE.md`
   step 7 (event emission) unchanged.

## Validation Rules

1. **Every tool call within step 3 passes `TOOL_REGISTRY.md`'s own
   validation rules** — this file does not duplicate or loosen them.
2. **Every message within step 4 passes `MESSAGE_SCHEMA.md`'s and
   `INTER_AGENT_PROTOCOL.md`'s own validation rules** — same
   non-duplication principle.
3. **A permission check (`PERMISSION_MODEL.md`) that would apply to the
   *eventual* action an executive is reasoning toward still happens
   before that action, not skipped because reasoning already
   completed** — this restates `RUNTIME_ARCHITECTURE.md` step 4's
   ordering, applied inside the reasoning step's own sub-steps, not a
   new permission mechanism.

## Failure Modes

- A failed invocation (step 2) is an `EXECUTION_ERROR` per
  `ai/core/runtime/ERROR_HANDLING.md` — the one error class that file
  already flags as "future phase only... a future phase defines this
  once... real failure modes to design against" exist; this file does
  not invent that retry/backoff policy either, consistent with
  `ERROR_HANDLING.md`'s own Rule 5.
- A failed tool call is an `INTEGRATION_ERROR` (per `TOOL_REGISTRY.md`'s
  own failure modes) or a `PERMISSION_ERROR` — never silently retried
  into a different outcome, per `ERROR_HANDLING.md` Rule 2.
- A failed message exchange is handled per
  `INTER_AGENT_PROTOCOL.md`'s own failure modes.

## Dependencies

- `ai/core/runtime/RUNTIME_ARCHITECTURE.md` (the outer nine-step
  walkthrough this file's content sits inside, at step 6 only)
- `PROMPT_REGISTRY.md`, `TOOL_REGISTRY.md`, `MESSAGE_SCHEMA.md`,
  `INTER_AGENT_PROTOCOL.md` (this folder)
- `ai/core/permissions/PERMISSION_MODEL.md`
- `ai/core/runtime/ERROR_HANDLING.md`

## Future Implementation Notes

No model, inference provider, or specific tool-calling API is chosen
in this phase. `ai/integrations/groq/README.md`'s own explicit
boundary ("SDOS never calls the Groq API directly with its own key...
never calls `groq-proxy` to generate content on the business's
behalf") continues to apply in full to whatever invocation mechanism a
future phase chooses for step 2 — this pipeline does not create a new
path around that boundary.

## Relationship to the Rest of SDOS

- Extends, without restating, `RUNTIME_ARCHITECTURE.md` step 6.
- Is the one document that ties `PROMPT_REGISTRY.md`, `TOOL_REGISTRY.md`,
  and `MESSAGE_SCHEMA.md`/`INTER_AGENT_PROTOCOL.md` together into a
  single sequence.
