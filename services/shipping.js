/**
 * Smart Door — Shipping Integration
 * services/shipping.js
 *
 * Phase 9 — Beta Launch Operations
 *
 * Provider-agnostic abstraction layer for shipping.
 * Supported (future): Shiprocket, Delhivery, BlueDart, DTDC
 *
 * Active provider is controlled by SHIPPING_PROVIDER env var.
 * All providers implement the same interface → swap without touching callers.
 *
 * Additive only — does NOT touch existing manufacturing or order logic.
 */

import { supabase } from './supabase.js';

// ────────── PROVIDER REGISTRY ──────────

const PROVIDERS = {
  shiprocket: {
    name:    'Shiprocket',
    baseUrl: 'https://apiv2.shiprocket.in/v1/external',
    docs:    'https://apiv2.shiprocket.in/v1/external/channels',
  },
  delhivery: {
    name:    'Delhivery',
    baseUrl: 'https://track.delhivery.com/api',
    docs:    'https://dev.delhivery.com/docs',
  },
  bluedart: {
    name:    'BlueDart',
    baseUrl: 'https://netconnect.bluedart.com/Ver1.9',
    docs:    'https://www.bluedart.com/developers',
  },
  dtdc: {
    name:    'DTDC',
    baseUrl: 'https://blktracksvc.dtdc.com',
    docs:    'https://dtdc.com/api',
  },
  manual: {
    name:    'Manual (No Provider)',
    baseUrl: null,
    docs:    null,
  },
};

function getActiveProvider() {
  // Set SHIPPING_PROVIDER in Supabase/Vercel env vars
  const key = (typeof process !== 'undefined' && process.env?.SHIPPING_PROVIDER) || 'manual';
  return { key, ...PROVIDERS[key] || PROVIDERS.manual };
}

// ────────── STANDARD SHIPPING INTERFACE ──────────

/**
 * Create a shipment with the active provider.
 * Returns { awbNumber, trackingUrl, provider, estimatedDelivery }
 */
export async function createShipment({ orderId, customerName, phone, email, address, productType, weight = 0.5 }) {
  const provider = getActiveProvider();

  try {
    let result;

    switch (provider.key) {
      case 'shiprocket':
        result = await _createShiprocket({ orderId, customerName, phone, email, address, productType, weight });
        break;
      case 'delhivery':
        result = await _createDelhivery({ orderId, customerName, phone, email, address, productType, weight });
        break;
      case 'bluedart':
        result = await _createBlueDart({ orderId, customerName, phone, email, address, productType, weight });
        break;
      case 'dtdc':
        result = await _createDtdc({ orderId, customerName, phone, email, address, productType, weight });
        break;
      case 'manual':
      default:
        result = await _createManual({ orderId, customerName });
        break;
    }

    // Save to DB
    await supabase.from('shipments').insert({
      order_id:           orderId,
      provider:           provider.key,
      awb_number:         result.awbNumber,
      tracking_url:       result.trackingUrl,
      estimated_delivery: result.estimatedDelivery,
      status:             'created',
    });

    // Update order shipping status
    await supabase.from('orders').update({ shipping_status: 'shipped', awb_number: result.awbNumber })
      .eq('id', orderId);

    return { success: true, shipment: result, provider: provider.name };
  } catch (err) {
    return { success: false, error: err.message, provider: provider.name };
  }
}

/**
 * Track a shipment by AWB number.
 */
