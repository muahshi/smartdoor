/**
 * Smart Door — Supabase Client
 * services/supabase.js
 * Single instance, used by all other services
 * FIX: Lazy initialization — __SD_CONFIG__ read at call time, not module parse time
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

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
