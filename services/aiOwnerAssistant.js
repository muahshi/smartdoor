/**
 * Smart Door — AI Owner Assistant
 * services/aiOwnerAssistant.js
 *
 * PHASE 5 — ADDITIVE ONLY. No SQL migration except sql/55 (owner-feedback
 * columns on the existing ai_call_screenings table). No auth/RBAC changes.
 * No WebRTC changes. Does not touch or duplicate AI Receptionist
 * (services/aiReceptionist.js), AI Voice Receptionist
 * (services/aiVoiceReceptionist.js), or Visitor Intelligence
 * (services/aiReceptionistAnalytics.js) — this module reads the data those
 * features already write and turns it into OWNER-facing decision support.
 * ────────────────────────────────────────────────────────────────────────
 * DESIGN
 *  1. Deterministic, rule-based math only — same design decision as
 *     services/aiInsights.js. No new LLM/Groq calls, no added latency,
 *     no hallucination risk. "AI" here means "derived from the AI-tagged
 *     data already in the system."
 *  2. PRIVACY: this module never stores a family name, phone number,
 *     contact list, or personal relationship anywhere new. It only reads
 *     existing tables (visitor_profiles, visitor_visits, visitor_logs,
 *     message_logs, ai_call_screenings) and the one column it writes
 *     (owner_feedback) is an enum ('correct'|'incorrect') the OWNER sets
 *     about the AI's own decision — never visitor data.
 *  3. PERFORMANCE (item 20): one batched fetch per dashboard render
 *     (getOwnerAssistantData), memoized for a short TTL, shared by every
 *     downstream pure function below — no N+1 queries per widget.
 *  4. EXPLAINABLE AI (item 17): every score/flag/recommendation this
 *     module produces carries a `factors` / `why` field naming the exact
 *     signals that drove it — never a bare number.
 * ────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase.js';

const MS_DAY = 86400000;
const MS_HOUR = 3600000;

// ────────── shared batched fetch + short-TTL memo (perf) ──────────
const _cache = new Map(); // ownerId -> { at, data }
const CACHE_TTL_MS = 30000;

/**
 * One round-trip batch for every function in this module. Callers should
 * fetch this once per dashboard render and pass the result around rather
 * than calling exported helpers that re-fetch internally.
 *
 * @param {string} ownerId
 * @param {{sinceDays?: number, force?: boolean}} [opts]
 */
