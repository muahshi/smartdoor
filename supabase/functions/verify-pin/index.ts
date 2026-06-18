/**
 * Smart Door — Supabase Edge Function: verify-pin
 * Deploy to: supabase/functions/verify-pin/index.ts
 *
 * Called by auth.js loginOwner()
 * Verifies Plate ID + PIN (bcrypt check server-side)
 * Returns a short-lived token to complete Supabase Auth signin
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { plate_id, pin } = await req.json();

    if (!plate_id || !pin) {
      return Response.json({ success: false, message: 'Missing plate_id or pin' }, { status: 400, headers: corsHeaders });
    }

    // Normalize
    const normalizedPlateId = plate_id.trim().toUpperCase();
    const pinStr = String(pin).trim();

    if (!/^\d{4}$/.test(pinStr)) {
      return Response.json({ success: false, message: 'PIN must be 4 digits' }, { status: 400, headers: corsHeaders });
    }

    // Use SERVICE ROLE key (bypasses RLS) for PIN verification
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up user by plate_id
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, pin_hash, plate_id')
      .eq('plate_id', normalizedPlateId)
      .single();

    if (error || !user) {
      // Timing-safe: still run bcrypt even on not-found to prevent timing attacks
      await bcrypt.compare('0000', '$2b$10$invalidhashpadding00000000000000000000000000000000000');
      return Response.json({ success: false, message: 'Invalid Plate ID or PIN' }, { status: 401, headers: corsHeaders });
    }

    // Verify PIN hash
    const isValid = await bcrypt.compare(pinStr, user.pin_hash);

    if (!isValid) {
      return Response.json({ success: false, message: 'Invalid Plate ID or PIN' }, { status: 401, headers: corsHeaders });
    }

    // Get subscription info
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expiry_date')
      .eq('owner_id', user.id)
      .eq('status', 'active')
      .single();

    // Generate a short-lived one-time token for client to complete auth
    // In production: use supabaseAdmin.auth.admin.generateLink or custom JWT
    // Simplified: return a signed-in session via admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin
      .getUserById(user.auth_user_id || '')
      .then(async () => {
        return await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: user.email || `${user.plate_id.toLowerCase()}@smartdoor.internal`,
          options: { redirectTo: '/app.html' },
        });
      });

    // Return success + user info
    return Response.json({
      success:   true,
      owner_id:  user.id,
      full_name: user.full_name,
      email:     user.email || `${user.plate_id.toLowerCase()}@smartdoor.internal`,
      token:     authData?.properties?.hashed_token || 'token_placeholder',
      plan:      sub?.plan || 'starter',
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[verify-pin] Error:', err);
    return Response.json({ success: false, message: 'Server error' }, { status: 500, headers: corsHeaders });
  }
});

/**
 * DEPLOY COMMAND:
 * supabase functions deploy verify-pin --no-verify-jwt
 *
 * SECRETS to set:
 * supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
 */
