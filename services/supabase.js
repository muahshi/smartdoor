/**
 * Smart Door — Supabase Client
 * services/supabase.js
 * Single instance, used by all other services
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = window.__SD_CONFIG__?.supabaseUrl  || '';
const SUPABASE_ANON = window.__SD_CONFIG__?.supabaseAnon || '';

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('[Supabase] Missing env config. Add SD_CONFIG to your HTML.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export default supabase;
