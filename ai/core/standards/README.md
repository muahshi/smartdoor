# ai/core/standards — Resolution Status (SDOS Phase 9)

## Status

SDOS Phase 9 (SDOS Runtime Foundation). This file resolves — by
**correcting**, not by rebuilding — the documentation gap that
`ai/executives/ceo/README.md` and `ai/executives/ceo/ROADMAP.md` flagged
as "the `ai/core/standards/` shared standards library... does not exist
anywhere in the repository."

**That finding was incomplete, not wrong in spirit.** A full
repository-wide read (per Golden Rule 1, `QUALITY_STANDARD.md` —
audit before touching) for this phase found the standards library
**does exist, in full** — eighteen files, not a placeholder — but
physically located at the repository root, `core/standards/`, one level
above `ai/`, not at `ai/core/standards/` where every one of the six
executives, `ai/knowledge/MASTER_INDEX.md`, and `ai/core/standards/`'s
own files reference it. The CEO-phase audit ran `find ai/core
-iname "*standard*"`, which was scoped to `ai/core/` only and correctly
found nothing there — it did not search the repository root, so it
never saw `core/standards/`. This phase corrects that scope.

## What Actually Exists (Confirmed by Direct Inspection)

At `core/standards/` (repository root, **outside** `ai/`):

| File | Defines the shared shape of... |
|---|---|
| `EXECUTIVE_STANDARD.md` | What an "SDOS executive" is, at all |
| `ROLE_TEMPLATE.md` | The folder/file skeleton every executive is built from |
| `MISSION_TEMPLATE.md` | An executive's `MISSION.md` |
| `RESPONSIBILITY_STANDARD.md` | An executive's `RESPONSIBILITIES.md` |
| `AUTHORITY_STANDARD.md` | An executive's `AUTHORITY_MATRIX.md`, plus universal founder-approval rules |
| `DECISION_STANDARD.md` | An executive's `DECISION_RULES.md` |
| `KPI.md` (as `KPI_STANDARD.md`) | An executive's `KPI.md` |
| `ESCALATION_STANDARD.md` | An executive's `ESCALATION_MATRIX.md` |
| `COMMUNICATION_STANDARD.md` | Voice/tone and inter-executive communication |
| `MEETING_STANDARD.md` | Recurring routines (daily/weekly/monthly) |
| `REPORT_STANDARD.md` | Founder- or external-facing reports |
| `PROMPT_STANDARD.md` | An executive's `PROMPT_TEMPLATE.md` |
| `RISK_STANDARD.md` | An executive's risk-classification framework |
| `DOCUMENTATION_STANDARD.md` | How executives write, cite, and keep docs honest |
| `NAMING_STANDARD.md` | File and folder naming conventions across `ai/` |
| `FOLDER_STANDARD.md` | Where things live in `ai/` and in an executive folder |
| `QUALITY_STANDARD.md` | The Golden Rules engineering discipline |
| `REVIEW_STANDARD.md` | How a proposed change gets reviewed |

Every file's own content already describes itself as living at
`ai/core/standards/<name>.md` — the misplacement is purely physical
(folder location), not conceptual. The content itself is complete,
non-placeholder, and consistent with everything all six executives
already cite from it.

## Why This Phase Does Not Copy Those 18 Files Here

Per Golden Rule 6 in `QUALITY_STANDARD.md` ("reuse before creating... the
single rule that motivated the standards library's own existence") and
per this build's explicit instruction to "never duplicate work,"
copying eighteen already-authored files into `ai/core/standards/` would
itself violate the exact discipline that library exists to enforce. A
second, physically duplicated copy would also immediately risk drifting
out of sync with the original the first time either one is edited —
trading one path bug for a permanent content-sync liability.

## Why This Phase Does Not Move the Folder Either

Moving `core/standards/` to `ai/core/standards/` would:

1. Touch a location outside `ai/` — outside this phase's additive-only-
   inside-`/ai` task boundary.
2. Require deleting the original 18 files after copying them (a
   destructive operation), which this phase is not authorized to
   perform silently.
3. Very likely require re-verifying every one of the ~40 cross-references
   inside `ai/executives/{cto,coo,cfo,cmo,cpo,ceo}/*.md` and
   `ai/knowledge/MASTER_INDEX.md` still resolve correctly afterward —
   more files than "only if absolutely necessary" permits touching in
   this phase.

Both the copy-and-keep and the move-and-delete resolutions are real,
valid options — but choosing between them is a **founder decision**,
not something this phase silently picks (`DECISION_STANDARD.md` Rule 4:
escalate on ambiguity, don't guess; the exact discipline `cmo/ROADMAP.md`
already applied when it first partially noticed this same discrepancy).

## What This Phase Does Instead

This `README.md` is the single, additive, non-duplicating fix: an
authoritative pointer, placed exactly where every existing reference
already expects to find something, that tells any future reader
(human or AI) precisely where the real file lives and why. Any tool or
executive that resolves `ai/core/standards/AUTHORITY_STANDARD.md` and
lands here instead of a dead path now gets the correct redirect —
`core/standards/AUTHORITY_STANDARD.md` — plus the context above, rather
than a silent 404 or a second, drifting copy.

## Real Gap Carried Forward (Flagged, Not Resolved Here)

**The path discrepancy itself.** A future phase — proposed as a Phase 10
candidate in `ai/core/README.md`'s own roadmap note — should make the
founder-level call: relocate `core/standards/` into `ai/core/standards/`
(matching all ~40 existing references), or formally update every
reference to point at `core/standards/` instead (matching the physical
reality). Either is a legitimate, mechanical fix once decided; neither
is decided by this phase.

## Relationship to Phase 9's Other `ai/core/` Subfolders

`ai/core/runtime/`, `registry/`, `context/`, `events/`, `tasks/`,
`session/`, `permissions/`, and `router/` (this phase's actual runtime-
architecture deliverables) all reference the standards above by their
intended path, `ai/core/standards/<name>.md`, for consistency with the
convention every executive folder already uses — each such reference
should be read as resolving via this README to `core/standards/<name>.md`
until the Real Gap above is formally closed.
