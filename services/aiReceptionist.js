/**
 * Smart Door — AI Receptionist (pre-call screening)
 * services/aiReceptionist.js
 *
 * Client for sql/52_ai_call_screening.sql. This is the AI layer that
 * answers a visitor's Call tap BEFORE the (untouched) WebRTC ring /
 * masked-call flow is placed — a short structured Q&A, a visitor-type
 * classification, and a summary the owner sees on their ring card.
 *
 * Does not touch services/webrtcCall.js, services/webrtcOwnerCall.js,
 * services/webrtcSignaling.js, or any ICE/STUN/TURN/signaling code.
 * Classification calls the same groq-proxy Edge Function the existing
 * AI Chat Receptionist already uses (visitor.html's handleAISend), with
 * its own structured prompt for call screening — reused infra, separate
 * concern. Fail-silent by design (same trust model as
 * services/visitorMemory.js and services/webrtcCall.js's _logAttempt):
 * a failure here must never block the visitor's call.
 */

import { supabase } from './supabase.js';

// Canonical visitor-type taxonomy the AI classifies into.
export const VISITOR_TYPES = [
  'Delivery Partner', 'Courier', 'Family', 'Friend', 'Guest', 'Maid',
  'Driver', 'Technician', 'Society Staff', 'Unknown Visitor',
  'Sales Person', 'Emergency',
];

function _cfg() {
  return {
    url: window.__SD_CONFIG__?.supabaseUrl || '',
    anonKey: window.__SD_CONFIG__?.supabaseAnon || '',
  };
}

/**
 * Classifies a visitor's answers from the pre-call screening into a
 * structured result. Tries the groq-proxy Edge Function first (same
 * proxy the AI Chat Receptionist uses); falls back to a deterministic
 * keyword classifier if the proxy is unreachable or mis-parses — the
 * visitor is never blocked waiting on the network.
 *
 * @param {object} answers
 * @param {string} [answers.purposeChip]     one of the quick-select chips the visitor tapped
 * @param {string} [answers.company]         delivery/courier company, if given
 * @param {string} [answers.visitingWhom]     who they're here to see, if given
 * @param {string} [answers.freeText]        free-text reason, if given
 * @param {boolean} [answers.expected]        visitor said they're expected
 * @param {object} [context]
 * @param {string} [context.aiName]
 * @param {string} [context.ownerLabel]
 * @param {string} [context.ownerStatus]
 * @returns {Promise<{visitorType:string, confidence:number, suggestedAction:string, aiSummary:string, priority:string}>}
 */
