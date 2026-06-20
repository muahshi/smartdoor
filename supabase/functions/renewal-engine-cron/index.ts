/**
 * Smart Door — Renewal Engine Cron
 * supabase/functions/renewal-engine-cron/index.ts
 *
 * Phase 9 — Beta Launch Operations
 *
 * Triggered daily via Supabase Cron (pg_cron) or Supabase scheduled functions.
 * Checks all subscriptions and dispatches renewal reminders.
 *
 * Setup in Supabase Dashboard → Edge Functions → Schedule:
 *   Cron: 0 3 * * *  (3:00 AM UTC = 8:30 AM IST, daily)
 *
 * Also callable manually from Admin Panel as a one-off trigger.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const RENEWAL_WINDOWS = [
  { days: 90, key: 'reminder_90d', channels: ['email'],                        priority: 'low'      },
  { days: 30, key: 'reminder_30d', channels: ['email', 'whatsapp'],            priority: 'medium'   },
  { days: 7,  key: 'reminder_7d',  channels: ['email', 'sms', 'whatsapp'],     priority: 'high'     },
  { days: 1,  key: 'reminder_1d',  channels: ['email', 'sms', 'whatsapp', 'in_app'], priority: 'critical' },
  { days: 0,  key: 'expired',      channels: ['email', 'sms', 'whatsapp', 'in_app'], priority: 'critical' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify cron secret or admin token
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const isCron  = authHeader === `Bearer ${cronSecret}`;
  const isAdmin = authHeader.startsWith('Bearer ') && authHeader !== `Bearer ${cronSecret}`;

  if (!isCron && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    supabaseServiceKey,
  );

  const results = { processed: 0, skipped: 0, errors: [] as string[], dispatched: [] as object[] };
  const now = new Date();

  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        id, owner_id, plan, status, expiry_date, renewal_price,
        users!owner_id(full_name, phone, email)
      `)
      .in('status', ['active', 'expired']);

    if (error) throw new Error(`DB fetch: ${error.message}`);

    for (const sub of subscriptions ?? []) {
      const expiryDate = new Date(sub.expiry_date);
      const daysLeft   = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const window = RENEWAL_WINDOWS.find(w => {
        if (w.days === 0) return sub.status === 'expired' && daysLeft <= 0;
        return daysLeft === w.days;
      });

      if (!window) { results.skipped++; continue; }

      // Dedup check
      const { data: existing } = await supabase
        .from('renewal_notifications')
        .select('id')
        .eq('subscription_id', sub.id)
        .eq('window_key', window.key)
        .single();

      if (existing) { results.skipped++; continue; }

      // Dispatch per channel
      const channelResults: Record<string, string> = {};
      const owner = (sub.users as any) ?? {};

      for (const channel of window.channels) {
        if (channel === 'in_app') {
          const body = daysLeft > 0
            ? `Subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew to keep Smart Door active.`
            : 'Subscription expired. Renew now to restore all features.';

          await supabase.from('notifications').insert({
            owner_id:   sub.owner_id,
            type:       'subscription_renewal',
            title:      daysLeft <= 0 ? '⚠️ Subscription Expired' : `⏰ Renewal Reminder`,
            body,
            priority:   window.priority,
            action_url: '/app#renew',
          });
          channelResults[channel] = 'sent';

        } else if (channel === 'email' && owner.email) {
          const { error: emailErr } = await supabase.functions.invoke('send-email', {
            body: {
              to:       owner.email,
              subject:  daysLeft <= 0
                ? '⚠️ Smart Door Subscription Expired'
                : `⏰ Smart Door — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
              template: 'renewal_reminder',
              vars: {
                ownerName:    owner.full_name || 'Valued Customer',
                daysLeft:     Math.max(0, daysLeft),
                expiryDate:   expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                renewalPrice: `₹${sub.renewal_price || 999}`,
                renewalLink:  'https://mysmartdoor.in/app#renew',
              },
            },
          });
          channelResults[channel] = emailErr ? 'failed' : 'sent';

        } else if (channel === 'whatsapp' && owner.phone) {
          const { error: waErr } = await supabase.functions.invoke('send-whatsapp', {
            body: {
              to:           owner.phone,
              templateName: 'smartdoor_renewal',
              templateVars: {
                name:     owner.full_name || 'Customer',
                daysLeft: Math.max(0, daysLeft),
                link:     'https://mysmartdoor.in/app#renew',
              },
            },
          });
          channelResults[channel] = waErr ? 'failed' : 'sent';

        } else {
          channelResults[channel] = 'skipped_no_contact';
        }
      }

      // Log it
      await supabase.from('renewal_notifications').insert({
        subscription_id: sub.id,
        owner_id:        sub.owner_id,
        window_key:      window.key,
        days_left:       Math.max(0, daysLeft),
        channels_sent:   window.channels,
        channel_results: channelResults,
      });

      results.processed++;
      results.dispatched.push({ subId: sub.id, window: window.key, channels: channelResults });
    }

    // Log the run
    await supabase.from('renewal_engine_logs').insert({
      run_at:       now.toISOString(),
      processed:    results.processed,
      skipped:      results.skipped,
      errors_count: results.errors.length,
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    results.errors.push((err as Error).message);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message, results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
