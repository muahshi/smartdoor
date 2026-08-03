# Cache Strategy

## Status

SDOS Phase 12. Genuinely new. No caching of any kind exists in SDOS
today; production's own Groq path (`js/groq.js`, `groq-proxy`) also
caches nothing — every visitor/owner call is a live request. This file
specifies what, if anything, a future SDOS runtime may cache, drawing a
careful line between static artifacts (safe to cache) and reasoning
output (never cached).

## Purpose

Prevent two distinct mistakes a future implementer might otherwise
make: (a) re-fetching genuinely static content (a `PROMPT_TEMPLATE.md`
read from disk, unchanged between calls) on every single turn for no
reason, and (b) caching a Groq reasoning response and silently
replaying it for a later, superficially-similar turn where the
underlying context has actually changed.

## Inputs

`PROMPT_LOADER.md` output (a candidate for caching), `RESPONSE_PIPELINE.md`
output (never a candidate — see Rationale).

## Outputs

```
CachePolicy:
  prompt_template_content:  CACHEABLE     # static file content, keyed by source_path + file mtime/hash
  assembled_context:        NOT_CACHEABLE  # changes per turn by definition (live_data, memory, cross_executive_input)
  groq_response_content:    NOT_CACHEABLE  # a reasoning output is never replayed as if freshly reasoned
```

## Dependencies

- `PROMPT_LOADER.md` (the one cacheable producer)
- `CONTEXT_BUILDER.md`, `RESPONSE_PIPELINE.md` (the two non-cacheable
  producers)

## Sequence

1. `PROMPT_LOADER.md` may cache a `PROMPT_TEMPLATE.md`'s resolved
   content, invalidated on file change (mtime or content hash) — this
   is a pure file-read optimization, never affects reasoning content.
2. `CONTEXT_BUILDER.md`'s output is never cached — by
   `CONTEXT_SCHEMA.md`'s own design, `live_data` and `memory` are
   expected to differ turn to turn; caching this object risks handing
   an executive stale Company Brain or memory state.
3. `RESPONSE_PIPELINE.md`'s parsed content is never cached or replayed
   — a founder or downstream system must always be able to trust that
   a result reflects that turn's actual reasoning, never a prior turn's
   answer served again under a different `task_id`.

## Failure Modes

Caching `assembled_context` or a Groq response and serving it for a
different turn would itself be a failure mode this file exists to
prevent — not a performance optimization but a correctness violation,
since a founder or another executive receiving a stale answer
presented as fresh reasoning is indistinguishable from
`FAILOVER_STRATEGY.md`'s prohibited mock-fallback case in its effect.

## Security

A cached `PROMPT_TEMPLATE.md` read never contains SmartDoor production
data — it is `ai/` content only. No cache in this policy ever touches
`live_data` or memory content, so no cache invalidation bug here can
leak stale production data.

## Future Implementation Notes

If a future phase identifies a genuine, safe caching opportunity beyond
prompt-template file reads (e.g. a `TOOL_REGISTRY.md` lookup table),
it should be added here explicitly, with the same cacheable/
non-cacheable reasoning made explicit — never assumed by omission.

## Relationship to the Rest of SDOS

- Governs `PROMPT_LOADER.md` only; every other `ai/runtime/` producer
  is explicitly non-cacheable.
- Protects `EXECUTION_PIPELINE.md` step 5's result production from
  ever receiving stale content presented as current.
