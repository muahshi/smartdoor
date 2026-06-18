/**
 * Smart Door — Edge Function: razorpay-refund
 * supabase/functions/razorpay-refund/index.ts
 *
 * Admin-only refund initiation.
 * Service role key required — frontend se direct accessible nahi.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RAZORPAY_KEY_ID      = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET  = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { order_id, amount = 0, reason = "Customer requested refund" } = await req.json();

    if (!order_id) {
      return Response.json({ success: false, message: "order_id required." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Get payment record ──
    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", order_id)
      .eq("status", "captured")
      .single();

    if (!payment) {
      return Response.json({ success: false, message: "No captured payment found." }, { status: 404, headers: corsHeaders });
    }

    if (payment.refund_id) {
      return Response.json({ success: false, message: "Already refunded." }, { status: 409, headers: corsHeaders });
    }

    // ── Razorpay refund create ──
    const refundAmount = amount > 0 ? amount : Math.round(payment.amount * 100);
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${payment.provider_payment_id}/refund`, {
      method: "POST",
      headers: { "Authorization": `Basic ${razorpayAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: refundAmount, notes: { reason } }),
    });

    if (!refundRes.ok) {
      const err = await refundRes.text();
      console.error("[razorpay-refund] Refund API error:", err);
      return Response.json({ success: false, message: "Refund failed at gateway." }, { status: 502, headers: corsHeaders });
    }

    const refundData = await refundRes.json();

    // ── Update DB ──
    await supabase.from("payments").update({
      status:        "refunded",
      refund_id:     refundData.id,
      refund_amount: refundAmount / 100,
    }).eq("id", payment.id);

    await supabase.from("orders").update({
      payment_status: "refunded",
      updated_at:     new Date().toISOString(),
    }).eq("id", order_id);

    // ── Tracking event ──
    await supabase.from("tracking_events").insert({
      order_id,
      event_type:  "refund_processed",
      event_label: "Refund Processed",
      event_detail: `₹${refundAmount / 100} refunded`,
      actor:       "admin",
    });

    return Response.json({
      success:  true,
      refundId: refundData.id,
      amount:   refundAmount / 100,
      message:  "Refund initiated successfully.",
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[razorpay-refund] Error:", err);
    return Response.json({ success: false, message: "Refund error." }, { status: 500, headers: corsHeaders });
  }
});
