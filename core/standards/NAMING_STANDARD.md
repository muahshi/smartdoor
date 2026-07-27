# Naming Standard

Naming conventions observed across `ai/` today, made explicit so future
files (and future executives) stay consistent without needing to
reverse-engineer the pattern from existing ones.

## Files

- **Role definition files**: `ALL_CAPS_WITH_UNDERSCORES.md`
  (`MISSION.md`, `AUTHORITY_MATRIX.md`, `DECISION_RULES.md`). This is
  the convention for every file directly under an
  `ai/executives/<role>/` folder.
- **Identity file**: `<ROLE>_PROFILE.md`, role prefix always the
  short uppercase form used elsewhere in that folder (`CTO_PROFILE.md`,
  `COO_PROFILE.md`, `CFO_PROFILE.md`).
- **Domain playbooks**: `<DOMAIN>_GUIDE.md` (`ARCHITECTURE_GUIDE.md`,
  `GST_COMPLIANCE_GUIDE.md`). The domain word is the specific area, not
  the role — this keeps guide names meaningful if ever referenced
  outside their folder.
- **Cadence files**: `<CADENCE>_ROUTINES.md` (`DAILY_ROUTINES.md`,
  `WEEKLY_ROUTINES.md`, `MONTHLY_ROUTINES.md`) — always plural
  "ROUTINES," never "ROUTINE."
- **Standards files** (this folder): `<TOPIC>_STANDARD.md` or
  `<TOPIC>_TEMPLATE.md` — "STANDARD" for a set of rules/structure a
  role-file must follow; "TEMPLATE" specifically for the two files whose
  entire content is a fill-in-the-blank skeleton (`ROLE_TEMPLATE.md`,
  `MISSION_TEMPLATE.md`). New standards files should follow whichever of
  the two better matches their content.
- **Knowledge domain files**: `ai/knowledge/<domain>/<domain>.md` —
  lowercase, singular folder name matching a lowercase, matching-or-
  plural file name (`company/company_profile.md`,
  `business/business_rules.md`).
- **Every folder's own overview**: `README.md`, always uppercase,
  always at the folder root.

## Folders

- `ai/executives/<role>/` — lowercase, short role abbreviation (`cto`,
  `coo`, `cfo`), matching the abbreviation used inside that folder's file
  prefixes.
- `ai/knowledge/<domain>/` — lowercase, full domain word, singular
  (`company`, `products`, `database`) matching `MASTER_INDEX.md`'s
  Knowledge Map.
- `ai/core/standards/` — this folder; flat, no subfolders, since every
  standard is a single file with no domain-specific sub-splitting needed
  at current scale.

## SQL / Migrations (production convention, referenced not owned by `ai/`)

`NN_description.sql`, sequentially numbered, never edited after landing
— new tables/columns are proposed as new migration files. This
convention belongs to the production repository, not `ai/`, but every
executive's guides should reference it consistently rather than
describe it differently per role.

## Rules

- A new file's name should make its *kind* (role-file / playbook /
  cadence / standard / knowledge-domain) identifiable from the suffix
  alone, without opening it.
- Don't introduce a new naming pattern for a kind of file that already
  has one above — extend the existing pattern instead.
