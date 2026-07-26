# ai/memory

## Purpose
Persistent memory for AI executives — records of past decisions, ongoing
threads, and context that needs to survive across sessions/runs so
executives don't start from zero every time.

## Status
Empty. Phase 0 defines the folder only; no memory storage mechanism,
schema, or persistence layer is implemented yet.

## What will eventually go here
- Decision logs (what an executive decided, and why)
- Session/run summaries for continuity between invocations
- Any local memory store or the integration config pointing at wherever
  memory is actually persisted (this may end up being a Supabase table
  rather than flat files — that decision is deferred to a later phase)

## What does NOT go here
- SmartDoor's operational/business data (owners, visitors, orders, etc.)
  — that remains in Supabase, the single source of truth