export async function trackShipment(awbNumber) {
  const provider = getActiveProvider();

  try {
    const { data: shipment } = await supabase
      .from('shipments')
      .select('*, orders!order_id(order_number, customer_name)')
      .eq('awb_number', awbNumber)
      .single();

    if (!shipment) return { success: false, error: 'Shipment not found.' };

    // In production, call provider tracking API here
    // For now returns DB-stored status
    return {
      success: true,
      tracking: {
        awbNumber:          shipment.awb_number,
        status:             shipment.status,
        trackingUrl:        shipment.tracking_url,
        estimatedDelivery:  shipment.estimated_delivery,
        lastUpdated:        shipment.updated_at,
        provider:           provider.name,
        orderNumber:        shipment.orders?.order_number,
        customerName:       shipment.orders?.customer_name,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update shipment status (webhook or manual update).
 */
export async function updateShipmentStatus(awbNumber, status, remarks = '') {
  const VALID_STATUSES = ['created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'];
  if (!VALID_STATUSES.includes(status)) return { success: false, error: 'Invalid status.' };

  try {
    const { error } = await supabase
      .from('shipments')
      .update({ status, remarks, updated_at: new Date().toISOString() })
      .eq('awb_number', awbNumber);

    if (error) return { success: false, error: error.message };

    // If delivered → trigger activation flow
    if (status === 'delivered') {
      const { data: shipment } = await supabase
        .from('shipments').select('order_id').eq('awb_number', awbNumber).single();

      if (shipment?.order_id) {
        await supabase.from('orders')
          .update({ shipping_status: 'delivered', delivered_at: new Date().toISOString() })
          .eq('id', shipment.order_id);

        // Notify customerSuccess module to mark step
        await supabase.from('delivery_events').insert({
          order_id: shipment.order_id,
          event:    'delivered',
          awb:      awbNumber,
        });
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── MANUFACTURING SLA TRACKER ──────────

export const MFG_STAGES = [
  { key: 'order_received',       label: 'Order Received',        sla_hours: 0  },
  { key: 'production_started',   label: 'Production Started',    sla_hours: 24 },
  { key: 'production_completed', label: 'Production Completed',  sla_hours: 72 },
  { key: 'packed',               label: 'Packed & Ready',        sla_hours: 96 },
  { key: 'shipped',              label: 'Shipped',               sla_hours: 120 },
  { key: 'delivered',            label: 'Delivered',             sla_hours: 192 }, // 8 days
  { key: 'activation_complete',  label: 'Activation Complete',   sla_hours: 240 }, // 10 days
];

export async function getMfgSLAStatus(orderId) {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('*, manufacturing!left(*)')
      .eq('id', orderId)
      .single();

    if (!order) return { success: false, error: 'Order not found.' };

    const orderCreated = new Date(order.created_at);
    const now = new Date();

    const stages = MFG_STAGES.map(stage => {
      const slaDeadline = new Date(orderCreated.getTime() + stage.sla_hours * 60 * 60 * 1000);
      const isBreached  = now > slaDeadline;
      const actualTime  = order.manufacturing?.[`${stage.key}_at`] || null;
      const isDone      = !!actualTime;

      return {
        ...stage,
        isDone,
        actualTime,
        slaDeadline: slaDeadline.toISOString(),
        isBreached: !isDone && isBreached,
        hoursLeft: isDone ? null : Math.max(0, Math.round((slaDeadline - now) / (1000 * 60 * 60))),
      };
    });

    const currentStage = stages.find(s => !s.isDone) || stages[stages.length - 1];
    const breachedCount = stages.filter(s => s.isBreached).length;

    return {
      success: true,
      sla: {
        orderId,
        stages,
        currentStage: currentStage.key,
        breachedCount,
        onTrack: breachedCount === 0,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── PROVIDER IMPLEMENTATIONS (Stubs) ──────────

async function _createShiprocket({ orderId, customerName, phone, address, weight }) {
  // TODO: Implement Shiprocket API
  // POST /shipments/create/adhoc/index_v2
  // Requires: SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD env vars
  // Auth: JWT token refresh every 24h
  return {
    awbNumber:         `SR-PENDING-${orderId.slice(0, 8).toUpperCase()}`,
    trackingUrl:       `https://shiprocket.co/tracking/${orderId}`,
    estimatedDelivery: _addBusinessDays(new Date(), 5).toISOString(),
    note:              'Shiprocket integration pending. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.',
  };
}

async function _createDelhivery({ orderId, customerName, phone, address, weight }) {
  // TODO: Implement Delhivery API
  // POST https://track.delhivery.com/api/cmu/create.json
  // Requires: DELHIVERY_TOKEN env var
  return {
    awbNumber:         `DL-PENDING-${orderId.slice(0, 8).toUpperCase()}`,
    trackingUrl:       `https://www.delhivery.com/track/package/${orderId}`,
    estimatedDelivery: _addBusinessDays(new Date(), 4).toISOString(),
    note:              'Delhivery integration pending. Set DELHIVERY_TOKEN.',
  };
}

async function _createBlueDart({ orderId, customerName, phone, address, weight }) {
  // TODO: Implement BlueDart API
  // POST /Ver1.9/ShippingAPI/CreateShipment
  // Requires: BLUEDART_LICENSE_KEY, BLUEDART_LOGIN_ID env vars
  // Auth: JW Token generated per request via GenerateJWTAuth
  return {
    awbNumber:         `BD-PENDING-${orderId.slice(0, 8).toUpperCase()}`,
    trackingUrl:       `https://www.bluedart.com/tracking/${orderId}`,
    estimatedDelivery: _addBusinessDays(new Date(), 3).toISOString(),
    note:              'BlueDart integration pending. Set BLUEDART_LICENSE_KEY and BLUEDART_LOGIN_ID.',
  };
}

async function _createDtdc({ orderId, customerName, phone, address, weight }) {
  // TODO: Implement DTDC API
  // POST https://blktracksvc.dtdc.com/dtdc-api/api/customer/integration/consignment/softdata
  // Requires: DTDC_API_KEY, DTDC_CUSTOMER_CODE env vars
  return {
    awbNumber:         `DT-PENDING-${orderId.slice(0, 8).toUpperCase()}`,
    trackingUrl:       `https://www.dtdc.in/tracking/${orderId}`,
    estimatedDelivery: _addBusinessDays(new Date(), 5).toISOString(),
    note:              'DTDC integration pending. Set DTDC_API_KEY and DTDC_CUSTOMER_CODE.',
  };
}

async function _createManual({ orderId, customerName }) {
  // Manual shipping — admin updates AWB manually in the admin panel
  const awb = `SD-${Date.now().toString(36).toUpperCase()}`;
  return {
    awbNumber:         awb,
    trackingUrl:       null,
    estimatedDelivery: _addBusinessDays(new Date(), 7).toISOString(),
    note:              'Manual shipping. Update AWB and tracking URL in admin panel.',
  };
}

function _addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

export { getActiveProvider, PROVIDERS };
