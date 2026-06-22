/**
 * Smart Door — Orders Service
 * services/orders.js
 *
 * Order lifecycle ka poora engine:
 * Create → Payment → Plate Gen → Manufacturing → Shipped → Delivered → Sub Activated
 *
 * Admin + Edge Functions dono use kar sakte hain yeh service.
 */

import { supabase } from './supabase.js';

// ────────── ORDER STATUS CONSTANTS ──────────
export const PAYMENT_STATUS = {
  PENDING:  'pending',
  PAID:     'paid',
  FAILED:   'failed',
  REFUNDED: 'refunded',
};

export const MANUFACTURING_STATUS = {
  QUEUED:      'queued',
  PRODUCTION:  'in_production',
  PACKED:      'packed',
  DISPATCHED:  'dispatched',
  DELIVERED:   'delivered',
};

export const TRACKING_EVENTS = {
  ORDER_PLACED:      { type: 'order_placed',      label: 'Order Placed',        icon: '🛒' },
  PAYMENT_VERIFIED:  { type: 'payment_verified',  label: 'Payment Verified',    icon: '✅' },
  PLATE_GENERATED:   { type: 'plate_generated',   label: 'Plate ID Generated',  icon: '🏷️' },
  QR_GENERATED:      { type: 'qr_generated',      label: 'QR Code Generated',   icon: '📱' },
  IN_PRODUCTION:     { type: 'in_production',     label: 'In Production',       icon: '🏭' },
  QUALITY_CHECK:     { type: 'quality_check',     label: 'Quality Check',       icon: '🔍' },
  PACKED:            { type: 'packed',            label: 'Packed & Ready',      icon: '📦' },
  SHIPPED:           { type: 'shipped',           label: 'Shipped',             icon: '🚚' },
  OUT_FOR_DELIVERY:  { type: 'out_for_delivery',  label: 'Out for Delivery',    icon: '🛵' },
  DELIVERED:         { type: 'delivered',         label: 'Delivered',           icon: '🏠' },
};

// ────────── GET ORDER BY ID ──────────
export async function getOrder(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, order: data };
}

// ────────── GET OWNER'S ORDERS ──────────
export async function getMyOrders(ownerId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, orders: data || [] };
}

// ────────── GET LATEST ORDER FOR OWNER ──────────
export async function getLatestOrder(ownerId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, order: data };
}

// ────────── GET TRACKING EVENTS FOR ORDER ──────────
/**
 * Chronological tracking timeline fetch karta hai.
 * @param {string} orderId
 */
