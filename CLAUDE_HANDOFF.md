# SmartDoor Handoff

Current Production URL:
https://smartdoor-omega.vercel.app

Current Database:
Supabase Production

Known Facts:
- verify-pin function deployed
- verify-pin logs empty
- Supabase config loads
- window.__SD_CONFIG__ exists
- window.supabase undefined
- Multiple js/services/*.js files return 404
- Login flow never reaches verify-pin

Current Priority:
Frontend Bootstrap Recovery

Do not modify business logic.
Do not modify pricing.
Do not modify database schema.

Fix frontend initialization first.