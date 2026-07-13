/**
 * Smart Door — Edge Function: manage-subscription
 * supabase/functions/manage-subscription/index.ts
 *
 * Owner self-service subscription actions that do NOT involve payment:
 *   - downgrade   → immediately move to the Free plan
 *   - cancel      → keep current plan active until expiry_date, then the
 *                   renewal-engine-cron auto-downgrades to Free instead of
 *                   expiring the account
 *   - reactivate  → undo a pending cancellation (still within period)
 *
 * Paid upgrades/renewals go through create-subscription-order +
 * verify-subscription-payment instead. Trusts `ownerId` from the request
 * body, same convention as every other owner-context Edge Function in this
 * codebase (activate-subscription, cancel-pending-order, initiate-call) —
 * owner sessions are Plate ID + PIN based, not Supabase Auth JWT.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ownerId, action } = await req.json();

    if (!ownerId || !action) {
      return Response.json({ success: false, message: "ownerId and action are required." }, { status: 400, headers: corsHeaders });
    }
    if (!["downgrade", "cancel", "reactivate"].includes(action)) {
      return Response.json({ success: false, message: "Invalid action." }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .maybeSingle();

    if (subErr) {
      return Response.json({ success: false, message: subErr.message }, { status: 500, headers: corsHeaders });
    }

    if (action === "downgrade") {
      const startDate = new Date();
      // Free plan never expires — set a far-future date so the existing
      // "daysLeft" UI logic (which treats 0 as expired) keeps working.
      const expiryDate = new Date(startDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + 100);

      if (sub) {
        await supabase.from("subscriptions").update({
          plan:                 "free",
          status:               "active",
          billing_cycle:        "yearly",
          expiry_date:          expiryDate.toISOString(),
          renewal_price:        0,
          cancel_at_period_end: false,
          grace_until:          null,
          source:               "self_serve",
          updated_at:           startDate.toISOString(),
        }).eq("id", sub.id);
      } else {
        await supabase.from("subscriptions").insert({
          owner_id:      ownerId,
          plan:          "free",
          status:        "active",
          billing_cycle: "yearly",
          start_date:    startDate.toISOString(),
          expiry_date:   expiryDate.toISOString(),
          renewal_price: 0,
          source:        "self_serve",
        });
      }

      return Response.json({ success: true, plan: "free", message: "Moved to the Free plan." }, { headers: corsHeaders });
    }

    if (!sub) {
      return Response.json({ success: false, message: "No active subscription found." }, { status: 404, headers: corsHeaders });
    }

    if (action === "cancel") {
      if (sub.plan === "free" || sub.plan === "hardware_only") {
        return Response.json({ success: false, message: "The Free plan cannot be cancelled." }, { status: 400, headers: corsHeaders });
      }
      await supabase.from("subscriptions").update({
        cancel_at_period_end: true,
        updated_at:            new Date().toISOString(),
      }).eq("id", sub.id);

      try {
        await supabase.from("notifications").insert({
          id: crypto.randomUUID(),
          owner_id: ownerId,
          type: "status_change",
          title: "Subscription set to cancel",
          body: `Your ${sub.plan} plan will remain active until ${new Date(sub.expiry_date).toLocaleDateString("en-IN")}, then move to Free.`,
          priority: "normal",
          channels: ["in_app"],
          delivery_status: {},
        });
      } catch (_ne) { /* non-fatal */ }

      return Response.json({ success: true, cancelAtPeriodEnd: true, message: "Subscription will move to Free at the end of the current period." }, { headers: corsHeaders });
    }

    if (action === "reactivate") {
      await supabase.from("subscriptions").update({
        cancel_at_period_end: false,
        updated_at:            new Date().toISOString(),
      }).eq("id", sub.id);

      return Response.json({ success: true, cancelAtPeriodEnd: false, message: "Cancellation reversed — your plan will renew as usual." }, { headers: corsHeaders });
    }

    return Response.json({ success: false, message: "Unhandled action." }, { status: 400, headers: corsHeaders });

  } catch (err) {
    console.error("[manage-subscription] Unexpected error:", err);
    return Response.json({ success: false, message: "Unexpected error." }, { status: 500, headers: corsHeaders });
  }
});
