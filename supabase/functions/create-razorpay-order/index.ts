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
 * 3. Razorpay order create karo
 * 4. DB mein order record insert karo
 * 5. Tracking event: order_placed
 * 6. Return razorpayOrderId + orderId to frontend
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { PRODUCT_PRICES_PAISE, SHIPPING_PRICE_PAISE, isValidProductType } from "../_shared/pricing.ts";

const RAZORPAY_KEY_ID     = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Product pricing now lives in ONE place: ../_shared/pricing.ts
// (PRODUCT_PRICES_PAISE / SHIPPING_PRICE_PAISE). Do not redeclare prices
// here — import them, so this function can never drift out of sync with
// other Edge Functions that also need product pricing.
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
    } = body;

    // ── Validate ──
    if (!customerName || !customerEmail || !customerPhone) {
      return Response.json({ success: false, message: "Customer details required." }, { status: 400, headers: corsHeaders });
    }

    if (!isValidProductType(productType)) {
      return Response.json({ success: false, message: "Invalid product type." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Duplicate order check (replay prevention) ──
    // Same email + same day mein ek hi pending order allowed
    if (customerEmail) {
      const today = new Date().toISOString().split("T")[0];
      const { data: dupes } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_email", customerEmail)
        .eq("payment_status", "pending")
        .gte("created_at", today + "T00:00:00Z")
        .limit(1);

      if (dupes && dupes.length > 0) {
        return Response.json({ success: false, message: "A pending order already exists. Complete or cancel it first." }, { status: 409, headers: corsHeaders });
      }
    }

    // ── Calculate amounts (paise) — sourced from ../_shared/pricing.ts ──
    const productPricePaise  = PRODUCT_PRICES_PAISE[productType];
    const shippingPricePaise = SHIPPING_PRICE_PAISE;
    const totalPaise         = productPricePaise + shippingPricePaise;

    // ── Create Razorpay order ──
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${razorpayAuth}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        amount:          totalPaise,
        currency:        "INR",
        receipt:         `SD-${Date.now()}`,
        notes: {
          customer_name:  customerName,
          customer_email: customerEmail,
          product_type:   productType,
        },
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.text();
      console.error("[create-razorpay-order] Razorpay error:", err);
      return Response.json({ success: false, message: "Payment gateway error. Please retry." }, { status: 502, headers: corsHeaders });
    }

    const rzpOrder = await rzpRes.json();

    // ── Generate order number ──
    const { data: orderNumData } = await supabase.rpc("generate_order_number");
    const orderNumber = orderNumData || `SD-ORD-${Date.now()}`;

    // ── Insert order into DB ──
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number:        orderNumber,
        owner_id:            ownerId || null,
        product_type:        productType,
        product_price:       productPricePaise / 100,
        subscription_price:  0,   // included free — never charged separately
        shipping_price:      shippingPricePaise / 100,
        total_amount:        totalPaise / 100,
        payment_status:      "pending",
        manufacturing_status: "queued",
        tracking_status:     "order_placed",
        customer_name:       customerName,
        customer_email:      customerEmail,
        customer_phone:      customerPhone,
        shipping_address:    shippingAddress,
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("[create-razorpay-order] DB insert error:", orderError);
      return Response.json({ success: false, message: "Order creation failed." }, { status: 500, headers: corsHeaders });
    }

    // ── Insert payment record ──
    await supabase.from("payments").insert({
      order_id:          order.id,
      provider:          "razorpay",
      provider_order_id: rzpOrder.id,
      amount:            totalPaise / 100,
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
      amount:          totalPaise,
      currency:        "INR",
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[create-razorpay-order] Unexpected error:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
