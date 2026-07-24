/**
 * My Smart Door — Customer Growth Service
 * services/customerGrowth.js
 *
 * Phase 12 — First 100 Customers
 * Handles: Early Access segmentation, First-100 dashboard, expanded
 *          feedback engine (confusion points + 3 rating types), customer
 *          interviews, PMF tracking, referral links, review collection,
 *          support health, bug/feature triage, usage insights, churn,
 *          and persisted customer health scores.
 *
 * Depends on sql/13_customer_growth_schema.sql being run.
 * Additive only — does not modify customerSuccess.js, support.js,
 * admin.js, customers.js, or any UI file.
 */

import { supabase } from './supabase.js';
import { adminAuditLog } from './admin.js';
import { getHealthScore } from './customerSuccess.js';

// ────────── CUSTOMER SEGMENTS (Early Access Program) ──────────

export const CUSTOMER_SEGMENTS = {
  beta:         { label: 'Beta User',        color: '#8B5CF6' },
  early_access: { label: 'Early Access',     color: '#3B82F6' },
  paying:       { label: 'Paying Customer',  color: '#10B981' },
  vip:          { label: 'VIP Customer',     color: '#F59E0B' },
};

export async function assignSegment(ownerId, segment, { source = 'manual', assignedBy = 'system', notes = '' } = {}) {
  if (!CUSTOMER_SEGMENTS[segment]) return { success: false, error: 'Invalid segment.' };
  try {
    const { data: before } = await supabase.from('customer_segments').select('*').eq('owner_id', ownerId).maybeSingle();

    const { data, error } = await supabase
      .from('customer_segments')
      .upsert({ owner_id: ownerId, segment, source, assigned_by: assignedBy, notes, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('segment_assigned', 'customer_segments', ownerId, before || {}, data, `Segment set to ${segment}`);
    return { success: true, segment: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getSegment(ownerId) {
  try {
    const { data, error } = await supabase.from('customer_segments').select('*').eq('owner_id', ownerId).maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, segment: data || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getSegmentBreakdown() {
  try {
    const { data, error } = await supabase.from('customer_segment_breakdown_view').select('*');
    if (error) return { success: false, error: error.message };

    const breakdown = { beta: 0, early_access: 0, paying: 0, vip: 0 };
    (data || []).forEach(row => { breakdown[row.segment] = row.count; });

    return { success: true, breakdown };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function listBySegment(segment, { limit = 50, offset = 0 } = {}) {
  try {
    const { data, error, count } = await supabase
      .from('customer_segments')
      .select('*, users!owner_id(full_name, phone, email)', { count: 'exact' })
      .eq('segment', segment)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, customers: data || [], total: count || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── FIRST 100 DASHBOARD ──────────

export async function getFirst100Dashboard() {
  try {
    const { data, error } = await supabase.from('first_100_dashboard_view').select('*').single();
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      dashboard: {
        totalCustomers:        data.total_customers || 0,
        activatedCustomers:    data.activated_customers || 0,
        activeCustomers:       data.active_customers || 0,
        pendingActivations:    data.pending_activations || 0,
        openSupportTickets:    data.open_support_tickets || 0,
        renewalsDue30Days:     data.renewals_due_30d || 0,
        avgProductSatisfaction: Number(data.avg_product_satisfaction) || 0,
        avgNpsSatisfaction:     Number(data.avg_nps_satisfaction) || 0,
        asOf: new Date().toISOString(),
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── FEEDBACK ENGINE (confusion points + structured ratings) ──────────
// All stored in feedback_logs.context, kept distinct from the generic
// dashboard star-rating context ('dashboard') already used elsewhere.

export async function submitConfusionPoint(ownerId, comment) {
  if (!comment) return { success: false, error: 'Comment required.' };
  try {
    const { error } = await supabase.from('feedback_logs').insert({
      owner_id: ownerId, rating: 0, comment, context: 'confusion_point',
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function _submitRating(ownerId, context, rating, comment) {
  if (rating < 1 || rating > 5) return { success: false, error: 'Rating must be 1-5.' };
  try {
    const { error } = await supabase.from('feedback_logs').insert({
      owner_id: ownerId, rating, comment: comment || null, context,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export const submitProductRating       = (ownerId, rating, comment) => _submitRating(ownerId, 'product_rating', rating, comment);
export const submitManufacturingRating = (ownerId, rating, comment) => _submitRating(ownerId, 'manufacturing_rating', rating, comment);
export const submitDeliveryRating      = (ownerId, rating, comment) => _submitRating(ownerId, 'delivery_rating', rating, comment);

export async function getFeedbackEngineSummary() {
  try {
    const [bugsRes, featuresRes, feedbackRes, npsRes] = await Promise.all([
      supabase.from('bug_reports').select('status, severity, assigned_to, resolved_at'),
      supabase.from('feature_requests').select('status, priority, upvotes'),
      supabase.from('feedback_logs').select('rating, context'),
      supabase.from('nps_responses').select('score, category'),
    ]);

    const bugs = bugsRes.data || [];
    const features = featuresRes.data || [];
    const feedback = feedbackRes.data || [];
    const nps = npsRes.data || [];

    const avgByContext = (ctx) => {
      const rows = feedback.filter(f => f.context === ctx && f.rating > 0);
      return rows.length ? +(rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(2) : 0;
    };

    return {
      success: true,
      summary: {
        bugs: {
          total: bugs.length,
          open: bugs.filter(b => b.status === 'open').length,
          critical: bugs.filter(b => b.severity === 'critical').length,
          unassigned: bugs.filter(b => !b.assigned_to && b.status !== 'fixed' && b.status !== 'wontfix').length,
        },
        features: {
          total: features.length,
          open: features.filter(f => f.status === 'open').length,
          highPriority: features.filter(f => f.priority === 'high' || f.priority === 'critical').length,
          topVoted: features.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 5),
        },
        confusionPoints: feedback.filter(f => f.context === 'confusion_point').length,
        productRating:        avgByContext('product_rating'),
        manufacturingRating:  avgByContext('manufacturing_rating'),
        deliveryRating:       avgByContext('delivery_rating'),
        dashboardRating:      avgByContext('dashboard'),
        npsSatisfaction: (() => {
          const scores = nps.filter(n => n.category === 'satisfaction').map(n => n.score);
          if (!scores.length) return 0;
          const promoters = scores.filter(s => s >= 9).length;
          const detractors = scores.filter(s => s <= 6).length;
          return Math.round(((promoters - detractors) / scores.length) * 100);
        })(),
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── CUSTOMER INTERVIEWS ──────────

export async function recordInterview(ownerId, {
  interviewDate = new Date().toISOString(), conductedBy, channel = 'call',
  feedbackNotes, problemsFound = [], requestedFeatures = [],
  sentiment = 'neutral', followUpNeeded = false, followUpNotes = '',
}) {
  try {
    const { data, error } = await supabase.from('customer_interviews').insert({
      owner_id: ownerId,
      interview_date: interviewDate,
      conducted_by: conductedBy,
      channel,
      feedback_notes: feedbackNotes,
      problems_found: problemsFound,
      requested_features: requestedFeatures,
      sentiment,
      follow_up_needed: followUpNeeded,
      follow_up_notes: followUpNotes,
    }).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, interview: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function listInterviews({ limit = 50, offset = 0, followUpOnly = false } = {}) {
  try {
    let qb = supabase
      .from('customer_interviews')
      .select('*, users!owner_id(full_name, phone)', { count: 'exact' })
      .order('interview_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (followUpOnly) qb = qb.eq('follow_up_needed', true);

    const { data, error, count } = await qb;
    if (error) return { success: false, error: error.message };
    return { success: true, interviews: data || [], total: count || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── PRODUCT-MARKET-FIT TRACKING ──────────

export async function getPMFMetrics() {
  try {
    const { data, error } = await supabase.from('pmf_metrics_view').select('*').single();
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      pmf: {
        dailyActiveOwners:   data.daily_active_owners || 0,
        weeklyActiveOwners:  data.weekly_active_owners || 0,
        monthlyActiveOwners: data.monthly_active_owners || 0,
        retentionRatePct:    Number(data.retention_rate_pct) || 0,
        renewalRatePct:      Number(data.renewal_rate_pct) || 0,
        avgRenewalIntent:    Number(data.avg_renewal_intent) || 0,   // 0-10 NPS-style
        avgReferralIntent:   Number(data.avg_referral_intent) || 0,  // 0-10 NPS-style
        avgUsageEventsPerOwner30d: Number(data.avg_usage_events_per_owner_30d) || 0,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── REFERRAL PROGRAM (links + leaderboard) ──────────
// Builds on services/customerSuccess.js — getReferralCode() / trackReferral()
// already create the code and log conversions. This adds the shareable
// link and an admin leaderboard view.

export function buildReferralLink(referralCode, baseUrl = 'https://mysmartdoor.in') {
  return `${baseUrl.replace(/\/$/, '')}/index.html?ref=${encodeURIComponent(referralCode)}`;
}

export async function getReferralLeaderboard(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('owner_id, referral_code, total_referrals, successful_referrals, reward_earned, users!owner_id(full_name, phone)')
      .order('successful_referrals', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, leaderboard: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── REVIEW COLLECTION (post-activation) ──────────

export async function requestReview(ownerId, orderId = null, channel = 'whatsapp') {
  try {
    const { data, error } = await supabase.from('customer_reviews').insert({
      owner_id: ownerId, order_id: orderId, channel, status: 'requested',
    }).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, review: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function submitReview(reviewId, { productRating, manufacturingRating, deliveryRating, testimonial, publicConsent = false }) {
  try {
    const { data, error } = await supabase
      .from('customer_reviews')
      .update({
        product_rating: productRating,
        manufacturing_rating: manufacturingRating,
        delivery_rating: deliveryRating,
        testimonial: testimonial || null,
        public_consent: publicConsent,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, review: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getReviewsSummary() {
  try {
    const { data, error } = await supabase
      .from('customer_reviews')
      .select('product_rating, manufacturing_rating, delivery_rating, status, testimonial, public_consent');

    if (error) return { success: false, error: error.message };

    const submitted = (data || []).filter(r => r.status === 'submitted');
    const avg = (key) => {
      const vals = submitted.map(r => r[key]).filter(v => v != null);
      return vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : 0;
    };

    return {
      success: true,
      summary: {
        requested: (data || []).length,
        submitted: submitted.length,
        responseRatePct: data?.length ? Math.round((submitted.length / data.length) * 100) : 0,
        avgProductRating: avg('product_rating'),
        avgManufacturingRating: avg('manufacturing_rating'),
        avgDeliveryRating: avg('delivery_rating'),
        publicTestimonials: submitted.filter(r => r.public_consent && r.testimonial).length,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── SUPPORT HEALTH (resolution time, escalations, repeat issues) ──────────

export async function getSupportHealthMetrics() {
  try {
    const { data, error } = await supabase.from('support_health_view').select('*').single();
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      health: {
        avgResolutionHours: Number(data.avg_resolution_hours) || 0,
        escalatedTickets:   data.escalated_tickets || 0,
        repeatIssueCustomers: data.repeat_issue_customers || 0,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function escalateTicket(ticketId, reason) {
  try {
    const { data: before } = await supabase.from('support_tickets').select('*').eq('id', ticketId).single();

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ escalated: true, escalated_at: new Date().toISOString(), escalated_reason: reason, priority: 'critical', updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('ticket_escalated', 'support', ticketId, before, data, reason);
    return { success: true, ticket: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── BUG TRACKING (assignment + resolution) ──────────

export async function assignBug(bugId, adminId) {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .update({ assigned_to: adminId, status: 'investigating', updated_at: new Date().toISOString() })
      .eq('id', bugId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, bug: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function resolveBug(bugId, adminNotes = '') {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .update({ status: 'fixed', resolved_at: new Date().toISOString(), admin_notes: adminNotes, updated_at: new Date().toISOString() })
      .eq('id', bugId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, bug: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── FEATURE REQUEST TRIAGE ──────────

export async function setFeaturePriority(featureId, priority) {
  if (!['low', 'medium', 'high', 'critical'].includes(priority)) {
    return { success: false, error: 'Invalid priority.' };
  }
  try {
    const { data, error } = await supabase
      .from('feature_requests')
      .update({ priority, updated_at: new Date().toISOString() })
      .eq('id', featureId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, feature: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function upvoteFeature(featureId) {
  try {
    const { data: row, error: readErr } = await supabase.from('feature_requests').select('upvotes').eq('id', featureId).single();
    if (readErr) return { success: false, error: readErr.message };

    const { data, error } = await supabase
      .from('feature_requests')
      .update({ upvotes: (row.upvotes || 0) + 1 })
      .eq('id', featureId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, feature: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── USAGE INSIGHTS ──────────
// logFeatureUsage: fire-and-forget ping. Call from any flow you want
// visibility into — does not require a schema change per feature.

export async function logFeatureUsage(ownerId, featureKey) {
  if (!ownerId || !featureKey) return { success: false, error: 'ownerId and featureKey required.' };
  try {
    const { error } = await supabase.from('feature_usage_events').insert({ owner_id: ownerId, feature_key: featureKey });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getUsageInsights() {
  try {
    const [featureRes, visitorRes, callRes, voiceRes, sosRes] = await Promise.all([
      supabase.from('feature_usage_summary_view').select('*'),
      supabase.from('visitor_logs').select('id', { count: 'exact', head: true }),
      supabase.from('call_logs').select('id', { count: 'exact', head: true }),
      supabase.from('voice_notes').select('id', { count: 'exact', head: true }),
      supabase.from('visitor_logs').select('id', { count: 'exact', head: true }).eq('intent', 'emergency'),
    ]);

    const features = featureRes.data || [];

    return {
      success: true,
      insights: {
        mostUsedFeatures: features.slice(0, 5),
        leastUsedFeatures: features.slice(-5).reverse(),
        visitorActions: visitorRes.count || 0,
        callUsage: callRes.count || 0,
        voiceNotes: voiceRes.count || 0,
        sosUsage: sosRes.count || 0,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── CHURN ANALYSIS ──────────

export async function getChurnAnalysis() {
  try {
    const { data, error } = await supabase.from('churn_analysis_view').select('*').single();
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      churn: {
        inactiveCustomers30d:   data.inactive_customers_30d || 0,
        expiredSubscriptions:   data.expired_subscriptions || 0,
        failedRenewals:         data.failed_renewals || 0,
        lowEngagementCustomers: data.low_engagement_customers || 0,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── CUSTOMER HEALTH SCORE — PERSISTENCE ──────────
// services/customerSuccess.js:getHealthScore() computes a live score but
// never writes it to the customer_health table, even though the ops
// dashboard reads breakdown counts from that table. These two functions
// close that gap — required for the dashboard numbers to be real.

export async function recalculateHealthScore(ownerId) {
  try {
    const result = await getHealthScore(ownerId);
    if (!result.success) return result;

    const { score, tier, factors } = result.health;
    const { error } = await supabase
      .from('customer_health')
      .upsert({ owner_id: ownerId, score, tier, factors, calculated_at: new Date().toISOString() }, { onConflict: 'owner_id' });

    if (error) return { success: false, error: error.message };
    return { success: true, health: result.health };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function bulkRecalculateHealthScores() {
  try {
    const { data: owners, error } = await supabase.from('users').select('id');
    if (error) return { success: false, error: error.message };

    let updated = 0;
    let failed = 0;
    for (const owner of owners || []) {
      const res = await recalculateHealthScore(owner.id);
      if (res.success) updated++; else failed++;
    }

    return { success: true, updated, failed, total: (owners || []).length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
