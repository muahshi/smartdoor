/**
 * Smart Door — Edge Function: set-owner-pin
 * supabase/functions/set-owner-pin/index.ts
 *
 * Owner onboarding ke time PIN set karta hai.
 * PIN kabhi client pe hash nahi hota — yahan bcrypt lagta hai.
 *
 * Also called at first login to set pin_hash from "UNSET" → real hash.
 *
 * SECURITY HARDENING (Phase 9):
 *   Previously this function trusted `owner_id` from the request body with
 *   NO authentication at all. Combined with onboarding.html's now-removed
 *   token-less fallback path, that meant anyone who knew (or guessed) a
 *   plate_id — printed on the physical nameplate / encoded in its public QR
 *   code — could set/overwrite that owner's login PIN directly, without a
 *   magic link, e-mail access, or session of any kind. That was a full
 *   account-takeover vector.
 *
 *   Fixed by requiring the caller to present the Supabase Auth session
 *   established by onboarding.html's `supabase.auth.verifyOtp()` magic-link
 *   step (supabase-js automatically forwards the current session as the
 *   Authorization bearer on `functions.invoke()`, so the legitimate
 *   onboarding flow needs no client-side changes). The authenticated
 *   session's e-mail must match the target owner's e-mail on file, and the
 *   PIN may only be set once (pin_hash must currently be 'UNSET') — an
 *   already-onboarded owner must use owner-forgot-pin to change their PIN,
 *   never this endpoint.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcryptjs from 'npm:bcryptjs@2.4.3';
import { restrictedCors } from '../_shared/cors.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  try {
    const { owner_id, pin, name, phone, email } = await req.json();

    if (!owner_id || !pin) {
      return Response.json({ success: false, message: 'owner_id and pin required.' }, { status: 400, headers });
    }
    if (!/^\d{4}$/.test(String(pin))) {
      return Response.json({ success: false, message: 'PIN must be exactly 4 digits.' }, { status: 400, headers });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── AUTH GATE: caller must present a valid Supabase session (from the
    //    magic-link verifyOtp() step in onboarding.html) whose e-mail
    //    matches the target owner's e-mail on file. ──
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!bearerToken || bearerToken === SUPABASE_ANON_KEY) {
      return Response.json({ success: false, message: 'Authentication required.' }, { status: 401, headers });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authErr } = await anonClient.auth.getUser(bearerToken);
    if (authErr || !authData?.user?.email) {
      return Response.json({ success: false, message: 'Invalid or expired session. Please reopen your activation link.' }, { status: 401, headers });
    }
    const authedEmail = authData.user.email.toLowerCase().trim();

    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, email, pin_hash, plate_id')
      .eq('id', owner_id)
      .maybeSingle();

    if (userErr || !userRow) {
      return Response.json({ success: false, message: 'Account not found.' }, { status: 404, headers });
    }

    // ── Rate limit: 5 attempts / 15 min per plate (reuses existing RPC) ──
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_plate_id: userRow.plate_id || owner_id,
      p_action_type: 'pin_set',
      p_window_secs: 900,
      p_max_count: 5,
    });
    if (allowed === false) {
      return Response.json({ success: false, message: 'Too many attempts. Please try again later.' }, { status: 429, headers });
    }
    await supabase.rpc('log_rate_limit_event', {
      p_plate_id: userRow.plate_id || owner_id,
      p_visitor_identifier: authedEmail,
      p_action_type: 'pin_set',
    });

    // Target account must actually have this e-mail on file.
    if (!userRow.email || userRow.email.toLowerCase().trim() !== authedEmail) {
      return Response.json({ success: false, message: 'Session does not match this account.' }, { status: 403, headers });
    }

    // One-time bootstrap only — already-activated accounts must use
    // owner-forgot-pin (OTP-verified) to change their PIN.
    if (userRow.pin_hash && userRow.pin_hash !== 'UNSET') {
      return Response.json({ success: false, message: 'PIN already set for this account. Use "Forgot PIN" to change it.' }, { status: 409, headers });
    }

    // Hash the PIN (bcrypt, cost 12)
    const pin_hash = bcryptjs.hashSync(String(pin), 12);

    // Update user record
    const updatePayload: Record<string, unknown> = { pin_hash };
    if (name)  updatePayload.full_name = name;
    if (phone) updatePayload.phone     = String(phone).replace(/\D/g, '').slice(-10);
    if (email) updatePayload.email     = String(email).toLowerCase().trim();

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', owner_id);

    if (error) {
      console.error('[set-owner-pin] DB update failed:', error);
      return Response.json({ success: false, message: 'Failed to save PIN.' }, { status: 500, headers });
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      owner_id,
      action:  'pin_set',
      details: { source: 'onboarding' },
    });

    return Response.json({ success: true, message: 'PIN set successfully.' }, { headers });

  } catch (err) {
    console.error('[set-owner-pin] Error:', err);
    return Response.json({ success: false, message: 'Server error.' }, { status: 500, headers });
  }
});
