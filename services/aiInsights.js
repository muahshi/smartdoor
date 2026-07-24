/**
 * My Smart Door — AI Insight Cards Service
 * services/aiInsights.js
 *
 * PHASE 7B — ADDITIVE ONLY. No SQL migration. No auth/RBAC/notification/
 * routing/QR changes. No new tables or columns.
 * ────────────────────────────────────────────────────────────────────────
 * Generates short, human-readable "AI Insight" cards for the owner
 * dashboard using data that is ALREADY written in production today:
 *   - visitor_logs     (event_type, ai_intent, created_at)
 *   - visitor_memory    (visit_count, visitor_label, last_seen)
 *   - message_logs      (message_type, created_at)
 *
 * Design decisions (read before modifying):
 *   1. Deterministic, rule-based math only — NO call to groq-proxy or any
 *      external AI API. This keeps the feature at zero added latency,
 *      zero new third-party dependency, and zero risk of a hallucinated
 *      claim reaching an owner. "AI Insight" here means "insight derived
 *      from the AI-tagged data already in the system" (ai_intent etc.),
 *      not a live LLM call.
 *   2. Every insight is gated behind a minimum-data threshold. If there
 *      isn't enough history to say something meaningful, that insight
 *      is simply omitted — never guessed or padded with fake numbers.
 *   3. Purely additive read layer: reuses existing RLS policies
 *      (message_logs_select_own, visitor_logs already owner-scoped,
 *      "Owners view their visitor memory" on visitor_memory). No policy
 *      changes required or made.
 *   4. Does not duplicate existing widgets 1:1 — e.g. Smart Analytics
 *      (js/ownerPremium.js) already shows a single peak HOUR and a raw
 *      spam-blocked count; this module reports a peak 3-hour WINDOW and
 *      week-over-week trend deltas instead, which are new figures.
 * ────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase.js';

const MS_DAY = 86400000;

function pct(curr, prev) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12} ${period}`;
}

function isDeliveryIntent(intent) {
  return !!intent && /deliver|courier|parcel|package/i.test(intent);
}

function isSecurityEvent(eventType) {
  return eventType === 'spam_blocked' || eventType === 'sos' || eventType === 'sos_triggered';
}

/**
 * @param {string} ownerId
 * @returns {Promise<{success:boolean, insights:Array<object>, generatedAt?:string, error?:string}>}
 */