export async function getOwnerAssistantData(ownerId, { sinceDays = 60, force = false } = {}) {
  if (!ownerId) return _empty();
  const cached = _cache.get(ownerId);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const since = new Date(Date.now() - sinceDays * MS_DAY).toISOString();

  const [profilesRes, visitsRes, logsRes, screeningsRes, messagesRes] = await Promise.allSettled([
    supabase.from('visitor_profiles')
      .select('id, phone, name, first_seen, last_seen, visit_count, blocked, notes')
      .eq('owner_id', ownerId)
      .order('last_seen', { ascending: false })
      .limit(200),
    supabase.from('visitor_visits')
      .select('id, visitor_profile_id, plate_id, purpose, call_type, accepted, duration, call_status, created_at')
      .eq('owner_id', ownerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('visitor_logs')
      .select('id, created_at, event_type, ai_intent, ai_confidence')
      .eq('owner_id', ownerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('ai_call_screenings')
      .select('id, plate_id, visitor_name, visitor_type, company, purpose, confidence, suggested_action, ai_summary, priority, owner_feedback, owner_feedback_note, created_at')
      .eq('owner_id', ownerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('message_logs')
      .select('id, plate_id, message_type, content, priority, created_at')
      .eq('owner_id', ownerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  const data = {
    profiles: _ok(profilesRes),
    visits: _ok(visitsRes),
    logs: _ok(logsRes),
    screenings: _ok(screeningsRes),
    messages: _ok(messagesRes),
    fetchedAt: Date.now(),
  };

  _cache.set(ownerId, { at: Date.now(), data });
  return data;
}

function _ok(settledRes) {
  return (settledRes.status === 'fulfilled' && !settledRes.value.error) ? (settledRes.value.data || []) : [];
}

function _empty() {
  return { profiles: [], visits: [], logs: [], screenings: [], messages: [], fetchedAt: Date.now() };
}

function _visitsFor(data, profileId) {
  return data.visits.filter((v) => v.visitor_profile_id === profileId);
}

// ────────── 1 & 3. RISK SCORING (per known visitor profile) ──────────
/**
 * Deterministic 0-100 risk score for one visitor_profile, built only from
 * that visitor's own recorded visits — never from another visitor's data.
 * @returns {{score:number, level:'low'|'medium'|'high', factors:Array<{label:string, points:number}>}}
 */
export function computeVisitorRiskScore(profile, visits) {
  const factors = [];
  let score = 0;

  if (profile.blocked) {
    score += 40;
    factors.push({ label: 'Marked blocked by owner', points: 40 });
  }

  if (visits.length >= 2) {
    const rejected = visits.filter((v) => v.accepted === false || v.call_status === 'rejected').length;
    const rejectRatio = rejected / visits.length;
    if (rejectRatio >= 0.5) {
      const pts = Math.round(rejectRatio * 25);
      score += pts;
      factors.push({ label: `${Math.round(rejectRatio * 100)}% of visits declined/rejected`, points: pts });
    }
  }

  // Late-night visiting pattern (10 PM – 5 AM)
  if (visits.length >= 3) {
    const nightVisits = visits.filter((v) => {
      const h = new Date(v.created_at).getHours();
      return h >= 22 || h < 5;
    }).length;
    const nightRatio = nightVisits / visits.length;
    if (nightRatio >= 0.4) {
      const pts = Math.round(nightRatio * 20);
      score += pts;
      factors.push({ label: `${Math.round(nightRatio * 100)}% of visits are late-night (10 PM–5 AM)`, points: pts });
    }
  }

  // Rapid repeat attempts — 3+ visits inside a single hour, any day
  const byHourBucket = {};
  visits.forEach((v) => {
    const bucket = Math.floor(new Date(v.created_at).getTime() / MS_HOUR);
    byHourBucket[bucket] = (byHourBucket[bucket] || 0) + 1;
  });
  const burstBucket = Math.max(0, ...Object.values(byHourBucket));
  if (burstBucket >= 3) {
    score += 15;
    factors.push({ label: `${burstBucket} visit attempts within a single hour`, points: 15 });
  }

  // Inconsistent stated purpose (many distinct purposes for a low-count visitor
  // reads as evasive/probing rather than a regular known contact)
  const distinctPurposes = new Set(visits.map((v) => (v.purpose || '').trim().toLowerCase()).filter(Boolean));
  if (visits.length >= 4 && distinctPurposes.size >= visits.length * 0.75) {
    score += 10;
    factors.push({ label: 'Stated a different reason nearly every visit', points: 10 });
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, level, factors };
}

// ────────── 5. SUSPICIOUS VISITOR DETECTION ──────────
/**
 * Real detection (not a static "all clear" string) — flags any visitor
 * profile whose computed risk score crosses the threshold, or who is
 * already blocked. Ranked highest-risk first.
 */
export function detectSuspiciousVisitors(data, { threshold = 40 } = {}) {
  return data.profiles
    .map((p) => {
      const visits = _visitsFor(data, p.id);
      const risk = computeVisitorRiskScore(p, visits);
      return { profileId: p.id, label: p.name || `Visitor ending ${String(p.phone || '').slice(-4)}`, risk, visitCount: p.visit_count || visits.length };
    })
    .filter((r) => r.risk.score >= threshold || r.risk.level === 'high')
    .sort((a, b) => b.risk.score - a.risk.score);
}

// ────────── 6. REPEATED VISITOR INTELLIGENCE ──────────
/**
 * Behavioral trend for one known visitor — frequency direction, typical
 * time-of-day, most common purpose, and visit rhythm. Computed only from
 * that visitor's own visit_visits rows; no cross-visitor comparison.
 */
export function analyzeRepeatVisitorIntelligence(profile, visits) {
  if (!visits.length) {
    return { hasPattern: false };
  }
  const now = Date.now();
  const last30 = visits.filter((v) => now - new Date(v.created_at).getTime() <= 30 * MS_DAY).length;
  const prev30 = visits.filter((v) => {
    const age = now - new Date(v.created_at).getTime();
    return age > 30 * MS_DAY && age <= 60 * MS_DAY;
  }).length;

  let trend = 'steady';
  if (last30 > prev30 * 1.3 && last30 >= 2) trend = 'increasing';
  else if (last30 < prev30 * 0.7 && prev30 >= 2) trend = 'decreasing';

  const hourCounts = new Array(24).fill(0);
  visits.forEach((v) => hourCounts[new Date(v.created_at).getHours()]++);
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  const purposeCounts = {};
  visits.forEach((v) => { if (v.purpose) purposeCounts[v.purpose] = (purposeCounts[v.purpose] || 0) + 1; });
  const topPurposeEntry = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1])[0];

  const sorted = [...visits].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((new Date(sorted[i].created_at) - new Date(sorted[i - 1].created_at)) / MS_DAY);
  }
  const avgGapDays = gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null;

  return {
    hasPattern: true,
    trend,
    last30DayVisits: last30,
    prev30DayVisits: prev30,
    typicalHour: peakHour,
    mostCommonPurpose: topPurposeEntry ? topPurposeEntry[0] : null,
    avgDaysBetweenVisits: avgGapDays,
  };
}

// ────────── 7 & 8. BEHAVIOUR TIMELINE + VISITOR HISTORY CARDS ──────────
const _TIMELINE_ICON = { webrtc: '📹', masked_call: '📞', bell: '🔔', message: '💬' };

export function buildBehaviorTimeline(visits, limit = 30) {
  return [...visits]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map((v) => ({
      at: v.created_at,
      icon: _TIMELINE_ICON[v.call_type] || '👤',
      label: v.purpose || (v.call_type ? v.call_type.replace('_', ' ') : 'Visit'),
      outcome: v.accepted === true ? 'accepted' : v.accepted === false ? 'declined' : (v.call_status || null),
      durationSeconds: v.duration || 0,
    }));
}

/**
 * One composed, explainable card per known visitor — the single object
 * a "Visitor History" UI panel needs, combining profile + risk + repeat
 * intelligence + timeline. Nothing here fabricates a name/relationship;
 * if the owner never labeled the visitor, `label` falls back to a masked
 * phone suffix.
 */
export function buildVisitorHistoryCard(profile, visits) {
  const risk = computeVisitorRiskScore(profile, visits);
  const intel = analyzeRepeatVisitorIntelligence(profile, visits);
  return {
    profileId: profile.id,
    label: profile.name || `Visitor ending ${String(profile.phone || '').slice(-4)}`,
    firstSeen: profile.first_seen,
    lastSeen: profile.last_seen,
    visitCount: profile.visit_count || visits.length,
    blocked: !!profile.blocked,
    risk,
    intelligence: intel,
    timeline: buildBehaviorTimeline(visits),
  };
}

export function getVisitorHistoryCards(data, { limit = 30 } = {}) {
  return data.profiles
    .slice(0, limit)
    .map((p) => buildVisitorHistoryCard(p, _visitsFor(data, p.id)));
}

// ────────── 11. DAILY AI SUMMARY ──────────
export function getDailyAISummary(data) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const todayLogs = data.logs.filter((l) => l.created_at >= startOfToday);
  const todayScreenings = data.screenings.filter((s) => s.created_at >= startOfToday);
  const todayMessages = data.messages.filter((m) => m.created_at >= startOfToday);

  const totalEvents = todayLogs.length + todayScreenings.length;
  if (totalEvents === 0 && todayMessages.length === 0) {
    return { hasActivity: false, text: 'No visitor activity yet today.' };
  }

  const typeCounts = {};
  todayScreenings.forEach((s) => { typeCounts[s.visitor_type] = (typeCounts[s.visitor_type] || 0) + 1; });
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  const needsAttention = todayScreenings.filter((s) => ['Ask Owner', 'Notify Owner'].includes(s.suggested_action)).length;
  const blocked = todayScreenings.filter((s) => s.suggested_action === 'Blocked').length
    + todayLogs.filter((l) => l.event_type === 'spam_blocked').length;
  const emergency = todayMessages.filter((m) => m.message_type === 'emergency').length
    + todayLogs.filter((l) => l.event_type === 'sos' || l.event_type === 'sos_triggered').length;

  const parts = [`${totalEvents} visitor event${totalEvents === 1 ? '' : 's'} today.`];
  if (topType) parts.push(`Most common: ${topType[0]}.`);
  if (needsAttention > 0) parts.push(`${needsAttention} may need your direct attention.`);
  if (blocked > 0) parts.push(`${blocked} blocked/flagged as spam.`);
  if (emergency > 0) parts.push(`⚠️ ${emergency} emergency event${emergency === 1 ? '' : 's'} today.`);

  return {
    hasActivity: true,
    text: parts.join(' '),
    totalEvents,
    needsAttention,
    blocked,
    emergency,
    topType: topType ? topType[0] : null,
  };
}

// ────────── 13. AI SEARCH ──────────
/**
 * Local, deterministic search across the AI-tagged data an owner would
 * plausibly want to find — no new LLM call, purely ILIKE-style matching
 * done client-side against the already-fetched batch.
 * @returns {Array<{source:string, at:string, text:string, meta?:object}>}
 */
export function searchVisitorActivity(data, queryText, limit = 25) {
  const q = (queryText || '').trim().toLowerCase();
  if (!q) return [];
  const hits = [];

  data.screenings.forEach((s) => {
    const hay = [s.visitor_type, s.company, s.purpose, s.ai_summary].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(q)) {
      hits.push({ source: 'ai_screening', at: s.created_at, text: s.ai_summary || `${s.visitor_type} — ${s.purpose || 'no purpose given'}`, meta: { visitorType: s.visitor_type, suggestedAction: s.suggested_action, confidence: s.confidence, screeningId: s.id } });
    }
  });

  data.visits.forEach((v) => {
    if ((v.purpose || '').toLowerCase().includes(q)) {
      hits.push({ source: 'visit', at: v.created_at, text: v.purpose, meta: { callType: v.call_type, accepted: v.accepted } });
    }
  });

  data.profiles.forEach((p) => {
    if ((p.notes || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)) {
      hits.push({ source: 'visitor_profile', at: p.last_seen, text: p.notes || p.name, meta: { profileId: p.id } });
    }
  });

  return hits
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

// ────────── 14 & 17. AI RECOMMENDATION ENGINE (explainable) ──────────
/**
 * Ranked list of actionable recommendations, each carrying a `why` so the
 * owner can see the exact reasoning ("Explainable AI"). Distinct from
 * aiInsights.js's single "Smart Recommendation" card — this is the fuller,
 * multi-item engine that also folds in risk scoring and feedback stats.
 */
export function getAIRecommendations(data) {
  const recs = [];

  const suspicious = detectSuspiciousVisitors(data, { threshold: 55 });
  if (suspicious.length > 0) {
    const top = suspicious[0];
    recs.push({
      id: 'review_high_risk_visitor',
      priority: 'high',
      title: 'Review a high-risk visitor',
      text: `${top.label} has a risk score of ${top.risk.score}/100.`,
      why: top.risk.factors.map((f) => f.label),
    });
  }

  const unlabeled = data.profiles.filter((p) => (p.visit_count || 1) > 1 && !p.name).length;
  if (unlabeled >= 2) {
    recs.push({
      id: 'label_repeat_visitors',
      priority: 'medium',
      title: 'Label your repeat visitors',
      text: `${unlabeled} repeat visitors have no saved name — labeling speeds up recognition next time.`,
      why: [`${unlabeled} visitor profiles with visit_count > 1 and no name set`],
    });
  }

  const lowConfidence = data.screenings.filter((s) => Number(s.confidence) < 0.6 && !s.owner_feedback);
  if (lowConfidence.length >= 2) {
    recs.push({
      id: 'review_low_confidence_screenings',
      priority: 'medium',
      title: 'Review uncertain AI decisions',
      text: `${lowConfidence.length} recent screenings had confidence below 60% and haven't been reviewed.`,
      why: lowConfidence.slice(0, 3).map((s) => `${s.visitor_type} at ${new Date(s.created_at).toLocaleString('en-IN')} — ${Math.round(Number(s.confidence) * 100)}% confidence`),
    });
  }

  const spamPattern = detectSpamPattern(data);
  if (spamPattern.flagged) {
    recs.push({
      id: 'possible_spam_campaign',
      priority: 'high',
      title: 'Possible repeated spam pattern',
      text: spamPattern.summary,
      why: spamPattern.examples,
    });
  }

  return recs.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1));
}

