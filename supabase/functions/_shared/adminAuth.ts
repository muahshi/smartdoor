/**
 * Smart Door — Shared Admin Auth/RBAC Helper
 * supabase/functions/_shared/adminAuth.ts
 *
 * Har sensitive admin Edge Function (provisioning, PIN reset, suspend,
 * ownership transfer) is helper se admin session verify karta hai —
 * server-side, service_role se — kyunki client-side session check
 * (services/admin.js → requireAdminAuth()) sirf UI gating ke liye hai,
 * bypass-able hai (DevTools se localStorage edit karke). Real
 * authorization hamesha yahi, Edge Function ke andar, honi chahiye.
 *
 * Session token contract (set by admin-login):
 *   - Client ko ek random opaque token milta hai (raw).
 *   - DB mein wahi raw token store hota hai (admin_users.session_token).
 *   - Client har request pe `Authorization: Bearer <token>` bhejta hai.
 *   - Server directly token compare karta hai (no SHA-256 hashing).
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AdminContext {
  id: string;
  email: string;
  full_name: string;
  role_name: string;
  permissions: Record<string, string[]>;
}

/**
 * Extracts + verifies the admin session from the Authorization header.
 * Returns the admin's context (id, role, permissions) or null if invalid/expired/revoked.
 */
export async function verifyAdminSession(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<AdminContext | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // Direct token comparison — no SHA-256 hashing
  const { data: admin, error } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, full_name, is_active, session_token, session_exp, role_id, admin_roles(name, permissions)')
    .eq('session_token', token)
    .maybeSingle();

  if (error) {
    console.error('[adminAuth] DB error looking up session_token:', error.message);
    return null;
  }
  if (!admin) {
    console.warn('[adminAuth] No admin found for token — user must re-login after schema changes');
    return null;
  }
  if (!admin.is_active) {
    console.warn('[adminAuth] Admin account inactive:', admin.email);
    return null;
  }
  if (!admin.session_exp || new Date(admin.session_exp).getTime() < Date.now()) return null;

  // Check revocation list (e.g. password changed, admin disabled mid-session).
  // DEFENSIVE: admin_session_revocations table may not exist in all deployments.
  // If the table is missing, skip the revocation check rather than failing auth entirely.
  try {
    const { data: revocation } = await supabaseAdmin
      .from('admin_session_revocations')
      .select('id')
      .eq('admin_id', admin.id)
      .gte('revoked_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (revocation) return null;
  } catch {
    // Table doesn't exist or query failed — non-fatal, continue auth
    console.warn('[adminAuth] admin_session_revocations check failed — skipping (table may not exist yet)');
  }

  const role = (admin as unknown as { admin_roles: { name: string; permissions: Record<string, string[]> } }).admin_roles;

  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role_name: role?.name || 'unknown',
    permissions: role?.permissions || {},
  };
}

/**
 * RBAC check: does this admin have `action` on `resource`?
 * Super admin wildcard ('*') always passes.
 */
export function adminCan(ctx: AdminContext, resource: string, action: 'read' | 'write' | 'delete' | 'manage' = 'write'): boolean {
  const perms = ctx.permissions || {};
  if (perms['*']) return true;
  const resourcePerms = perms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action) || resourcePerms.includes('manage');
}

/** Standard 401/403 JSON response helper for admin Edge Functions. */
export function adminAuthError(headers: Record<string, string>, status = 401, message = 'Admin session invalid or expired.') {
  return Response.json({ success: false, message }, { status, headers });
}

/** Convenience: build a service-role Supabase client (used by every admin Edge Function). */
export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}
