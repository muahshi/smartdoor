/**
 * Smart Door — Renewal Engine
 * services/renewalEngine.js
 *
 * Phase 9 — Beta Launch Operations
 *
 * Automated renewal lifecycle:
 *   90d → Early bird nudge
 *   30d → Renewal reminder (all channels)
 *   7d  → Urgent reminder
 *   1d  → Final warning
 *   0d  → Expired notification + grace period start
 *
 * Designed to be triggered by:
 *   - Supabase Edge Function (cron, daily at 9 AM IST)
 *   - Manual admin trigger
 *
 * Additive only — does NOT modify existing subscription or notification logic.
 */

import { supabase } from './supabase.js';

// ────────── RENEWAL TRIGGER WINDOWS ──────────

export const RENEWAL_WINDOWS = [
  { days: 90, key: 'reminder_90d', label: '90-Day Early Bird',  channels: ['email'],                        priority: 'low'    },
  { days: 30, key: 'reminder_30d', label: '30-Day Reminder',    channels: ['email', 'whatsapp'],            priority: 'medium' },
  { days: 7,  key: 'reminder_7d',  label: '7-Day Urgent',       channels: ['email', 'sms', 'whatsapp'],     priority: 'high'   },
  { days: 1,  key: 'reminder_1d',  label: '1-Day Final Warning', channels: ['email', 'sms', 'whatsapp', 'in_app'], priority: 'critical' },
  { days: 0,  key: 'expired',      label: 'Subscription Expired', channels: ['email', 'sms', 'whatsapp', 'in_app'], priority: 'critical' },
];

// ────────── RUN DAILY RENEWAL CHECK ──────────
/**
 * Called once per day by cron. Checks all active/expired subscriptions
 * and dispatches reminders for the appropriate windows.
 */
export async function runDailyRenewalCheck() {
  const results = { processed: 0, skipped: 0, errors: [], dispatched: [] };

  try {
    const now = new Date();

    // Fetch all subscriptions needing attention
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        id, owner_id, plan, status, expiry_date, renewal_price,
        users!owner_id(full_name, phone, email)
      `)
      .in('status', ['active', 'expired'])
      .order('expiry_date', { ascending: true });

    if (error) {
      results.errors.push(`DB fetch error: ${error.message}`);
      return results;
    }

    for (const sub of (subscriptions || [])) {
      try {
        const expiryDate = new Date(sub.expiry_date);
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        // Find which window this subscription falls in
        const window = RENEWAL_WINDOWS.find(w => {
          if (w.days === 0) return sub.status === 'expired' && daysLeft <= 0;
          return daysLeft === w.days;
        });

        if (!window) { results.skipped++; continue; }

        // Check if this window already sent for this sub
        const { data: existing } = await supabase
          .from('renewal_notifications')
          .select('id')
          .eq('subscription_id', sub.id)
          .eq('window_key', window.key)
          .single();

        if (existing) { results.skipped++; continue; }

        // Dispatch renewal notification
        const dispatchResult = await _dispatchRenewalNotification(sub, window, daysLeft);
        results.dispatched.push({ subId: sub.id, window: window.key, ...dispatchResult });
        results.processed++;

      } catch (subErr) {
        results.errors.push({ subId: sub.id, error: subErr.message });
      }
    }

    // Log the run
    await supabase.from('renewal_engine_logs').insert({
      run_at: now.toISOString(),
      processed: results.processed,
      skipped: results.skipped,
      errors_count: results.errors.length,
    });

    return results;
  } catch (err) {
    results.errors.push(err.message);
    return results;
  }
}

// ────────── DISPATCH RENEWAL NOTIFICATION ──────────

async function _dispatchRenewalNotification(sub, window, daysLeft) {
  const owner = sub.users || {};
  const channelResults = {};

  const messageData = {
    ownerName:    owner.full_name || 'Valued Customer',
    plan:         sub.plan,
    daysLeft:     Math.max(0, daysLeft),
    expiryDate:   new Date(sub.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    renewalPrice: `₹${sub.renewal_price ?? 0}`,
    renewalLink:  `https://mysmartdoor.in/app#renew`,
    windowLabel:  window.label,
  };

  for (const channel of window.channels) {
    channelResults[channel] = await _sendViaChannel(channel, owner, messageData, window);
  }

  // Record that this window was processed
  await supabase.from('renewal_notifications').insert({
    subscription_id: sub.id,
    owner_id:        sub.owner_id,
    window_key:      window.key,
    days_left:       Math.max(0, daysLeft),
    channels_sent:   window.channels,
    channel_results: channelResults,
  });

  return { channels: channelResults };
}

