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

    // Step 1: Fetch the plate row (anon-accessible via plates_public_qr_lookup RLS policy)
    // Uses .maybeSingle() so 0 rows → { data: null, error: null } instead of PGRST116 error
    const { data: plate, error: plateError } = await supabase
      .from('plates')
      .select('id, plate_id, qr_slug, product_type, status, owner_id')
      .eq('qr_slug', normalized)
      .eq('status', 'active')
      .maybeSingle();

    if (plateError) {
      console.error('[Plates] getPlateBySlug DB error:', plateError.message, plateError.code);
      return { success: false, error: 'Database error. Please try again.' };
    }

    if (!plate) {
      // Try by plate_id in case qr_slug wasn't backfilled
      const { data: plateById } = await supabase
        .from('plates')
        .select('id, plate_id, qr_slug, product_type, status, owner_id')
        .eq('plate_id', normalized)
        .eq('status', 'active')
        .maybeSingle();

      if (!plateById) {
        return { success: false, error: 'Plate not found or inactive.' };
      }
      // Use this row instead
      return _buildPlateResponse(plateById, normalized);
    }

    return _buildPlateResponse(plate, normalized);

  } catch (err) {
    console.error('[Plates] getPlateBySlug error:', err);
    return { success: false, error: 'Server error. Please try again.' };
  }
}

async function _buildPlateResponse(plate, normalizedSlug) {
  // Fetch owner display name and security rules in parallel.
  // Both use SECURITY DEFINER RPCs or public-read policies — safe for anon.
  const [ownerRes, rulesRes] = await Promise.all([
    supabase.rpc('get_owner_display_for_plate', { p_plate_id: normalizedSlug }),
    supabase
      .from('security_rules')
      .select('night_mode_on, night_mode_start, night_mode_end, allow_sos, allow_voice, allow_calls, call_forwarding, current_status, custom_message')
      .eq('owner_id', plate.owner_id)
      .maybeSingle(),  // FIX: was .single() — throws PGRST116 when row missing for new owners
  ]);

  // FIX: RPC with RETURNS TABLE returns an array, not a single object.
  // Must access [0].full_name, not .full_name directly.
  let ownerName = 'Resident';
  if (ownerRes.data) {
    if (Array.isArray(ownerRes.data) && ownerRes.data.length > 0) {
      ownerName = ownerRes.data[0]?.full_name || 'Resident';
    } else if (typeof ownerRes.data === 'object' && ownerRes.data.full_name) {
      ownerName = ownerRes.data.full_name;
    }
  }

  // Default security rules for newly provisioned plates with no security_rules row yet
  const defaultRules = {
    night_mode_on: false,
    allow_sos: true,
    allow_voice: true,
    allow_calls: true,
    call_forwarding: true,
    current_status: 'available',
    custom_message: null,
  };

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
    securityRules: rulesRes.data || defaultRules,
    subscription: null, // resolved separately via get_subscription_status_for_plate RPC
  };
}

// ────────── GET OWNER'S PLATE ──────────
export async function getMyPlate(ownerId) {
  const { data, error } = await supabase
    .from('plates')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'No plate found.' };
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
