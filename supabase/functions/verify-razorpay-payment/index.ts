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

    // ── Trigger QR image generation (non-blocking) ──
    // Edge function ya client-side QR service handle karega upload
    supabase.functions.invoke("generate-qr", {
      body: { plate_id: plateId, order_id: orderId },
    }).catch((e: Error) => console.warn("[verify-payment] QR generation dispatch failed:", e.message));

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

    // ── 11. Send activation / onboarding email ──
    // Generate magic-link token for the owner's email so they can set PIN + family
    const ownerEmail = order.customer_email;
    const APP_URL    = Deno.env.get("APP_URL") || "https://smartdoor.in";
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type:    "magiclink",
        email:   ownerEmail,
        options: { redirectTo: `${APP_URL}/onboarding.html?plate_id=${plateId}&order_id=${orderId}` },
      });

      // NOTE: linkData.properties.action_link points at Supabase's own hosted
      // /auth/v1/verify endpoint, which (with detectSessionInUrl: false on the
      // client) redirects back with the session in a URL hash fragment — not
      // the `?token_hash=...&type=...` query params onboarding.html's boot()
      // actually reads. Build the link onboarding.html expects directly from
      // hashed_token instead, matching its own documented URL format.
      const hashedToken = linkData?.properties?.hashed_token || null;
      const activationUrl = hashedToken
        ? `${APP_URL}/onboarding.html?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&plate_id=${encodeURIComponent(plateId)}&order_id=${encodeURIComponent(orderId)}`
        : null;

      if (activationUrl) {
        await supabase.functions.invoke("send-email", {
          body: {
            to:      ownerEmail,
            subject: `Activate Your Smart Door — ${plateId}`,
            html: `
              <div style="font-family:sans-serif;max-width:540px;margin:auto;">
                <h2 style="color:#00A2E8;">Your Smart Door is Confirmed! 🏠</h2>
                <p>Hi ${order.customer_name},</p>
                <p>Payment received. Your plate <strong>${plateId}</strong> is now in production.</p>
                <p>Click the button below to set your PIN and activate your account:</p>
                <a href="${activationUrl}"
                   style="display:inline-block;margin:20px 0;padding:14px 28px;
                          background:#00A2E8;color:#fff;border-radius:10px;
                          text-decoration:none;font-weight:700;font-size:1rem;">
                  Activate My Smart Door →
                </a>
                <p style="color:#888;font-size:.85rem;">This link expires in 24 hours. If you didn't make this purchase, please contact hello@smartdoor.in immediately.</p>
              </div>`,
          },
        });
      }
    } catch (emailErr) {
      // Non-fatal — plate is created, email failure should not block response
      console.error("[verify-payment] Activation email failed:", emailErr);
    }

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