export async function getTrackingEvents(orderId) {
  const { data, error } = await supabase
    .from('tracking_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, events: data || [] };
}

// ────────── ADD TRACKING EVENT ──────────
/**
 * Tracking timeline mein naya event add karta hai.
 * @param {string} orderId
 * @param {string} eventType   - TRACKING_EVENTS keys
 * @param {object} opts        - { detail, actor, metadata }
 */
export async function addTrackingEvent(orderId, eventType, opts = {}) {
  const ev = Object.values(TRACKING_EVENTS).find(e => e.type === eventType);
  if (!ev) return { success: false, error: 'Invalid event type' };

  const { error } = await supabase
    .from('tracking_events')
    .insert({
      order_id:     orderId,
      event_type:   ev.type,
      event_label:  ev.label,
      event_detail: opts.detail || null,
      actor:        opts.actor  || 'system',
      metadata:     opts.metadata || {},
    });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ────────── UPDATE ORDER STATUS ──────────
/**
 * Order ke payment_status ya manufacturing_status update karta hai.
 * Automatically tracking event bhi add karta hai.
 *
 * @param {string} orderId
 * @param {object} updates  - { payment_status?, manufacturing_status?, tracking_status?, plate_id? }
 * @param {string} actor    - 'system' | 'admin' | 'courier'
 */
export async function updateOrderStatus(orderId, updates, actor = 'system') {
  const { error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) return { success: false, error: error.message };

  // Manufacturing status change → tracking event add karo
  const mfgToTracking = {
    [MANUFACTURING_STATUS.QUEUED]:     TRACKING_EVENTS.IN_PRODUCTION.type,
    [MANUFACTURING_STATUS.PRODUCTION]: TRACKING_EVENTS.IN_PRODUCTION.type,
    [MANUFACTURING_STATUS.PACKED]:     TRACKING_EVENTS.PACKED.type,
    [MANUFACTURING_STATUS.DISPATCHED]: TRACKING_EVENTS.SHIPPED.type,
    [MANUFACTURING_STATUS.DELIVERED]:  TRACKING_EVENTS.DELIVERED.type,
  };

  if (updates.manufacturing_status && mfgToTracking[updates.manufacturing_status]) {
    await addTrackingEvent(orderId, mfgToTracking[updates.manufacturing_status], { actor });
  }

  return { success: true };
}

// ────────── ASSIGN TO PRODUCTION ──────────
/**
 * Manufacturing table mein production assign karta hai.
 * @param {string} orderId
 * @param {object} opts  - { assignedTo, notes }
 */
export async function assignProduction(orderId, opts = {}) {
  // Manufacturing record update karo
  const { error: mfgError } = await supabase
    .from('manufacturing')
    .update({
      production_status: 'printing',
      assigned_to:       opts.assignedTo || 'production_team',
      production_notes:  opts.notes || null,
      updated_at:        new Date().toISOString(),
    })
    .eq('order_id', orderId);

  if (mfgError) return { success: false, error: mfgError.message };

  // Order status update
  await updateOrderStatus(orderId, {
    manufacturing_status: MANUFACTURING_STATUS.PRODUCTION,
    tracking_status:      'in_production',
  }, 'admin');

  return { success: true };
}

// ────────── MARK SHIPPED ──────────
/**
 * Order ko shipped mark karta hai.
 * @param {string} orderId
 * @param {object} shippingInfo  - { trackingNumber, courier, estimatedDelivery }
 */
export async function markShipped(orderId, shippingInfo = {}) {
  await updateOrderStatus(orderId, {
    manufacturing_status: MANUFACTURING_STATUS.DISPATCHED,
    tracking_status:      'shipped',
  }, 'admin');

  await addTrackingEvent(orderId, TRACKING_EVENTS.SHIPPED.type, {
    actor:    'admin',
    detail:   shippingInfo.courier ? `Shipped via ${shippingInfo.courier}` : null,
    metadata: {
      tracking_number:    shippingInfo.trackingNumber || null,
      courier:            shippingInfo.courier || null,
      estimated_delivery: shippingInfo.estimatedDelivery || null,
    },
  });

  return { success: true };
}

// ────────── MARK DELIVERED + ACTIVATE SUBSCRIPTION ──────────
/**
 * Order delivered mark karta hai aur subscription activate karta hai.
 * Yeh Phase 6 ka final step hai.
 * @param {string} orderId
 */
export async function markDelivered(orderId) {
  // 1. Order update
  await updateOrderStatus(orderId, {
    manufacturing_status: MANUFACTURING_STATUS.DELIVERED,
    tracking_status:      'delivered',
  }, 'system');

  // 2. Tracking event
  await addTrackingEvent(orderId, TRACKING_EVENTS.DELIVERED.type, {
    actor:  'system',
    detail: 'Package delivered. Activating subscription...',
  });

  // 3. Subscription activate karo (Edge Function via invoke)
  const orderResult = await getOrder(orderId);
  if (!orderResult.success || !orderResult.order.owner_id || !orderResult.order.plate_id) {
    return { success: false, error: 'Order is missing owner_id or plate_id — cannot activate subscription.' };
  }

  const { data, error } = await supabase.functions.invoke('activate-subscription', {
    body: {
      owner_id:  orderResult.order.owner_id,
      order_id:  orderId,
      plate_id:  orderResult.order.plate_id,
      plan:      'hardware_only',  // default plan on hardware purchase
    },
  });

  if (error || !data?.success) {
    console.error('[Orders] Subscription activation failed:', error || data?.message);
    // Order is marked delivered, but activation failed — surface this so the
    // caller doesn't show a false "success" toast (matches the audit's Bug 1
    // principle: never report success when the underlying action failed).
    return { success: false, error: data?.message || error?.message || 'Subscription activation failed.' };
  }

  return { success: true, expiryDate: data.expiryDate, message: data.message };
}

// ────────── SUBSCRIBE TO ORDER TRACKING (Realtime) ──────────
/**
 * Owner dashboard pe live order tracking updates.
 * @param {string} orderId
 * @param {Function} callback  (event) => void
 */
export function subscribeToOrderTracking(orderId, callback) {
  const channel = supabase
    .channel(`order-tracking:${orderId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'tracking_events',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ────────── GET ORDER SUMMARY (for dashboard display) ──────────
/**
 * Dashboard ke liye formatted order summary.
 * @param {string} ownerId
 */
export async function getOrderSummary(ownerId) {
  const ordersResult = await getMyOrders(ownerId);
  if (!ordersResult.success) return { success: false, error: ordersResult.error };

  const orders = ordersResult.orders;
  if (!orders.length) return { success: true, summary: null };

  const latest = orders[0];

  // Latest order ki tracking events
  const trackingResult = await getTrackingEvents(latest.id);
  const events = trackingResult.success ? trackingResult.events : [];

  // Progress percentage calculate karo
  const progressMap = {
    'order_placed':     10,
    'payment_verified': 20,
    'plate_generated':  30,
    'qr_generated':     40,
    'in_production':    55,
    'quality_check':    65,
    'packed':           75,
    'shipped':          85,
    'out_for_delivery': 93,
    'delivered':        100,
  };

  const progress = progressMap[latest.tracking_status] || 0;

  return {
    success: true,
    summary: {
      orderId:             latest.id,
      orderNumber:         latest.order_number,
      plateId:             latest.plate_id,
      productType:         latest.product_type,
      totalAmount:         latest.total_amount,
      paymentStatus:       latest.payment_status,
      manufacturingStatus: latest.manufacturing_status,
      trackingStatus:      latest.tracking_status,
      progress,
      events,
      createdAt:           latest.created_at,
    },
  };
}
