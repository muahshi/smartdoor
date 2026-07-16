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
import { fetchWithTimeout } from './httpClient.js';

// Canonical visitor-type taxonomy the AI classifies into.
// PHASE 4 — additive superset only. The original 12 types are unchanged
// (existing rows in ai_call_screenings, ai_receptionist_rules templates,
// and RULE_TEMPLATES in services/aiReceptionistRules.js all still match
// exactly) — 8 new categories are appended so the classifier can
// distinguish visits that used to collapse into "Unknown Visitor" or an
// approximate neighbor (e.g. a relative was previously "Family", an
// electricity-board visit was previously "Unknown Visitor").
export const VISITOR_TYPES = [
  'Delivery Partner', 'Courier', 'Family', 'Friend', 'Guest', 'Maid',
  'Driver', 'Technician', 'Society Staff', 'Unknown Visitor',
  'Sales Person', 'Emergency',
  // Additive (Phase 4):
  'Relative', 'Neighbour', 'Government', 'Utility', 'Maintenance',
  'House Help', 'Business Visitor', 'Medical',
];

// One-line disambiguation shown to the model so near-duplicate categories
// (Maid vs House Help, Family vs Relative, Technician vs Maintenance,
// Government vs Utility) get classified consistently rather than randomly.
const VISITOR_TYPE_GUIDE = `
- Delivery Partner: e-commerce/food delivery (Amazon, Flipkart, Swiggy, Zomato, Blinkit, courier apps)
- Courier: postal/document/parcel courier not tied to an e-commerce brand
- Family: immediate household member (spouse, parent, child, sibling)
- Relative: extended family (uncle, aunt, cousin, in-law) — do not ask which specific relative, category is enough
- Friend: personal friend of a resident
- Guest: invited visitor not otherwise categorized
- Neighbour: lives in the same building/society/street
- Maid / House Help: domestic help (cleaning, cooking, childcare) — use whichever the visitor's own word maps to
- Driver: personal/cab/hired driver
- Technician: appliance/electronics/IT repair or installation
- Maintenance: building/plumbing/carpentry/AC servicing, society-arranged repair work
- Society Staff: building security, watchman, society office staff
- Government: municipal, police, postal department, government office visit
- Utility: electricity/water/gas board, meter reading, utility company staff
- Business Visitor: professional/work meeting, vendor, sales call to a home office
- Medical: doctor, nurse, medical equipment, pharmacy delivery, health check-up
- Sales Person: unsolicited sales, promotions, surveys, insurance/loan pitches
- Emergency: any distress, accident, urgent help request — always highest priority
- Unknown Visitor: purpose could not be determined from the visitor's answers`;

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
      const systemPrompt = `You are ${aiName}, an AI receptionist for Smart Door screening a visitor BEFORE connecting their call to ${ownerLabel}. You understand Hindi, Hinglish (Hindi written in Latin script, e.g. "main uske dost hoon"), English, and natural code-mixing between them — classify correctly regardless of which language or mix the visitor used, and never ask the visitor to switch languages.

Classify the visitor into exactly one of these types, using this guide to disambiguate close categories:
${VISITOR_TYPE_GUIDE}

Owner's current status: ${ownerStatus}.

PRIVACY — do not extract or restate any family member's personal name, phone number, or relationship detail in your output. "visitingWhom" and "aiSummary" may reference a role/category (e.g. "visiting a family member") but must never fabricate or repeat identifying household details beyond what the visitor themselves already volunteered as free text.

SPAM/SALES: unsolicited sales, surveys, promotions, or vague/evasive answers to a direct purpose question are "Sales Person" or "Unknown Visitor" with suggestedAction "Decline" or "Blocked" — do not give the benefit of the doubt to a generic pitch.

Given the visitor's short answers, respond ONLY with this valid JSON (no markdown, no backticks):
{"visitorType":"<one of the exact types above>","confidence":0.0-1.0,"suggestedAction":"Accept|Decline|Ask Owner|Notify Owner|Blocked","aiSummary":"<one short sentence for the owner, e.g. 'Amazon Delivery — package expected'>","priority":"Low|Normal|High|Critical","languageDetected":"hi-IN|en-IN|mixed"}`;

      const userContent = `Purpose selected: ${purposeChip || 'not specified'}
Company: ${company || 'n/a'}
Visiting: ${visitingWhom || 'n/a'}
Expected by owner: ${expected === null ? 'unknown' : expected ? 'yes' : 'no'}
Additional notes: ${freeText || 'n/a'}`;

      // PRODUCTION HARDENING (API timeout consistency): this call sits in
      // the live visitor-facing screening flow — a stalled request used to
      // leave the visitor staring at nothing with no fallback. See
      // services/httpClient.js. Callers already treat any thrown error as
      // "fall back to the non-AI path" (see the catch block below), so a
      // bounded timeout makes that fallback actually reachable.
      const res = await fetchWithTimeout(`${url}/functions/v1/groq-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 220,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      }, 10000);
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
            languageDetected: parsed.languageDetected || null,
          };
        }
      }
    } catch (_) {
      // fall through to deterministic fallback below
    }
  }

  return _fallbackClassify({ purposeChip, company, visitingWhom, freeText, expected });
}

// Hindi/Hinglish keyword hints layered onto the English chip/keyword map
// below — covers the common Devanagari + romanized words visitors type
// into the free-text field when the chip flow (not voice) is used.
const _HI_KEYWORDS = {
  emergency: ['aapatkal', 'madad', 'bachao', 'जरूरी', 'आपातकाल'],
  family: ['parivaar', 'ghar wale', 'परिवार'],
  friend: ['dost', 'yaar', 'दोस्त'],
  relative: ['rishtedar', 'chacha', 'mama', 'mausi', 'bua', 'रिश्तेदार'],
  neighbour: ['padosi', 'पड़ोसी'],
  maid: ['kaam wali', 'bai', 'नौकरानी'],
  driver: ['driver', 'chalak'],
  technician: ['mistri', 'मिस्त्री'],
  maintenance: ['plumber', 'electrician', 'ac service', 'repair', 'marammat', 'मरम्मत'],
  government: ['sarkari', 'nagar nigam', 'सरकारी', 'police', 'पुलिस'],
  utility: ['bijli', 'बिजली', 'meter reading', 'gas connection', 'paani', 'पानी'],
  sales: ['bechna', 'offer', 'scheme'],
  medical: ['doctor', 'nurse', 'dawai', 'दवाई', 'clinic'],
};

/** Deterministic, offline-safe fallback — never blocks the call flow. */
function _fallbackClassify({ purposeChip, company, visitingWhom, freeText, expected }) {
  const chip = (purposeChip || '').toLowerCase();
  const text = (freeText || '').toLowerCase();
  const combined = `${chip} ${text}`;

  const map = [
    { key: 'emergency', type: 'Emergency', action: 'Accept', priority: 'Critical', confidence: 0.98 },
    { key: 'delivery', type: 'Delivery Partner', action: 'Notify Owner', priority: 'Normal', confidence: 0.9 },
    { key: 'courier', type: 'Courier', action: 'Notify Owner', priority: 'Normal', confidence: 0.9 },
    { key: 'relative', type: 'Relative', action: 'Accept', priority: 'High', confidence: 0.82 },
    { key: 'family', type: 'Family', action: 'Accept', priority: 'High', confidence: 0.85 },
    { key: 'friend', type: 'Friend', action: 'Accept', priority: 'High', confidence: 0.85 },
    { key: 'neighbour', type: 'Neighbour', action: 'Accept', priority: 'Normal', confidence: 0.8 },
    { key: 'neighbor', type: 'Neighbour', action: 'Accept', priority: 'Normal', confidence: 0.8 },
    { key: 'guest', type: 'Guest', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'house help', type: 'House Help', action: 'Ask Owner', priority: 'Normal', confidence: 0.82 },
    { key: 'maid', type: 'Maid', action: 'Ask Owner', priority: 'Normal', confidence: 0.82 },
    { key: 'driver', type: 'Driver', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'maintenance', type: 'Maintenance', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'technician', type: 'Technician', action: 'Ask Owner', priority: 'Normal', confidence: 0.8 },
    { key: 'society', type: 'Society Staff', action: 'Notify Owner', priority: 'Normal', confidence: 0.78 },
    { key: 'government', type: 'Government', action: 'Ask Owner', priority: 'Normal', confidence: 0.75 },
    { key: 'municipal', type: 'Government', action: 'Ask Owner', priority: 'Normal', confidence: 0.75 },
    { key: 'utility', type: 'Utility', action: 'Ask Owner', priority: 'Normal', confidence: 0.75 },
    { key: 'electricity', type: 'Utility', action: 'Ask Owner', priority: 'Normal', confidence: 0.78 },
    { key: 'water board', type: 'Utility', action: 'Ask Owner', priority: 'Normal', confidence: 0.78 },
    { key: 'gas', type: 'Utility', action: 'Ask Owner', priority: 'Normal', confidence: 0.7 },
    { key: 'business', type: 'Business Visitor', action: 'Ask Owner', priority: 'Normal', confidence: 0.75 },
    { key: 'meeting', type: 'Business Visitor', action: 'Ask Owner', priority: 'Normal', confidence: 0.72 },
    { key: 'doctor', type: 'Medical', action: 'Notify Owner', priority: 'High', confidence: 0.85 },
    { key: 'nurse', type: 'Medical', action: 'Notify Owner', priority: 'High', confidence: 0.85 },
    { key: 'medical', type: 'Medical', action: 'Notify Owner', priority: 'High', confidence: 0.82 },
    { key: 'sales', type: 'Sales Person', action: 'Decline', priority: 'Low', confidence: 0.85 },
  ];

  // Hindi/Hinglish keyword pass — reuses the same category → chip.key
  // mapping above so a Hindi answer classifies exactly as its English
  // equivalent would, satisfying the multilingual requirement without a
  // second parallel taxonomy.
  const hiHit = Object.entries(_HI_KEYWORDS).find(([, words]) =>
    words.some((w) => combined.includes(w.toLowerCase()))
  );

  let match = map.find((m) => chip.includes(m.key) || text.includes(m.key));
  if (!match && hiHit) {
    const [hiKey] = hiHit;
    match = map.find((m) => m.key === hiKey) || (hiKey === 'relative' ? { type: 'Relative', action: 'Accept', priority: 'High', confidence: 0.78 } : null);
  }
  if (!match) {
    // Spam/sales patterns not caught by the chip/keyword map — treat a
    // vague or evasive free-text answer to a direct purpose question the
    // same as an explicit sales pitch rather than defaulting it to Unknown.
    if (['sell', 'offer', 'insurance', 'loan', 'discount', 'promote', 'scheme', 'investment'].some((k) => text.includes(k))) {
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
    languageDetected: /[\u0900-\u097F]/.test(combined) || !!hiHit ? 'hi-IN' : 'en-IN',
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
  // Additive (sql/54_ai_receptionist_intelligence.sql) — the urgency and
  // detected language classifyCallPurpose()/finalizeVoiceScreening()
  // already compute on every call; previously discarded before this
  // migration, now persisted for the owner's category/quality analytics.
  priority = 'Normal', languageDetected = null,
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
      priority: priority || 'Normal', language_detected: languageDetected,
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
      .select('visitor_name, visitor_type, company, visiting_whom, purpose, confidence, suggested_action, ai_summary, transcript, conversation_mode, rule_matched, priority, language_detected, created_at')
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
      priority: data.priority || 'Normal',
      languageDetected: data.language_detected || null,
    };
  } catch (_) {
    return null;
  }
}

export default { VISITOR_TYPES, classifyCallPurpose, saveCallScreening, getRecentCallScreening };
