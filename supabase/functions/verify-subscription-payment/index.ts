/**
 * Smart Door — Edge Function: verify-subscription-payment
 * supabase/functions/verify-subscription-payment/index.ts
 *
 * Companion to create-subscription-order. Verifies the Razorpay HMAC
 * signature, captures the payment, marks the invoice paid, and
 * activates/upgrades the owner's subscription row (upsert — one active
 * subscription per owner, same convention as activateFromOrder() in
 * services/subscriptions.js).
 *
 * Does NOT touch the `orders`/`payments` tables (hardware flow) — mirrors
 * verify-razorpay-payment's signature-verification + capture pattern but
 * fulfils into `subscriptions` + `invoices` instead of `orders`/`plates`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const RAZORPAY_KEY_ID      = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET  = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      ownerId,
      invoiceId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = await req.json();

    if (!ownerId || !invoiceId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return Response.json({ success: false, message: "Missing required fields." }, { status: 400, headers: corsHeaders });
    }

    // ── 1. HMAC signature verify ──
    const expectedSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      console.error("[verify-subscription-payment] Signature mismatch — possible replay attack");
      return Response.json({ success: false, message: "Payment verification failed." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Load invoice ──
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (invErr || !invoice) {
      return Response.json({ success: false, message: "Invoice not found." }, { status: 404, headers: corsHeaders });
    }

    if (invoice.status === "paid") {
      return Response.json({ success: false, message: "Invoice already paid." }, { status: 409, headers: corsHeaders });
    }

    if (invoice.razorpay_order_id !== razorpayOrderId) {
      return Response.json({ success: false, message: "Order mismatch." }, { status: 400, headers: corsHeaders });
    }

    // ── 3. Idempotency — already processed this payment id? ──
    const { data: existingPaid } = await supabase
      .from("invoices")
      .select("id")
      .eq("razorpay_payment_id", razorpayPaymentId)
      .eq("status", "paid")
      .maybeSingle();

    if (existingPaid) {
      return Response.json({ success: false, message: "Payment already processed." }, { status: 409, headers: corsHeaders });
    }

    // ── 4. Capture payment via Razorpay ──
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const captureRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/capture`, {
      method: "POST",
      headers: { "Authorization": `Basic ${razorpayAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(Number(invoice.amount) * 100), currency: "INR" }),
    });

    if (!captureRes.ok) {
      const errText = await captureRes.text();
      console.error("[verify-subscription-payment] Capture failed:", errText);
      return Response.json({ success: false, message: "Payment capture failed." }, { status: 502, headers: corsHeaders });
    }

    // ── 5. Mark invoice paid ──
    await supabase
      .from("invoices")
      .update({
        status:               "paid",
        razorpay_payment_id:  razorpayPaymentId,
        razorpay_signature:   razorpaySignature,
        updated_at:           new Date().toISOString(),
      })
      .eq("id", invoiceId);

    // ── 6. Activate / upgrade subscription (upsert — one active row per owner) ──
    const startDate  = new Date();
    const expiryDate = new Date(invoice.period_end || startDate);

    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .maybeSingle();

    const { data: plan } = await supabase
      .from("plan_catalog")
      .select("price_monthly, price_yearly")
      .eq("plan_key", invoice.plan)
      .maybeSingle();

    const renewalPrice = invoice.billing_cycle === "monthly" ? plan?.price_monthly : plan?.price_yearly;

    if (existingSub) {
      await supabase
        .from("subscriptions")
        .update({
          plan:                  invoice.plan,
          status:                "active",
          billing_cycle:         invoice.billing_cycle,
          start_date:            startDate.toISOString(),
          expiry_date:           expiryDate.toISOString(),
          renewal_price:         renewalPrice ?? invoice.amount,
          cancel_at_period_end:  false,
          grace_until:           null,
          is_admin_assigned:     false,
          source:                "self_serve",
          updated_at:            startDate.toISOString(),
        })
        .eq("id", existingSub.id);
    } else {
      await supabase.from("subscriptions").insert({
        owner_id:       ownerId,
        plan:           invoice.plan,
        status:         "active",
        billing_cycle:  invoice.billing_cycle,
        start_date:     startDate.toISOString(),
        expiry_date:    expiryDate.toISOString(),
        renewal_price:  renewalPrice ?? invoice.amount,
        source:         "self_serve",
      });
    }

    await supabase.from("invoices").update({ subscription_id: existingSub?.id ?? null }).eq("id", invoiceId);

    // ── Phase 8B GST Billing: backfill GST fields on this SaaS invoice now
    // that it's paid. Idempotent (no-op if already populated) and
    // best-effort — a failure here must never block the plan activation
    // that already succeeded above.
    try {
      await supabase.rpc("populate_gst_fields_for_invoice", { p_invoice_id: invoiceId });
    } catch (e) {
      console.warn("[verify-subscription-payment] GST field backfill failed (non-fatal):", (e as Error).message);
    }

    // ── Phase 8B GST Billing: email the invoice-ready notice (link back to
    // the dashboard's download portal — see services/gstInvoicePdf.js).
    try {
      const { data: ownerRow } = await supabase.from("users").select("email, full_name").eq("id", ownerId).maybeSingle();
      if (ownerRow?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to:      ownerRow.email,
            subject: `Your GST Invoice — ${invoice.invoice_number}`,
            html: `
              <div style="font-family:sans-serif;max-width:540px;margin:auto;">
                <h2 style="color:#00A2E8;">Your GST Invoice is Ready 🧾</h2>
                <p>Hi ${ownerRow.full_name || ""},</p>
                <p>Your GST tax invoice <strong>${invoice.invoice_number}</strong> for the ${invoice.plan} plan has been generated.</p>
                <p>Sign in to your SmartDoor dashboard and open <strong>Subscription &amp; Billing → Invoices</strong> to download the PDF.</p>
              </div>`,
          },
        });
      }
    } catch (emailErr) {
      console.warn("[verify-subscription-payment] GST invoice email failed (non-fatal):", (emailErr as Error).message);
    }

    // ── 7. In-app notification ──
    try {
      await supabase.from("notifications").insert({
        id: crypto.randomUUID(),
        owner_id: ownerId,
        type: "status_change",
        title: "✨ Plan Upgraded",
        body: `You're now on the ${invoice.plan} plan. Enjoy your new features!`,
        priority: "normal",
        channels: ["in_app"],
        delivery_status: {},
        payload: { plan: invoice.plan },
      });
    } catch (_ne) { /* non-fatal */ }

    return Response.json({
      success:     true,
      plan:        invoice.plan,
      billingCycle: invoice.billing_cycle,
      expiryDate:  expiryDate.toISOString(),
      invoiceNumber: invoice.invoice_number,
      message:     "Payment verified! Your plan is now active.",
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[verify-subscription-payment] Unexpected:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
