/**
 * Smart Door — Edge Function: razorpay-refund
 * supabase/functions/razorpay-refund/index.ts
 *
 * Admin-only refund initiation.
 * Service role key required — frontend se direct accessible nahi.
 *
 * SECURITY HARDENING (Phase 9): this function was documented as
 * "admin-only" but had no actual server-side enforcement of that — any
 * caller with the public anon key could invoke it directly and trigger a
 * real Razorpay refund for any order/invoice. Now gated the same way as
 * every other admin Edge Function (verifyAdminSession + adminCan), using
 * the existing 'orders'/'subscriptions' write permission the RBAC schema
 * already defines (no new resource key needed).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { restrictedCors } from "../_shared/cors.ts";
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from "../_shared/adminAuth.ts";

const RAZORPAY_KEY_ID      = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET  = Deno.env.get("RAZORPAY_KEY_SECRET")!;

serve(async (req) => {
  const corsHeaders = restrictedCors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = getServiceClient();

  const ctx = await verifyAdminSession(req, supabase);
  if (!ctx) return adminAuthError(corsHeaders);

  try {
    const { order_id, invoice_id, amount = 0, reason = "Customer requested refund" } = await req.json();

    if (!order_id && !invoice_id) {
      return Response.json({ success: false, message: "order_id or invoice_id required." }, { status: 400, headers: corsHeaders });
    }

    const requiredResource = invoice_id ? "subscriptions" : "orders";
    if (!adminCan(ctx, requiredResource, "write") && !adminCan(ctx, "*", "write")) {
      return Response.json({ success: false, message: "Permission denied." }, { status: 403, headers: corsHeaders });
    }

    // ── SaaS subscription invoice refund path (Admin Controls → Refund support) ──
    // Kept as a separate branch rather than reusing the `payments` table
    // below: invoices are SaaS billing (subscriptions), payments/orders are
    // the hardware nameplate checkout — the two must never cross-write.
    if (invoice_id) {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoice_id)
        .eq("status", "paid")
        .maybeSingle();

      if (!invoice) {
        return Response.json({ success: false, message: "No paid invoice found." }, { status: 404, headers: corsHeaders });
      }
      if (invoice.refund_id) {
        return Response.json({ success: false, message: "Already refunded." }, { status: 409, headers: corsHeaders });
      }
      if (!invoice.razorpay_payment_id) {
        return Response.json({ success: false, message: "No captured payment on this invoice." }, { status: 400, headers: corsHeaders });
      }

      const refundAmount = amount > 0 ? amount : Math.round(Number(invoice.amount) * 100);
      const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

      const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${invoice.razorpay_payment_id}/refund`, {
        method: "POST",
        headers: { "Authorization": `Basic ${razorpayAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: refundAmount, notes: { reason } }),
      });

      if (!refundRes.ok) {
        const err = await refundRes.text();
        console.error("[razorpay-refund] Invoice refund API error:", err);
        return Response.json({ success: false, message: "Refund failed at gateway." }, { status: 502, headers: corsHeaders });
      }

      const refundData = await refundRes.json();

      await supabase.from("invoices").update({
        status:        "refunded",
        refund_id:     refundData.id,
        refund_amount: refundAmount / 100,
        updated_at:    new Date().toISOString(),
      }).eq("id", invoice_id);

      // Refunding a subscription payment also ends the paid access it funded.
      if (invoice.subscription_id) {
        await supabase.from("subscriptions").update({
          status: "cancelled", updated_at: new Date().toISOString(),
        }).eq("id", invoice.subscription_id);
      }

      // ── Phase 8B GST Billing: auto-issue a credit note against this
      // invoice (only if it's an actual GST tax invoice — i.e. taxable_value
      // has been populated) and log the refund in the unified ledger.
      // Best-effort — the refund itself has already succeeded at the
      // gateway and in `invoices` above; a billing-side failure here must
      // not be reported back as a failed refund.
      let creditNoteId: string | null = null;
      try {
        if (invoice.taxable_value != null) {
          const { data: cnId, error: cnErr } = await supabase.rpc("issue_billing_note", {
            p_original_invoice_id: invoice_id,
            p_note_type:           "credit_note",
            p_amount:              refundAmount / 100,
            p_reason:              reason,
            p_issued_by:           "system_refund",
          });
          if (cnErr) throw cnErr;
          creditNoteId = cnId as string;
        }
      } catch (e) {
        console.warn("[razorpay-refund] Auto credit-note issuance skipped (non-fatal):", (e as Error).message);
      }

      try {
        await supabase.from("refund_ledger").insert({
          source_type:        "saas_invoice",
          invoice_id:          invoice_id,
          owner_id:            invoice.owner_id,
          razorpay_refund_id:  refundData.id,
          amount:              refundAmount / 100,
          reason,
          credit_note_id:      creditNoteId,
          initiated_by:        ctx.email || "admin",
        });
      } catch (e) {
        console.warn("[razorpay-refund] refund_ledger insert failed (non-fatal):", (e as Error).message);
      }

      return Response.json({
        success:      true,
        refundId:     refundData.id,
        amount:       refundAmount / 100,
        creditNoteId,
        message:      "Refund initiated successfully.",
      }, { headers: corsHeaders });
    }

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

    // ── Phase 8B GST Billing: auto-issue a credit note against this order's
    // GST tax invoice (if one exists) and log the refund in the unified
    // ledger. Best-effort — the refund itself has already succeeded at the
    // gateway and in `payments`/`orders` above.
    let creditNoteId: string | null = null;
    try {
      const { data: gstInvoice } = await supabase
        .from("invoices")
        .select("id, taxable_value")
        .eq("order_id", order_id)
        .eq("invoice_type", "tax_invoice")
        .maybeSingle();

      if (gstInvoice?.id && gstInvoice.taxable_value != null) {
        const { data: cnId, error: cnErr } = await supabase.rpc("issue_billing_note", {
          p_original_invoice_id: gstInvoice.id,
          p_note_type:           "credit_note",
          p_amount:              refundAmount / 100,
          p_reason:              reason,
          p_issued_by:           "system_refund",
        });
        if (cnErr) throw cnErr;
        creditNoteId = cnId as string;
      }
    } catch (e) {
      console.warn("[razorpay-refund] Auto credit-note issuance skipped (non-fatal):", (e as Error).message);
    }

    try {
      const { data: orderOwner } = await supabase.from("orders").select("owner_id").eq("id", order_id).maybeSingle();
      await supabase.from("refund_ledger").insert({
        source_type:        "hardware_order",
        order_id,
        owner_id:            orderOwner?.owner_id || null,
        razorpay_refund_id:  refundData.id,
        amount:              refundAmount / 100,
        reason,
        credit_note_id:      creditNoteId,
        initiated_by:        ctx.email || "admin",
      });
    } catch (e) {
      console.warn("[razorpay-refund] refund_ledger insert failed (non-fatal):", (e as Error).message);
    }

    return Response.json({
      success:      true,
      refundId:     refundData.id,
      amount:       refundAmount / 100,
      creditNoteId,
      message:      "Refund initiated successfully.",
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[razorpay-refund] Error:", err);
    return Response.json({ success: false, message: "Refund error." }, { status: 500, headers: corsHeaders });
  }
});