export async function classifyCallPurpose(answers = {}, context = {}) {
  const { purposeChip = '', company = '', visitingWhom = '', freeText = '', expected = null } = answers;
  const { aiName = 'Priya', ownerLabel = 'the resident', ownerStatus = 'available' } = context;

  const { url, anonKey } = _cfg();
  if (url && anonKey) {
    try {
      const systemPrompt = `You are ${aiName}, an AI receptionist for Smart Door screening a visitor BEFORE connecting their call to ${ownerLabel}.

Classify the visitor into exactly one of these types:
${VISITOR_TYPES.join(', ')}

Owner's current status: ${ownerStatus}.

Given the visitor's short answers, respond ONLY with this valid JSON (no markdown, no backticks):
{"visitorType":"<one of the exact types above>","confidence":0.0-1.0,"suggestedAction":"Accept|Decline|Ask Owner|Notify Owner|Blocked","aiSummary":"<one short sentence for the owner, e.g. 'Amazon Delivery — package expected'>","priority":"Low|Normal|High|Critical"}`;

      const userContent = `Purpose selected: ${purposeChip || 'not specified'}
Company: ${company || 'n/a'}
Visiting: ${visitingWhom || 'n/a'}
Expected by owner: ${expected === null ? 'unknown' : expected ? 'yes' : 'no'}
Additional notes: ${freeText || 'n/a'}`;

      const res = await fetch(`${url}/functions/v1/groq-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      });
      const data = await res.json();
      if (data?.success && data.content) {
        const clean = data.content.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        if (parsed?.visitorType) {
          return {
            visitorType: parsed.visitorType,
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.7)),
            suggestedAction: parsed.suggestedAction || 'Notify Owner',
            aiSummary: parsed.aiSummary || `${parsed.visitorType} — awaiting owner response`,
            priority: parsed.priority || 'Normal',
          };
        }
      }
    } catch (_) {
      // fall through to deterministic fallback below
    }
  }

  return _fallbackClassify({ purposeChip, company, visitingWhom, freeText, expected });
}

/** Deterministic, offline-safe fallback — never blocks the call flow. */
function _fallbackClassify({ purposeChip, company, visitingWhom, freeText, expected }) {
  const chip = (purposeChip || '').toLowerCase();
  const text = (freeText || '').toLowerCase();

  const map = [
    { key: 'emergency', type: 'Emergency', action: 'Accept', priority: 'Critical', confidence: 0.98 },
    { key: 'delivery', type: 'Delivery Partner', action: 'Notify Owner', priority: 'Normal', confidence: 0.9 },
    { key: 'courier', type: 'Courier', action: 'Notify Owner', priority: 'Normal', confidence: 0.9 },
    { key: 'family', type: 'Family', action: 'Accept', priority: 'High', confidence: 0.85 },
    { key: 'friend', type: 'Friend', action: 'Accept', priority: 'High', confidence: 0.85 },
    { key: 'guest', type: 'Guest', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'maid', type: 'Maid', action: 'Ask Owner', priority: 'Normal', confidence: 0.82 },
    { key: 'driver', type: 'Driver', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'technician', type: 'Technician', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'society', type: 'Society Staff', action: 'Notify Owner', priority: 'Normal', confidence: 0.78 },
    { key: 'sales', type: 'Sales Person', action: 'Decline', priority: 'Low', confidence: 0.85 },
  ];

  let match = map.find((m) => chip.includes(m.key) || text.includes(m.key));
  if (!match) {
    if (['sell', 'offer', 'insurance', 'loan', 'discount', 'promote'].some((k) => text.includes(k))) {
      match = map.find((m) => m.key === 'sales');
    }
  }
  if (!match) {
    match = { type: 'Unknown Visitor', action: 'Ask Owner', priority: 'Normal', confidence: 0.65 };
  }

  let aiSummary = `${match.type}`;
  if (company) aiSummary += ` (${company})`;
  if (match.type === 'Delivery Partner' || match.type === 'Courier') aiSummary += ' — package expected';
  else if (visitingWhom) aiSummary += ` — visiting ${visitingWhom}`;
  else if (expected === true) aiSummary += ' — expected by owner';
  else if (expected === false) aiSummary += ' — not expected';

  return {
    visitorType: match.type,
    confidence: match.confidence,
    suggestedAction: match.action,
    aiSummary,
    priority: match.priority,
  };
}

/**
 * Persists one pre-call screening result. Fire-and-forget from the
 * caller's perspective — never throws, never delays the call.
 *
 * @returns {Promise<{success:boolean, id?:string}>}
 */
export async function saveCallScreening({
  ownerId, plateId, visitorName = null, visitorType, company = null,
  visitingWhom = null, purpose = null, flatNumber = null, hasPackage = null,
  expectedByOwner = null, confidence = 0.7, suggestedAction = 'Notify Owner',
  aiSummary = null, transcript = [],
  // Additive (sql/53_ai_voice_receptionist.sql) — safe defaults so every
  // existing caller (the chip-based screening flow) keeps working
  // unchanged without passing these.
  conversationMode = 'chip', durationSeconds = null, ruleMatched = null,
}) {
  if (!ownerId || !plateId || !visitorType) return { success: false };
  try {
    const { data, error } = await supabase.from('ai_call_screenings').insert({
      owner_id: ownerId, plate_id: plateId, visitor_name: visitorName,
      visitor_type: visitorType, company, visiting_whom: visitingWhom,
      purpose, flat_number: flatNumber, has_package: hasPackage,
      expected_by_owner: expectedByOwner, confidence, suggested_action: suggestedAction,
      ai_summary: aiSummary, transcript,
      conversation_mode: conversationMode, duration_seconds: durationSeconds, rule_matched: ruleMatched,
    }).select('id').single();
    if (error) {
      console.error('[AIReceptionist] saveCallScreening failed:', error);
      return { success: false };
    }
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[AIReceptionist] saveCallScreening threw:', err);
    return { success: false };
  }
}

/**
 * Owner-side read: the most recent screening for this owner+plate,
 * within a short freshness window (default 3 minutes) — used by the
 * ring UI to enrich the incoming-call card. Returns null on any miss
 * or error so the caller can safely fall back to the generic card.
 *
 * @returns {Promise<null|{visitorName, visitorType, company, purpose, confidence, suggestedAction, aiSummary, priority:undefined}>}
 */
export async function getRecentCallScreening(ownerId, plateId, freshnessMs = 3 * 60 * 1000) {
  if (!ownerId || !plateId) return null;
  try {
    const since = new Date(Date.now() - freshnessMs).toISOString();
    const { data, error } = await supabase
      .from('ai_call_screenings')
      .select('visitor_name, visitor_type, company, visiting_whom, purpose, confidence, suggested_action, ai_summary, transcript, conversation_mode, rule_matched, created_at')
      .eq('owner_id', ownerId)
      .eq('plate_id', plateId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      visitorName: data.visitor_name,
      visitorType: data.visitor_type,
      company: data.company,
      visitingWhom: data.visiting_whom,
      purpose: data.purpose,
      confidence: Number(data.confidence),
      suggestedAction: data.suggested_action,
      aiSummary: data.ai_summary,
      transcript: Array.isArray(data.transcript) ? data.transcript : [],
      conversationMode: data.conversation_mode || 'chip',
      ruleMatched: data.rule_matched || null,
    };
  } catch (_) {
    return null;
  }
}

export default { VISITOR_TYPES, classifyCallPurpose, saveCallScreening, getRecentCallScreening };
