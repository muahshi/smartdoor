/**
 * Smart Door — Edge Function: cancel-pending-order
 * supabase/functions/cancel-pending-order/index.ts
 *
 * ROOT CAUSE FIX (Phase 11 — 409 on immediate retry after cancel):
 *
 * Razorpay Checkout has no server callback for "user dismissed the modal" —
 * that only exists client-side (modal.ondismiss in services/payments.js).
 * Because of that, an order row created by create-razorpay-order stayed
 * `payment_status = 'pending'` forever once a customer cancelled checkout.
 * create-razorpay-order's duplicate-order guard then matched that stale
 * row on the very next attempt and returned 409 before
 * verify-razorpay-payment was ever reached.
 *
 * This function gives the client the missing signal: the moment the
 * Razorpay modal is dismissed, it flips that ONE order (by id) from
 * 'pending' to 'failed', so it can never again be mistaken for an
 * in-progress checkout.
 *
 * Deliberately narrow and safe:
 *   - Only ever moves payment_status 'pending' → 'failed' for the exact
 *     order_id supplied. The .eq('payment_status','pending') guard means
 *     it is a no-op against any order that's already paid/failed/refunded
 *     — it can never clobber a real payment (including one that captured
 *     a split-second after the modal fired ondismiss).
 *   - No Razorpay API call, no signature needed — this never touches
 *     money, only bookkeeping on our own already-'pending' row.
 *   - Best-effort only: the client does not block on this call, and if it
 *     fails, create-razorpay-order's narrowed 3-minute duplicate window
 *     (also fixed in this change) is the backstop.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ success: false, message: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();

    if (!orderId || typeof orderId !== "string") {
      return Response.json({ success: false, message: "orderId is required." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Scoped update: only affects this exact order, and only while it is
    // still 'pending'. If it's already 'paid' (payment actually went
    // through right as the modal closed) this simply matches zero rows.
    const { data, error } = await supabase
      .from("orders")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("payment_status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[cancel-pending-order] Update failed:", error.message);
      // Non-fatal from the caller's point of view — the narrowed
      // duplicate-check window in create-razorpay-order is the backstop.
      return Response.json({ success: false, message: "Could not update order." }, { status: 500, headers: corsHeaders });
    }

    if (data) {
      await supabase.from("tracking_events").insert({
        order_id:    orderId,
        event_type:  "payment_cancelled",
        event_label: "Payment Cancelled by Customer",
        actor:       "system",
      });

      // Phase 8A Commerce Engine: release any reserved coupon usage slot /
      // pricing-rule ledger rows so an abandoned checkout never permanently
      // consumes a limited-use coupon. Best-effort — this is bookkeeping,
      // not payment-critical.
      try {
        await supabase.rpc("release_order_discounts", { p_order_id: orderId });
      } catch (e) {
        console.warn("[cancel-pending-order] release_order_discounts failed (non-fatal):", (e as Error).message);
      }
    }

    // Whether or not a row matched (e.g. it was already paid/failed),
    // this is a successful, idempotent no-op from the client's perspective.
    return Response.json({ success: true, updated: !!data }, { headers: corsHeaders });

  } catch (err) {
    console.error("[cancel-pending-order] Unexpected:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});

/**
 * DEPLOY COMMAND:
 * supabase functions deploy cancel-pending-order
 *   (JWT verification stays ON — default — this is called by the logged-in
 *    checkout session same as create-razorpay-order/verify-razorpay-payment,
 *    no new auth model introduced.)
 *
 * No new secrets required — reuses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * already configured for every other payment Edge Function.
 */
