/**
 * Smart Door — Twilio Provider (Server-Side, Fallback)
 * supabase/functions/_shared/providers/twilio.ts
 *
 * Holds and uses TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_CALLER_NUMBER.
 * Used when Exotel is unavailable, unconfigured, or fails. Bridges visitor
 * and owner through a Twilio number using a short inline TwiML <Dial>, so
 * neither party sees the other's real number.
 *
 * Docs reference (verify against current Twilio API version before going live):
 *   POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json
 */

import type { CallRequest, CallResult } from './exotel.ts';

export async function placeCall({ visitorPhone, ownerPhone, callbackUrl }: CallRequest): Promise<CallResult> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const callerNumber = Deno.env.get('TWILIO_CALLER_NUMBER'); // the masking/caller-id number

  if (!accountSid || !authToken) {
    return { success: false, error: 'Twilio credentials not configured' };
  }
  if (!visitorPhone) {
    return { success: false, error: 'No visitor phone captured — cannot place a two-leg masked call via Twilio' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const basicAuth = btoa(`${accountSid}:${authToken}`);

  // Inline TwiML: dial the owner, masking the caller ID with our Twilio number.
  // For production, prefer Twilio Proxy (purpose-built for number masking)
  // over building it from raw Voice + TwiML.
  const twiml = `<Response><Dial callerId="${callerNumber}" timeout="30" timeLimit="120">${ownerPhone}</Dial></Response>`;

  const body = new URLSearchParams({
    From: callerNumber || '',
    To: visitorPhone,
    Twiml: twiml,
    StatusCallback: callbackUrl,
    StatusCallbackEvent: 'completed',
  });

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { success: false, error: data?.message || `Twilio returned ${resp.status}` };
    }

    return {
      success: true,
      providerCallSid: data?.sid,
      maskedNumber: callerNumber,
      status: data?.status || 'initiated',
    };
  } catch (err) {
    return { success: false, error: `Twilio request failed: ${(err as Error).message}` };
  }
}
