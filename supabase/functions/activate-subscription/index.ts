/**
 * Smart Door — Edge Function: activate-subscription
 * supabase/functions/activate-subscription/index.ts
 *
 * Delivery ke baad automatically:
 * 1. Subscription activate/renew karo (1 year)
 * 2. Plate status → 'active'
 * 3. Tracking event: subscription_activated
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { owner_id, order_id, plate_id, plan = "starter" } = await req.json();

    if (!owner_id || !order_id || !plate_id) {
      return Response.json({ success: false, message: "owner_id, order_id, plate_id required." }, { status: 400, headers: corsHeaders });
    }

    const supabase   = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const startDate  = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // ── 1. Existing subscription check ──
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id, expiry_date")
      .eq("owner_id", owner_id)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      // Existing subscription ko extend karo
      const existingExpiry = new Date(existing.expiry_date);
      // Agar abhi bhi active hai toh expiry se ek saal badhao, else aaj se
      const baseDate = existingExpiry > startDate ? existingExpiry : startDate;
      const newExpiry = new Date(baseDate);
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);

      await supabase
        .from("subscriptions")
        .update({ expiry_date: newExpiry.toISOString(), updated_at: startDate.toISOString() })
        .eq("id", existing.id);
    } else {
      // New subscription
      await supabase.from("subscriptions").insert({
        owner_id:      owner_id,
        plan,
        status:        "active",
        start_date:    startDate.toISOString(),
        expiry_date:   expiryDate.toISOString(),
        renewal_price: plan === "standard" ? 1999 : plan === "scale" ? 2999 : 999,
      });
    }

    // ── 2. Plate activate karo ──
    await supabase
      .from("plates")
      .update({
        status:          "active",
        activation_date: startDate.toISOString(),
        expiry_date:     expiryDate.toISOString(),
      })
      .eq("plate_id", plate_id);

    // ── 3. Order mein subscription activated mark karo ──
    await supabase
      .from("orders")
      .update({ manufacturing_status: "delivered", tracking_status: "delivered", updated_at: startDate.toISOString() })
      .eq("id", order_id);

    // ── 4. Tracking event ──
    await supabase.from("tracking_events").insert({
      order_id:    order_id,
      event_type:  "delivered",
      event_label: "Delivered & Subscription Activated",
      event_detail: `Subscription active until ${expiryDate.toLocaleDateString("en-IN")}`,
      actor:       "system",
    });

    return Response.json({
      success:    true,
      startDate:  startDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      plan,
      message:    "Subscription activated for 1 year!",
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[activate-subscription] Error:", err);
    return Response.json({ success: false, message: "Activation failed." }, { status: 500, headers: corsHeaders });
  }
});