export async function getAIInsights(ownerId) {
  try {
    if (!ownerId) return { success: false, error: 'Missing ownerId', insights: [] };

    const now = new Date();
    const since60 = new Date(now.getTime() - 60 * MS_DAY);
    const since14 = new Date(now.getTime() - 14 * MS_DAY);

    const [logsRes, memoryRes, messagesRes] = await Promise.allSettled([
      supabase
        .from('visitor_logs')
        .select('created_at, event_type, ai_intent')
        .eq('owner_id', ownerId)
        .gte('created_at', since60.toISOString()),
      supabase
        .from('visitor_memory')
        .select('visit_count, visitor_label, last_seen')
        .eq('owner_id', ownerId),
      supabase
        .from('message_logs')
        .select('message_type, created_at')
        .eq('owner_id', ownerId)
        .gte('created_at', since14.toISOString()),
    ]);

    const logs     = (logsRes.status === 'fulfilled' && !logsRes.value.error) ? (logsRes.value.data || []) : [];
    const memory   = (memoryRes.status === 'fulfilled' && !memoryRes.value.error) ? (memoryRes.value.data || []) : [];
    const messages = (messagesRes.status === 'fulfilled' && !messagesRes.value.error) ? (messagesRes.value.data || []) : [];

    const insights = [];

    // ── time windows ──
    const d7  = new Date(now.getTime() - 7 * MS_DAY);
    const d14 = new Date(now.getTime() - 14 * MS_DAY);
    const d28 = new Date(now.getTime() - 28 * MS_DAY);

    const visitTypes = new Set(['qr_scan', 'bell_ring', 'ai_intent', 'ai_conversation']);
    const visits = logs.filter((l) => visitTypes.has(l.event_type));

    const last7Visits  = visits.filter((l) => new Date(l.created_at) >= d7);
    const prev7Visits  = visits.filter((l) => new Date(l.created_at) >= d14 && new Date(l.created_at) < d7);
    const last14Visits = visits.filter((l) => new Date(l.created_at) >= d14);
    const prev14Visits = visits.filter((l) => new Date(l.created_at) >= d28 && new Date(l.created_at) < d14);

    // ── 1. Peak visiting window (3-hour rolling block — distinct from the
    //       single peak-HOUR stat already shown in Smart Analytics) ──
    if (visits.length >= 5) {
      const hourCounts = new Array(24).fill(0);
      visits.forEach((l) => hourCounts[new Date(l.created_at).getHours()]++);
      let bestStart = 0, bestSum = -1;
      for (let h = 0; h < 24; h++) {
        const sum = hourCounts[h] + hourCounts[(h + 1) % 24] + hourCounts[(h + 2) % 24];
        if (sum > bestSum) { bestSum = sum; bestStart = h; }
      }
      if (bestSum > 0) {
        insights.push({
          id: 'peak_window',
          icon: '🕓',
          tone: 'info',
          title: 'Peak Visiting Hours',
          text: `Most visitors arrive between ${formatHour(bestStart)} and ${formatHour((bestStart + 3) % 24)}.`,
        });
      }
    }

    // ── 2. Visitor trend change (week over week) ──
    if (last7Visits.length > 0 || prev7Visits.length > 0) {
      const change = pct(last7Visits.length, prev7Visits.length);
      if (change !== 0) {
        insights.push({
          id: 'visitor_trend',
          icon: change > 0 ? '📈' : '📉',
          tone: change > 0 ? 'positive' : 'neutral',
          title: 'Visitor Trend',
          text: `Visitor traffic ${change > 0 ? 'increased' : 'decreased'} ${Math.abs(change)}% this week vs last week.`,
        });
      } else if (last7Visits.length > 0) {
        insights.push({
          id: 'visitor_trend_steady',
          icon: '📊',
          tone: 'neutral',
          title: 'Visitor Trend',
          text: `Visitor traffic stayed steady this week (${last7Visits.length} visits).`,
        });
      }
    }

    // ── 3. Courier / delivery traffic trend (14-day windows — lower
    //       frequency category needs a wider window to avoid noise) ──
    const courierLast14 = last14Visits.filter((l) => isDeliveryIntent(l.ai_intent)).length;
    const courierPrev14 = prev14Visits.filter((l) => isDeliveryIntent(l.ai_intent)).length;
    if (courierLast14 + courierPrev14 >= 3) {
      const change = pct(courierLast14, courierPrev14);
      if (change !== 0) {
        insights.push({
          id: 'courier_trend',
          icon: '📦',
          tone: 'info',
          title: 'Courier Traffic',
          text: `Courier/delivery visits ${change > 0 ? 'increased' : 'decreased'} ${Math.abs(change)}% over the last 2 weeks.`,
        });
      }
    }

    // ── 4. Repeat visitor insight (from visitor_memory) ──
    if (memory.length >= 2) {
      const repeat = memory.filter((m) => (m.visit_count || 1) > 1);
      if (repeat.length > 0) {
        const repeatPct = Math.round((repeat.length / memory.length) * 100);
        const top = repeat.slice().sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))[0];
        const label = top.visitor_label ? ` — most frequent: ${top.visitor_label} (${top.visit_count} visits)` : '';
        insights.push({
          id: 'repeat_visitors',
          icon: '🔁',
          tone: 'positive',
          title: 'Repeat Visitor Insight',
          text: `${repeatPct}% of recognized visitors have visited more than once${label}.`,
        });
      }
    }

    // ── 5. Security observation (spam/SOS/emergency trend, week over week) ──
    const secLast7 = logs.filter((l) => isSecurityEvent(l.event_type) && new Date(l.created_at) >= d7).length;
    const secPrev7 = logs.filter((l) => isSecurityEvent(l.event_type) && new Date(l.created_at) >= d14 && new Date(l.created_at) < d7).length;
    const emergencyMsgs7 = messages.filter((m) => m.message_type === 'emergency' && new Date(m.created_at) >= d7).length;

    if (secLast7 + secPrev7 + emergencyMsgs7 === 0 && visits.length >= 5) {
      insights.push({
        id: 'security_clear',
        icon: '🛡️',
        tone: 'positive',
        title: 'Security Observation',
        text: 'No spam, SOS, or emergency events this week — all clear.',
      });
    } else if (secLast7 > secPrev7) {
      insights.push({
        id: 'security_rising',
        icon: '⚠️',
        tone: 'warning',
        title: 'Security Observation',
        text: `Blocked/flagged visitor events rose this week (${secLast7} vs ${secPrev7} last week). Worth a quick review.`,
      });
    }

    // ── 6. Weekly AI summary (deterministic template — no LLM call) ──
    if (visits.length > 0) {
      const intentCounts = {};
      last7Visits.forEach((l) => { if (l.ai_intent) intentCounts[l.ai_intent] = (intentCounts[l.ai_intent] || 0) + 1; });
      const topIntentEntry = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0];
      const topIntent = topIntentEntry ? topIntentEntry[0] : null;

      const parts = [`${last7Visits.length} visitor ${last7Visits.length === 1 ? 'event' : 'events'} this week.`];
      if (topIntent) parts.push(`Most common: ${topIntent}.`);
      parts.push(secLast7 > 0 ? `${secLast7} security event${secLast7 === 1 ? '' : 's'} flagged.` : 'No security concerns.');

      insights.push({
        id: 'weekly_summary',
        icon: '🧾',
        tone: 'info',
        title: 'Weekly AI Summary',
        text: parts.join(' '),
      });
    }

    // ── 7. Smart recommendation (conservative, data-gated, at most one) ──
    const unlabeledRepeat = memory.filter((m) => (m.visit_count || 1) > 1 && !m.visitor_label).length;
    if (unlabeledRepeat >= 2) {
      insights.push({
        id: 'recommend_label',
        icon: '💡',
        tone: 'suggestion',
        title: 'Smart Recommendation',
        text: `You have ${unlabeledRepeat} repeat visitors without a saved label. Labeling them (e.g. "Maid", "Electrician") helps SmartDoor recognize them faster next time.`,
      });
    } else if (secLast7 > secPrev7 && secLast7 >= 2) {
      insights.push({
        id: 'recommend_review',
        icon: '💡',
        tone: 'suggestion',
        title: 'Smart Recommendation',
        text: 'Blocked/flagged visitor activity is rising — consider reviewing your Privacy Shield and Night Security settings.',
      });
    }

    return { success: true, insights, generatedAt: now.toISOString() };
  } catch (err) {
    console.error('[AIInsights] getAIInsights error:', err);
    return { success: false, error: err.message, insights: [] };
  }
}

export default { getAIInsights };
