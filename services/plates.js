8/**
 * Smart Door — Plates Service
 * services/plates.js
 *
 * Handles: QR slug lookup, plate activation check, visitor PWA data loading
 *
 * REDESIGN (Activation Fix):
 *  - isPlateActive()   → Single source of truth for activation state.
 *                        Used by visitorExperience.js. No order/subscription queries.
 *  - getPlateBySlug()  → Now searches BOTH qr_slug AND plate_id (old plates compat).
 *                        Does NOT filter on status='active' — activation gate is
 *                        handled by isPlateActive() alone.
 */

import { supabase } from './supabase.js';

// ────────── ACTIVATION CHECK: Single Source of Truth ──────────
/**
 * A plate is ACTIVE if and only if:
 *   1. owner_id is not null   (an owner has been assigned)
 *   2. status = 'active'      (admin/system set it active)
 *   3. activation_date is not null (activation was recorded)
 *
 * This is the ONLY place activation is evaluated for the visitor flow.
 * No orders, no subscriptions, no manufacturing checks.
 *
 * @param {string} slugOrPlateId  — qr_slug OR plate_id (e.g. "SD-ABX9K7")
 * @returns {{ active: boolean, plate: object|null, reason: string|null }}
 */
export async function isPlateActive(slugOrPlateId) {
  try {
    const normalized = slugOrPlateId.trim().toUpperCase();

    // Search by qr_slug OR plate_id to support both old and new plates.
    // We do NOT filter on status here — we read status and decide below.
    const { data: plate, error } = await supabase
      .from('plates')
      .select('id, plate_id, qr_slug, product_type, status, owner_id, activation_date')
      .or(`qr_slug.eq."${normalized}",plate_id.eq."${normalized}"`)
      .maybeSingle();

    if (error) {
      console.error('[Plates] isPlateActive DB error:', error);
      return { active: false, plate: null, reason: 'db_error' };
    }

    if (!plate) {
      return { active: false, plate: null, reason: 'not_found' };
    }

    // The three conditions for a plate being active:
    const hasOwner      = !!plate.owner_id;
    const isActive      = plate.status === 'active';
    const isActivated   = !!plate.activation_date;

    if (!hasOwner)    return { active: false, plate, reason: 'no_owner' };
    if (!isActive)    return { active: false, plate, reason: 'status_inactive' };
    if (!isActivated) return { active: false, plate, reason: 'not_activated' };

    return { active: true, plate, reason: null };
  } catch (err) {
    console.error('[Plates] isPlateActive error:', err);
    return { active: false, plate: null, reason: 'exception' };
  }
}

// ────────── GET PLATE DATA (Visitor PWA — only called after isPlateActive confirms active) ──────────
/**
 * Fetches owner display name and security rules for an already-confirmed active plate.
 * Called by visitorExperience.js AFTER isPlateActive() returns true.
 *
 * Supports both qr_slug and plate_id lookups for backward compatibility.
 *
 * @param {string} slugOrPlateId
 * @returns {{ success: boolean, plate?, owner?, securityRules?, error? }}
 */
export async function getPlateBySlug(slugOrPlateId) {
  try {
    const normalized = slugOrPlateId.trim().toUpperCase();

    // FIX: Do NOT embed-join users here. The plates_public_qr_lookup RLS
    // policy allows anon to read active plates, BUT the embedded PostgREST
    // join to users goes through users_select_own (auth_user_id = auth.uid())
    // which returns NULL for anon. Fetch via SECURITY DEFINER RPC instead.
    //
    // FIX: Search both qr_slug AND plate_id so old plates (where plate_id
    // was used directly as the QR slug before the qr_slug column existed)
    // still resolve correctly.
    const { data: plate, error } = await supabase
      .from('plates')
      .select('id, plate_id, qr_slug, product_type, status, owner_id, activation_date')
      .or(`qr_slug.eq.${normalized},plate_id.eq.${normalized}`)
      .maybeSingle();

    if (error || !plate) {
      return { success: false, error: 'Plate not found.' };
    }

    // Fetch owner display name and security rules in parallel.
    // Both use SECURITY DEFINER RPCs or public-read policies — safe for anon.
    const [ownerRes, rulesRes] = await Promise.all([
      supabase.rpc('get_owner_display_for_plate', { p_plate_id: plate.plate_id }),
      supabase
        .from('security_rules')
        .select('night_mode_on, night_mode_start, night_mode_end, allow_sos, allow_voice, allow_calls, call_forwarding, current_status, custom_message')
        .eq('owner_id', plate.owner_id)
        .single(),
    ]);

    const ownerName = ownerRes.data?.full_name || 'Resident';

    return {
      success: true,
      plate: {
        id: plate.id,
        plateId: plate.plate_id,
        productType: plate.product_type,
      },
      owner: {
        id: plate.owner_id,
        name: ownerName,
      },
      securityRules: rulesRes.data || {
        night_mode_on: false,
        allow_sos: true,
        allow_voice: true,
        allow_calls: true,
        call_forwarding: true,
        current_status: 'available',
        custom_message: null,
      },
    };
  } catch (err) {
    console.error('[Plates] getPlateBySlug error:', err);
    return { success: false, error: 'Server error. Please try again.' };
  }
}

// ────────── GET OWNER'S PLATE ──────────
export async function getMyPlate(ownerId) {
  const { data, error } = await supabase
    .from('plates')
    .select('*')
    .eq('owner_id', ownerId)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, plate: data };
}

// ────────── GENERATE UNIQUE PLATE ID ──────────
/**
 * Generates a unique Smart Door plate ID
 * Format: SD-XXXXXXX (2 letters + 1 digit + 1 letter + 1 digit + 2 letters)
 * Example: SD-ABX9K7
 */
export function generatePlateId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums  = '23456789';
  const rand  = (arr) => arr[Math.floor(Math.random() * arr.length)];

  return `SD-${rand(chars)}${rand(chars)}${rand(nums)}${rand(chars)}${rand(nums)}${rand(chars)}`;
}

// ────────── GENERATE QR URL ──────────
export function getQrUrl(plateId, baseUrl = 'https://mysmartdoor.in') {
  return `${baseUrl}/p/${plateId}`;
}

// ────────── REALTIME: LISTEN TO PLATE STATUS CHANGES ──────────
/**
 * Subscribe to security_rules changes for a plate (used on visitor PWA)
 * @param {string} ownerId
 * @param {Function} callback  (rules) => void
 */
export function subscribeToStatusChanges(ownerId, callback) {
  const channel = supabase
    .channel(`status:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'security_rules',
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel); // returns unsubscribe fn
}
