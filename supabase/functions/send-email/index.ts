/**
 * Smart Door — Edge Function: send-email
 * supabase/functions/send-email/index.ts
 *
 * Provider: Resend (primary)
 * Future: SMTP fallback
 *
 * Templates yahan inline defined hain (simple text+HTML).
 * Production mein React Email ya MJML se proper templates banana.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = "Smart Door <noreply@smartdoor.in>";

// ────────── EMAIL TEMPLATES ──────────
function getEmailContent(template: string, toName: string, data: Record<string, string>) {
  const greet = `Hi ${toName},`;

  const templates: Record<string, { subject: string; html: string }> = {
    order_confirmation: {
      subject: `Order Confirmed — ${data.order_number}`,
      html: `<p>${greet}</p>
<p>Your Smart Door order <strong>${data.order_number}</strong> has been confirmed!</p>
<p><strong>Product:</strong> ${data.product_type}<br/>
<strong>Total:</strong> ${data.total_amount}<br/>
<strong>Estimated Delivery:</strong> ${data.estimated_delivery}</p>
<p>We'll notify you when your plate ships.</p>
<p>— Smart Door Team</p>`,
    },
    payment_success: {
      subject: `Payment Received — ${data.order_number}`,
      html: `<p>${greet}</p>
<p>We received your payment of <strong>${data.amount}</strong>.</p>
<p>Your Plate ID: <strong>${data.plate_id}</strong></p>
<p>Your Smart Door QR plate is now in manufacturing queue!</p>
<p><a href="${data.dashboard_url}">View Dashboard →</a></p>
<p>— Smart Door Team</p>`,
    },
    dispatch_notification: {
      subject: `Your Smart Door is on the way! — ${data.order_number}`,
      html: `<p>${greet}</p>
<p>Great news! Your Smart Door plate has been dispatched.</p>
<p><strong>Courier:</strong> ${data.courier}<br/>
<strong>Tracking Number:</strong> ${data.tracking_number}</p>
<p>Expected delivery in 2–3 business days.</p>
<p>— Smart Door Team</p>`,
    },
    delivery_confirmation: {
      subject: `Smart Door Delivered! — ${data.plate_id}`,
      html: `<p>${greet}</p>
<p>Your Smart Door QR plate <strong>${data.plate_id}</strong> has been delivered.</p>
<p>Your <strong>1-year subscription</strong> is now active!</p>
<p><a href="${data.app_url}">Open Dashboard to configure your plate →</a></p>
<p>— Smart Door Team</p>`,
    },
    subscription_activated: {
      subject: `Smart Door Subscription Activated!`,
      html: `<p>${greet}</p>
<p>Your Smart Door subscription is now <strong>active for 1 year</strong>.</p>
<p><a href="${data.app_url}">Open Dashboard →</a></p>
<p>— Smart Door Team</p>`,
    },
    renewal_reminder_30: {
      subject: `Smart Door Renewal in 30 Days`,
      html: `<p>${greet}</p>
<p>Your Smart Door subscription expires on <strong>${data.expiry_date}</strong> (${data.days_left} days left).</p>
<p>Plan: ${data.plan_name} — ${data.renewal_price}/year</p>
<p><a href="${data.renew_url}">Renew Now →</a></p>
<p>— Smart Door Team</p>`,
    },
    renewal_reminder_7: {
      subject: `⚠️ Smart Door Renewal — 7 Days Left`,
      html: `<p>${greet}</p>
<p>Your Smart Door subscription expires in <strong>${data.days_left} days</strong>!</p>
<p><a href="${data.renew_url}">Renew Now to avoid interruption →</a></p>
<p>— Smart Door Team</p>`,
    },
    renewal_reminder_1: {
      subject: `🚨 Smart Door Subscription Expires Tomorrow`,
      html: `<p>${greet}</p>
<p>Your Smart Door subscription expires <strong>tomorrow</strong>.</p>
<p><a href="${data.renew_url}">Renew Now →</a></p>
<p>— Smart Door Team</p>`,
    },
  };

  return templates[template] || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { template, to, to_name, data = {} } = await req.json();

    if (!template || !to) {
      return Response.json({ success: false, message: "template and to required." }, { status: 400, headers: corsHeaders });
    }

    const content = getEmailContent(template, to_name || "Customer", data);
    if (!content) {
      return Response.json({ success: false, message: "Unknown email template." }, { status: 400, headers: corsHeaders });
    }

    // ── Send via Resend ──
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [to],
        subject: content.subject,
        html:    content.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-email] Resend error:", err);
      return Response.json({ success: false, message: "Email delivery failed." }, { status: 502, headers: corsHeaders });
    }

    const result = await res.json();

    return Response.json({
      success:   true,
      messageId: result.id,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[send-email] Error:", err);
    return Response.json({ success: false, message: "Email error." }, { status: 500, headers: corsHeaders });
  }
});
