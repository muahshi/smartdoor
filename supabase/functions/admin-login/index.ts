/**
 * Smart Door — Edge Function: admin-login
 * supabase/functions/admin-login/index.ts
 *
 * services/admin.js → adminLogin() already called this function name —
 * it just never existed, so admin-login.html could never actually log
 * anyone in. This implements the missing backend half.
 *
 * Flow:
 *   1. Validate input, check DB-backed lockout (reuses pin_lockouts,
 *      keyed 'ADMIN:<email>' — see sql/15_admin_provisioning_schema.sql)
 *   2. Look up admin_users + joined admin_roles
 *   3. bcrypt.compare password
 *   4. If totp_enabled and no/invalid code → requires2FA
 *   5. Issue opaque session token (raw → client, sha256 → DB)
 *   6. Audit log + last_login_at/ip update
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/adminAuth.ts';
import { verifyTotp } from '../_shared/totp.ts';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours — matches services/admin.js

const _recentAttempts = new Map<string, number[]>();
const EDGE_WINDOW_MS = 60_000;
const EDGE_MAX = 8;

function edgeRateLimit(key: string): boolean {
  const now = Date.now();
  const list = (_recentAttempts.get(key) || []).filter((t) => now - t < EDGE_WINDOW_MS);
  if (list.length >= EDGE_MAX) return false;
  list.push(now);
  _recentAttempts.set(key, list);
  return true;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { email, password, totp_code } = body as { email?: string; password?: string; totp_code?: string | null };

    if (!email || !password) {
      return Response.json({ success: false, message: 'Email and password required.' }, { status: 400, headers });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const lockoutKey = `ADMIN:${normalizedEmail}`;

    if (!edgeRateLimit(normalizedEmail)) {
      return Response.json(
        { success: false, message: 'Too many attempts. Please wait a minute and try again.' },
        { status: 429, headers: { ...headers, 'Retry-After': '60' } }
      );
    }

    const supabaseAdmin = getServiceClient();

    // DB-backed lockout (5 fails / 15 min — reuses Phase 8 infra)
    const { data: lockoutData } = await supabaseAdmin.rpc('check_pin_lockout', { p_plate_id: lockoutKey });
    if (lockoutData?.locked) {
      const secs = lockoutData.seconds_remaining || 900;
      return Response.json(
        { success: false, message: `Too many failed attempts. Try again in ${Math.ceil(secs / 60)} min.` },
        { status: 429, headers: { ...headers, 'Retry-After': String(secs) } }
      );
    }

    const { data: admin, error: adminErr } = await supabaseAdmin
      .from('admin_users')
      .select('id, email, full_name, password_hash, is_active, totp_secret, totp_enabled, role_id, admin_roles(name, label, color, permissions)')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Constant-time-ish behaviour: always run a bcrypt compare even on miss
    if (adminErr || !admin || !admin.is_active) {
      await bcrypt.compare(password, '$2b$10$invalidhashpadding000000000000000000000000000000000000000');
      await supabaseAdmin.rpc('record_failed_pin', { p_plate_id: lockoutKey });
      return Response.json({ success: false, message: 'Invalid credentials.' }, { status: 401, headers });
    }

    const passwordValid = await bcrypt.compare(password, admin.password_hash);
    if (!passwordValid) {
      const { data: failData } = await supabaseAdmin.rpc('record_failed_pin', { p_plate_id: lockoutKey });
      if (failData?.locked) {
        return Response.json(
          { success: false, message: `Account locked for ${failData.retry_after_minutes} minutes.` },
          { status: 429, headers }
        );
      }
      return Response.json({ success: false, message: 'Invalid credentials.' }, { status: 401, headers });
    }

    // ── 2FA ──
    if (admin.totp_enabled) {
      if (!totp_code) {
        return Response.json({ success: false, requires2FA: true, message: '2FA code required.' }, { status: 401, headers });
      }
      const totpValid = await verifyTotp(admin.totp_secret || '', String(totp_code).trim());
      if (!totpValid) {
        await supabaseAdmin.rpc('record_failed_pin', { p_plate_id: lockoutKey });
        return Response.json({ success: false, requires2FA: true, message: 'Invalid 2FA code.' }, { status: 401, headers });
      }
    }

    // ── Success ──
    await supabaseAdmin.rpc('reset_pin_lockout', { p_plate_id: lockoutKey });

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    await supabaseAdmin
      .from('admin_users')
      .update({
        session_token: tokenHash,
        session_exp: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
      })
      .eq('id', admin.id);

    const role = (admin as unknown as { admin_roles: { name: string; label: string; color: string; permissions: Record<string, string[]> } }).admin_roles;

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action: 'login',
      resource: 'admin_users',
      resource_id: admin.id,
      ip_address: ip,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
      notes: 'Login successful',
    });

    return Response.json({
      success: true,
      token: rawToken,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role_name: role?.name || 'support',
        role_label: role?.label || role?.name || 'Staff',
        role_color: role?.color || '#6B7280',
        permissions: role?.permissions || {},
      },
    }, { headers });

  } catch (err) {
    console.error('[admin-login] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
