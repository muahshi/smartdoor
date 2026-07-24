// Phase 2A Production Persistence Fix
/**
 * Smart Door — Edge Function: razorpay-webhook
 * supabase/functions/razorpay-webhook/index.ts
 *
 * Server-side Razorpay webhook receiver. This is the SOURCE OF TRUTH for
 * payment confirmation — it does not depend on the customer's browser
 * staying alive after checkout.
 *
 * WHY THIS EXISTS (Phase 11 — Payment Reliability):
 *   verify-razorpay-payment (existing, UNCHANGED) is called by the client
 *   right after Razorpay checkout succeeds and remains the fast path — it
 *   gives the customer an instant "payment verified" response. But if the
 *   browser/app closes, loses network, or crashes between "payment done"
 *   and that client call, Razorpay has captured money while our DB never
 *   learns about it. This function is Razorpay's server-to-server callback,
 *   so it fires independently of the client and closes that gap.
 *
 * Design per architecture already documented in services/webhooks.js:
 *   1. Verify HMAC-SHA256 signature (X-Razorpay-Signature) over the RAW body.
 *   2. Identify duplicate deliveries via X-Razorpay-Event-Id (Razorpay's own
 *      idempotency header — see https://razorpay.com/docs/webhooks/faqs/).
 *   3. Record every event in webhook_events (schema already exists —
 *      sql/16_phase13_schema.sql — reused as-is, no migration needed).
 *   4. Before doing any fulfillment work, check whether the order is
 *      already paid (i.e. verify-razorpay-payment's fast path already ran).
 *      If so, exit safely — no duplicate plate/manufacturing/email work.
 *
 * NOTE ON DUPLICATION (documented tradeoff, not an oversight):
 *   Per explicit instruction, verify-razorpay-payment is NOT modified and
 *   NOT refactored to share code with this function, to avoid any risk to
 *   the already-working checkout path. That means the fulfillment steps
 *   below (plate ID generation, manufacturing record, tracking events,
 *   activation email) are re-implemented here rather than imported from a
 *   shared helper. This function only runs that logic when the fast path
 *   did NOT already complete it (see the payment_status === 'paid' guard),
 *   so in normal operation this code path is a safety net, not a second
 *   writer. A future cleanup (not part of this change) could extract both
 *   into a shared `_shared/orderFulfillment.ts` once this webhook has been
 *   running safely in production for a while.
 *
 * Only handles what's needed for payment reliability right now:
 *   payment.captured, payment.failed. Other event types are acknowledged
 *   and logged but not acted on (no invented scope).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

const jsonHeaders = { "Content-Type": "application/json" };

// ── Plate ID generator (same format as verify-razorpay-payment: SD-ABX9K7) ──
function generatePlateId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums  = "23456789";
  const r     = (s: string) => s[Math.floor(Math.random() * s.length)];
  return `SD-${r(chars)}${r(chars)}${r(nums)}${r(chars)}${r(nums)}${r(chars)}`;
}

async function generateUniquePlateId(supabase: ReturnType<typeof createClient>): Promise<string> {
  let attempts = 0;
  while (attempts < 20) {
    const pid = generatePlateId();
    const { data } = await supabase.from("plates").select("id").eq("plate_id", pid).maybeSingle();
    if (!data) return pid;
    attempts++;
  }
  return `SD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// ── HMAC-SHA256 hex digest over the raw body, using Web Crypto ──
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Constant-time string compare (avoid timing side-channel on signature check) ──
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function logError(
  supabase: ReturnType<typeof createClient>,
  message: string,
  meta: Record<string, unknown> = {},
) {
  try {
    await supabase.from("error_logs").insert({
      level: "error",
      category: "payment",
      message: `[razorpay-webhook] ${message}`,
      meta,
    });
  } catch (_e) {
    // Never let logging failure break webhook processing
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Read RAW body — signature is computed over raw bytes, not re-serialized JSON ──
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const eventId = req.headers.get("x-razorpay-event-id") || "";

  // ── 1. Signature verification ──
  if (!RAZORPAY_WEBHOOK_SECRET) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting.");
    await logError(supabase, "RAZORPAY_WEBHOOK_SECRET missing — webhook rejected");
    return new Response(JSON.stringify({ success: false, message: "Webhook not configured." }), { status: 500, headers: jsonHeaders });
  }

  if (!signature) {
    return new Response(JSON.stringify({ success: false, message: "Missing signature." }), { status: 400, headers: jsonHeaders });
  }

  const expectedSignature = await hmacHex(RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (!timingSafeEqual(expectedSignature, signature)) {
    console.error("[razorpay-webhook] Signature mismatch — possible spoofed request.");
    await logError(supabase, "Signature mismatch on incoming webhook", { eventId });
    return new Response(JSON.stringify({ success: false, message: "Invalid signature." }), { status: 400, headers: jsonHeaders });
  }

  // ── 2. Parse payload ──
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid JSON." }), { status: 400, headers: jsonHeaders });
  }

  const eventType = String(body.event || "unknown");

  if (!eventId) {
    // Extremely unlikely (Razorpay always sends this), but without it we
    // cannot guarantee idempotency — refuse rather than risk double-processing.
    await logError(supabase, "Missing X-Razorpay-Event-Id header", { eventType });
    return new Response(JSON.stringify({ success: false, message: "Missing event id." }), { status: 400, headers: jsonHeaders });
  }

  // ── 3. Idempotency: record this event, bail out cleanly on duplicates ──
  const { error: insertErr } = await supabase.from("webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    payload: body,
    status: "pending",
  });

  if (insertErr) {
    // 23505 = unique_violation on event_id → we've seen this event before
    if (insertErr.code === "23505") {
      const { data: existing } = await supabase
        .from("webhook_events")
        .select("status")
        .eq("event_id", eventId)
        .maybeSingle();

      // Whatever its current status, we do not reprocess a known event.
      // Razorpay only needs a 2xx to stop retrying.
      console.log(`[razorpay-webhook] Duplicate delivery for event ${eventId} (status: ${existing?.status}) — no-op.`);
      return new Response(JSON.stringify({ success: true, message: "Already recorded." }), { status: 200, headers: jsonHeaders });
    }
    console.error("[razorpay-webhook] Failed to record webhook_events row:", insertErr.message);
    await logError(supabase, "Failed to insert webhook_events row", { eventId, error: insertErr.message });
    return new Response(JSON.stringify({ success: false, message: "Internal error." }), { status: 500, headers: jsonHeaders });
  }

  // ── 4. Dispatch by event type ──
  try {
    if (eventType === "payment.captured") {
      await handlePaymentCaptured(supabase, body, eventId);
    } else if (eventType === "payment.failed") {
      await handlePaymentFailed(supabase, body, eventId);
    } else {
      // Known-but-unhandled or irrelevant event — acknowledge, don't act.
      await supabase.from("webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_message: "Event type not handled by current implementation — acknowledged only.",
      }).eq("event_id", eventId);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[razorpay-webhook] Handler error for ${eventType}:`, message);
    await supabase.from("webhook_events").update({
      status: "failed",
      error_message: message,
      retry_count: 1,
    }).eq("event_id", eventId);
    await logError(supabase, `Handler failed for ${eventType}`, { eventId, error: message });

    // Return 200 anyway once the event is durably logged as 'failed' —
    // it's now visible on the ops/admin side for manual/cron retry, and
    // we avoid Razorpay's blind exponential-backoff retries hammering the
    // same bug for 24h. (If the failure was transient — e.g. a momentary
    // DB blip — the admin replay tool documented in services/webhooks.js
    // (`replayWebhookEvent`) can re-drive it.)
    return new Response(JSON.stringify({ success: true, note: "Logged for review." }), { status: 200, headers: jsonHeaders });
  }
});

// ────────────────────────────────────────────────────────────
// payment.captured — the core payment-reliability safety net
// ────────────────────────────────────────────────────────────
async function handlePaymentCaptured(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  eventId: string,
) {
  const paymentEntity = (body.payload as any)?.payment?.entity;
  if (!paymentEntity) throw new Error("payload.payment.entity missing from payment.captured event");

  const razorpayPaymentId = paymentEntity.id as string;
  const razorpayOrderId = paymentEntity.order_id as string;

  // Find our payment record via provider_order_id (set at create-razorpay-order time)
  const { data: payment } = await supabase
    .from("payments")
    .select("id, order_id, status")
    .eq("provider_order_id", razorpayOrderId)
    .maybeSingle();

  if (!payment) {
    // We have no record of this Razorpay order at all — log for investigation,
    // acknowledge the webhook (nothing we can safely do without an order to attach to).
    await logError(supabase, "payment.captured for unknown provider_order_id", { razorpayOrderId, razorpayPaymentId });
    await supabase.from("webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: "No matching payments row for provider_order_id — logged only.",
    }).eq("event_id", eventId);
    return;
  }

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", payment.order_id)
    .maybeSingle();

  if (!order) {
    await logError(supabase, "payment.captured — order row missing for known payment", { orderId: payment.order_id, razorpayPaymentId });
    await supabase.from("webhook_events").update({
      status: "failed",
      error_message: "orders row missing for payment.order_id",
    }).eq("event_id", eventId);
    return;
  }

  // ── Idempotency guard #2 (business-level): already fulfilled? ──
  // Covers the normal case where verify-razorpay-payment's fast path already
  // did everything. This is the "exit safely" requirement.
  if (order.payment_status === "paid" || payment.status === "captured") {
    await supabase.from("payments").update({
      provider_payment_id: razorpayPaymentId,
      status: "captured",
      raw_webhook: body,
    }).eq("id", payment.id);

    await supabase.from("webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      entity_id: razorpayPaymentId,
      error_message: "Order already paid (fast path had already fulfilled it) — no-op.",
    }).eq("event_id", eventId);
    return;
  }

  // ── Fast path did NOT complete — do full fulfillment here ──
  const plateId = await generateUniquePlateId(supabase);

  await supabase.from("payments").update({
    provider_payment_id: razorpayPaymentId,
    status: "captured",
    raw_webhook: body,
  }).eq("id", payment.id);

  await supabase.from("orders").update({
    payment_status: "paid",
    plate_id: plateId,
    manufacturing_status: "queued",
    tracking_status: "payment_verified",
    updated_at: new Date().toISOString(),
  }).eq("id", order.id);

  let ownerId = order.owner_id;
  if (!ownerId) {
    const { data: newUser } = await supabase
      .from("users")
      .insert({
        full_name: order.customer_name,
        phone: String(order.customer_phone || "").replace(/\D/g, "").slice(-10),
        email: order.customer_email,
        plate_id: plateId,
        pin_hash: "UNSET",
      })
      .select("id")
      .single();
    ownerId = newUser?.id;
    if (ownerId) {
      await supabase.from("orders").update({ owner_id: ownerId }).eq("id", order.id);
    }
  }

  await supabase.from("plates").insert({
    plate_id: plateId,
    qr_slug: plateId,
    product_type: order.product_type,
    status: "inactive",
    owner_id: ownerId,
  });

  supabase.functions.invoke("generate-qr", {
    body: { plate_id: plateId, order_id: order.id },
  }).catch((e: Error) => console.warn("[razorpay-webhook] QR generation dispatch failed:", e.message));

  // Phase 2A fix: identical root cause and fix as verify-razorpay-payment —
  // house_number/font_style previously read from fields that never held this
  // data; plate_name now uses the actual "Name to Print on Plate" text
  // (order.house_name) instead of the buyer's account name, with a fallback
  // for pre-Phase-2A orders. Keeps webhook-completed orders identical to
  // orders fulfilled via the fast (verify-razorpay-payment) path.
  const webhookCustomization = (order.customization && typeof order.customization === "object") ? order.customization : {};
  const { error: manufacturingError } = await supabase.from("manufacturing").insert({
    order_id: order.id,
    plate_id: plateId,
    plate_name: order.house_name || order.customer_name,
    house_name: order.house_name || null,
    house_number: order.house_number || "",
    font_style: order.font_style || "modern",
    product_type: order.product_type,
    finish: webhookCustomization.finish || null,
    plate_size: webhookCustomization.size || null,
    symbol: webhookCustomization.symbol || null,
    qr_style: webhookCustomization.qrStyle || null,
    logo_file_name: webhookCustomization.logoFileName || null,
    customization: webhookCustomization,
    qr_slug: plateId,
    production_status: "queued",
  });

  // Hardening (Phase 2A): same reasoning as verify-razorpay-payment — the
  // order is already marked 'paid' by this point, so a failed insert here
  // must not be silently lost. Reuses the existing logError() helper
  // (writes to error_logs, same as every other failure path in this file)
  // instead of introducing a new logging mechanism.
  if (manufacturingError) {
    console.error("[razorpay-webhook] Manufacturing record insert FAILED — order paid but not queued for production:", manufacturingError.message, { orderId: order.id, plateId });
    await logError(supabase, "Manufacturing insert failed after successful payment capture (webhook path)", {
      orderId: order.id,
      plateId,
      error: manufacturingError.message,
    });
  }

  await supabase.from("tracking_events").insert([
    { order_id: order.id, event_type: "payment_verified", event_label: "Payment Verified (webhook)", actor: "system" },
    { order_id: order.id, event_type: "plate_generated", event_label: "Plate ID Generated", event_detail: plateId, actor: "system" },
    { order_id: order.id, event_type: "qr_generated", event_label: "QR Code Generated", actor: "system" },
    { order_id: order.id, event_type: "in_production", event_label: "In Manufacturing Queue", actor: "system" },
  ]);

  // Activation email — same magic-link approach as verify-razorpay-payment
  try {
    const ownerEmail = order.customer_email;
    const APP_URL = Deno.env.get("APP_URL") || "https://mysmartdoor.in";
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
      options: { redirectTo: `${APP_URL}/onboarding.html?plate_id=${plateId}&order_id=${order.id}` },
    });
    const hashedToken = (linkData as any)?.properties?.hashed_token || null;
    const activationUrl = hashedToken
      ? `${APP_URL}/onboarding.html?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&plate_id=${encodeURIComponent(plateId)}&order_id=${encodeURIComponent(order.id)}`
      : null;

    if (activationUrl) {
      await supabase.functions.invoke("send-email", {
        body: {
          to: ownerEmail,
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
              <p style="color:#888;font-size:.85rem;">This link expires in 24 hours. If you didn't make this purchase, please contact hello@mysmartdoor.in immediately.</p>
            </div>`,
        },
      });
    }
  } catch (emailErr) {
    console.error("[razorpay-webhook] Activation email failed:", emailErr);
  }

  if (ownerId) {
    try {
      await supabase.from("notifications").insert([
        {
          id: crypto.randomUUID(), owner_id: ownerId, type: "status_change",
          title: "🛒 Order Confirmed", priority: "normal", channels: ["in_app"], delivery_status: {},
          body: `Order ${order.order_number} received. Plate ${plateId} is in production.`,
          payload: { plateId, orderNumber: order.order_number },
        },
        {
          id: crypto.randomUUID(), owner_id: ownerId, type: "status_change",
          title: "📱 QR Code Generated", priority: "normal", channels: ["in_app"], delivery_status: {},
          body: `Your Smart Door QR code for ${plateId} is ready.`,
          payload: { plateId },
        },
        {
          id: crypto.randomUUID(), owner_id: ownerId, type: "status_change",
          title: "🏭 In Production", priority: "normal", channels: ["in_app"], delivery_status: {},
          body: "Your Smart Door nameplate is being manufactured.",
          payload: { plateId },
        },
      ]);
    } catch (_ne) { /* non-fatal */ }
  }

  await supabase.from("webhook_events").update({
    status: "processed",
    processed_at: new Date().toISOString(),
    entity_id: razorpayPaymentId,
    error_message: "Fulfilled by webhook — client fast path did not complete first.",
  }).eq("event_id", eventId);

  console.log(`[razorpay-webhook] payment.captured fulfilled order ${order.id} → plate ${plateId} (fast path had not completed).`);
}

