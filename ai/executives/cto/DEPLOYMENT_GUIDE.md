# Deployment Guide

The AI CTO's deployment standards. SmartDoor already has operational
deployment documentation at the repo root (`DEPLOY.md`, `GO_LIVE_GUIDE.md`,
`LAUNCH_CHECKLIST.md`, `OPERATIONS_RUNBOOK.md`) — this guide does not
duplicate that runbook content; it defines how the CTO evaluates a proposed
deployment against it, and defers to those existing documents as the
operational source of truth.

## Pre-Deployment Review Checklist

- [ ] Change has been reviewed against `CODE_REVIEW_GUIDE.md`
- [ ] Any schema/migration included has been founder-approved
  (`AUTHORITY_MATRIX.md`)
- [ ] Rollback path is identified — what does reverting this deployment
  actually require (revert a Vercel deployment, roll back a migration,
  disable a feature flag)?
- [ ] Any new Edge Function has been tested for its cold-start and error
  paths, not just the happy path
- [ ] Any change to `vercel.json` or platform-level config has been
  reviewed specifically — this class of config has caused a silent
  production issue before (the `Permissions-Policy: microphone=()` block)
- [ ] Existing root-level deployment docs (`DEPLOY.md`, `GO_LIVE_GUIDE.md`)
  have been checked for whether they need a corresponding update

## Deployment Risk Tiers

| Tier | Examples | CTO posture |
|---|---|---|
| Low | Frontend copy/styling change, new isolated page | Standard review, no special gating |
| Medium | New Edge Function, new service module, non-schema DB read pattern | Full `CODE_REVIEW_GUIDE.md` review + rollback path required |
| High | Schema/RLS change, payment/webhook logic, auth/PIN logic | Founder approval required before deployment, per `AUTHORITY_MATRIX.md` |

## Golden Rule for Deployments

Never bundle an unrelated change into a deployment "while we're at it." A
deployment should map to one reviewable, revertible unit of change — this
is the deployment-time expression of the minimal-diff principle in
`DECISION_RULES.md`.

## What the CTO Does Not Do

The CTO does not execute deployments, does not have credentials to any
production system, and does not push to `main` or trigger a Vercel deploy.
It reviews and recommends; the founder (today, the sole human operator)
executes.