// ────────── CHANNEL DISPATCH ──────────

async function _sendViaChannel(channel, owner, data, window) {
  try {
    switch (channel) {
      case 'in_app': {
        const body = data.daysLeft > 0
          ? `Your Smart Door subscription expires in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'} on ${data.expiryDate}. Renew now to keep your plate active.`
          : `Your Smart Door subscription has expired. Renew at ${data.renewalPrice}/year to restore all features.`;

        await supabase.from('notifications').insert({
          owner_id:  owner.id,
          type:      'subscription_renewal',
          title:     window.days === 0 ? '⚠️ Subscription Expired' : `⏰ ${window.label}`,
          body,
          priority:  window.priority,
          action_url: '/app#renew',
        });
        return { status: 'sent' };
      }

      case 'email':
        // Route through Supabase Edge Function: send-email
        if (!owner.email) return { status: 'skipped_no_email' };
        await supabase.functions.invoke('send-email', {
          body: {
            to:       owner.email,
            subject:  _getEmailSubject(window, data),
            template: 'renewal_reminder',
            vars:     data,
          }
        });
        return { status: 'sent' };

      case 'sms':
        // Route through SMS service
        if (!owner.phone) return { status: 'skipped_no_phone' };
        await supabase.functions.invoke('send-sms', {
          body: {
            to:      owner.phone,
            message: _getSMSMessage(window, data),
          }
        });
        return { status: 'sent' };

      case 'whatsapp':
        if (!owner.phone) return { status: 'skipped_no_phone' };
        await supabase.functions.invoke('send-whatsapp', {
          body: {
            to:           owner.phone,
            templateName: 'smartdoor_renewal',
            templateVars: data,
          }
        });
        return { status: 'sent' };

      default:
        return { status: 'unknown_channel' };
    }
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

// ────────── MESSAGE TEMPLATES ──────────

function _getEmailSubject(window, data) {
  if (window.days === 0) return `⚠️ Smart Door Subscription Expired — Renew Now`;
  if (window.days === 1) return `🔔 Last Chance: Smart Door Subscription Expires Tomorrow`;
  if (window.days === 7) return `⏰ 7 Days Left: Renew Your Smart Door Subscription`;
  if (window.days === 30) return `Smart Door Subscription Renews in 30 Days`;
  return `Early Renewal Offer — Smart Door`;
}

function _getSMSMessage(window, data) {
  if (window.days === 0)
    return `Smart Door subscription expired. Renew at ${data.renewalPrice}/yr: ${data.renewalLink}`;
  return `Smart Door sub expires in ${data.daysLeft}d (${data.expiryDate}). Renew ${data.renewalPrice}/yr: ${data.renewalLink}`;
}

// ────────── GET RENEWAL STATUS FOR OWNER ──────────

export async function getRenewalStatus(ownerId) {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, plan, status, expiry_date, renewal_price')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sub) return { success: true, status: 'no_subscription' };

    const now = new Date();
    const expiryDate = new Date(sub.expiry_date);
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    const { data: sentNotifs } = await supabase
      .from('renewal_notifications')
      .select('window_key, sent_at')
      .eq('subscription_id', sub.id)
      .order('sent_at', { ascending: false });

    return {
      success: true,
      renewal: {
        subscriptionId: sub.id,
        plan:           sub.plan,
        status:         sub.status,
        daysLeft:       Math.max(0, daysLeft),
        expiryDate:     sub.expiry_date,
        renewalPrice:   sub.renewal_price,
        notificationsSent: sentNotifs || [],
        urgency: daysLeft <= 0 ? 'expired' : daysLeft <= 1 ? 'critical' : daysLeft <= 7 ? 'high' : daysLeft <= 30 ? 'medium' : 'low',
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── MANUAL TRIGGER (Admin) ──────────

export async function triggerRenewalReminder(subscriptionId, windowKey) {
  try {
    const window = RENEWAL_WINDOWS.find(w => w.key === windowKey);
    if (!window) return { success: false, error: 'Invalid window key.' };

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*, users!owner_id(full_name, phone, email)')
      .eq('id', subscriptionId)
      .single();

    if (!sub) return { success: false, error: 'Subscription not found.' };

    const daysLeft = Math.ceil((new Date(sub.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    const result = await _dispatchRenewalNotification(sub, window, daysLeft);

    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
