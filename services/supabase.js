/**
 * Smart Door — Supabase Client
 * services/supabase.js
 * Single instance, used by all other services
 * FIX: Lazy initialization — __SD_CONFIG__ read at call time, not module parse time
 *
 * PRODUCTION HOTFIX (Loading Smart Door incident): the SDK used to be
 * imported live from https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm.
 * That is a static top-level import, so any jsdelivr outage (503s seen in
 * prod) or the app's own Content-Security-Policy blocking that origin
 * (connect-src did not allow cdn.jsdelivr.net) made this module fail to
 * resolve entirely — before any function body ever ran, so no try/catch
 * anywhere downstream could catch it. Every page imports `supabase` from
 * here, so one broken CDN request took down login, the owner dashboard,
 * and the visitor page simultaneously.
 *
 * Fix: the SDK is now vendored locally (esbuild-bundled, self-contained,
 * no external imports) at vendor/supabase-js/, served same-origin. No
 * third-party network request is needed to load the client library.
 * See vendor/supabase-js/README.md for how to update the pinned version.
 */

import { createClient } from '../vendor/supabase-js/supabase-js.v2.110.7.min.js';

function getSupabaseUrl()  { return window.__SD_CONFIG__?.supabaseUrl  || ''; }
function getSupabaseAnon() { return window.__SD_CONFIG__?.supabaseAnon || ''; }

// Lazy singleton — created on first access so __SD_CONFIG__ is already set
let _client = null;
function getClient() {
  if (_client) return _client;
  const url  = getSupabaseUrl();
  const anon = getSupabaseAnon();
  if (!url || !anon) {
    console.error('[Supabase] Missing env config — window.__SD_CONFIG__ not set yet.');
  }
  _client = createClient(url, anon, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

// Proxy so existing code using `supabase.from(...)` still works
export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getClient()[prop];
  }
});

export default supabase;
