# Context Builder

## Status

SDOS Phase 12. Genuinely new. Converts `CONTEXT_SCHEMA.md`'s
(Phase 11) `AssembledContext` object into the `user`-role message(s) a
Groq chat-completion request expects — `CONTEXT_SCHEMA.md` specifies
the object's shape but not its wire serialization for any particular
provider.

## Purpose

Turn `standards`, `role_definition`, `company_brain`,
`cross_executive_input`, `live_data`, and `memory` (each a list per
`CONTEXT_SCHEMA.md`) into a bounded, ordered set of `user`-role message
content the model can actually read within `groq-proxy`'s existing
per-message and total-character caps.

## Inputs

An `AssembledContext` object (`CONTEXT_SCHEMA.md`) for one executive,
one session, one task/turn.

## Outputs

```
BuiltContext:
  messages:         list    # one or more {role: "user", content} entries
  total_chars:       integer
  sections_included: list    # which AssembledContext fields were serialized
  sections_omitted:  list    # which were empty (per CONTEXT_SCHEMA.md Rule 1) and correctly excluded from content, not padded
```

## Dependencies

- `CONTEXT_SCHEMA.md` (the object this builder serializes)
- `TOKEN_BUDGETING.md` (the char budget this builder must respect)
- `MEMORY_LOADER.md` (populates the `memory` field this builder reads,
  once `ai/memory/` exists)

## Sequence

1. Read the `AssembledContext` object's six fields in the precedence
   order `CONTEXT_LOADING.md` already defines (live data > Company
   Brain > role playbooks > standards) — this builder does not
   reorder them; it serializes in that order so the model reads
   highest-precedence information first.
2. Serialize each non-empty field into a labeled section (e.g.
   `## Company Brain`, `## Cross-Executive Input`) — an empty field
   per `CONTEXT_SCHEMA.md` Rule 1 is omitted from the message content
   entirely, not rendered as an empty section header.
3. If `conflicts_flagged` is non-empty, surface it as its own labeled
   section near the top — a precedence conflict is exactly the kind of
   thing the model must reason about explicitly, not have silently
   resolved by ordering alone.
4. Check the running total against `TOKEN_BUDGETING.md`'s ceiling; if
   exceeded, this is a failure (see Failure Modes), never a silent
   truncation of Company Brain content.

## Failure Modes

- A serialized context exceeding `TOKEN_BUDGETING.md`'s per-turn
  ceiling is an `EXECUTION_ERROR` — the turn does not proceed with a
  truncated, arbitrarily-cut Company Brain excerpt, per
  `ERROR_HANDLING.md` Rule 1 (fail closed, never proceed on partial
  information).
- An `AssembledContext` that was never validated by `CONTEXT_SCHEMA.md`
  itself (e.g. a required field genuinely missing rather than
  correctly empty) is a `CONTEXT_ERROR`, inherited from that file's own
  Failure Modes — this builder does not re-validate what
  `CONTEXT_SCHEMA.md` already guarantees.

## Security

The builder never reads live SmartDoor production data directly — the
`live_data` field it serializes is populated exclusively by
`ai/integrations/` (per `READONLY_INTEGRATION_POLICY.md`), and only
ever contains what that layer already scoped as safe to read.

## Future Implementation Notes

Section ordering and labeling above is illustrative of the precedence
requirement, not a fixed final format — a future implementation phase
may choose a different serialization (e.g. structured JSON instead of
labeled Markdown sections) as long as precedence order and the
non-padding rule for empty fields are preserved.

## Relationship to the Rest of SDOS

- The second of two assembly steps feeding `REQUEST_PIPELINE.md` (the
  first is `PROMPT_LOADER.md`).
- Directly implements `CONTEXT_SCHEMA.md`'s object as this phase's one
  consumer.
