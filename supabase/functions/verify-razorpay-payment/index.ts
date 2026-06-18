/**
 * Smart Door — Edge Function: verify-razorpay-payment
 * supabase/functions/verify-razorpay-payment/index.ts
 *
 * Payment verify karta hai aur poori post-payment pipeline trigger karta hai:
 * 1. HMAC signature verify (replay attack prevention)
 * 2. Razorpay payment capture
 * 3. Unique Plate ID generate
 * 4. QR slug set karo
 * 5. DB: order paid, payment captured, plate created
 * 6. Manufacturing queue mein daalo
 * 7. Tracking events add karo
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const RAZORPAY_KEY_ID      = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET  = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Plate ID generator: SD-ABX9K7 ──
function generatePlateId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums  = "23456789";
  const r     = (s: string) => s[Math.floor(Math.random() * s.length)];
  return `SD-${r(chars)}${r(chars)}${r(nums)}${r(chars)}${r(nums)}${r(chars)}`;
}

// ── Collision-safe Plate ID ──
async function generateUniquePlateId(supabase: ReturnType<typeof createClient>): Promise<string> {
  let attempts = 0;
  while (attempts < 20) {
    const pid = generatePlateId();
    const { data } = await supabase.from("plates").select("id").eq("plate_id", pid).maybeSingle();
    if (!data) return pid;  // Unique mila
    attempts++;
  }
  // Fallback with timestamp suffix
  return `SD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      orderId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = await req.json();

    if (!orderId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return Response.json({ success: false, message: "Missing required fields." }, { status: 400, headers: corsHeaders });
    }

    // ── 1. HMAC Signature Verify ──
    const expectedSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      console.error("[verify-payment] Signature mismatch — possible replay attack");
      return Response.json({ success: false, message: "Payment verification failed." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Idempotency check — already processed? ──
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("status")
      .eq("provider_payment_id", razorpayPaymentId)
      .maybeSingle();

    if (existingPayment?.status === "captured") {
      return Response.json({ success: false, message: "Payment already processed." }, { status: 409, headers: corsHeaders });
    }

    // ── 3. Get order details ──
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return Response.json({ success: false, message: "Order not found." }, { status: 404, headers: corsHeaders });
    }

    if (order.payment_status === "paid") {
      return Response.json({ success: false, message: "Order already paid." }, { status: 409, headers: corsHeaders });
    }

    // ── 4. Capture payment via Razorpay ──
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const captureRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/capture`, {
      method: "POST",
      headers: { "Authorization": `Basic ${razorpayAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(order.total_amount * 100), currency: "INR" }),
    });

    if (!captureRes.ok) {
      const errText = await captureRes.text();
      console.error("[verify-payment] Capture failed:", errText);
      return Response.json({ success: false, message: "Payment capture failed." }, { status: 502, headers: corsHeaders });
    }

    // ── 5. Generate unique Plate ID ──
    const plateId = await generateUniquePlateId(supabase);

    // ── 6. Update payment record ──
    await supabase
      .from("payments")
      .update({
        provider_payment_id: razorpayPaymentId,
        provider_signature:  razorpaySignature,
        status:              "captured",
      })
      .eq("provider_order_id", razorpayOrderId);

    // ── 7. Update order: paid + plate assigned ──
    await supabase
      .from("orders")
      .update({
        payment_status:      "paid",
        plate_id:            plateId,
        manufacturing_status: "queued",
        tracking_status:     "payment_verified",
        updated_at:          new Date().toISOString(),
      })
      .eq("id", orderId);

    // ── 8. Create Plate record ──
    const existingOwner = order.owner_id;
    let ownerId = existingOwner;

    if (!ownerId) {
      // Guest checkout — minimal user record
      const { data: newUser } = await supabase
        .from("users")
        .insert({
          full_name: order.customer_name,
          phone:     order.customer_phone.replace(/\D/g, "").slice(-10),
          email:     order.customer_email,
          plate_id:  plateId,
          pin_hash:  "UNSET",   // Onboarding mein set hoga
        })
        .select("id")
        .single();
      ownerId = newUser?.id;
    }

    await supabase.from("plates").insert({
      plate_id:     plateId,
      qr_slug:      plateId,
      product_type: order.product_type,
      status:       "inactive",   // Delivery ke baad active hoga
      owner_id:     ownerId,
    });

    // owner_id update in order
    if (ownerId && !order.owner_id) {
      await supabase.from("orders").update({ owner_id: ownerId }).eq("id", orderId);
    }

    // ── 9. Create Manufacturing record ──
    await supabase.from("manufacturing").insert({
      order_id:         orderId,
      plate_id:         plateId,
      plate_name:       order.customer_name,
      house_number:     order.shipping_address?.houseNumber || "",
      font_style:       order.notes?.fontStyle || "modern",
      product_type:     order.product_type,
      qr_slug:          plateId,
      production_status: "queued",
    });

    // ── 10. Tracking events ──
    const trackingInserts = [
      { order_id: orderId, event_type: "payment_verified", event_label: "Payment Verified", actor: "system" },
      { order_id: orderId, event_type: "plate_generated",  event_label: "Plate ID Generated", event_detail: plateId, actor: "system" },
      { order_id: orderId, event_type: "qr_generated",     event_label: "QR Code Generated", actor: "system" },
      { order_id: orderId, event_type: "in_production",    event_label: "In Manufacturing Queue", actor: "system" },
    ];
    await supabase.from("tracking_events").insert(trackingInserts);

    return Response.json({
      success:     true,
      plateId,
      orderNumber: order.order_number,
      message:     "Payment verified! Your Smart Door plate is now in production.",
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[verify-payment] Unexpected:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