// ────────────────────────────────────────────────────────────
// payment.failed — mark the order so it doesn't sit as a silent "pending" forever
// ────────────────────────────────────────────────────────────
async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  eventId: string,
) {
  const paymentEntity = (body.payload as any)?.payment?.entity;
  if (!paymentEntity) throw new Error("payload.payment.entity missing from payment.failed event");

  const razorpayOrderId = paymentEntity.order_id as string;
  const errorDescription = paymentEntity.error_description || "Payment failed";

  const { data: payment } = await supabase
    .from("payments")
    .select("id, order_id, status")
    .eq("provider_order_id", razorpayOrderId)
    .maybeSingle();

  if (!payment) {
    await supabase.from("webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: "No matching payments row for provider_order_id — logged only.",
    }).eq("event_id", eventId);
    return;
  }

  // Razorpay warns event order isn't guaranteed — never downgrade a payment
  // that's already been captured (e.g. a stale/out-of-order failed event).
  if (payment.status === "captured") {
    await supabase.from("webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: "Ignored — payment already captured (out-of-order event).",
    }).eq("event_id", eventId);
    return;
  }

  await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
  await supabase.from("orders").update({
    payment_status: "failed",
    updated_at: new Date().toISOString(),
  }).eq("id", payment.order_id);

  await supabase.from("tracking_events").insert({
    order_id: payment.order_id,
    event_type: "payment_failed",
    event_label: "Payment Failed",
    event_detail: String(errorDescription),
    actor: "system",
  });

  await supabase.from("webhook_events").update({
    status: "processed",
    processed_at: new Date().toISOString(),
    error_message: `Order marked failed: ${errorDescription}`,
  }).eq("event_id", eventId);
}

/**
 * DEPLOY COMMAND:
 * supabase functions deploy razorpay-webhook --no-verify-jwt
 *   (--no-verify-jwt is required: Razorpay calls this directly, it cannot
 *    send a Supabase auth token. Signature verification above is what
 *    actually authenticates the caller.)
 *
 * SECRETS to set:
 * supabase secrets set RAZORPAY_WEBHOOK_SECRET=<value you set in Razorpay Dashboard>
 * (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *  already exist as secrets for the other payment functions — reused, not re-added.)
 */
