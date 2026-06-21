/**
 * Smart Door — Edge Function: set-owner-pin
 * supabase/functions/set-owner-pin/index.ts
 *
 * Owner onboarding ke time PIN set karta hai.
 * PIN kabhi client pe hash nahi hota — yahan bcrypt lagta hai.
 *
 * Also called at first login to set pin_hash from "UNSET" → real hash.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcryptjs from 'npm:bcryptjs@2.4.3';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL              = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { owner_id, pin, name, phone, email } = await req.json();

    if (!owner_id || !pin) {
      return Response.json({ success: false, message: 'owner_id and pin required.' }, { status: 400, headers: corsHeaders });
    }
    if (!/^\d{4}$/.test(String(pin))) {
      return Response.json({ success: false, message: 'PIN must be exactly 4 digits.' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hash the PIN (bcrypt, cost 12)
    const pin_hash = bcryptjs.hashSync(String(pin), 12);

    // Update user record
    const updatePayload: Record<string, unknown> = { pin_hash };
    if (name)  updatePayload.full_name = name;
    if (phone) updatePayload.phone     = phone.replace(/\D/g, '').slice(-10);
    if (email) updatePayload.email     = email.toLowerCase().trim();

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', owner_id);

    if (error) {
      console.error('[set-owner-pin] DB update failed:', error);
      return Response.json({ success: false, message: 'Failed to save PIN.' }, { status: 500, headers: corsHeaders });
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      owner_id,
      action:  'pin_set',
      details: { source: 'onboarding' },
    });

    return Response.json({ success: true, message: 'PIN set successfully.' }, { headers: corsHeaders });

  } catch (err) {
    console.error('[set-owner-pin] Error:', err);
    return Response.json({ success: false, message: 'Server error.' }, { status: 500, headers: corsHeaders });
  }
});
