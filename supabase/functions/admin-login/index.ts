/**
 * Smart Door — Edge Function: admin-login
 * supabase/functions/admin-login/index.ts
 *
 * FIX (Phase 13 hotfix): Replaced deno.land/x/bcrypt@v0.4.1 with
 * npm:bcryptjs — bcryptjs is pure JS, zero Worker/thread dependency,
 * runs fine in Supabase Edge Functions (Deno).
 *
 * Root cause of original error:
 *   deno.land/x/bcrypt@v0.4.1/mod.ts spawns a Worker for the hash
 *   operation. Supabase Edge Functions block Worker instantiation →
 *   "ReferenceError: Worker is not defined".
 *
 * Solution: npm:bcryptjs — identical API, pure JS, no Workers.
 * Password hashes created by pgcrypto crypt('bf') are $2a$ format,
 * which bcryptjs handles correctly (it normalises $2a$/$2b$/$2y$).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// ✅ Pure-JS bcrypt — no Worker, no threads, Deno-safe
import bcryptjs from 'npm:bcryptjs@2.4.3';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/adminAuth.ts';
import { verifyTotp } from '../_shared/totp.ts';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

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

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// bcryptjs compare wrapper — same signature as deno bcrypt
async function bcryptCompare(plain: string, hash: string): Promise<boolean> {
  try {
    return bcryptjs.compareSync(plain, hash);
  } catch {
    return false;
  }
}

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json(
      { success: false, message: 'Method not allowed' },
      { status: 405, headers }
    );
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { success: false, message: 'Invalid JSON body' },
        { status: 400, headers }
      );
    }

    const { email, password, totp_code } = body as {
      email?: string;
      password?: string;
      totp_code?: string | null;
    };

    if (!email || !password) {
      return Response.json(
        { success: false, message: 'Email and password required.' },
        { status: 400, headers }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const lockoutKey = `ADMIN:${normalizedEmail}`;

    // Edge-level rate limit (in-memory, per instance)
    if (!edgeRateLimit(normalizedEmail)) {
      return Response.json(
        { success: false, message: 'Too many attempts. Please wait a minute and try again.' },
        { status: 429, headers: { ...headers, 'Retry-After': '60' } }
      );
    }

    const supabaseAdmin = getServiceClient();

    // DB-backed lockout — reuses pin_lockouts table keyed ADMIN:<email>
    const { data: lockoutData } = await supabaseAdmin.rpc('check_pin_lockout', {
      p_plate_id: lockoutKey,
    });
    if (lockoutData?.locked) {
      const secs = lockoutData.seconds_remaining || 900;
      return Response.json(
        {
          success: false,
          message: `Too many failed attempts. Try again in ${Math.ceil(secs / 60)} min.`,
        },
        { status: 429, headers: { ...headers, 'Retry-After': String(secs) } }
      );
    }

    // Fetch admin record + role
    const { data: admin, error: adminErr } = await supabaseAdmin
      .from('admin_users')
      .select(
        'id, email, full_name, password_hash, is_active, totp_secret, totp_enabled, role_id, admin_roles(name, label, color, permissions)'
      )
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Constant-time behaviour on miss — always run a compare
    if (adminErr || !admin || !admin.is_active) {
      // Dummy compare so timing doesn't reveal existence of account
      await bcryptCompare(
        password,
        '$2a$12$invalidhashpaddinginvalidhashpaddinginvalidhashpadding00'
      );
      await supabaseAdmin.rpc('record_failed_pin', { p_plate_id: lockoutKey });
      return Response.json(
        { success: false, message: 'Invalid credentials.' },
        { status: 401, headers }
      );
    }

    // ── Password verify ──
    const passwordValid = await bcryptCompare(String(password), admin.password_hash);

    if (!passwordValid) {
      const { data: failData } = await supabaseAdmin.rpc('record_failed_pin', {
        p_plate_id: lockoutKey,
      });
      if (failData?.locked) {
        return Response.json(
          {
            success: false,
            message: `Account locked for ${failData.retry_after_minutes} minutes.`,
          },
          { status: 429, headers }
        );
      }
      return Response.json(
        { success: false, message: 'Invalid credentials.' },
        { status: 401, headers }
      );
    }

    // ── 2FA (optional TOTP) ──
    if (admin.totp_enabled) {
      if (!totp_code) {
        return Response.json(
          { success: false, requires2FA: true, message: '2FA code required.' },
          { status: 401, headers }
        );
      }
      const totpValid = await verifyTotp(
        admin.totp_secret || '',
        String(totp_code).trim()
      );
      if (!totpValid) {
        await supabaseAdmin.rpc('record_failed_pin', { p_plate_id: lockoutKey });
        return Response.json(
          { success: false, requires2FA: true, message: 'Invalid 2FA code.' },
          { status: 401, headers }
        );
      }
    }

    // ── Success — issue session token ──
    await supabaseAdmin.rpc('reset_pin_lockout', { p_plate_id: lockoutKey });

    const rawToken = randomToken();
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    await supabaseAdmin
      .from('admin_users')
      .update({
        session_token: rawToken,
        session_exp: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
      })
      .eq('id', admin.id);

    const role = (
      admin as unknown as {
        admin_roles: {
          name: string;
          label: string;
          color: string;
          permissions: Record<string, string[]>;
        };
      }
    ).admin_roles;

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

    return Response.json(
      {
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
      },
      { headers }
    );
  } catch (err) {
    console.error('[admin-login] Unexpected error:', err);
    return Response.json(
      { success: false, message: 'Server error. Please try again.' },
      { status: 500, headers }
    );
  }
});
