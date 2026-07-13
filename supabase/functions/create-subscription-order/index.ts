/**
 * Smart Door — Edge Function: create-subscription-order
 * supabase/functions/create-subscription-order/index.ts
 *
 * SaaS plan billing (Free / Premium / Enterprise) — kept deliberately
 * SEPARATE from create-razorpay-order, which is the hardware nameplate
 * checkout flow (orders/payments/manufacturing tables). This function never
 * touches the `orders` table — it creates a pending `invoices` row instead,
 * so the two payment flows can never collide or be confused with each other.
 *
 * Flow:
 *   1. Validate planKey + billingCycle against plan_catalog
 *   2. Duplicate-order guard (same pattern as create-razorpay-order)
 *   3. Razorpay order create
 *   4. Insert `invoices` row (status='pending')
 *   5. Return razorpayOrderId + invoiceId to the frontend
 *
 * Frontend then opens Razorpay checkout and calls
 * verify-subscription-payment on success.
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
    const {
      ownerId,
      planKey,
      billingCycle = "yearly",   // 'monthly' | 'yearly'
    } = await req.json();

    if (!ownerId || !planKey) {
      return Response.json({ success: false, message: "ownerId and planKey are required." }, { status: 400, headers: corsHeaders });
    }
    if (!["monthly", "yearly"].includes(billingCycle)) {
      return Response.json({ success: false, message: "Invalid billingCycle." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Look up plan (must be an active, purchasable plan) ──
    const { data: plan, error: planErr } = await supabase
      .from("plan_catalog")
      .select("*")
      .eq("plan_key", planKey)
      .eq("is_active", true)
      .maybeSingle();

    if (planErr || !plan) {
      return Response.json({ success: false, message: "Invalid or unavailable plan." }, { status: 400, headers: corsHeaders });
    }

    const priceRupees = billingCycle === "monthly" ? Number(plan.price_monthly) : Number(plan.price_yearly);

    if (priceRupees <= 0) {
      // Free plan — no payment needed; caller should use manage-subscription instead.
      return Response.json({ success: false, message: "This plan does not require payment. Use the downgrade action instead.", freePlan: planKey === "free" }, { status: 400, headers: corsHeaders });
    }

    // ── Owner must exist ──
    const { data: owner, error: ownerErr } = await supabase
      .from("users")
      .select("id, full_name, email, phone")
      .eq("id", ownerId)
      .maybeSingle();

    if (ownerErr || !owner) {
      return Response.json({ success: false, message: "Owner not found." }, { status: 404, headers: corsHeaders });
    }

    // ── Duplicate-order guard (same short window pattern as create-razorpay-order) ──
    const recentWindowStart = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: dupes } = await supabase
      .from("invoices")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .gte("created_at", recentWindowStart)
      .limit(1);

    if (dupes && dupes.length > 0) {
      return Response.json({ success: false, message: "A subscription payment is already in progress. Please wait a moment and try again." }, { status: 409, headers: corsHeaders });
    }

    const amountPaise = Math.round(priceRupees * 100);

    // ── Create Razorpay order ──
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${razorpayAuth}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        amount:   amountPaise,
        currency: "INR",
        receipt:  `SD-SUB-${Date.now()}`,
        notes: {
          owner_id:      ownerId,
          plan_key:      planKey,
          billing_cycle: billingCycle,
          kind:          "subscription",
        },
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.text();
      console.error("[create-subscription-order] Razorpay error:", err);
      return Response.json({ success: false, message: "Payment gateway error. Please retry." }, { status: 502, headers: corsHeaders });
    }

    const rzpOrder = await rzpRes.json();

    // ── Generate invoice number + insert pending invoice ──
    const { data: invNumData } = await supabase.rpc("generate_invoice_number");
    const invoiceNumber = invNumData || `SD-INV-${Date.now()}`;

    const periodStart = new Date();
    const periodEnd    = new Date(periodStart);
    if (billingCycle === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
    else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number:    invoiceNumber,
        owner_id:          ownerId,
        plan:               planKey,
        billing_cycle:      billingCycle,
        amount:             priceRupees,
        currency:           "INR",
        status:             "pending",
        razorpay_order_id:  rzpOrder.id,
        period_start:       periodStart.toISOString(),
        period_end:         periodEnd.toISOString(),
        issued_by:          "self_serve",
      })
      .select("id")
      .single();

    if (invErr) {
      console.error("[create-subscription-order] Invoice insert error:", invErr);
      return Response.json({ success: false, message: "Could not create invoice." }, { status: 500, headers: corsHeaders });
    }

    return Response.json({
      success:         true,
      invoiceId:       invoice.id,
      invoiceNumber,
      razorpayOrderId: rzpOrder.id,
      amount:          amountPaise,
      currency:        "INR",
      planKey,
      billingCycle,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[create-subscription-order] Unexpected error:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
