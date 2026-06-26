/**
 * PATCH for supabase/functions/admin-data/index.ts
 * 
 * INSERT THIS BLOCK before the final:
 *   return Response.json({ success: false, message: `Unknown type: ${type}` }, ...
 * 
 * (i.e., after the "TEAM LIST" handler block, before the closing fallthrough)
 */

    // ══════════════════════════════════════════════
    // CREATE ORDER (Amazon / Flipkart / manual import)
    // ══════════════════════════════════════════════
    if (type === 'create_order') {
      if (!adminCan(ctx, 'orders', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const {
        owner_id, plate_id, product_type,
        order_source, external_order_id,
        customer_name, customer_phone, customer_email,
        shipping_address, notes,
      } = body as any;

      const VALID_SOURCES = ['admin_manual','amazon','flipkart','offline','whatsapp','website'];
      if (!owner_id || !plate_id || !VALID_SOURCES.includes(String(order_source))) {
        return Response.json({
          success: false,
          message: 'owner_id, plate_id, and a valid order_source are required',
        }, { status: 400, headers });
      }

      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
      const orderNumber = `SD-ORD-${ts}-${rnd}`;

      const { data: order, error: orderErr } = await db.from('orders').insert({
        order_number: orderNumber,
        owner_id,
        plate_id,
        product_type: product_type || 'acrylic',
        product_price: 0,
        subscription_price: 0,
        shipping_price: 0,
        total_amount: 0,
        payment_status: 'paid',             // admin-imported = already paid
        manufacturing_status: 'queued',
        tracking_status: 'order_placed',
        fulfilment_status: 'new_order',
        order_source: String(order_source),
        external_order_id: external_order_id || null,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        shipping_address: shipping_address || {},
        notes: notes || null,
      }).select().single();

      if (orderErr) {
        return Response.json({ success: false, message: orderErr.message }, { status: 500, headers });
      }

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id,
        admin_email: ctx.email,
        action: 'create_order',
        resource: 'orders',
        resource_id: order.id,
        after_data: { order_number: orderNumber, order_source, plate_id },
        notes: `Order ${orderNumber} created by ${ctx.email} (source: ${order_source})`,
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, order }, { headers });
    }

    // ══════════════════════════════════════════════
    // ADVANCE FULFILMENT PIPELINE (9-stage)
    // ══════════════════════════════════════════════
    if (type === 'advance_fulfilment') {
      if (!adminCan(ctx, 'orders', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { order_id, to_status } = body as any;

      const VALID_STAGES = [
        'new_order', 'payment_verified', 'manufacturing', 'qr_generated',
        'nameplate_printed', 'quality_check', 'packed', 'shipped', 'delivered',
        'owner_activated', 'live',
      ];

      if (!order_id || !VALID_STAGES.includes(String(to_status))) {
        return Response.json({
          success: false,
          message: `order_id and a valid to_status required. Valid: ${VALID_STAGES.join(', ')}`,
        }, { status: 400, headers });
      }

      // Map fulfilment_status → manufacturing_status (legacy column, keep in sync)
      const MFG_MAP: Record<string, string> = {
        new_order: 'queued',
        payment_verified: 'queued',
        manufacturing: 'in_production',
        qr_generated: 'in_production',
        nameplate_printed: 'in_production',
        quality_check: 'quality_check',
        packed: 'packed',
        shipped: 'dispatched',
        delivered: 'delivered',
        owner_activated: 'delivered',
        live: 'delivered',
      };

      const { error: updateErr } = await db.from('orders').update({
        fulfilment_status: to_status,
        manufacturing_status: MFG_MAP[to_status] || 'queued',
        tracking_status: to_status,
        updated_at: new Date().toISOString(),
      }).eq('id', order_id);

      if (updateErr) {
        return Response.json({ success: false, message: updateErr.message }, { status: 500, headers });
      }

      // Non-fatal tracking event
      await db.from('tracking_events').insert({
        order_id,
        event_type: to_status,
        description: `Status advanced to "${to_status}" by ${ctx.email}`,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id,
        admin_email: ctx.email,
        action: 'advance_fulfilment',
        resource: 'orders',
        resource_id: order_id,
        after_data: { fulfilment_status: to_status },
        notes: `Fulfilment advanced to ${to_status} by ${ctx.email}`,
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, fulfilment_status: to_status }, { headers });
    }

/**
 * END OF PATCH
 * 
 * Also add to services/adminData.js:
 *
 *   export async function createOrder(payload) {
 *     return _call('admin-data', { type: 'create_order', ...payload });
 *   }
 *
 *   export async function advanceFulfilment(orderId, toStatus) {
 *     return _call('admin-data', { type: 'advance_fulfilment', order_id: orderId, to_status: toStatus });
 *   }
 *
 * And update admin.html submitCreateCustomer() to pass:
 *   order_source: document.getElementById('cc-source').value || 'admin_manual',
 *   external_order_id: document.getElementById('cc-ext-order')?.value?.trim() || null,
 */
