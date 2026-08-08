# Execution Flow

## Status

SDOS Phase 12. Extension, not a duplicate.
`ai/core/contracts/EXECUTION_PIPELINE.md` (Phase 11) already specifies
the five sub-steps inside `RUNTIME_ARCHITECTURE.md` step 6 (prompt
assembly, invocation, tool-call sub-loop, message sub-loop, result
production). This file is the concrete Groq-specific walkthrough of
sub-steps 1–2 (and the entry point back from sub-step 3), tying
together every other `ai/runtime/` document into one ordered sequence.
Sub-steps 4 (inter-agent messaging) and 5 (result production) are not
restated — they remain exactly as `EXECUTION_PIPELINE.md` specifies.

## Purpose

Give a future implementer one linear sequence to read, rather than
requiring them to manually stitch together eleven separate
`ai/runtime/` documents in the right order.

## Inputs

Everything `EXECUTION_PIPELINE.md` sub-step 1 already requires: a
resolved `PromptRegistryEntry` and an `AssembledContext`, for an
executive instance already in `ACTIVE` (per `AGENT_LIFECYCLE.md`) with
its permission check already passed (per `RUNTIME_ARCHITECTURE.md`
step 4).

## Outputs

A single result — `RESULT_PRODUCED` or an error — handed to
`EXECUTION_PIPELINE.md` sub-step 5 (unchanged) or
`ERROR_RECOVERY.md`.

## Dependencies

Every other document in `ai/runtime/`, plus
`ai/core/contracts/EXECUTION_PIPELINE.md`, `PROMPT_REGISTRY.md`,
`TOOL_REGISTRY.md`, `CONTEXT_SCHEMA.md`.

## Sequence

1. **Provider decision** — `AI_ROUTER.md` determines a model call is
   needed and selects Groq.
2. **Executive resolution** — `EXECUTIVE_ROUTER.md` resolves model,
   temperature, and token ceiling for the owning executive.
