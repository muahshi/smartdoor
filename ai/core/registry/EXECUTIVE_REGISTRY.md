# Executive Registry

The contract for what it means for an executive to be "registered," and
the flow a future runtime follows to register one. Six executives
already exist as complete documentation
(`ai/executives/{cto,coo,cfo,cmo,cpo,ceo}/`); none has ever been
registered, because no registry has executed before this phase defined
one.

## Status

Architecture and contract only. No code here creates, reads, or
validates a registry entry.

## Registry Entry Shape

A registry entry is the minimal, derivable-from-disk metadata a runtime
needs to know an executive exists and is well-formed, before loading any
of its actual content:

```
RegistryEntry:
  role_id:            string   # e.g. "cto", "ceo" — matches ai/executives/<role_id>/
  folder_path:        string   # ai/executives/<role_id>/
  phase_built:        integer  # the SDOS phase that defined this role (2, 3, 4, 6, 7, 8, ...)
  role_template_ok:    boolean  # does the folder contain every file ROLE_TEMPLATE.md requires?
  standards_version:   string   # which version of ai/core/standards/ this role was built against
  domain_summary:      string   # one line, drawn from the role's own MISSION.md
  owns_no_domain:      boolean  # true only for CEO, per its own AUTHORITY_MATRIX.md
  status:              enum     # "documented" (today, for all six) | "runtime_ready" (future)
```

This shape is descriptive of what already exists on disk for all six
executives today — it invents no new field an existing executive
folder doesn't already imply.

## Registration Flow (Intended, Future Behavior)

1. **Discovery** — the runtime lists `ai/executives/*/` and treats each
   subfolder as a registration candidate.
2. **Template validation** — for each candidate, check its files against
   `ai/core/standards/ROLE_TEMPLATE.md` (see
   `ai/core/standards/README.md` for this reference's current
   resolution status). A folder missing a required file (e.g. no
   `AUTHORITY_MATRIX.md`) fails registration with a `REGISTRY_ERROR`
   (see `ai/core/runtime/ERROR_HANDLING.md`) — it is not partially
   registered.
3. **Standards-version check** — confirm the candidate's files reference
   a resolvable version of `ai/core/standards/` (today: the Phase 5
   library, physically at `core/standards/` — see the standards-folder
   resolution note above).
4. **Entry creation** — a well-formed candidate becomes a `RegistryEntry`
   with `status: documented` (no executive reaches `runtime_ready` in
   this phase, since no runtime exists to make that status meaningful
   yet).
5. **No re-registration on every turn.** Registration is a one-time (or
   on-change) admission check, not repeated per task — this keeps
   `ai/core/runtime/RUNTIME_ARCHITECTURE.md`'s "Admission" step in a
   single turn cheap.

## What Registration Deliberately Does Not Do

- It does not grant any authority — see
  `ai/core/permissions/PERMISSION_MODEL.md`. A registered executive has
  exactly the authority its own `AUTHORITY_MATRIX.md` documents, which
  as of every phase through Phase 9 is none.
- It does not validate domain-specific content correctness (e.g.
  whether `cfo/GST_COMPLIANCE_GUIDE.md`'s facts are accurate) — that is
  a documentation-quality concern for `DOCUMENTATION_STANDARD.md` and
  `REVIEW_STANDARD.md`, not a registry concern.
- It does not spawn anything — see
  `ai/core/runtime/AGENT_LIFECYCLE.md` for what happens after
  registration, on an actual turn request.

## Applying This to the Six Existing Executives (Illustrative, Not Executed)

If this flow ran today against the real repository, all six of
`cto`, `coo`, `cfo`, `cmo`, `cpo`, and `ceo` would be expected to pass
template validation (each already follows the shared shape
`FOLDER_STANDARD.md` describes) and would register with `status:
documented`. This is stated for illustration only — no such run has
actually occurred, since no registry component exists to run it.

## Relationship to the Rest of SDOS

- Gates entry into `ai/core/runtime/AGENT_LIFECYCLE.md`'s `SPAWNING`
  state.
- Depends on `ai/core/standards/ROLE_TEMPLATE.md` and
  `EXECUTIVE_STANDARD.md` for what "well-formed" means.
- A `REGISTRY_ERROR` here is defined and handled per
  `ai/core/runtime/ERROR_HANDLING.md`.
