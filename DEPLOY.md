# SmartDoor Production Recovery — Deployment Guide
## File Map

| Patched File | What Changed | Priority |
|---|---|---|
| `services/admin.js` | `adminLogin()` now uses raw `fetch()` instead of `supabase.functions.invoke()` — fixes the anon-key-as-Bearer bug that caused every admin API call to return 401 | CRITICAL |
| `supabase/functions/_shared/adminAuth.ts` | `admin_session_revocations` query wrapped in try/catch — missing table no longer crashes `verifyAdminSession()` | CRITICAL |
| `visitor.html` | Hinglish AI Receptionist, dual-bubble (Hinglish + English subtitle), auto-speak on response, voiceEnabled defaults ON, ai-subtitle CSS, detectLang(), autoSpeak(), mockClassify with hindi_tts | HIGH |
| `js/groq.js` | No changes needed — groq.js is correct; visitor.html now inlines the Groq call with the new system prompt | INFO |
| `sql/21_production_recovery.sql` | Adds missing columns, RLS policies, RPCs, revocations table, indexes | CRITICAL |
| `sql/21b_storage_rls.sql` | Storage bucket RLS for qr-codes | HIGH |

## Deployment Order

### 1. Database (Supabase Dashboard > SQL Editor)
```
Run: sql/21_production_recovery.sql
Then: sql/21b_storage_rls.sql (after creating qr-codes bucket)
```

### 2. Storage (Supabase Dashboard > Storage)
```
Create bucket: qr-codes
Public: YES
File size: 5MB
```

### 3. Edge Functions (supabase CLI)
```bash
supabase functions deploy admin-login
supabase functions deploy admin-data
supabase functions deploy admin-provision-customer
supabase functions deploy generate-qr
supabase functions deploy groq-proxy
```
Edge Function secrets must include:
- SUPABASE_SERVICE_ROLE_KEY
- APP_URL=https://mysmartdoor.in

### 4. Frontend (Vercel)
Copy these files into your repo and push:
- services/admin.js → services/admin.js
- visitor.html → visitor.html

Verify vercel.json has the /p/:slug rewrite:
```json
{ "source": "/p/:slug", "destination": "/visitor.html?plate=:slug" }
```

### 5. QR Backfill (for existing customers)
For each plate with NULL qr_image_url, call generate-qr:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/generate-qr \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"plate_id":"SD-XXXXXX"}'
```
Or use Admin Panel > QR Management > Regenerate.

## Quick Verification
1. Admin login → DevTools Network → admin-login response has `{success:true,token:"..."}`
2. Dashboard loads → #m-customers shows a number (not blank)
3. Customer Management loads without "Connection Error"
4. Create customer → customer appears in list, QR is not broken
5. Scan QR → visitor.html opens (not app.html), shows correct owner name
6. AI Receptionist → type "parcel deliver karna hai" → Hinglish reply + auto audio
