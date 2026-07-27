# Documentation Standard

How every executive writes, cites, and maintains documentation —
whether its own role files or the shared Company Brain
(`ai/knowledge/`). This standard applies `ai/docs/COMPANY_BRAIN.md`'s
existing rules to every executive uniformly rather than each role
restating them.

## Groundedness (applies to every file any executive writes)

1. **Every fact traces to the actual repository.** Nothing is inferred
   from a feature's name, a general SaaS/industry convention, or a
   plausible-sounding assumption — it's read from the real code, schema,
   or an existing production document.
2. **Never let a derived doc become the source of truth.** `ai/knowledge/`
   and every executive's own files describe production; they never
   replace it. If tempted to "just update the doc" instead of checking
   the live system before acting, that's a misuse of the layer.
3. **Flag, don't silently resolve, discrepancies.** When documentation
   and the live repository disagree, write the discrepancy down — never
   quietly pick one side (see `DECISION_STANDARD.md` Rule 3).

## Staying Synchronized With Production

- Every knowledge/role file is a snapshot as of when it was last
  regenerated from the live repository — not hand-maintained from
  memory.
- When a significant production change lands (new table, new service,
  new business rule), the corresponding file should be re-read-and-
  regenerated from the updated repository, in the same spirit as the
  phase that first built it — not patched from memory.
- Known staleness in *source* documents (e.g. a top-level doc claiming
  an outdated phase number) should be explicitly flagged in whatever
  file indexes it, not silently inherited.

## Additive, In-Place Updates Only

Regenerate a file in place when it goes stale; don't fork parallel
copies or move content between folders without updating the relevant
index (`MASTER_INDEX.md`, `ai/executives/README.md`, or the standard
folder's own `README.md`) accordingly.

## Citation Discipline

Cite specific file paths, table names, migration numbers, or section
numbers — never speak in generalities where a specific reference is
available. This is the same discipline `COMMUNICATION_STANDARD.md`
requires of an executive's voice, applied here to its writing.

## Staying Inside `/ai`

Nothing in any executive's documentation build process modifies
SmartDoor's production code, schema, UI, or business logic. Any
exception (e.g. a documentation cross-link added to an existing
top-level doc) must be explicit, minimal, and called out in the phase
summary that made it.
