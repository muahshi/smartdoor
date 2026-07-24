/**
 * My Smart Door — Customer Success Service
 * services/customerSuccess.js
 *
 * Phase 9 — Beta Launch Operations
 * Handles: Onboarding tracking, Health scores, Usage analytics,
 *          Renewal lifecycle, Retention workflows, NPS.
 *
 * Additive only — does NOT touch existing services or UI.
 */

import { supabase } from './supabase.js';

// ────────── ONBOARDING STEPS ──────────

export const ONBOARDING_STEPS = [
  { key: 'order_placed',       label: 'Order Placed',          weight: 10 },
  { key: 'payment_done',       label: 'Payment Confirmed',     weight: 10 },
  { key: 'plate_manufactured', label: 'Plate Manufactured',    weight: 10 },
  { key: 'plate_shipped',      label: 'Plate Shipped',         weight: 10 },
  { key: 'plate_delivered',    label: 'Plate Delivered',       weight: 10 },
  { key: 'account_activated',  label: 'Account Activated',     weight: 15 },
  { key: 'family_setup',       label: 'Family Members Added',  weight: 10 },
  { key: 'status_setup',       label: 'Status Messages Set',   weight: 5  },
  { key: 'security_setup',     label: 'Security Rules Config', weight: 5  },
  { key: 'first_visitor_scan', label: 'First Visitor Scanned', weight: 15 },
];

// ────────── GET ONBOARDING PROGRESS ──────────

