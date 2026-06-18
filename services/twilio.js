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
      return { success: false, error: data?.message || error?.message || 'Twilio call failed' };
    }

    return { success: true, callId: data.callId, status: data.status };
  } catch (err) {
    console.error('[Twilio] call() error:', err);
    return { success: false, error: 'Twilio provider unreachable' };
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