// ────────── 15. OWNER FEEDBACK LEARNING ──────────
/**
 * Persists the owner's correctness label for one past screening. Display
 * layer only — never rewrites the live AI receptionist prompt/logic.
 */
export async function submitOwnerFeedback(screeningId, feedback, note = null) {
  if (!screeningId || !['correct', 'incorrect'].includes(feedback)) return { success: false };
  try {
    const { error } = await supabase
      .from('ai_call_screenings')
      .update({ owner_feedback: feedback, owner_feedback_note: note, owner_feedback_at: new Date().toISOString() })
      .eq('id', screeningId);
    if (error) {
      console.error('[AIOwnerAssistant] submitOwnerFeedback failed:', error);
      return { success: false };
    }
    return { success: true };
  } catch (err) {
    console.error('[AIOwnerAssistant] submitOwnerFeedback threw:', err);
    return { success: false };
  }
}

/**
 * Historical accuracy per visitor_type, from the owner's own feedback —
 * shown as an explainable trust signal next to future AI decisions of the
 * same type. Never fed back into groq.js's classification prompt.
 */
export function getFeedbackAccuracyByType(data) {
  const byType = {};
  data.screenings.forEach((s) => {
    if (!s.owner_feedback) return;
    byType[s.visitor_type] = byType[s.visitor_type] || { correct: 0, incorrect: 0 };
    byType[s.visitor_type][s.owner_feedback]++;
  });
  return Object.entries(byType).map(([visitorType, counts]) => {
    const total = counts.correct + counts.incorrect;
    return {
      visitorType,
      total,
      accuracyPct: total ? Math.round((counts.correct / total) * 100) : null,
      correct: counts.correct,
      incorrect: counts.incorrect,
    };
  });
}

