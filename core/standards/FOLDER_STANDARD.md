# Folder Standard

Where things live in `ai/`, restated from `ai/docs/SDOS_ARCHITECTURE.md`
so it doesn't have to be re-derived per phase, plus the folder-README
convention every subfolder follows.

## Top-Level `ai/` Layout (from `SDOS_ARCHITECTURE.md`)

| Folder | Responsibility |
|---|---|
| `ai/core/` | Shared runtime kernel (executive lifecycle, task routing, event loop) — and, as of Phase 5, `ai/core/standards/`, the shared documentation layer every executive is built from |
| `ai/executives/` | Individual AI executive roles, one subfolder per role |
| `ai/knowledge/` | The Company Brain — derived, AI-facing knowledge base, never the source of truth |
| `ai/memory/` | Persistent memory — decision logs, session continuity |
| `ai/workflows/` | Multi-step processes executives run |
| `ai/integrations/` | The boundary layer to SmartDoor's real data (future, read-only-first) |
| `ai/dashboard/` | Future human-facing observability surface |
| `ai/prompts/` | Prompt library — system prompts and reusable fragments |
| `ai/docs/` | SDOS's own architecture/phase documentation |

## Every Folder's Own README

Every subfolder under `ai/` — including `ai/core/standards/` itself —
carries a `README.md` at its root following this shape:
1. `## Purpose` — one paragraph
2. `## Status` — what phase built it, what does and doesn't exist yet
3. What belongs here / what doesn't (two short lists)
4. Where relevant: a file index table

## Inside `ai/executives/<role>/`

See `ROLE_TEMPLATE.md` for the full file skeleton. The folder-level
`README.md` for each role follows this shape (established by
`cto/README.md`, mirrored by `coo/` and `cfo/`):

1. Title + phase (`# AI <Role> — SmartDoor Operating System (SDOS Phase
   N)`)
2. `## Status` — what this phase is, what's built on top of what
3. `## What Phase N Is` / `## What Phase N Is Not`
4. `## How to Read This Folder` — reading order guidance
5. `## Files in This Folder` — a `File | Purpose` table listing every
   file (see `NAMING_STANDARD.md` for what each suffix means)
6. `## Relationship to the Rest of SDOS` — what it reads, what it can't
   yet touch, which sibling folders it sits alongside
7. `## Founder` — closing note naming Mubashir Hasan and pointing to
   `AUTHORITY_MATRIX.md`

## Rules

- A new executive's `README.md` should follow the seven-section shape
  above rather than inventing a new folder-overview format.
- `ai/executives/README.md` (the folder-of-folders index) stays the
  single place that lists which roles are defined vs. still empty —
  individual role READMEs don't need to restate sibling-role status
  beyond a one-line mention.
- Folder responsibilities (top table) don't get redefined per phase;
  amend `ai/docs/SDOS_ARCHITECTURE.md` itself if a folder's
  responsibility genuinely changes.
