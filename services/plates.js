/**
 * Smart Door — Plates Service
 * services/plates.js
 *
 * Handles: QR slug lookup, plate status, visitor PWA data loading
 */

import { supabase } from './supabase.js';

// ────────── GET PLATE BY QR SLUG (Visitor PWA) ──────────
/**
 * Called when visitor scans QR: /p/SD-ABX9K7
 * Returns owner status + security rules for visitor display
 * @param {string} slug  e.g. "SD-ABX9K7"
 * @returns {{ plate, owner, securityRules, subscription } | null}
 */
export async function getPlateBySlug(slug) {
  try {
    const normalized = slug.trim().toUpperCase();

    // FIX: Do NOT embed-join users here. The plates_public_qr_lookup RLS
    // policy allows anon to read active plates, BUT the embedded PostgREST
    // join to users goes through users_select_own (auth_user_id = auth.uid())
    // which returns NULL for anon — causing the join to return no user data or
    // silently fail. Fetch the plate row alone, then get the owner display
    // name via the get_owner_display_for_plate() SECURITY DEFINER RPC which
    // only exposes the non-sensitive full_name field.
    const { data: plate, error } = await supabase
      .from('plates')
      .select('id, plate_id, qr_slug, product_type, status, owner_id')
      .eq('qr_slug', normalized)
      .eq('status', 'active')
      .single();

    if (error || !plate) {
      return { success: false, error: 'Plate not found or inactive.' };
    }

    // Fetch owner display name, security rules, subscription in parallel.
    // All three use SECURITY DEFINER RPCs or public-read policies — safe for anon.
    const [ownerRes, rulesRes] = await Promise.all([
      supabase.rpc('get_owner_display_for_plate', { p_plate_id: normalized }),
      supabase
        .from('security_rules')
        .select('night_mode_on, night_mode_start, night_mode_end, allow_sos, allow_voice, allow_calls, call_forwarding, current_status, custom_message')
        .eq('owner_id', plate.owner_id)
        .single(),
    ]);

    const ownerName = ownerRes.data?.full_name || 'Resident';

    // Note: subscription is now read via the get_subscription_status_for_plate
    // RPC in visitorExperience.js — not here — to avoid the RLS block on
    // subscriptions_select_own (which also requires auth_user_id = auth.uid()).

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
      subscription: null, // resolved separately via get_subscription_status_for_plate RPC
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