3. **Assembly** — `PROMPT_LOADER.md`, `CONTEXT_BUILDER.md` (reading
   `MEMORY_LOADER.md`'s output where applicable), and
   `TOOL_SELECTION.md` each produce their piece.
4. **Request** — `REQUEST_PIPELINE.md` merges all of the above,
   checked against `TOKEN_BUDGETING.md` and `RATE_LIMITING.md`.
5. **Invocation** — the (future, unspecified) network call happens.
   `CACHE_STRATEGY.md` and `PERFORMANCE_STRATEGY.md` govern whether and
   how this step is short-circuited or timed.
6. **Response** — `RESPONSE_PIPELINE.md` parses the result.
   - If a tool call is proposed: control returns to
     `EXECUTION_PIPELINE.md` sub-step 3 (its own tool-call sub-loop),
     and this flow re-enters at step 3 above once the tool result is
     available, per that sub-loop's own iteration rule.
   - If a result is produced: control passes to
     `EXECUTION_PIPELINE.md` sub-step 5, unchanged.
   - If failed: `FAILOVER_STRATEGY.md` and `ERROR_RECOVERY.md` apply.
7. **Observability** — regardless of outcome, `OBSERVABILITY.md`
   records usage/latency/outcome metadata.

## Failure Modes

Each numbered step's own document is authoritative for its failure
modes; this file does not introduce a new error class, only the
ordering in which existing ones can occur.

## Security

This file grants no authority and adds no access path of its own — it
is purely a sequencing document over documents that each already carry
their own security constraints.

## Future Implementation Notes

The re-entry at step 6→3 (tool-call loop) should be bounded by a
maximum-iteration count in a future implementation, to prevent an
unbounded tool-call cycle — no such count is fixed in this phase, since
`EXECUTION_PIPELINE.md` itself does not fix one either and this file
does not invent a constraint that document doesn't already impose.

## Inter-Agent Message-Triggered Reasoning (SDOS Phase 13A Extension)

**Status:** Phase 13A. Additive. Every step 1–7 above remains
authoritative and unchanged; this section only specifies one new
entry path into that same sequence — a `Message`
(`MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md`) arriving from another
executive, rather than a task originating from
`RUNTIME_ARCHITECTURE.md` step 5 (task intake). No connection to Groq
exists as a result of this section — it documents where such a
connection would enter this file's existing sequence, if a future
phase implements it, exactly as every other step in this file already
does for its own entry point.

### Sequence

```
Agent Message (INTER_AGENT_PROTOCOL.md)
  → Context Evaluation
  → Determine whether reasoning is required
  → [if yes] Prompt/Context assembly (steps 2-3 above)
  → Token budget check (TOKEN_BUDGETING.md)
  → Rate-limit check (RATE_LIMITING.md)
  → Groq reasoning request (steps 4-6 above)
  → Response validation (RESPONSE_PIPELINE.md)
  → Agent response (RESPONSE, per INTER_AGENT_PROTOCOL.md)
  → Audit trail (AUDIT_TRAIL.md)
```

1. **Context Evaluation.** A received `Message` is first evaluated
   against `CONTEXT_SCHEMA.md`'s existing `AssembledContext` shape —
   does answering it require new reasoning, or does the receiving
   executive's already-loaded context and existing prior output
   already answer it. This evaluation step itself is not a Groq call;
   it is a check the receiving executive's runtime instance performs
   using context it already holds.

2. **When Reasoning Is Required.** A `Message` triggers this file's
   existing steps 1–7 (entering fresh at step 1, "Provider decision")
   only when Context Evaluation determines the question is genuinely
   new — i.e. not already answered by the receiving executive's
   current `AssembledContext`, its own prior `RESPONSE` in the same
   `conversation_id` (`INTER_AGENT_PROTOCOL.md` Phase 13A extension),
   or a static rule already in its own `DECISION_RULES.md` /
   `AUTHORITY_MATRIX.md` that resolves the question without new
   inference.

3. **When Reasoning Should NOT Be Triggered.**
   - The `Message` is a duplicate delivery under
     `INTER_AGENT_PROTOCOL.md`'s Phase 13A deduplication rule — the
     original `RESPONSE` is re-emitted, no new reasoning occurs.
   - The `Message` is expired per that same extension's expiration
     rule.
   - The question the `Message` asks is already fully resolved by
     existing static documentation (an `AUTHORITY_MATRIX.md` lookup,
     for example) — invoking Groq to restate a lookup table's own
     answer would be reasoning where none is needed, and this section
     explicitly does not authorize that.
   - The `Message` requests information the receiving executive is not
     permitted to reason about or disclose, per
     `SECURITY_BOUNDARIES.md` — the response is a permission-boundary
     `RESPONSE`, not a reasoning attempt that then gets filtered
     after the fact.

4. **Token-Budget Interaction.** A message-triggered entry into step 4
   ("Request") above is checked against `TOKEN_BUDGETING.md` exactly
   as a task-triggered entry is — this section adds no separate
   message-specific budget. If the receiving executive's remaining
   budget for its current session cannot accommodate the request, the
   `RESPONSE` is a budget-exhausted failure (see Failure Handling
   below), not a silently truncated reasoning attempt.

5. **Rate-Limit Interaction.** Same principle as token budget: message-
   triggered requests share the same `RATE_LIMITING.md` ceiling as
   task-triggered ones. A busy executive fielding many inter-agent
   messages does not get a separate, larger rate-limit allowance by
   virtue of the request arriving as a `Message` rather than a task —
   this prevents inter-agent messaging from becoming an unthrottled
   side-channel around the existing per-executive rate limit.

6. **Retry Behavior.** A message-triggered reasoning failure (step 5,
   "Invocation," fails) follows this file's existing Failure Modes
   section unchanged — `FAILOVER_STRATEGY.md` and `ERROR_RECOVERY.md`
   apply. The retry itself, if the sender resends the `Message`, is
   governed by `INTER_AGENT_PROTOCOL.md`'s Phase 13A retry rule
   (same `idempotency_key`, so a resend during an in-flight reasoning
   attempt is recognized as a duplicate, not a second concurrent
   invocation).

7. **Failure Handling.** A message-triggered reasoning failure produces
   a `RESPONSE` carrying a failure status (per
   `INTER_AGENT_PROTOCOL.md`'s existing lifecycle states — `Failed`),
   not a silently dropped `Message`. The failure is itself an
   `error.raised` event (`EVENT_BUS.md`), same as any other failure
   in this file's existing sequence.

8. **Context Minimization.** The `AssembledContext` built for a
   message-triggered reasoning call includes only what
   `CONTEXT_BUILDER.md` already scopes for the receiving executive's
   own domain — the sending executive's `Message` payload does not
   grant the receiver access to context outside its own existing
   scope, per `MEMORY_SCHEMA.md`'s shared-vs-private separation and
   `SECURITY_BOUNDARIES.md`'s data-minimization principle. This
   section does not create a new context-sharing path.

9. **Prompt Registry Usage.** Message-triggered reasoning uses the
   receiving executive's own existing `PromptRegistryEntry`
   (`PROMPT_REGISTRY.md`) — this section does not define a new,
   separate prompt template for "answering another executive," on
   the same non-duplication principle every other section of this
   file already follows.

10. **Memory Loading.** `MEMORY_LOADER.md`'s existing rules govern what
    memory loads into a message-triggered call exactly as they do for
    a task-triggered one — private executive memory is not exposed to
    the sending executive by virtue of the question being asked in a
    `Message`.

11. **Tool Restrictions.** Any tool call within a message-triggered
    reasoning attempt still passes `TOOL_REGISTRY.md`'s existing
    `allowed_executives` and `input_schema` validation, unchanged —
    per `EXECUTION_PIPELINE.md`'s own step 3, restated here only to
    confirm the message-triggered entry path does not bypass it.

12. **Founder Approval Boundaries.** If the reasoning result would lead
    to an action requiring founder approval under the receiving
    executive's own `AUTHORITY_MATRIX.md`, that requirement applies
    identically regardless of whether the underlying question arrived
    as a task or as an inter-agent `Message` — a `Message` from a
    sibling executive is never itself a substitute for founder
    approval, per `MULTI_PARTY_CONFLICT.md` Rule 21's identical
    principle for multi-party conflicts.

13. **Audit Requirements.** The full chain — receiving `Message`,
    Context Evaluation outcome, whether reasoning was triggered, and
    the resulting `RESPONSE` — is recorded in `AUDIT_TRAIL.md`, keyed
    by the `conversation_id` / `correlation_id` pair
    (`INTER_AGENT_PROTOCOL.md` Phase 13A extension), whether or not a
    Groq call actually occurred. A Context-Evaluation decision *not*
    to invoke reasoning is itself auditable — "why didn't this trigger
    a model call" is as reviewable as "what did the model call return."

### Dependencies (in addition to this file's existing Dependencies section)

- `INTER_AGENT_PROTOCOL.md`'s Phase 13A extension (conversation,
  sequence, and idempotency identifiers this section's Context
  Evaluation and retry handling rely on)
- `MULTI_PARTY_CONFLICT.md` (the CEO-layer path a message-triggered
  disagreement across three or more executives would follow, if the
  reasoning result itself becomes contested)

## Relationship to the Rest of SDOS

- The single ordered index over every other `ai/runtime/` document.
- Extends `EXECUTION_PIPELINE.md` sub-steps 1–3 specifically for the
  Groq case; sub-steps 4–5 remain that file's own, unchanged.
- The Phase 13A extension above is the first document to specify how
  `EXECUTION_PIPELINE.md` sub-step 4 (inter-agent message sub-loop)
  and this file's own Groq sequence actually connect — previously
  named as adjacent concepts, never as one specified path.
