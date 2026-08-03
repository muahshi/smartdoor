# Prompt Loader

## Status

SDOS Phase 12. Genuinely new. `PROMPT_REGISTRY.md` (Phase 11) indexes
each executive's `PROMPT_TEMPLATE.md` but explicitly defers "exact
assembly mechanism" to "whichever future phase first invokes a model."
This file is that deferred mechanism, specified for the Groq case
specifically.

## Purpose

Define how a resolved `PromptRegistryEntry` becomes the `system`-role
message in a Groq chat-completion request — the same message shape
`js/groq.js`'s `classifyVisitorIntent`/`generateStatusMessage` already
build for production features, applied here to an executive's own
`PROMPT_TEMPLATE.md` content instead of a visitor-facing prompt.

## Inputs

A `PromptRegistryEntry` (`PROMPT_REGISTRY.md`), its `source_path`
(`ai/executives/<role>/PROMPT_TEMPLATE.md`), and any `fragment_refs` it
declares.

## Outputs

```
LoadedPrompt:
  prompt_id:       string
  role:            "system"
  content:         string   # the resolved, fragment-composed text
  char_count:       integer  # checked against TOKEN_BUDGETING.md before send
```

## Dependencies

- `PROMPT_REGISTRY.md` (this folder's parent — the index this loader
  resolves against)
- `TOKEN_BUDGETING.md` (the char-count ceiling this loader's output
  must respect, mirroring `groq-proxy`'s `MAX_MESSAGE_CHARS`)
- `CONTEXT_BUILDER.md` (the sibling step that produces the `user`-role
  content this loader's `system` message pairs with)

## Sequence

1. Resolve `prompt_id` to its `source_path` via `PROMPT_REGISTRY.md`.
2. Read the executive's `PROMPT_TEMPLATE.md` content in full — never a
   partial or paraphrased read, since the registry's own Validation
   Rule 1 already forbids the registry from restating it, meaning the
   loader is the first place the full text is actually read.
3. Compose in any `fragment_refs`, in the order the registry entry
   declares.
4. Emit exactly one `system`-role message — `groq-proxy`'s own
   `MAX_SYSTEM_MESSAGES = 1` cap makes a second system message a
   request-shape rejection, not a style preference this loader
   invents on its own.

## Failure Modes

- A `source_path` that does not resolve to a real file is a
  `REGISTRY_ERROR`, per `PROMPT_REGISTRY.md`'s own failure mode,
  applied here at load time rather than registration time.
- A composed prompt exceeding `TOKEN_BUDGETING.md`'s per-message
  ceiling is an `EXECUTION_ERROR` — truncation is never silent; the
  turn fails closed and is flagged for a founder/CTO to shorten the
  template or fragment.

## Security

The loader reads only `ai/executives/` content — it never reads
SmartDoor production data, and never composes a prompt from anything
outside `ai/`. This is the same "no direct network/DB access from
`ai/`" posture `SECURITY_MODEL.md` already requires.

## Future Implementation Notes

No templating engine (string interpolation, Jinja-style, etc.) is
chosen in this phase — `PROMPT_REGISTRY.md`'s own deferral on assembly
mechanism still applies to the literal string-composition step; this
file only fixes the message-role shape the result must take.

## Relationship to the Rest of SDOS

- The first of two assembly steps feeding `REQUEST_PIPELINE.md` (the
  second is `CONTEXT_BUILDER.md`).
- Never restates or edits any executive's own `PROMPT_TEMPLATE.md`.