// ────────── 19. SMART ESCALATION ──────────
/**
 * Pure decision function — the caller (owner-facing UI, already holding a
 * live screening result) decides whether to escalate. Composes with the
 * EXISTING notificationDispatcher 'ai_escalation' event type rather than
 * creating a new notification channel.
 */
export function shouldEscalate(screening, riskScore = null) {
  const reasons = [];
  if (Number(screening?.confidence) < 0.55) reasons.push(`Low AI confidence (${Math.round(Number(screening.confidence) * 100)}%)`);
  if (screening?.priority === 'Critical') reasons.push('Marked Critical priority');
  if (riskScore && riskScore.level === 'high') reasons.push(`High visitor risk score (${riskScore.score}/100)`);
  if (screening?.suggestedAction === 'Ask Owner' && reasons.length > 0) reasons.push('AI could not confidently decide without you');
  return { escalate: reasons.length > 0, reasons };
}

// ────────── 18. SPAM DETECTION (pattern-level, additive to keyword check) ──────────
/**
 * services/aiReceptionist.js already keyword-matches an individual
 * conversation as "Sales Person"/spam. This adds a SEPARATE, cross-visit
 * signal: multiple screenings in a short window with near-identical
 * AI summaries/purposes — a pattern a single-conversation classifier
 * can't see.
 */
