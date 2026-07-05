/**
 * Smart Door — Security Rules Service
 * services/security.js
 */

import { supabase } from './supabase.js';
import { sanitize } from './sanitize.js';

// ────────── GET SECURITY RULES ──────────
export async function getSecurityRules(ownerId) {
  const { data, error } = await supabase
    .from('security_rules')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle(); // FIX: was .single() — a new owner without a
                    // security_rules row yet is normal, not an error.

  if (error) return { success: false, error: error.message };
  // No row yet: return safe defaults instead of leaving callers with
  // undefined data (rules?.night_mode_on etc. all resolve to falsy/off).
  return { success: true, rules: data || {} };
}

// ────────── UPDATE SECURITY RULES ──────────
export async function updateSecurityRules(ownerId, updates) {
  const { data, error } = await supabase
    .from('security_rules')
    .update(updates)
    .eq('owner_id', ownerId)
    .select()
    .maybeSingle(); // FIX: was .single() — if no security_rules row exists
                    // yet for this owner, UPDATE matches 0 rows and .single()
                    // 406s instead of returning cleanly.

  if (error) return { success: false, error: error.message };
  return { success: true, rules: data };
}

// ────────── UPDATE STATUS ──────────
export async function updateOwnerStatus(ownerId, status, customMessage = null) {
  // Update security rules
  const { error } = await supabase
    .from('security_rules')
    .update({ current_status: status, custom_message: customMessage })
    .eq('owner_id', ownerId);

  if (error) return { success: false, error: error.message };

  // Log to status history
  await supabase.from('status_history').insert({
    owner_id: ownerId,
    status,
    custom_message: customMessage,
  });

  return { success: true };
}

// ────────── GET FAMILY MEMBERS ──────────
export async function getFamilyMembers(ownerId) {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('owner_id', ownerId)
    .order('priority', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, members: data };
}

// ────────── ADD FAMILY MEMBER ──────────
// NOTE: priority 1 is reserved for the primary owner (call_logs.routed_to_priority
// defaults to 1 for the owner's own leg — see call-status-webhook's family
// routing fallback). Family members occupy tiers 2, 3, 4, matching the
// Primary Owner → Member 2 → Member 3 → Member 4 routing order.
export async function addFamilyMember(ownerId, { name, phone, relationship = 'family' }) {
  // Count existing members (was previously checked against a 1-row query,
  // which could never report more than 1 member — fixed to a real count).
  const { count, error: countErr } = await supabase
    .from('family_members')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  if (countErr) return { success: false, error: countErr.message };
  if ((count || 0) >= 3) {
    return { success: false, error: 'Maximum 3 family members allowed (tiers 2–4 after the primary owner).' };
  }

  const { data: existing } = await supabase
    .from('family_members')
    .select('priority')
    .eq('owner_id', ownerId)
    .order('priority', { ascending: false })
    .limit(1);

  const nextPriority = Math.max(existing?.[0]?.priority || 1, 1) + 1;

  const { data, error } = await supabase
    .from('family_members')
    .insert({ owner_id: ownerId, name: sanitize.text(name, 60), phone, relationship, priority: nextPriority })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
}

// ────────── REMOVE FAMILY MEMBER ──────────
export async function removeFamilyMember(memberId, ownerId) {
  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', memberId)
    .eq('owner_id', ownerId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ────────── REORDER FAMILY MEMBERS ──────────
export async function reorderFamilyMembers(ownerId, orderedIds) {
  const updates = orderedIds.map((id, idx) =>
    supabase
      .from('family_members')
      .update({ priority: idx + 2 })   // tier 1 reserved for the primary owner
      .eq('id', id)
      .eq('owner_id', ownerId)
  );

  await Promise.all(updates);
  return { success: true };
}

// ────────── TOGGLE MEMBER ACTIVE ──────────
export async function toggleMemberActive(memberId, ownerId, isActive) {
  const { error } = await supabase
    .from('family_members')
    .update({ is_active: isActive })
    .eq('id', memberId)
    .eq('owner_id', ownerId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ────────── NIGHT MODE CHECK ──────────
export function isNightModeActive(rules) {
  if (!rules?.night_mode_on) return false;

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (rules.night_mode_start || '22:00').split(':').map(Number);
  const [endH, endM]     = (rules.night_mode_end   || '06:00').split(':').map(Number);

  const startMins = startH * 60 + startM;
  const endMins   = endH * 60 + endM;

  // Handle overnight range (e.g., 22:00 – 06:00)
  if (startMins > endMins) {
    return currentMins >= startMins || currentMins < endMins;
  }
  return currentMins >= startMins && currentMins < endMins;
}
