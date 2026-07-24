/**
 * My Smart Door — Exotel Provider (Primary)
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
      // DIAGNOSTIC FIX: on a non-2xx response, supabase-js sets `data` to
      // null and `error` to a FunctionsHttpError whose .message is a fixed
      // string ("Edge Function returned a non-2xx status code") — it does
      // NOT contain the JSON body the Edge Function actually returned
      // (e.g. { success:false, message:'Twilio returned 400: ...' }).
      // That real body lives on error.context (the raw Response). We read
      // it here so the visitor UI shows the actual provider error instead
      // of the generic SDK message. Falls back to the old behavior if the
      // body can't be parsed, so nothing regresses.
      const serverMessage = await _extractEdgeFunctionErrorMessage(error);
      return { success: false, error: data?.message || serverMessage || error?.message || 'Exotel call failed' };
    }

    return { success: true, callId: data.callId, status: data.status };
  } catch (err) {
    console.error('[Exotel] call() error:', err);
    return { success: false, error: 'Exotel provider unreachable' };
  }
}

/**
 * Reads the real response body off a supabase-js FunctionsHttpError, since
 * error.message is always the generic "Edge Function returned a non-2xx
 * status code" string, not the body the Edge Function returned.
 * Safe no-op (returns null) for any other error shape.
 */
async function _extractEdgeFunctionErrorMessage(error) {
  try {
    if (!error?.context || typeof error.context.json !== 'function') return null;
    // context is a Response — clone before reading so nothing else that
    // might inspect it later is affected.
    const body = await error.context.clone().json();
    return body?.message || null;
  } catch {
    return null;
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
