# PHASE 18 — CHANGED FILES (changed-files-only ZIP)

## CREATE
- scripts/sdos-dashboard-auth-test.js  (12/12 tests)

## MODIFY
- ai/dashboard/index.html   — removed manual token/gateway-URL fields, added Authentication card, loads config/env.generated.js
- ai/dashboard/dashboard.js — added getAdminSession()/gatewayUrl()/renderAuthStatus(); callGateway() now uses the reused admin session automatically
- ai/dashboard/dashboard.css — one small rule for the auth-card link color

## NOT TOUCHED
- supabase/functions/sdos-dashboard-gateway/index.ts
- supabase/functions/sdos-dashboard-gateway/gatewayLogic.js
- supabase/functions/_shared/adminAuth.ts
- ai/integrations/supabase/sdosEventsReader.js
- admin.html, admin-login.html
- sql/**, RLS policies, feature_flags
- Android code, payment code, production calling code

Copy these files into the matching paths in the main repo and commit.