export async function getOnboardingProgress(ownerId) {
  try {
    const { data, error } = await supabase
      .from('customer_onboarding')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle(); // FIX: was .single() — a brand-new owner has no
                      // onboarding row yet. .single() still returned a 406
                      // even though the PGRST116 code below was handled in
                      // JS; maybeSingle() avoids the 406 response entirely.

    if (error) return { success: false, error: error.message };

    const progress = data || {};
    let completedWeight = 0;
    const steps = ONBOARDING_STEPS.map(step => {
      const done = !!progress[step.key];
      if (done) completedWeight += step.weight;
      return { ...step, done, done_at: progress[`${step.key}_at`] || null };
    });

    const score = completedWeight; // out of 100
    const nextStep = steps.find(s => !s.done) || null;
    const isComplete = score === 100;

    return {
      success: true,
      onboarding: {
        ownerId,
        score,
        isComplete,
        steps,
        nextStep,
        completedAt: progress.completed_at || null,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── MARK ONBOARDING STEP DONE ──────────

export async function markOnboardingStep(ownerId, stepKey) {
  try {
    const now = new Date().toISOString();
    const update = {
      owner_id: ownerId,
      [stepKey]: true,
      [`${stepKey}_at`]: now,
      updated_at: now,
    };

    // Check if all steps now done → mark complete
    const afterUpdate = await getOnboardingProgress(ownerId);
    const allDone = afterUpdate.success && afterUpdate.onboarding.steps
      .filter(s => s.key !== stepKey)
      .every(s => s.done);

    if (allDone) update.completed_at = now;

    const { error } = await supabase
      .from('customer_onboarding')
      .upsert(update, { onConflict: 'owner_id' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── CUSTOMER HEALTH SCORE ──────────
/**
 * Health score 0–100.
 * Factors: subscription status, recent visitor scans, family setup, last login.
 */
export async function getHealthScore(ownerId) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [subRes, visitorRes, familyRes, userRes, onboardRes] = await Promise.all([
      supabase.from('subscriptions').select('status, expiry_date').eq('owner_id', ownerId).eq('status', 'active').single(),
      supabase.from('visitor_logs').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).gte('created_at', thirtyDaysAgo),
      supabase.from('family_members').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
      supabase.from('users').select('last_login_at').eq('id', ownerId).single(),
      getOnboardingProgress(ownerId),
    ]);

    let score = 0;
    const factors = [];

    // Subscription active: 30 pts
    if (subRes.data) {
      score += 30;
      factors.push({ key: 'subscription', label: 'Active Subscription', score: 30, max: 30 });
    } else {
      factors.push({ key: 'subscription', label: 'Active Subscription', score: 0, max: 30 });
    }

    // Visitor scans last 30 days: up to 25 pts
    const scans = visitorRes.count || 0;
    const scanScore = Math.min(25, scans * 5);
    score += scanScore;
    factors.push({ key: 'scans', label: `Visitor Scans (${scans} this month)`, score: scanScore, max: 25 });

    // Family members setup: up to 20 pts
    const members = familyRes.count || 0;
    const familyScore = members > 0 ? Math.min(20, members * 5) : 0;
    score += familyScore;
    factors.push({ key: 'family', label: `Family Members (${members})`, score: familyScore, max: 20 });

    // Last login recency: up to 15 pts
    const lastLogin = userRes.data?.last_login_at ? new Date(userRes.data.last_login_at) : null;
    const daysSinceLogin = lastLogin ? Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24)) : 999;
    const loginScore = daysSinceLogin <= 7 ? 15 : daysSinceLogin <= 30 ? 8 : 0;
    score += loginScore;
    factors.push({ key: 'login', label: `Last Login (${daysSinceLogin === 999 ? 'Never' : daysSinceLogin + 'd ago'})`, score: loginScore, max: 15 });

    // Onboarding: up to 10 pts
    const onboardScore = onboardRes.success ? Math.round((onboardRes.onboarding.score / 100) * 10) : 0;
    score += onboardScore;
    factors.push({ key: 'onboarding', label: `Onboarding (${onboardRes.onboarding?.score || 0}%)`, score: onboardScore, max: 10 });

    const tier = score >= 80 ? 'healthy' : score >= 50 ? 'at_risk' : 'churning';
    const tierLabel = { healthy: '🟢 Healthy', at_risk: '🟡 At Risk', churning: '🔴 Churning' }[tier];

    return {
      success: true,
      health: { ownerId, score, tier, tierLabel, factors }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── USAGE TRACKING ──────────

export async function getUsageStats(ownerId, days = 30) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [visitorRes, callRes, voiceRes, sosRes] = await Promise.all([
      supabase.from('visitor_logs').select('id, intent, created_at').eq('owner_id', ownerId).gte('created_at', since),
      supabase.from('call_logs').select('id, status, created_at').eq('owner_id', ownerId).gte('created_at', since),
      supabase.from('voice_notes').select('id, created_at').eq('owner_id', ownerId).gte('created_at', since),
      supabase.from('visitor_logs').select('id').eq('owner_id', ownerId).eq('intent', 'emergency').gte('created_at', since),
    ]);

    const visitors = visitorRes.data || [];
    const intentBreakdown = {};
    visitors.forEach(v => {
      intentBreakdown[v.intent || 'unknown'] = (intentBreakdown[v.intent || 'unknown'] || 0) + 1;
    });

    return {
      success: true,
      usage: {
        period: `${days}d`,
        qrScans: visitors.length,
        callsInitiated: callRes.count || 0,
        voiceNotes: voiceRes.count || 0,
        sosEvents: sosRes.count || 0,
        intentBreakdown,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── NPS / FEEDBACK ──────────

export async function submitNPS(ownerId, { score, category, comment }) {
  try {
    if (score < 0 || score > 10) return { success: false, error: 'NPS score must be 0–10.' };

    const { error } = await supabase.from('nps_responses').insert({
      owner_id: ownerId,
      score,
      category,      // 'satisfaction' | 'renewal_likelihood' | 'referral_likelihood'
      comment: comment || null,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getNPSSummary() {
  try {
    const { data, error } = await supabase
      .from('nps_responses')
      .select('score, category, created_at');

    if (error) return { success: false, error: error.message };

    const responses = data || [];
    const byCategory = {};

    responses.forEach(r => {
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r.score);
    });

    const calcNPS = (scores) => {
      if (!scores?.length) return { nps: 0, count: 0 };
      const promoters  = scores.filter(s => s >= 9).length;
      const detractors = scores.filter(s => s <= 6).length;
      const nps = Math.round(((promoters - detractors) / scores.length) * 100);
      return { nps, count: scores.length, avg: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) };
    };

    return {
      success: true,
      nps: {
        satisfaction:        calcNPS(byCategory['satisfaction']),
        renewal_likelihood:  calcNPS(byCategory['renewal_likelihood']),
        referral_likelihood: calcNPS(byCategory['referral_likelihood']),
        overall:             calcNPS(responses.map(r => r.score)),
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── REFERRAL SYSTEM ──────────

export async function getReferralCode(ownerId) {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('referral_code, total_referrals, successful_referrals, reward_earned')
      .eq('owner_id', ownerId)
      .single();

    if (error && error.code !== 'PGRST116') return { success: false, error: error.message };

    if (!data) {
      // Auto-generate referral code
      const code = 'SD-' + ownerId.slice(0, 6).toUpperCase();
      const { data: newRef, error: insertErr } = await supabase
        .from('referrals')
        .insert({ owner_id: ownerId, referral_code: code })
        .select()
        .single();
      if (insertErr) return { success: false, error: insertErr.message };
      return { success: true, referral: newRef };
    }

    return { success: true, referral: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function trackReferral(referralCode, newOwnerId) {
  try {
    const { data: ref } = await supabase
      .from('referrals')
      .select('*')
      .eq('referral_code', referralCode)
      .single();

    if (!ref) return { success: false, error: 'Invalid referral code.' };
    if (ref.owner_id === newOwnerId) return { success: false, error: 'Cannot refer yourself.' };

    const { error } = await supabase
      .from('referral_logs')
      .insert({ referral_id: ref.id, referred_owner_id: newOwnerId, status: 'pending' });

    if (error) return { success: false, error: error.message };

    await supabase.from('referrals')
      .update({ total_referrals: (ref.total_referrals || 0) + 1 })
      .eq('id', ref.id);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── BETA FEEDBACK ──────────

export async function submitBetaFeedback(ownerId, { type, title, description, severity }) {
  try {
    const table = type === 'bug'     ? 'bug_reports'
                : type === 'feature' ? 'feature_requests'
                : 'feedback_logs';

    const { error } = await supabase.from(table).insert({
      owner_id: ownerId,
      title,
      description,
      severity: severity || 'medium',
      status: 'open',
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getBetaFeedbackSummary() {
  try {
    const [bugsRes, featuresRes, feedbackRes] = await Promise.all([
      supabase.from('bug_reports').select('status, severity'),
      supabase.from('feature_requests').select('status, upvotes'),
      supabase.from('feedback_logs').select('rating'),
    ]);

    const bugs = bugsRes.data || [];
    const features = featuresRes.data || [];
    const feedback = feedbackRes.data || [];

    const avgRating = feedback.length
      ? +(feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length).toFixed(1)
      : 0;

    return {
      success: true,
      summary: {
        bugs:     { total: bugs.length, open: bugs.filter(b => b.status === 'open').length, critical: bugs.filter(b => b.severity === 'critical').length },
        features: { total: features.length, open: features.filter(f => f.status === 'open').length },
        feedback: { total: feedback.length, avgRating },
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── OPERATIONS DASHBOARD DATA ──────────

export async function getOperationsDashboard() {
  try {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const in7Days  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000).toISOString();

    const [
      pendingActivations,
      renewalIn30,
      renewalIn7,
      mfgDelays,
      shippingDelays,
      openTickets,
      healthData,
    ] = await Promise.all([
      supabase.from('customer_onboarding').select('id', { count: 'exact', head: true }).eq('account_activated', false),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('expiry_date', in30Days).gt('expiry_date', now.toISOString()),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('expiry_date', in7Days).gt('expiry_date', now.toISOString()),
      supabase.from('manufacturing').select('id', { count: 'exact', head: true }).in('production_status', ['queued', 'printing']).lt('created_at', new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('shipping_status', 'in_transit').lt('updated_at', new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('customer_health').select('tier'),
    ]);

    const health = healthData.data || [];
    const healthBreakdown = { healthy: 0, at_risk: 0, churning: 0 };
    health.forEach(h => { if (healthBreakdown[h.tier] !== undefined) healthBreakdown[h.tier]++; });

    return {
      success: true,
      ops: {
        pendingActivations:  pendingActivations.count || 0,
        renewalsIn30Days:    renewalIn30.count || 0,
        renewalsIn7Days:     renewalIn7.count || 0,
        manufacturingDelays: mfgDelays.count || 0,
        shippingDelays:      shippingDelays.count || 0,
        openSupportTickets:  openTickets.count || 0,
        customerHealth:      healthBreakdown,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── LAUNCH KPI DASHBOARD ──────────

export async function getLaunchKPIs() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [
      totalCustomers,
      totalRevenue,
      monthlyRevenue,
      activeSubs,
      renewedSubs,
      expiredSubs,
      activatedThisMonth,
      totalReferrals,
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid'),
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid').gte('created_at', monthStart),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('start_date', lastMonthStart).lt('start_date', monthStart),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'expired').gte('expiry_date', lastMonthStart).lt('expiry_date', monthStart),
      supabase.from('customer_onboarding').select('id', { count: 'exact', head: true }).eq('account_activated', true).gte('account_activated_at', monthStart),
      supabase.from('referral_logs').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
    ]);

    const allRevenue = totalRevenue.data || [];
    const mrr = (monthlyRevenue.data || []).reduce((s, o) => s + (o.total_amount || 0), 0);
    const arr = mrr * 12;
    const totalRev = allRevenue.reduce((s, o) => s + (o.total_amount || 0), 0);

    const renewalRate = (renewedSubs.count && expiredSubs.count)
      ? Math.round((renewedSubs.count / (renewedSubs.count + expiredSubs.count)) * 100)
      : 100;

    const total = totalCustomers.count || 0;
    const activated = activatedThisMonth.count || 0;
    const activationRate = total > 0 ? Math.round((activated / total) * 100) : 0;

    const referralRate = total > 0
      ? Math.round(((totalReferrals.count || 0) / total) * 100)
      : 0;

    return {
      success: true,
      kpis: {
        customers:       total,
        totalRevenue:    totalRev,
        mrr,
        arr,
        activeSubscriptions: activeSubs.count || 0,
        renewalRate,
        activationRate,
        referralRate,
        asOf: now.toISOString(),
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
