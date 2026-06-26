/**
 * Smart Door — Activation Engine
 * services/activation.js
 *
 * REDESIGN (Activation Fix):
 *
 * REMOVED: getActivationPendingInfo()
 *   This function was querying the `orders` table to generate a status
 *   message for the visitor pending screen. This was architecturally wrong —
 *   the visitor page should NEVER depend on orders, manufacturing, or
 *   subscriptions to determine activation state.
 *   Activation state lives entirely in the `plates` table (isPlateActive()
 *   in services/plates.js). The pending screen now shows a simple, honest
 *   message without any order dependency.
 *
 * KEPT: All audit trail, metrics, and admin functions unchanged.
 *   activatePlateAndLog(), recordRenewal(), recordExpiry(),
 *   deactivatePlateAndLog(), getPlateActivationHistory(), getActivationMetrics()
 *   are all preserved — these are admin/backend tools, not visitor-facing.
 *
 * Owns the QR lifecycle audit trail and the activation funnel metrics:
 *   Order Paid → Plate ID Generated → QR Generated → Manufactured →
 *   Delivered → Customer Activates → Visitor Scans → Live Visitor Experience
 */

import { supabase } from './supabase.js';

export const ACTIVATION_EVENT_TYPES = ['activated', 'deactivated', 'transferred', 'renewed', 'expired'];

// ────────── RECORD ACTIVATION EVENT ──────────
/**
 * @param {string} plateId
 * @param {string|null} ownerId
 * @param {'activated'|'deactivated'|'transferred'|'renewed'|'expired'} eventType
 * @param {object} opts  - { orderId, detail, actor, metadata }
 */
export async function recordActivationEvent(plateId, ownerId, eventType, opts = {}) {
  if (!ACTIVATION_EVENT_TYPES.includes(eventType)) {
    return { success: false, error: `Invalid event type: ${eventType}` };
  }

  try {
    const { data, error } = await supabase
      .from('activation_events')
      .insert({
        plate_id:     plateId?.toUpperCase() || null,
        owner_id:     ownerId || null,
        order_id:     opts.orderId || null,
        event_type:   eventType,
        event_detail: opts.detail || null,
        actor:        opts.actor || 'system',
        metadata:     opts.metadata || {},
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, event: data };
  } catch (err) {
    console.error('[Activation] recordActivationEvent error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── ACTIVATE + LOG (preferred entry point for new code) ──────────
/**
 * Wraps subscriptions.activateFromOrder() and logs an 'activated' event.
 * Use this from admin tools / the first-login wizard instead of calling
 * subscriptions.activateFromOrder() directly.
 *
 * After this completes:
 *   - plates.status = 'active'
 *   - plates.activation_date is set
 *   - plates.owner_id is set
 *   → isPlateActive() in plates.js will return { active: true }
 *   → All future QR scans immediately open visitor.html — no pending screen.
 */
export async function activatePlateAndLog(ownerId, orderId, plateId, plan = 'hardware_only', actor = 'system') {
  const { activateFromOrder } = await import('./subscriptions.js');
  const result = await activateFromOrder(ownerId, orderId, plateId, plan);

  if (result.success) {
    await recordActivationEvent(plateId, ownerId, 'activated', {
      orderId,
      actor,
      detail: `Plate activated on plan "${plan}"`,
      metadata: { plan, expiryDate: result.expiryDate },
    });
  }

  return result;
}

/**
 * Renewal completed — call after a successful renewal payment.
 */
export async function recordRenewal(ownerId, plateId, plan, expiryDate, actor = 'system') {
  return recordActivationEvent(plateId, ownerId, 'renewed', {
    actor,
    detail: `Subscription renewed on plan "${plan}"`,
    metadata: { plan, expiryDate },
  });
}

/**
 * Subscription has crossed past the grace period — call from the renewal
 * engine / a daily cron once the plate is fully locked out.
 *
 * NOTE: This records the SUBSCRIPTION expiry, not plate deactivation.
 * The plate remains status='active'; only subscription features are gated.
 * isPlateActive() in plates.js will still return true after this.
 * Grace period UI is handled in gracePeriod.js.
 */
export async function recordExpiry(ownerId, plateId, actor = 'system') {
  return recordActivationEvent(plateId, ownerId, 'expired', {
    actor,
    detail: 'Subscription expired — grace period ended.',
  });
}

/**
 * Plate manually deactivated by admin (fraud, refund, support action).
 * Sets plates.status = 'inactive' → isPlateActive() returns false → pending screen shown.
 */
export async function deactivatePlateAndLog(plateId, ownerId, reason, actor = 'admin') {
  try {
    const { error } = await supabase
      .from('plates')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('plate_id', plateId.toUpperCase());

    if (error) return { success: false, error: error.message };

    await recordActivationEvent(plateId, ownerId, 'deactivated', { actor, detail: reason });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── PLATE ACTIVATION HISTORY ──────────
export async function getPlateActivationHistory(plateId) {
  try {
    const { data, error } = await supabase
      .from('activation_events')
      .select('*')
      .eq('plate_id', plateId.toUpperCase())
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, events: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── ACTIVATION METRICS (admin dashboard — unchanged) ──────────
/**
 * Reads sql/12_real_world_operations.sql:activation_metrics_view.
 * Falls back to a manual computation if the view isn't deployed yet.
 */
export async function getActivationMetrics() {
  try {
    const { data, error } = await supabase
      .from('activation_metrics_view')
      .select('*')
      .single();

    if (!error && data) {
      return {
        success: true,
        metrics: {
          totalOrders:         data.total_orders || 0,
          paidOrders:          data.paid_orders || 0,
          activatedPlates:     data.activated_plates || 0,
          pendingActivation:   data.pending_activation || 0,
          activationRatePct:   Number(data.activation_rate_pct) || 0,
          avgActivationHours:  data.avg_activation_hours !== null ? Number(data.avg_activation_hours) : null,
        },
      };
    }

    return await _computeActivationMetricsManually();
  } catch (err) {
    console.error('[Activation] getActivationMetrics error:', err);
    return await _computeActivationMetricsManually();
  }
}

async function _computeActivationMetricsManually() {
  try {
    const [{ count: totalOrders }, { count: paidOrders }, { data: activePlates }, { data: paidOrdersData }] =
      await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
        supabase.from('plates').select('plate_id, activation_date').eq('status', 'active'),
        supabase.from('orders').select('plate_id, created_at').eq('payment_status', 'paid'),
      ]);

    const activatedSet = new Set((activePlates || []).map((p) => p.plate_id));
    const activatedPlates = activatedSet.size;
    const pendingActivation = (paidOrdersData || []).filter((o) => !activatedSet.has(o.plate_id)).length;
    const activationRatePct = paidOrders > 0 ? Math.round((activatedPlates / paidOrders) * 10000) / 100 : 0;

    const activationByPlate = new Map((activePlates || []).map((p) => [p.plate_id, p.activation_date]));
    const diffs = [];
    for (const o of paidOrdersData || []) {
      const actDate = activationByPlate.get(o.plate_id);
      if (actDate) {
        const hours = (new Date(actDate) - new Date(o.created_at)) / (1000 * 60 * 60);
        if (hours >= 0) diffs.push(hours);
      }
    }
    const avgActivationHours = diffs.length
      ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10
      : null;

    return {
      success: true,
      metrics: {
        totalOrders: totalOrders || 0,
        paidOrders: paidOrders || 0,
        activatedPlates,
        pendingActivation,
        activationRatePct,
        avgActivationHours,
      },
      computedManually: true,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
