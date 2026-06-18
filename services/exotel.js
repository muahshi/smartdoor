/**
 * Smart Door — Exotel Provider (Primary)
 * services/exotel.js
 *
 * IMPORTANT — SECURITY MODEL:
 * Exotel API Key/Secret/SID must NEVER reach the browser. This file does not
 * call api.exotel.com directly. It dispatches to the `initiate-call` Supabase
 * Edge Function, which holds EXOTEL_API_KEY / EXOTEL_API_SECRET / EXOTEL_SID
 * as server-side secrets and makes the real provider call there.
 * (See supabase/functions/initiate-call/index.ts and
 *  supabase/functions/_shared/providers/exotel.ts for the actual integration.)
 *
 * This module exists so `services/communication.js` can treat every provider
 * identically via the same `call()` / `getStatus()` interface, regardless of
 * which one is actually wired up server-side.
 */

import { supabase } from './supabase.js';

export const PROVIDER_NAME = 'exotel';

/**
 * Request a masked call via Exotel.
 * @param {object} payload
 * @param {string} payload.plateId
 * @param {string} payload.ownerId
 * @param {string} [payload.visitorPhone]   visitor's number, if captured (click-to-call leg)
 * @param {string} payload.visitorIdentifier  non-PII fingerprint for logging/rate limiting
 * @returns {Promise<{ success: boolean, callId?: string, status?: string, error?: string }>}
 */
export async function call(payload) {
  try {
    const { data, error } = await supabase.functions.invoke('initiate-call', {
      body: { ...payload, provider: PROVIDER_NAME },
    });

    if (error || !data?.success) {
      return { success: false, error: data?.message || error?.message || 'Exotel call failed' };
    }

    return { success: true, callId: data.callId, status: data.status };
  } catch (err) {
    console.error('[Exotel] call() error:', err);
    return { success: false, error: 'Exotel provider unreachable' };
  }
}

/**
 * Poll current status of a call (used as a fallback when webhooks are delayed).
 * @param {string} callId  internal call_logs.id
 */
export async function getStatus(callId) {
  const { data, error } = await supabase
    .from('call_logs')
    .select('call_status, duration, ended_at')
    .eq('id', callId)
    .eq('provider', PROVIDER_NAME)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, ...data };
}

export default { PROVIDER_NAME, call, getStatus };
