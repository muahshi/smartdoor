/**
 * Smart Door — Exotel Provider (Server-Side)
 * supabase/functions/_shared/providers/exotel.ts
 *
 * Holds and uses EXOTEL_API_KEY / EXOTEL_API_SECRET / EXOTEL_SID. This file
 * only ever runs inside an Edge Function — never shipped to the browser.
 *
 * Uses Exotel's Connect API to bridge two numbers through a virtual/masking
 * number, exactly the "Visitor → Virtual Number → Owner" pattern: Exotel
 * dials the visitor's number first, and once they pick up, bridges the call
 * to the owner (or current family-routing target), with the Exotel virtual
 * number shown as caller ID on both legs. Neither party's real number is
 * ever exposed to the other.
 *
 * Docs reference (verify against current Exotel API version before going live):
 *   POST https://api.exotel.com/v1/Accounts/{SID}/Calls/connect.json
 */

export interface CallRequest {
  visitorPhone: string | null;
  ownerPhone: string;
  callbackUrl: string; // call-status-webhook URL, for status callbacks
}

export interface CallResult {
  success: boolean;
  providerCallSid?: string;
  maskedNumber?: string;
  status?: string;
  error?: string;
}

export async function placeCall({ visitorPhone, ownerPhone, callbackUrl }: CallRequest): Promise<CallResult> {
  const sid = Deno.env.get('EXOTEL_SID');
  const apiKey = Deno.env.get('EXOTEL_API_KEY');
  const apiSecret = Deno.env.get('EXOTEL_API_SECRET');
  const virtualNumber = Deno.env.get('EXOTEL_VIRTUAL_NUMBER'); // the masking/caller-id number, e.g. ExoPhone

  if (!sid || !apiKey || !apiSecret) {
    return { success: false, error: 'Exotel credentials not configured' };
  }
  if (!visitorPhone) {
    return { success: false, error: 'No visitor phone captured — cannot place a two-leg masked call via Exotel' };
  }

  const url = `https://${apiKey}:${apiSecret}@api.exotel.com/v1/Accounts/${sid}/Calls/connect.json`;

  const body = new URLSearchParams({
    From: visitorPhone,
    To: ownerPhone,
    CallerId: virtualNumber || '',
    StatusCallback: callbackUrl,
    StatusCallbackEvents: 'terminal',
    TimeLimit: '120', // hard cap a masked call at 2 minutes
  });

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { success: false, error: data?.RestException?.Message || `Exotel returned ${resp.status}` };
    }

    return {
      success: true,
      providerCallSid: data?.Call?.Sid,
      maskedNumber: virtualNumber,
      status: data?.Call?.Status || 'initiated',
    };
  } catch (err) {
    return { success: false, error: `Exotel request failed: ${(err as Error).message}` };
  }
}