export function detectSpamPattern(data, { windowHours = 6, minRepeat = 3 } = {}) {
  const since = Date.now() - windowHours * MS_HOUR;
  const recent = data.screenings.filter((s) => new Date(s.created_at).getTime() >= since);
  const counts = {};
  recent.forEach((s) => {
    const key = `${s.visitor_type}::${(s.purpose || '').trim().toLowerCase()}`;
    if (!key.trim()) return;
    counts[key] = (counts[key] || []).concat(s);
  });
  const flaggedEntry = Object.entries(counts).find(([, arr]) => arr.length >= minRepeat);
  if (!flaggedEntry) return { flagged: false };
  const [, arr] = flaggedEntry;
  return {
    flagged: true,
    summary: `${arr.length} near-identical "${arr[0].visitor_type}" calls in the last ${windowHours} hours.`,
    examples: arr.slice(0, 3).map((s) => `${new Date(s.created_at).toLocaleTimeString('en-IN')} — ${s.ai_summary || s.purpose}`),
  };
}

export default {
  getOwnerAssistantData,
  computeVisitorRiskScore,
  detectSuspiciousVisitors,
  analyzeRepeatVisitorIntelligence,
  buildBehaviorTimeline,
  buildVisitorHistoryCard,
  getVisitorHistoryCards,
  getDailyAISummary,
  searchVisitorActivity,
  getAIRecommendations,
  submitOwnerFeedback,
  getFeedbackAccuracyByType,
  shouldEscalate,
  detectSpamPattern,
};
