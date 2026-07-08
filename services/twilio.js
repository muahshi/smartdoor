/**
 * Smart Door — Twilio Provider (Secondary / Fallback)
 * services/twilio.js
 *
 * Same security model as services/exotel.js — TWILIO_ACCOUNT_SID /
 * TWILIO_AUTH_TOKEN never reach the browser. This dispatches to the same
 * `initiate-call` Edge Function with provider='twilio', which is used when
 * Exotel fails, times out, or is not configured for a given owner.
 */

import { supabase } from './supabase.js';

export const PROVIDER_NAME = 'twilio';

/**
 * Request a masked call via Twilio (fallback path).
 * @param {object} payload  same shape as services/exotel.js#call()
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
      return { success: false, error: data?.message || serverMessage || error?.message || 'Twilio call failed' };
    }

    return { success: true, callId: data.callId, status: data.status };
  } catch (err) {
    console.error('[Twilio] call() error:', err);
    return { success: false, error: 'Twilio provider unreachable' };
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
