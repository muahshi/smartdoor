/**
 * My Smart Door — Property Management Service
 * services/propertyManagement.js
 *
 * Phase 13 — Apartment & Society Platform
 *
 * Handles: Organizations, Properties, Towers, Floors, Units, Residents.
 * Additive only — does NOT modify any existing service.
 * Single-home workflow unchanged.
 */

import { supabase } from './supabase.js';

// ────────── ORGANIZATIONS ──────────

export async function createOrganization(data) {
  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name:           data.name,
      org_type:       data.orgType || 'society',
      contact_email:  data.email,
      contact_phone:  data.phone,
      address:        data.address,
      city:           data.city,
      state:          data.state,
      pincode:        data.pincode,
      billing_plan:   data.billingPlan || 'per_unit',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, org };
}

export async function getOrganization(orgId) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*, properties(*)')
    .eq('id', orgId)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, org: data };
}

// ────────── PROPERTIES ──────────

export async function createProperty(orgId, data) {
  const { data: property, error } = await supabase
    .from('properties')
    .insert({
      org_id:        orgId,
      name:          data.name,
      property_type: data.propertyType || 'residential',
      address:       data.address,
      city:          data.city,
      state:         data.state,
      pincode:       data.pincode,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, property };
}

export async function getPropertyWithHierarchy(propertyId) {
  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      towers (
        *,
        floors (
          *,
          units (
            *,
            residents (*)
          )
        )
      )
    `)
    .eq('id', propertyId)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, property: data };
}

export async function getPropertyStats(propertyId) {
  const { data, error } = await supabase
    .rpc('get_society_stats', { p_property_id: propertyId });

  if (error) return { success: false, error: error.message };
  return { success: true, stats: data };
}

// ────────── TOWERS ──────────

export async function createTower(propertyId, name, totalFloors = 1) {
  const { data: tower, error } = await supabase
    .from('towers')
    .insert({ property_id: propertyId, name, total_floors: totalFloors })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, tower };
}

export async function getTowersByProperty(propertyId) {
  const { data, error } = await supabase
    .from('towers')
    .select('*, floors(count)')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, towers: data };
}

// ────────── FLOORS ──────────

export async function createFloor(towerId, floorNumber, label = null) {
  const { data: floor, error } = await supabase
    .from('floors')
    .insert({ tower_id: towerId, floor_number: floorNumber, floor_label: label })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, floor };
}

// Bulk create floors for a tower (e.g., 1-20)
export async function bulkCreateFloors(towerId, fromFloor, toFloor) {
  const rows = [];
  for (let i = fromFloor; i <= toFloor; i++) {
    rows.push({ tower_id: towerId, floor_number: i });
  }

  const { data, error } = await supabase
    .from('floors')
    .insert(rows)
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, floors: data };
}

// ────────── UNITS ──────────

export async function createUnit(data) {
  const { data: unit, error } = await supabase
    .from('units')
    .insert({
      floor_id:    data.floorId,
      tower_id:    data.towerId,
      property_id: data.propertyId,
      unit_number: data.unitNumber,
      unit_type:   data.unitType || 'apartment',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, unit };
}

export async function getUnitsByTower(towerId) {
  const { data, error } = await supabase
    .from('units')
    .select('*, floors(floor_number, floor_label), residents(*)')
    .eq('tower_id', towerId)
    .eq('is_active', true)
    .order('unit_number');

  if (error) return { success: false, error: error.message };
  return { success: true, units: data };
}

export async function linkUnitToOwner(unitId, ownerId) {
  const { data, error } = await supabase
    .from('units')
    .update({ linked_owner_id: ownerId, is_occupied: true })
    .eq('id', unitId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, unit: data };
}

export async function linkUnitToPlate(unitId, plateId) {
  const { data, error } = await supabase
    .from('units')
    .update({ plate_id: plateId })
    .eq('id', unitId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, unit: data };
}

// ────────── RESIDENTS ──────────

export async function addResident(data) {
  const { data: resident, error } = await supabase
    .from('residents')
    .insert({
      unit_id:          data.unitId,
      property_id:      data.propertyId,
      linked_user_id:   data.linkedUserId || null,
      full_name:        data.fullName,
      phone:            data.phone,
      email:            data.email || null,
      resident_type:    data.residentType || 'owner',
      is_primary:       data.isPrimary || false,
      routing_priority: data.routingPriority || 1,
      lease_start:      data.leaseStart || null,
      lease_end:        data.leaseEnd || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Mark unit as occupied if primary resident added
  if (data.isPrimary) {
    await supabase.from('units').update({ is_occupied: true }).eq('id', data.unitId);
  }

  return { success: true, resident };
}

export async function getUnitResidents(unitId) {
  const { data, error } = await supabase
    .rpc('get_unit_residents', { p_unit_id: unitId });

  if (error) return { success: false, error: error.message };
  return { success: true, residents: data };
}

export async function updateResidentPriority(residentId, newPriority) {
  const { data, error } = await supabase
    .from('residents')
    .update({ routing_priority: newPriority })
    .eq('id', residentId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, resident: data };
}

// ────────── TENANT TRANSFER ──────────

export async function transferTenancy(unitId, newResidentData) {
  // Deactivate existing tenant(s)
  await supabase
    .from('residents')
    .update({ is_active: false })
    .eq('unit_id', unitId)
    .eq('resident_type', 'tenant');

  // Add new tenant
  return addResident({
    ...newResidentData,
    unitId,
    residentType: 'tenant',
    isPrimary: true,
  });
}

// ────────── MULTI-RESIDENT ROUTING ──────────

/**
 * Visitor arrived at unitNumber. Returns ordered list of residents to contact.
 * Falls back gracefully: primary → secondary → all active.
 */
export async function resolveRoutingForUnit(unitId) {
  const result = await getUnitResidents(unitId);
  if (!result.success || !result.residents.length) {
    return { success: false, error: 'No active residents found for this unit.' };
  }

  return {
    success: true,
    // Already ordered by routing_priority ASC from DB function
    residents: result.residents,
    primaryContact: result.residents[0],
    fallbackContacts: result.residents.slice(1),
  };
}

// Lookup unit by flat number + tower (for guard panel search)
export async function findUnitByNumber(propertyId, unitNumber, towerName = null) {
  let query = supabase
    .from('units')
    .select('*, towers(name), residents(*)')
    .eq('property_id', propertyId)
    .ilike('unit_number', unitNumber)
    .eq('is_active', true);

  if (towerName) {
    query = query.eq('towers.name', towerName);
  }

  const { data, error } = await query.limit(5);
  if (error) return { success: false, error: error.message };
  return { success: true, units: data };
}

