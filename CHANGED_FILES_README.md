# Phase 3.1A — Changed Files Only

Paths below are relative to the repo root — drop these into the repo at
the same paths, overwriting existing files.

## New files
- `supabase/functions/_shared/aiSessionAuth.ts`
- `supabase/functions/ai-session-token/index.ts`
- `js/aiSessionClient.js`

## Modified files
- `supabase/functions/groq-proxy/index.ts`
- `supabase/functions/_shared/cors.ts`
- `js/groq.js`
- `js/aiProductConsultant.js`
- `services/aiReceptionist.js`
- `services/aiVoiceReceptionist.js`
- `services/messaging.js`
- `visitor.html`
- `product.html`
- `products.html`
- `index.html`
- `app.html`

## Deleted (do this manually — not included, since it's a removal)
- `supabase/functions/groq-proxy/groq-proxy.index.ts` — stale, unreferenced
  duplicate of `groq-proxy/index.ts`. Delete this file from the repo.

## Before deploying
Set `AI_SESSION_SECRET` (new secret) in Supabase Dashboard → Settings →
Secrets, then:

```
supabase functions deploy ai-session-token --no-verify-jwt
supabase functions deploy groq-proxy --no-verify-jwt
```

See `PHASE_3_1A_GROQ_PROXY_SECURITY_REPORT.md` for the full audit,
design rationale, and manual test plan.
