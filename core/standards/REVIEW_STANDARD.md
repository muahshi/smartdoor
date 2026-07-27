# Review Standard

How any proposed change — code (CTO's domain, `cto/CODE_REVIEW_GUIDE.md`
stays the authoritative checklist for that), a documentation edit, or a
new/edited standard in this folder — gets reviewed before it's
considered done. This file generalizes the review *gate structure*
CTO already uses; it does not replace `CODE_REVIEW_GUIDE.md`'s
code-specific checklist.

## Pre-Review Gate: Golden Rules (applies to every kind of change)

Before reviewing content, correctness, or style, confirm the change
itself follows `QUALITY_STANDARD.md`:
- [ ] Was the existing system/file/pattern actually audited before this
      change was proposed?
- [ ] Does this extend what exists rather than introduce a parallel or
      competing version?
- [ ] Is there any placeholder, TODO, or stub left in?
- [ ] Does the diff touch only what actually needed to change?

A change failing any of these is sent back before content-level review
starts, regardless of how good the content itself looks.

## Content-Level Review, by Kind

- **Code**: see `cto/CODE_REVIEW_GUIDE.md` — frontend/backend/SQL
  checklists specific to SmartDoor's actual stack.
- **A role's own documentation** (mission, responsibilities, playbooks):
  every claim traces to something real per `DOCUMENTATION_STANDARD.md`;
  no invented capability described as operating.
- **A shared standard** (this folder): does it describe *shape*, not
  role-specific decisions? Does it avoid supplying domain content that
  belongs in an executive's own file? Is every universal rule it states
  actually universal (true for every current and reasonably foreseeable
  future role), not just true for the role it was extracted from?

## General Checklist (every kind of change)

- [ ] Naming consistent with `NAMING_STANDARD.md`
- [ ] No dead references — every file/table/path cited actually exists
- [ ] No secrets, credentials, or PII in the diff
- [ ] If the change references a table/column/file, it was verified to
      exist, not assumed from a similar-sounding one
- [ ] Any index affected (`MASTER_INDEX.md`, `ai/executives/README.md`,
      `ai/core/standards/README.md`) updated in the same change

## Anti-Patterns to Reject on Sight

- Rewriting a working file "for cleanliness" without a functional reason
- A second way to do something that already has one established pattern
  (a second authority-matrix shape, a second KPI category structure)
- Silent scope creep beyond the stated task
- Copying a pattern from one domain into another without checking it
  actually fits (a COO-flavored rule applied to CFO content unchanged)

## Rules

- The Pre-Review Gate applies uniformly; it is never skipped because a
  change "looks small."
- A reviewer (human or AI) that finds a review checklist itself
  duplicated across multiple files should treat that as a signal for
  this standard, not a one-off fix — extract it here per Golden Rule 6.
