/**
 * Smart Door — Edge Function: owner-forgot-pin
 * supabase/functions/owner-forgot-pin/index.ts
 *
 * Forgot PIN — Owner Recovery Flow (Phase 13)
 *
 * Step 1 — Request OTP:
 *   POST { plate_id, channel: 'phone'|'email' }
 *   → Looks up user by plate_id, sends OTP, returns { success, masked_contact }
 *
 * Step 2 — Verify OTP + Reset PIN:
 *   POST { plate_id, otp, new_pin }
 *   → Verifies OTP, bcrypt-hashes new PIN, updates users.pin_hash
 *   → Clears PIN lockout so owner can log in immediately
 *
 * Uses: pin_recovery_otps table (6-digit OTP, 10-minute TTL, max 3 active per plate)
 * Sends: OTP via MSG91 (SMS) or send-email function (email)
 *
 * Rate limits:
 *   - 3 OTP requests per plate per 15 minutes (DB-level, pin_lockouts reused)
 *   - 5 wrong OTP attempts → OTP invalidated
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/adminAuth.ts';

const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS = 3;
const OTP_WINDOW_MINUTES = 15;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return '****';
  return '***' + phone.slice(-4);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '****@****.***';
  return local.slice(0, 2) + '****@' + domain;
}

serve(async (req) => {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), { status: 405, headers });
  }

  const supabaseAdmin = getServiceClient();

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return new Response(JSON.stringify({ success: false, message: 'Invalid JSON body' }), { status: 400, headers }); }

    const { plate_id, channel, otp, new_pin, step } = body as {
      plate_id?: string;
      channel?: string;
      otp?: string;
      new_pin?: string;
      step?: 'request_otp' | 'verify_otp';
    };

    if (!plate_id) {
      return new Response(JSON.stringify({ success: false, message: 'plate_id is required.' }), { status: 400, headers });
    }

    const pid = String(plate_id).trim().toUpperCase();

    // Determine step from payload
    const action = step || (otp ? 'verify_otp' : 'request_otp');

    // ──────────────────────────────────────────────
    // STEP 1: REQUEST OTP
    // ──────────────────────────────────────────────
    if (action === 'request_otp') {
      const ch = String(channel || 'phone').toLowerCase();
      if (!['phone', 'email'].includes(ch)) {
        return new Response(JSON.stringify({ success: false, message: "channel must be 'phone' or 'email'." }), { status: 400, headers });
      }

      // Look up user by plate_id
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id, full_name, phone, email, plate_id')
        .eq('plate_id', pid)
        .maybeSingle();

      if (userErr || !user) {
        // Don't reveal if plate exists — generic message
        return new Response(JSON.stringify({ success: true, message: 'If this plate ID is registered, an OTP has been sent.' }), { headers });
      }

      // Check contact availability
      if (ch === 'email' && !user.email) {
        return new Response(JSON.stringify({ success: false, message: 'No email address is registered for this plate. Try SMS.' }), { status: 400, headers });
      }

      // Rate limit: max 3 OTP requests per plate per 15 min
      const windowStart = new Date(Date.now() - OTP_WINDOW_MINUTES * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('pin_recovery_otps')
        .select('id', { count: 'exact', head: true })
        .eq('plate_id', pid)
        .gte('created_at', windowStart);

      if ((count || 0) >= MAX_OTP_REQUESTS) {
        return new Response(JSON.stringify({
          success: false,
          message: `Too many OTP requests. Please wait ${OTP_WINDOW_MINUTES} minutes and try again.`,
        }), { status: 429, headers });
      }

      // Invalidate any existing active OTPs for this plate
      await supabaseAdmin
        .from('pin_recovery_otps')
        .update({ status: 'invalidated' })
        .eq('plate_id', pid)
        .eq('status', 'pending');

      // Generate OTP
      const otpCode = generateOtp();
      const otpHash = await (async () => {
        const data = new TextEncoder().encode(otpCode);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      })();

      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

      // Store OTP (hashed)
      await supabaseAdmin.from('pin_recovery_otps').insert({
        plate_id: pid,
        owner_id: user.id,
        otp_hash: otpHash,
        channel: ch,
        expires_at: expiresAt,
        status: 'pending',
        attempt_count: 0,
      });

      // Send OTP
      let sendSuccess = false;
      let maskedContact = '';

      if (ch === 'phone') {
        maskedContact = maskPhone(user.phone);
        // Send via MSG91 SMS
        const msg91Key = Deno.env.get('MSG91_API_KEY');
        const msg91Sender = Deno.env.get('MSG91_SENDER_ID') || 'SMRTDR';
        if (msg91Key) {
          try {
            const smsRes = await fetch('https://api.msg91.com/api/v5/otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', authkey: msg91Key },
              body: JSON.stringify({
                template_id: Deno.env.get('MSG91_OTP_TEMPLATE_ID') || '',
                mobile: `91${user.phone}`,
                otp: otpCode,
                sender: msg91Sender,
              }),
            });
            sendSuccess = smsRes.ok;
          } catch (e) {
            console.error('[owner-forgot-pin] SMS send failed:', e);
          }
        } else {
          // Fallback: log OTP in dev mode (remove in production)
          console.log(`[owner-forgot-pin] DEV OTP for ${pid}: ${otpCode}`);
          sendSuccess = true;
        }
      } else {
        maskedContact = maskEmail(user.email!);
        // Send via send-email Edge Function
        try {
          const emailRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              to: user.email,
              subject: 'SmartDoor PIN Recovery OTP',
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto">
                  <h2>SmartDoor PIN Recovery</h2>
                  <p>Hi ${user.full_name},</p>
                  <p>Your OTP to reset the PIN for plate <strong>${pid}</strong> is:</p>
                  <div style="font-size:36px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center">${otpCode}</div>
                  <p>This OTP is valid for <strong>${OTP_TTL_MINUTES} minutes</strong> and can only be used once.</p>
                  <p>If you did not request this, please ignore this email — your PIN has not changed.</p>
                  <hr/>
                  <small>SmartDoor — mysmartdoor.in</small>
                </div>
              `,
            }),
          });
          sendSuccess = emailRes.ok;
        } catch (e) {
          console.error('[owner-forgot-pin] Email send failed:', e);
        }
      }

      if (!sendSuccess) {
        // Invalidate the OTP we just stored since we couldn't deliver it
        await supabaseAdmin.from('pin_recovery_otps').update({ status: 'failed' }).eq('plate_id', pid).eq('status', 'pending');
        return new Response(JSON.stringify({
          success: false,
          message: 'Failed to send OTP. Please try again.',
        }), { status: 500, headers });
      }

      return new Response(JSON.stringify({
        success: true,
        message: `OTP sent to ${maskedContact}. Valid for ${OTP_TTL_MINUTES} minutes.`,
        masked_contact: maskedContact,
        channel: ch,
        expires_in_minutes: OTP_TTL_MINUTES,
      }), { headers });
    }

    // ──────────────────────────────────────────────
    // STEP 2: VERIFY OTP + RESET PIN
    // ──────────────────────────────────────────────
    if (action === 'verify_otp') {
      const otpStr = String(otp || '').trim();
      const pinStr = String(new_pin || '').trim();

      if (!otpStr || otpStr.length !== 6) {
        return new Response(JSON.stringify({ success: false, message: 'OTP must be 6 digits.' }), { status: 400, headers });
      }
      if (!/^\d{4}$/.test(pinStr)) {
        return new Response(JSON.stringify({ success: false, message: 'New PIN must be exactly 4 digits.' }), { status: 400, headers });
      }

      // Find active OTP record
      const { data: otpRecord, error: otpErr } = await supabaseAdmin
        .from('pin_recovery_otps')
        .select('id, owner_id, otp_hash, expires_at, attempt_count, status')
        .eq('plate_id', pid)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpErr || !otpRecord) {
        return new Response(JSON.stringify({ success: false, message: 'No active OTP found. Please request a new one.' }), { status: 400, headers });
      }

      // Check expiry
      if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
        await supabaseAdmin.from('pin_recovery_otps').update({ status: 'expired' }).eq('id', otpRecord.id);
        return new Response(JSON.stringify({ success: false, message: 'OTP has expired. Please request a new one.' }), { status: 400, headers });
      }

      // Check attempt count
      if ((otpRecord.attempt_count || 0) >= MAX_OTP_ATTEMPTS) {
        await supabaseAdmin.from('pin_recovery_otps').update({ status: 'invalidated' }).eq('id', otpRecord.id);
        return new Response(JSON.stringify({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' }), { status: 429, headers });
      }

      // Verify OTP hash
      const otpHash = await (async () => {
        const data = new TextEncoder().encode(otpStr);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      })();

      if (otpHash !== otpRecord.otp_hash) {
        await supabaseAdmin.from('pin_recovery_otps').update({ attempt_count: (otpRecord.attempt_count || 0) + 1 }).eq('id', otpRecord.id);
        const remaining = MAX_OTP_ATTEMPTS - (otpRecord.attempt_count || 0) - 1;
        return new Response(JSON.stringify({
          success: false,
          message: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        }), { status: 400, headers });
      }

      // OTP valid — hash new PIN and update
      const pinHash = await bcrypt.hash(pinStr, await bcrypt.genSalt(12));

      const { error: updateErr } = await supabaseAdmin
        .from('users')
        .update({ pin_hash: pinHash })
        .eq('id', otpRecord.owner_id);

      if (updateErr) {
        console.error('[owner-forgot-pin] PIN update failed:', updateErr);
        return new Response(JSON.stringify({ success: false, message: 'Failed to update PIN. Please try again.' }), { status: 500, headers });
      }

      // Mark OTP as used
      await supabaseAdmin.from('pin_recovery_otps').update({ status: 'used', used_at: new Date().toISOString() }).eq('id', otpRecord.id);

      // Clear PIN lockout (in case the owner was locked out)
      await supabaseAdmin.rpc('reset_pin_lockout', { p_plate_id: pid });

      // Audit
      await supabaseAdmin.from('audit_logs').insert({
        owner_id: otpRecord.owner_id,
        action: 'pin_changed',
        details: { method: 'forgot_pin_otp', plate_id: pid },
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'PIN reset successfully. You can now log in with your new PIN.',
      }), { headers });
    }

    return new Response(JSON.stringify({ success: false, message: "step must be 'request_otp' or 'verify_otp'." }), { status: 400, headers });

  } catch (err) {
    console.error('[owner-forgot-pin] Unexpected error:', err);
    return new Response(JSON.stringify({ success: false, message: 'Server error. Please try again.' }), { status: 500, headers });
  }
});
