# Prompt Registry

## Status

SDOS Phase 11. Genuinely new. `ai/prompts/README.md` has stood empty
since Phase 0 ("Empty. Phase 0 does not define any prompt content").
Each of the six executives already has its own `PROMPT_TEMPLATE.md`
(built against the shared `core/standards/PROMPT_STANDARD.md`), but no
phase before this one specifies how those six templates — plus any
future shared fragment — are registered, versioned, or assembled at
runtime. Architecture and contract only; no prompt has ever been
assembled or invoked.

## Purpose

Define the registry that indexes every executive's `PROMPT_TEMPLATE.md`
and any shared prompt fragment, so a future runtime can resolve
"assemble the prompt for this executive, this turn" to a specific,
versioned artifact — without re-deriving assembly order from each
executive's own file by hand every time, and without this registry
restating any executive's actual prompt content.

## Responsibilities

- Index, not author, prompt content — every existing
  `ai/executives/<role>/PROMPT_TEMPLATE.md` remains that role's own
  source of truth.
- Track which version of `core/standards/PROMPT_STANDARD.md` each
  registered template was built against (mirroring
  `EXECUTIVE_REGISTRY.md`'s own `standards_version` field).
- Give shared prompt fragments (if any future phase introduces them) a
  registration point distinct from any one executive's own template.

## Inputs

The six existing `PROMPT_TEMPLATE.md` files, `PROMPT_STANDARD.md`
(via `ai/core/standards/README.md`'s resolution note), and — at
assembly time — the `AssembledContext` object from `CONTEXT_SCHEMA.md`.

## Outputs — Registry Entry Shape

```
PromptRegistryEntry:
  prompt_id:            string    # e.g. "cto.v1", matches ai/executives/cto/PROMPT_TEMPLATE.md
  executive:             string    # role_id
  source_path:            string    # ai/executives/<role>/PROMPT_TEMPLATE.md
  standards_version:       string    # which PROMPT_STANDARD.md version this was built against
  fragment_refs:           list      # ids of any shared fragments this template composes in, if applicable
  status:                 enum      # "documented" (today, for all six) | "runtime_ready" (future)
  registered_at:           datetime
```

This mirrors `EXECUTIVE_REGISTRY.md`'s own shape deliberately — a
prompt registry entry and an executive registry entry answer parallel
questions ("is this well-formed and versioned?") for two different
artifacts.

## Validation Rules

1. **A registry entry never contains the prompt text itself** — only a
   pointer to `source_path`. This keeps the registry a lightweight
   index, exactly as `EXECUTIVE_REGISTRY.md`'s own entry does not
   duplicate an executive's actual folder content.
2. **An entry's `standards_version` must be resolvable** — if
   `PROMPT_STANDARD.md` changes in a way that would invalidate an
   existing template's assumptions, that template's entry is flagged
   as stale, not silently treated as current (per Golden Rule 5, flag
   don't silently resolve).
3. **All six existing templates register with `status: documented`**,
   consistent with `EXECUTIVE_REGISTRY.md`'s own current status for
   all six executives — no template reaches `runtime_ready` in this
   phase, since no runtime exists to make that status meaningful yet.

## Failure Modes

- A `PROMPT_TEMPLATE.md` missing entirely (none of the six are, as of
  this phase) would fail registration the same way a malformed
  executive folder fails `EXECUTIVE_REGISTRY.md`'s template
  validation — a `REGISTRY_ERROR` per `ai/core/runtime/ERROR_HANDLING.md`,
  applied to the prompt layer.
- A stale `standards_version` reference is a `CONTEXT_ERROR`-adjacent
  flag, not silently ignored.

## Dependencies

- `ai/executives/{cto,coo,cfo,cmo,cpo,ceo}/PROMPT_TEMPLATE.md` (the six
  real artifacts this registry indexes)
- `core/standards/PROMPT_STANDARD.md` (via `ai/core/standards/README.md`)
- `ai/core/registry/EXECUTIVE_REGISTRY.md` (the parallel pattern this
  registry's shape follows)
- `CONTEXT_SCHEMA.md` (the assembled context a registered prompt is
  composed with at invocation time)

## Future Implementation Notes

No prompt-assembly mechanism (string templating, structured message
array, etc.) is chosen in this phase — that is an implementation
decision for whichever future phase first invokes a model, not an
architecture decision this registry makes.

## Relationship to the Rest of SDOS

- Indexes, never restates, each executive's own `PROMPT_TEMPLATE.md`.
- Parallel in shape and purpose to `ai/core/registry/EXECUTIVE_REGISTRY.md`,
  one layer more specific (prompts, not whole executives).
- Feeds a future `EXECUTION_PIPELINE.md` invocation step.
