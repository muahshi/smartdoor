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

    // Get plate + owner details (join via owner_id)
    const { data: plate, error } = await supabase
      .from('plates')
      .select(`
        id,
        plate_id,
        qr_slug,
        product_type,
        status,
        owner_id,
        users!plates_owner_id_fkey (
          id,
          full_name,
          phone
        )
      `)
      .eq('qr_slug', normalized)
      .eq('status', 'active')
      .single();

    if (error || !plate) {
      return { success: false, error: 'Plate not found or inactive.' };
    }

    // Get security rules for this owner
    const { data: rules } = await supabase
      .from('security_rules')
      .select('night_mode_on, night_mode_start, night_mode_end, allow_sos, allow_voice, allow_calls, call_forwarding, current_status, custom_message')
      .eq('owner_id', plate.owner_id)
      .single();

    // Get subscription status
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status, expiry_date')
      .eq('owner_id', plate.owner_id)
      .eq('status', 'active')
      .single();

    return {
      success: true,
      plate: {
        id: plate.id,
        plateId: plate.plate_id,
        productType: plate.product_type,
      },
      owner: {
        id: plate.owner_id,
        name: plate.users?.full_name || 'Resident',
      },
      securityRules: rules || {
        night_mode_on: false,
        allow_sos: true,
        allow_voice: true,
        allow_calls: true,
        call_forwarding: true,
        current_status: 'available',
        custom_message: null,
      },
      subscription: sub || null,
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
