# Model Configuration

## Status

SDOS Phase 12. Genuinely new. Specifies the per-executive model
selection table `EXECUTIVE_ROUTER.md` resolves against — no such table
has existed before this phase, since no SDOS invocation mechanism
existed to need one.

## Purpose

Give each executive role a documented, reviewable model/temperature
default, drawn from the same whitelist `groq-proxy` already enforces —
rather than leaving model choice as an unstated assumption inside a
future implementation's code.

## Inputs

`groq-proxy`'s existing `GROQ_MODEL_WHITELIST` (the only models this
phase may select from, since inventing a new one here would bypass a
security control this phase does not have authority to change); each
role's `RESPONSIBILITIES.md` and `DECISION_RULES.md` for a qualitative
read on precision-vs-creativity needs.

## Outputs — Configuration Table (Proposed, Not Yet Approved)

```
role   | model                        | temperature | rationale
-------|------------------------------|-------------|----------------------------------------
cto    | llama-3.3-70b-versatile      | 0.3         | architecture/security decisions favor precision
coo    | llama-3.3-70b-versatile      | 0.4         | operational judgment, moderate latitude
cfo    | llama-3.3-70b-versatile      | 0.2         | financial figures favor lowest variance
cmo    | llama-3.3-70b-versatile      | 0.6         | campaign/content ideation favors range
cpo    | llama-3.3-70b-versatile      | 0.4         | product judgment, moderate latitude
ceo    | llama-3.3-70b-versatile      | 0.3         | cross-domain synthesis favors precision
```

All six default to `llama-3.3-70b-versatile` (the newest whitelisted
model, same family already used in production) rather than
`llama3-70b-8192` (the older model `js/groq.js`'s hardcoded `CONFIG`
still defaults to) — this is a documented proposal, not a claim that
either model is objectively better; a founder/CTO reviewing this table
may revise any row.

## Dependencies

- `groq-proxy/index.ts`'s `GROQ_MODEL_WHITELIST` (the bounding set —
  read-only reference, this file never edits that constant)
- `EXECUTIVE_ROUTER.md` (the consumer of this table)
- `TOKEN_BUDGETING.md` (the paired `max_tokens` ceiling per role)

## Sequence

1. `EXECUTIVE_ROUTER.md` looks up `role_id` in this table.
2. Returns `model` and `temperature` for that role, unmodified by any
   per-task override (none exists in this phase).

## Failure Modes

- A role missing from this table (should never occur — all six rows
  are populated) would be a `REGISTRY_ERROR`-adjacent gap, per
  `EXECUTIVE_ROUTER.md`'s own Failure Modes.
- A future model choice not on `GROQ_MODEL_WHITELIST` is invalid by
  construction — this file only selects from that whitelist; expanding
  it is a `groq-proxy` change, outside this phase's "additive work
  inside `/ai` only" boundary and outside SDOS's authority to make
  unilaterally.

## Security

This table never introduces a new model outside the whitelist
`groq-proxy` already enforces server-side — even if a future SDOS-side
call bypassed this table entirely, `groq-proxy`'s own validation would
still reject an unlisted model. This file adds a second, independent
layer of restraint, not a replacement for that server-side check.

## Future Implementation Notes

Temperature values above are a reasoned starting proposal, not a
benchmarked result — no SDOS invocation has ever run, so there is no
production data yet to tune against. A future phase should revisit
these once real usage exists.

## Relationship to the Rest of SDOS

- Consumed exclusively by `EXECUTIVE_ROUTER.md`.
- Bounded by, never expanding, `groq-proxy`'s existing model whitelist.
