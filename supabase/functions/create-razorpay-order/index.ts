/**
 * Smart Door — Edge Function: create-razorpay-order
 * supabase/functions/create-razorpay-order/index.ts
 *
 * Server-side Razorpay order create karta hai.
 * Secret key kabhi browser mein nahi jaata.
 *
 * Flow:
 * 1. Validate request params
 * 2. Duplicate order check (replay attack prevention)
 * 3. Compute pricing (Phase 8A: partner/dealer/franchise price, bulk tiers,
 *    stackable pricing_rules) → then reserve a coupon code if one was sent
 * 4. DB mein order record insert karo (at the FINAL, discounted amount)
 * 5. Razorpay order create karo for that same final amount
 * 6. Tracking event: order_placed
 * 7. Return razorpayOrderId + orderId to frontend
 *
 * PHASE 8A COMMERCE ENGINE — additive only:
 *   New optional body fields: quantity, couponCode, partnerAdminId.
 *   None of them are required — omitting all three reproduces the exact
 *   pre-Phase-8A behavior and charge amount (quantity defaults to 1,
 *   no partner price lookup, no coupon reservation).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { SHIPPING_PRICE_PAISE, isValidProductType } from "../_shared/pricing.ts";
import { computePricing } from "../_shared/commercePricing.ts";

const RAZORPAY_KEY_ID     = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Product pricing now lives in ONE place: ../_shared/pricing.ts
// (PRODUCT_PRICES_PAISE / SHIPPING_PRICE_PAISE, consumed indirectly via
// ../_shared/commercePricing.ts). Do not redeclare prices here — import
// them, so this function can never drift out of sync with other Edge
// Functions that also need product pricing.
// NOTE: SUBSCRIPTION_PRICE removed. 1 year Privacy subscription is
// included FREE with every plate (as advertised on the product page) —
// it must NOT be added on top of the product price.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      productType    = "acrylic",
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress = {},
      houseName,
      houseNumber,
      fontStyle       = "modern",
      ownerId,
      quantity        = 1,     // Phase 8A — bulk pricing. Existing callers omit this and get qty=1, unchanged behavior.
      couponCode      = null,  // Phase 8A — promo code entered at checkout.
      partnerAdminId  = null,  // Phase 8A — set when a dealer/franchise is placing this order for a customer.
    } = body;

    // ── Validate ──
    if (!customerName || !customerEmail || !customerPhone) {
      return Response.json({ success: false, message: "Customer details required." }, { status: 400, headers: corsHeaders });
    }

    if (!isValidProductType(productType)) {
      return Response.json({ success: false, message: "Invalid product type." }, { status: 400, headers: corsHeaders });
    }

    const qty = Math.max(1, Math.min(1000, Math.floor(Number(quantity) || 1)));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Duplicate order check (replay prevention) ──
    // Same email + a pending order created very recently → likely a genuine
    // double-submit (double click, double tab), so still blocked.
    //
    // FIX (Phase 11 — 409 root cause): this used to match ANY 'pending'
    // order from the whole calendar day. Razorpay checkout has no
    // server-side "cancelled" callback — when a customer opens checkout,
    // then dismisses the Razorpay modal, the order row this function just
    // inserted stays 'pending' forever (nothing ever flips it away from
    // that status). The very next retry, seconds later, matched that same
    // stale 'pending' row from the whole day and was wrongly rejected with
    // 409, and verify-razorpay-payment was never reached.
    //
    // Client-side (services/payments.js) now proactively marks an order
    // 'failed' the moment the user dismisses the checkout modal (see
    // cancel-pending-order), which is the real fix for the common case.
    // This narrowed time window is the defense-in-depth backstop for when
    // that call doesn't land (offline, tab killed, etc.) — a 'pending' row
    // older than a couple minutes is essentially never a live in-progress
    // checkout, so it should no longer block a genuine retry.
    if (customerEmail) {
      const recentWindowStart = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: dupes } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_email", customerEmail)
        .eq("payment_status", "pending")
        .gte("created_at", recentWindowStart)
        .limit(1);

      if (dupes && dupes.length > 0) {
        return Response.json({ success: false, message: "A payment for this email is already in progress. Please wait a moment and try again." }, { status: 409, headers: corsHeaders });
      }
    }

    // ── Phase 8A: resolve partner (dealer/franchise) role server-side ──
    // Never trust a client-supplied role name — look it up from admin_users
    // so a partner price list can only ever be matched against the partner's
    // REAL role. If the id doesn't resolve to an active dealer/franchise,
    // this order simply proceeds at public pricing (never hard-fails
    // checkout over a bad/missing partner id).
    let partnerRoleName: 'dealer' | 'franchise' | null = null;
    if (partnerAdminId) {
      const { data: partnerAdmin } = await supabase
        .from("admin_users")
        .select("is_active, admin_roles(name)")
        .eq("id", partnerAdminId)
        .maybeSingle();
      const roleName = (partnerAdmin as unknown as { admin_roles?: { name?: string } })?.admin_roles?.name;
      if (partnerAdmin?.is_active && (roleName === "dealer" || roleName === "franchise")) {
        partnerRoleName = roleName;
      }
    }

    // ── Phase 8A: compute rule-based pricing (partner price, bulk tiers, stackable pricing_rules) ──
    const pricing = await computePricing(supabase, {
      productType,
      quantity: qty,
      partnerAdminId: partnerRoleName ? partnerAdminId : null,
      partnerRoleName,
    });

    if ("error" in pricing) {
      return Response.json({ success: false, message: pricing.error }, { status: 400, headers: corsHeaders });
    }

    const shippingPricePaise = SHIPPING_PRICE_PAISE;
    const ruleAdjustedTotalPaise = pricing.finalPricePaise; // after partner price + bulk tier + stackable pricing_rules, before coupon

    // ── Generate order number ──
    const { data: orderNumData } = await supabase.rpc("generate_order_number");
    const orderNumber = orderNumData || `SD-ORD-${Date.now()}`;

    // ── Insert order into DB at the rule-adjusted (pre-coupon) amount ──
    // Coupon reservation needs a real order_id (order_discounts.order_id is
    // NOT NULL + FK'd), so the order row is created first, then the coupon
    // is reserved against it, then the row is updated to the final amount
    // below. The order stays 'pending' throughout — nothing is charged yet.
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number:        orderNumber,
        owner_id:            ownerId || null,
        product_type:        productType,
        quantity:            qty,
        product_price:       ruleAdjustedTotalPaise / 100,
        subscription_price:  0,   // included free — never charged separately
        shipping_price:      shippingPricePaise / 100,
        total_amount:        (ruleAdjustedTotalPaise + shippingPricePaise) / 100,
        payment_status:      "pending",
        manufacturing_status: "queued",
        tracking_status:     "order_placed",
        customer_name:       customerName,
        customer_email:      customerEmail,
        customer_phone:      customerPhone,
        shipping_address:    shippingAddress,
        created_by_admin_id: partnerRoleName ? partnerAdminId : null,
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("[create-razorpay-order] DB insert error:", orderError);
      return Response.json({ success: false, message: "Order creation failed." }, { status: 500, headers: corsHeaders });
    }

    // ── Phase 8A: log each applied pricing_rule/bulk-tier to the discount ledger (informational — no usage cap to enforce) ──
    for (const rule of pricing.appliedRules) {
      if (rule.ruleId === "bulk-tier") continue; // bulk tier isn't a pricing_rules row — nothing to attribute by id, already reflected in product_price
      await supabase.from("order_discounts").insert({
        order_id:        order.id,
        owner_id:        ownerId || null,
        customer_email:  customerEmail,
        discount_source: "pricing_rule",
        source_id:       rule.ruleId,
        source_code:     rule.name,
        discount_type:   rule.discountType,
        discount_value:  rule.discountValue,
        discount_amount: rule.discountAmount / 100,
        status:          "reserved",
      });
    }

    // ── Phase 8A: reserve the coupon (atomic, race-safe — see reserve_coupon() in 57_commerce_engine_phase8a.sql) ──
    let couponDiscountPaise = 0;
    let appliedCouponCode: string | null = null;
    if (couponCode) {
      const { data: couponResult, error: couponError } = await supabase.rpc("reserve_coupon", {
        p_code:           couponCode,
        p_order_id:       order.id,
        p_order_total:    ruleAdjustedTotalPaise / 100,
        p_product_type:   productType,
        p_customer_email: customerEmail,
        p_owner_id:       ownerId || null,
      });

      if (couponError || !couponResult?.success) {
        // Roll back the order we just created rather than leaving an
        // orphaned 'pending' row the customer never got to pay for.
        await supabase.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
        return Response.json({ success: false, message: couponResult?.message || "Invalid coupon code." }, { status: 400, headers: corsHeaders });
      }

      couponDiscountPaise = Math.round(Number(couponResult.discount_amount) * 100);
      appliedCouponCode = couponCode.toUpperCase();
    }

    const finalTotalPaise = Math.max(0, ruleAdjustedTotalPaise + shippingPricePaise - couponDiscountPaise);
    const totalDiscountRupees = ((pricing.basePricePaise + shippingPricePaise - finalTotalPaise) / 100);

    // ── Update order to the FINAL amount (this is what actually gets charged) ──
    await supabase
      .from("orders")
      .update({
        total_amount:    finalTotalPaise / 100,
        discount_amount: totalDiscountRupees,
        coupon_code:     appliedCouponCode,
        updated_at:      new Date().toISOString(),
      })
      .eq("id", order.id);

    // ── Create Razorpay order for the FINAL discounted amount ──
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${razorpayAuth}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        amount:          finalTotalPaise,
        currency:        "INR",
        receipt:         `SD-${Date.now()}`,
        notes: {
          customer_name:  customerName,
          customer_email: customerEmail,
          product_type:   productType,
          quantity:       String(qty),
          coupon_code:    appliedCouponCode || "",
        },
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.text();
      console.error("[create-razorpay-order] Razorpay error:", err);
      // Release any coupon reservation / mark order failed so nothing is left dangling.
      await supabase.rpc("release_order_discounts", { p_order_id: order.id });
      await supabase.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
      return Response.json({ success: false, message: "Payment gateway error. Please retry." }, { status: 502, headers: corsHeaders });
    }

    const rzpOrder = await rzpRes.json();

    // ── Insert payment record (final amount) ──
    await supabase.from("payments").insert({
      order_id:          order.id,
      provider:          "razorpay",
      provider_order_id: rzpOrder.id,
      amount:            finalTotalPaise / 100,
      currency:          "INR",
      status:            "created",
    });

    // ── Tracking event: order_placed ──
    await supabase.from("tracking_events").insert({
      order_id:    order.id,
      event_type:  "order_placed",
      event_label: "Order Placed",
      actor:       "system",
    });

    return Response.json({
      success:         true,
      orderId:         order.id,
      orderNumber,
      razorpayOrderId: rzpOrder.id,
      amount:          finalTotalPaise,
      currency:        "INR",
      discountAmount:  totalDiscountRupees,   // Phase 8A — 0 when no coupon/rules applied
      couponApplied:   appliedCouponCode,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[create-razorpay-order] Unexpected error:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
