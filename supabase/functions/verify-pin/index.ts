/**
 * Smart Door — Supabase Edge Function: verify-pin (v2 — Phase 8 Hardened)
 * supabase/functions/verify-pin/index.ts
 *
 * Phase 8 changes:
 *   - PIN lockout: 5 failed attempts → 15-min lockout (DB-backed)
 *   - Input validation: regex on plate_id, length on PIN
 *   - Edge-layer rate limit: 10 req/min per plate_id
 *   - CORS: domain-restricted in production
 *   - Audit: records pin_failed + pin_locked events
 *   - Explicit error handling on generateLink failure
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcryptjs from 'npm:bcryptjs@2.4.3';

const ALLOWED_ORIGINS = [
  'https://mysmartdoor.in',
  'https://www.mysmartdoor.in',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const _recentAttempts = new Map<string, number[]>();
const EDGE_WINDOW_MS  = 60_000;
const EDGE_MAX        = 10;

function edgeRateLimit(plateId: string): boolean {
  const now  = Date.now();
  const list = (_recentAttempts.get(plateId) || []).filter((t: number) => now - t < EDGE_WINDOW_MS);
  if (list.length >= EDGE_MAX) return false;
  list.push(now);
  _recentAttempts.set(plateId, list);
  return true;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { plate_id, pin } = body as { plate_id?: string; pin?: string };

    if (!plate_id || !pin) {
      return Response.json({ success: false, message: 'Missing plate_id or pin' }, { status: 400, headers });
    }

    const normalizedPlateId = String(plate_id).trim().toUpperCase();
    const pinStr            = String(pin).trim();

    if (!/^SD-[A-Z0-9]{6}$/.test(normalizedPlateId)) {
      return Response.json({ success: false, message: 'Invalid Plate ID format' }, { status: 400, headers });
    }
    if (!/^\d{4}$/.test(pinStr)) {
      return Response.json({ success: false, message: 'PIN must be exactly 4 digits' }, { status: 400, headers });
    }

    if (!edgeRateLimit(normalizedPlateId)) {
      return Response.json(
        { success: false, message: 'Too many attempts. Please wait and try again.' },
        { status: 429, headers: { ...headers, 'Retry-After': '60' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check DB-level lockout
    const { data: lockoutData } = await supabaseAdmin.rpc('check_pin_lockout', { p_plate_id: normalizedPlateId });
    if (lockoutData?.locked) {
      const secs = lockoutData.seconds_remaining || 900;
      return Response.json(
        { success: false, locked: true, message: `Locked. Retry in ${Math.ceil(secs / 60)} min.`, seconds_remaining: secs },
        { status: 429, headers: { ...headers, 'Retry-After': String(secs) } }
      );
    }

    // Look up user
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, pin_hash, plate_id, auth_user_id')
      .eq('plate_id', normalizedPlateId)
      .single();

    if (userErr || !user) {
      bcryptjs.compareSync('0000', '$2b$10$invalidhashpadding000000000000000000000000000000000000000');
      return Response.json({ success: false, message: 'Invalid Plate ID or PIN' }, { status: 401, headers });
    }

    const isValid = bcryptjs.compareSync(pinStr, user.pin_hash);

    if (!isValid) {
      const { data: failData } = await supabaseAdmin.rpc('record_failed_pin', { p_plate_id: normalizedPlateId });

      await supabaseAdmin.from('audit_logs').insert({
        owner_id: user.id,
        action:   failData?.locked ? 'pin_locked' : 'pin_failed',
        details:  { plate_id: normalizedPlateId, failed_count: failData?.failed_count },
        user_agent: req.headers.get('user-agent')?.slice(0, 200),
      });

      if (failData?.locked) {
        return Response.json(
          { success: false, locked: true, message: `Account locked for ${failData.retry_after_minutes} minutes.` },
          { status: 429, headers }
        );
      }
      const remaining = failData?.attempts_remaining ?? 'few';
      return Response.json(
        { success: false, message: `Invalid Plate ID or PIN. ${remaining} attempt(s) remaining.` },
        { status: 401, headers }
      );
    }

    // Success — reset lockout
    await supabaseAdmin.rpc('reset_pin_lockout', { p_plate_id: normalizedPlateId });

    // ── Activate-on-login (the actual fix for "Owner? Login to activate") ──
    // The pending-activation screen on visitor.html has always told visitors
    // "Owner? Login to activate" — but until now, login never activated
    // anything. It only authenticated. A plate that ended up pending for any
    // reason (admin-provisioning row with a mismatched qr_slug, a missed
    // webhook, etc.) could never be fixed by logging in, no matter how many
    // times the owner tried. This makes that promise true, exactly once,
    // idempotently — does nothing if the plate is already active.
    try {
      const { data: ownedPlate } = await supabaseAdmin
        .from('plates')
        .select('id, plate_id, qr_slug, status')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (ownedPlate && ownedPlate.status !== 'active') {
        const { error: activateErr } = await supabaseAdmin
          .from('plates')
          .update({
            status: 'active',
            qr_slug: ownedPlate.qr_slug || ownedPlate.plate_id,
            activation_date: new Date().toISOString(),
          })
          .eq('id', ownedPlate.id);

        if (!activateErr) {
          await supabaseAdmin.from('activation_events').insert({
            plate_id: ownedPlate.plate_id,
            owner_id: user.id,
            event_type: 'activated',
            event_detail: 'Activated via first owner login (verify-pin)',
            actor: 'owner',
          });
          // Notify owner their Smart Door is now live
          supabaseAdmin.from('notifications').insert({
            id: crypto.randomUUID(),
            owner_id: user.id,
            type: 'status_change',
            title: '✅ Smart Door Activated!',
            body: `Your Smart Door ${ownedPlate.plate_id} is live. Visitors can now reach you.`,
            payload: { plateId: ownedPlate.plate_id },
            priority: 'high',
            channels: ['in_app'],
            delivery_status: {},
          }).catch(() => {});
        } else {
          console.error('[verify-pin] plate activation failed:', activateErr);
        }
      }
    } catch (activationErr) {
      // Non-fatal — login must still succeed even if activation bookkeeping fails.
      console.error('[verify-pin] activate-on-login error:', activationErr);
    }

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expiry_date')
      .eq('owner_id', user.id)
      .eq('status', 'active')
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const syntheticEmail = user.email || `${normalizedPlateId.toLowerCase()}@smartdoor.internal`;

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
      options: { redirectTo: '/app.html' },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[verify-pin] generateLink failed:', linkErr);
      return Response.json({ success: false, message: 'Auth token generation failed. Please retry.' }, { status: 500, headers });
    }

    // ── Server-side auth_user_id linking ──
    // Previously this link was only ever set client-side, inside
    // onboarding.html, after a separate auth.signUp() call. If onboarding
    // was skipped or abandoned, PIN login would still "succeed" here (a
    // valid Supabase Auth session gets created) but getCurrentOwner()
    // (services/auth.js) would never resolve a profile, since it looks up
    // users by auth_user_id. generateLink() above already creates-or-finds
    // the Supabase Auth user for this email and returns it — so we link it
    // here, server-side, on every successful login, not just onboarding.
    if (!user.auth_user_id && linkData?.user?.id) {
      const { error: linkUpdateErr } = await supabaseAdmin
        .from('users')
        .update({ auth_user_id: linkData.user.id })
        .eq('id', user.id);

      if (linkUpdateErr) {
        // Non-fatal — login can still proceed via the magic-link token;
        // log it so it's visible without blocking the user.
        console.error('[verify-pin] auth_user_id link failed:', linkUpdateErr);
      }
    }

    return Response.json({
      success:    true,
      owner_id:   user.id,
      full_name:  user.full_name,
      email:      syntheticEmail,
      token:      linkData.properties.hashed_token,
      plan:       sub?.plan || 'hardware_only',
      sub_expiry: sub?.expiry_date || null,
    }, { headers });

  } catch (err) {
    console.error('[verify-pin] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
