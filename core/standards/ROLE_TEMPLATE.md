# Role Template

The canonical file skeleton for `ai/executives/<role>/`. CTO, COO, and
CFO each converged on this shape independently (COO/CFO explicitly
"mirrored" the CTO's structure); Phase 5 makes it the standard so the
next executive starts from this list instead of reverse-engineering it
from three examples.

## Standard File Set

| File | Standard it follows | Required for every role? |
|---|---|---|
| `README.md` | `FOLDER_STANDARD.md` (folder README section) | Yes |
| `<ROLE>_PROFILE.md` | — (always role-specific; no template) | Yes |
| `MISSION.md` | `MISSION_TEMPLATE.md` | Yes |
| `RESPONSIBILITIES.md` | `RESPONSIBILITY_STANDARD.md` | Yes |
| `AUTHORITY_MATRIX.md` | `AUTHORITY_STANDARD.md` | Yes |
| `DECISION_RULES.md` | `DECISION_STANDARD.md` | Yes |
| `ESCALATION_MATRIX.md` | `ESCALATION_STANDARD.md` | Yes, once the role has an operational or customer-facing escalation surface |
| `INTER_EXECUTIVE_COMMUNICATION.md` | `COMMUNICATION_STANDARD.md` | Yes, once more than one executive exists |
| `PROMPT_TEMPLATE.md` | `PROMPT_STANDARD.md` | Yes |
| `KPI.md` | `KPI_STANDARD.md` | Yes |
| `ROADMAP.md` | — (role-specific planning artifact; no template) | Yes |
| `DAILY_ROUTINES.md` / `WEEKLY_ROUTINES.md` / `MONTHLY_ROUTINES.md` | `MEETING_STANDARD.md` | Where the role has a recurring operating cadence |
| One or more `*_GUIDE.md` domain playbooks | — (always role-specific; no template) | Yes — this is where the role's actual expertise lives |
| `RISK_FRAMEWORK.md` | `RISK_STANDARD.md` | Where the role carries a distinct risk surface |
| `*_MODEL.md` (e.g. `FINANCIAL_MODEL.md`) | — (role-specific grounding artifact) | Only where the role needs one |

## What Makes a File "Standard" vs. "Role-Specific"

A file following a standard still contains 100% role-specific content —
the standard only fixes its *section structure* and the *handful of
universal rules* that genuinely apply to every role (e.g. the universal
founder-approval list in `AUTHORITY_STANDARD.md`). A `*_GUIDE.md` domain
playbook has no standard at all — its content, structure, and existence
are entirely up to the role, because unlike a mission statement or an
authority matrix, there's no reusable shape to a security guide vs. a
GST compliance guide.

## Building a New Executive (e.g. a future CEO or CMO)

1. Create `ai/executives/<role>/`.
2. Copy the file list above; for each templated file, open the
   corresponding standard and follow its skeleton, filling in
   role-specific content only — don't restate the standard's universal
   sections.
3. Write `<ROLE>_PROFILE.md` from scratch (identity/persona have no
   template — see `EXECUTIVE_STANDARD.md` for the five things every
   profile should establish: role, reports-to, scope, authority model,
   persona).
4. Write the role's actual domain playbooks — these are the substance of
   the role and are never templated.
5. Update `ai/executives/README.md` and `ai/knowledge/MASTER_INDEX.md`
   to list the new executive, per `FOLDER_STANDARD.md`.
6. Do not implement any runtime, agent, or execution capability — every
   phase that defines a new executive is documentation-only, exactly
   like Phases 2, 3, 4, and 5.
