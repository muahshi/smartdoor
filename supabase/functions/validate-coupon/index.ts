/**
 * Smart Door — Edge Function: validate-coupon
 * supabase/functions/validate-coupon/index.ts
 *
 * Phase 8A Commerce Engine.
 *
 * Lightweight, unauthenticated DRY-RUN coupon check for the checkout UI —
 * lets a customer see "Coupon applied: ₹200 off" before they submit the
 * order. Does NOT reserve a usage slot (no order exists yet at this point
 * in the flow) — the real, race-safe reservation happens inside
 * create-razorpay-order via the reserve_coupon() DB function. This
 * function can therefore say a coupon looks valid and the later reserve
 * can still reject it (e.g. someone else used the last slot in between) —
 * the client must treat create-razorpay-order's response as authoritative.
 *
 * Rate-limited (shared in-memory limiter, same pattern as
 * send-sms/send-whatsapp) since this has no auth and no order to
 * anchor abuse-prevention to.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isValidProductType } from "../_shared/pricing.ts";
import { allowEdgeRequest, callerIp } from "../_shared/edgeRateLimit.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ip = callerIp(req);
    if (!allowEdgeRequest(`validate-coupon:ip:${ip}`, 60_000, 20)) {
      return Response.json({ success: false, message: "Too many attempts. Please wait a moment." }, { status: 429, headers: corsHeaders });
    }

    const { code, orderTotal, productType = "acrylic" } = await req.json();

    if (!code || typeof code !== "string") {
      return Response.json({ success: false, message: "Coupon code is required." }, { status: 400, headers: corsHeaders });
    }
    if (typeof orderTotal !== "number" || orderTotal <= 0) {
      return Response.json({ success: false, message: "orderTotal is required." }, { status: 400, headers: corsHeaders });
    }
    if (!isValidProductType(productType)) {
      return Response.json({ success: false, message: "Invalid product type." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("code, discount_type, discount_value, max_discount_amount, min_order_value, usage_limit_total, times_used, starts_at, expires_at, is_active, applicable_product_types")
      .ilike("code", code)
      .maybeSingle();

    if (error || !coupon) {
      return Response.json({ success: false, message: "Invalid coupon code." }, { headers: corsHeaders });
    }
    if (!coupon.is_active) {
      return Response.json({ success: false, message: "This coupon is no longer active." }, { headers: corsHeaders });
    }
    const now = new Date();
    if (coupon.starts_at && now < new Date(coupon.starts_at)) {
      return Response.json({ success: false, message: "This coupon is not active yet." }, { headers: corsHeaders });
    }
    if (coupon.expires_at && now > new Date(coupon.expires_at)) {
      return Response.json({ success: false, message: "This coupon has expired." }, { headers: corsHeaders });
    }
    if (orderTotal < coupon.min_order_value) {
      return Response.json({ success: false, message: `Minimum order value for this coupon is ₹${coupon.min_order_value}.` }, { headers: corsHeaders });
    }
    if (coupon.applicable_product_types?.length && !coupon.applicable_product_types.includes(productType)) {
      return Response.json({ success: false, message: "This coupon does not apply to the selected product." }, { headers: corsHeaders });
    }
    if (coupon.usage_limit_total != null && coupon.times_used >= coupon.usage_limit_total) {
      return Response.json({ success: false, message: "This coupon has reached its usage limit." }, { headers: corsHeaders });
    }

    let discountAmount = 0;
    if (coupon.discount_type === "percentage") {
      discountAmount = Math.round(orderTotal * coupon.discount_value) / 100;
      if (coupon.max_discount_amount != null) discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
    } else if (coupon.discount_type === "fixed") {
      discountAmount = Math.min(coupon.discount_value, orderTotal);
    }

    return Response.json({
      success:       true,
      valid:         true,
      code:          coupon.code,
      discountType:  coupon.discount_type,
      discountAmount,
      message:       `Coupon applied: ₹${discountAmount} off`,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[validate-coupon] Unexpected error:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
