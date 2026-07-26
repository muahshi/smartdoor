# Document Index — My Smart Door

> Every markdown/reference document found in the repository, with its
> purpose, importance, and whether a future AI executive should read it
> as part of its context-gathering. This index does not move, edit, or
> duplicate any of these documents — it only catalogues them in place.

## Root-Level Documents

| Document | Purpose | Importance | Should AI read? |
|---|---|---|---|
| `README.md` | Product/architecture overview, core flows, critical rules | High | Yes |
| `SYSTEM_ARCHITECTURE.md` | One-page flow diagram (Visitor/Owner/Admin/Payment) | Medium — very high-level, thin | Yes (as a quick map only) |
| `BUSINESS_RULES.md` | Plate ID format, PIN login, plate status values, visitor privacy rule | High but **incomplete** — see `business/business_rules.md` for the fuller, code-derived version | Yes |
| `DATABASE_SCHEMA.md` | Lists 10 "core" tables | **Stale** — real schema has 100+ tables (see `database/database.md`) | Yes, with caution — do not treat as complete |
| `PROJECT_STATE.md` | Current phase, working systems, pending items, known issues | High but **stale** — says "Phase 12" while SQL/service history shows work through Phase 13-equivalent partner/commerce features | Yes, with caution |
| `CURRENT_STATUS.md` | Similar to `PROJECT_STATE.md`, overlapping content | Medium (duplicate of above) | Yes, with caution |
| `CLAUDE.md` | Instructions for AI coding assistants working on this repo | High — defines the house rules this very project follows | Yes |
| `SKILLS.md` | (178 lines) — presumably repo-specific skill/tooling guidance | Medium | Yes |
| `CHANGED_FILES_README.md` | Log of changed files from a past session | Low (historical) | Optional |
| `AUDIT_REPORT.md` | Past audit findings | Medium (historical) | Optional |
| `OPERATIONS_RUNBOOK.md` | Operational procedures | High for COO-type usage | Yes |
| `SUPPORT_RUNBOOK.md` | Support procedures | High for support/COO usage | Yes |
| `GO_LIVE_GUIDE.md` | Launch procedure | Medium (historical/reference) | Optional |
| `LAUNCH_CHECKLIST.md` | Launch checklist | Medium (historical/reference) | Optional |
| `DEPLOY.md` | Deployment instructions | High for CTO/infra usage | Yes |
| `ACTIVATION_FIX_NOTES.md` | Notes on a past activation bug fix | Low (historical) | Optional |
| `FCM_INTEGRATION_VERIFIC ATION_REPORT.md` *(sic — filename contains a stray space)* | FCM push integration verification | Low (historical) | Optional |
| `PHASE2_WEBRTC_AUDIT_AND_IMPLEMENTATION_REPORT.md` | WebRTC Phase 2 audit | Medium (historical, but WebRTC is an active area) | Yes |
| `README_PHASE4A.md` | Phase 4A notes | Low (historical) | Optional |
| `SMARTDOOR_MASTER_STABILIZATION.md` | Master stabilization audit (9-stage fulfilment pipeline etc.) | High — significant architectural audit | Yes |
| `SYSTEM_AUDIT_AND_FIX.md` | Audit and fix log | Medium (historical) | Optional |
| `WEBRTC_RUNTIME_TRACE_FIX_REPORT.md` | WebRTC runtime trace fix report | Medium (historical, active area) | Optional |

## `docs/` Folder

| Document | Purpose | Should AI read? |
|---|---|---|
| `docs/BETA_LAUNCH_CHECKLIST.md` | Beta launch checklist | Optional |
| `docs/PRODUCTION_CHECKLIST.md` | Production readiness checklist | Yes |
| `docs/CUSTOMER_INTERVIEW_TEMPLATE.md` | Template for customer interviews | Optional (Growth-specific) |
| `docs/DOMAIN_SETUP.md` | Domain configuration | Optional (infra-specific) |
| `docs/BACKUP_STRATEGY.md` | Backup approach | Yes (infra/reliability relevant) |
| `docs/EMAIL_DNS_SETUP.md` | Email DNS configuration | Optional |
| `docs/LAUNCH_DASHBOARD.md` | Launch dashboard notes | Optional |
| `docs/SECURITY_FINDINGS.md` | Security findings | Yes — security relevant |
| `docs/SUPPORT_ESCALATION_GUIDE.md` | Support escalation procedure | Yes (Support/COO relevant) |
| `docs/DEPLOYMENT_AUDIT.md` | Deployment audit | Optional |
| `docs/SECURITY_AUDIT_REPORT.md` | Security audit | Yes — security relevant |
| `docs/PHASE2A_DEPLOYMENT.md` | Phase 2A deployment notes | Optional |
| `docs/MONITORING_SETUP.md` | Monitoring configuration | Optional (infra-specific) |
| `docs/FIRST_100_CUSTOMERS_PLAYBOOK.md` | Early customer growth playbook | Yes — Growth/business relevant |
| `docs/PHASE9_APP_INTEGRATION.js` | *(non-markdown; a JS file living in `docs/`)* | Optional |

### `docs/legal/`

| Document | Purpose | Should AI read? |
|---|---|---|
| `privacy-policy.md`, `terms-of-service.md`, `shipping-policy.md`, `refund-policy.md`, `cookie-policy.md`, `acceptable-use-policy.md` | Source markdown for the legal pages rendered at `legal/*.html` via `generate_legal_pages.py` | Yes — any AI executive reasoning about customer commitments should read these as authoritative |

## Design System Documentation

| Document | Purpose | Should AI read? |
|---|---|---|
| `design-system/master-reference/README.md` | Reference material for product visuals (acrylic/teakwood/stainless) | Optional — relevant only for product/design reasoning |
| `design-system/future/README.md` | Notes on future design-system direction | Optional |

## SDOS's Own Documentation

| Document | Purpose | Should AI read? |
|---|---|---|
| `ai/docs/SDOS_ARCHITECTURE.md` | SDOS foundation architecture (Phase 0) | Yes — required reading for any SDOS component |
| `ai/docs/COMPANY_BRAIN.md` | This phase's documentation of the Company Brain itself | Yes — required reading before consuming `ai/knowledge/` |
| `ai/knowledge/MASTER_INDEX.md` | Entry point into the entire Company Brain | Yes — the starting point for every future AI executive |

## Known Discrepancies (flagged, not resolved)

These are observations for human engineering follow-up, not something
this documentation pass corrects:

1. `DATABASE_SCHEMA.md` (10 tables) vs. the real schema (100+ tables
   across 86 migrations). See `database/database.md`.
2. `PROJECT_STATE.md` / `CURRENT_STATUS.md` describe "Phase 12" as
   current, while the SQL migration numbering and service catalogue
   (partner platform, GST billing, observability, AI consultant
   analytics) reflect substantially more advanced, later-phase work.
3. `guard.html` and `society-admin.html` share an identical `<title>`
   string despite being different pages.
4. `FCM_INTEGRATION_VERIFIC ATION_REPORT.md` has a stray space in its
   filename.

## Notes for AI Executives

- When a top-level status document (`PROJECT_STATE.md`,
  `CURRENT_STATUS.md`, `DATABASE_SCHEMA.md`) conflicts with the actual
  codebase, treat the codebase as authoritative and flag the conflict
  rather than silently trusting either source.
- No document listed here was edited, moved, or duplicated in producing
  this index.
