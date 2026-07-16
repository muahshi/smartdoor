/**
 * Smart Door — AI Voice Receptionist, Conversation Engine
 * services/aiVoiceReceptionist.js
 *
 * Production AI Voice Receptionist built on top of the existing AI Call
 * Screening (services/aiReceptionist.js) and the same groq-proxy Edge
 * Function the AI Chat Receptionist (visitor.html's handleAISend) and the
 * chip-based screening (js/aiCallScreeningUI.js) already use — one more
 * consumer of shared infra, not a new AI backend.
 *
 * This module is pure conversation logic (no DOM, no speech APIs — those
 * live in js/aiVoiceReceptionistUI.js so this file stays testable and
 * reusable). It runs a short, bounded, natural-language Q&A ("answer like
 * a real receptionist", not a chatbot) and hands off to the existing
 * classifyCallPurpose() for the final structured classification — reusing
 * that function's own Groq call + deterministic fallback rather than
 * duplicating either.
 *
 * Does not touch services/webrtcCall.js, services/webrtcOwnerCall.js,
 * services/webrtcSignaling.js, or services/aiReceptionist.js. Fail-open by
 * design: any network/parse failure ends the conversation immediately
 * with whatever was already gathered, so a flaky connection can never
 * trap a visitor in a loop.
 */

import { classifyCallPurpose, VISITOR_TYPES } from './aiReceptionist.js';

// Ask only the minimum required follow-up questions — hard cap, matches
// the "answers first, minimum Q&A" product requirement.
export const MAX_VOICE_TURNS = 3;

function _cfg() {
  return {
    url: window.__SD_CONFIG__?.supabaseUrl || '',
    anonKey: window.__SD_CONFIG__?.supabaseAnon || '',
  };
}

/**
 * Runs one turn of the voice conversation: given what's been said so far,
 * asks Groq to (a) extract any new structured info from the visitor's
 * latest utterance and (b) decide whether enough is known to stop asking,
 * or produce exactly one more short follow-up question.
 *
 * @param {object} params
 * @param {Array<{role:'assistant'|'visitor', content:string}>} params.history
 * @param {string} params.visitorUtterance   latest transcribed speech (may be '' if silent/timeout)
 * @param {number} params.turnIndex          0-based turn count already completed
 * @param {object} params.answers            accumulated structured answers so far
 * @param {object} params.context            {aiName, ownerLabel, ownerStatus, langHint}
 * @returns {Promise<{done:boolean, spokenReply:string, answers:object, langHint:string}>}
 */
export async function conductVoiceTurn({ history = [], visitorUtterance = '', turnIndex = 0, answers = {}, context = {} }) {
  const { aiName = 'Priya', ownerLabel = 'the resident', ownerStatus = 'available', langHint = 'hi-IN' } = context;
  const { url, anonKey } = _cfg();

  const reachedCap = turnIndex + 1 >= MAX_VOICE_TURNS;

  if (!url || !anonKey) {
    return _fallbackTurn({ visitorUtterance, answers, reachedCap, langHint });
  }

  try {
    const systemPrompt = `You are ${aiName}, an AI receptionist answering a visitor's call at the door BEFORE connecting them to ${ownerLabel}. Speak like a real, warm, efficient human receptionist — never a chatbot. Ask only the minimum questions needed (you have at most ${MAX_VOICE_TURNS} turns total, this is turn ${turnIndex + 1}).

Owner's current status: ${ownerStatus}.

LANGUAGE: You understand and speak Hindi, Hinglish (Hindi in Latin script), English, and natural code-mixing between them. Match the visitor's own language/mix — if they speak Hinglish, reply in Hinglish; if they switch mid-conversation, follow the switch. Never ask them to repeat themselves in a different language.

PRIVACY: You classify the visit — you do not build a record of who the visitor is related to, their name, or their phone number. "visitingWhom" may capture a role/first-name the visitor themselves offers unprompted, but never press for surname, relationship detail, or contact info beyond what is needed to route this one visit.

From the visitor's latest utterance, extract into "answers" (merge with what's already known, never discard known fields):
- purposeChip: best-guess category — one of: ${VISITOR_TYPES.join(', ')}
- company: delivery/courier company name if mentioned
- visitingWhom: who they're here to see, if mentioned
- freeText: a short free-text reason, if given
- expected: true/false/null — whether they claim to be expected

SPAM/SALES: an unsolicited pitch, survey, or vague/evasive answer to "why are you here" is Sales Person or Unknown Visitor — do not give it the benefit of the doubt.

Decide "done": true if you have enough to classify the visitor (most visitors need only 0-1 follow-up), or if turn ${turnIndex + 1} has reached the ${MAX_VOICE_TURNS}-turn cap. Emergencies are always "done" immediately.

If not done, "nextQuestion" must be ONE short, natural spoken sentence (max ~12 words) — a real receptionist's follow-up, not a form field label.

Respond in the visitor's language (Hindi/Hinglish if they spoke Hindi/Hinglish, else English) for "spokenReply". Respond ONLY with this valid JSON (no markdown, no backticks):
{"done":true|false,"answers":{"purposeChip":"...","company":"...","visitingWhom":"...","freeText":"...","expected":true|false|null},"nextQuestion":"<or empty string if done>","spokenReply":"<what you say out loud this turn — greeting/ack + nextQuestion if not done, or a short 'connecting you now' style close if done>","langHint":"hi-IN|en-IN"}`;

    const historyMsgs = history.slice(-6).map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    }));

    const userContent = visitorUtterance
      ? visitorUtterance
      : '[visitor was silent / no speech detected]';

    const res = await fetch(`${url}/functions/v1/groq-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0.5,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMsgs,
          { role: 'user', content: userContent },
        ],
      }),
    });
    const data = await res.json();
    if (data?.success && data.content) {
      const clean = data.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      const mergedAnswers = _mergeAnswers(answers, parsed.answers || {});
      const isEmergency = mergedAnswers.purposeChip === 'Emergency';
      return {
        done: isEmergency || !!parsed.done || reachedCap,
        spokenReply: parsed.spokenReply || (reachedCap ? 'Thanks — connecting you now.' : 'Could you tell me a bit more?'),
        answers: mergedAnswers,
        langHint: parsed.langHint || langHint,
      };
    }
  } catch (_) {
    // fall through to fail-open fallback below
  }

  return _fallbackTurn({ visitorUtterance, answers, reachedCap, langHint });
}

/** Merges partial answers from a turn into the running accumulated set — never overwrites a known field with an empty one. */
function _mergeAnswers(prev = {}, next = {}) {
  const out = { ...prev };
  if (next.purposeChip) out.purposeChip = next.purposeChip;
  if (next.company) out.company = next.company;
  if (next.visitingWhom) out.visitingWhom = next.visitingWhom;
  if (next.freeText) out.freeText = next.freeText;
  if (next.expected === true || next.expected === false) out.expected = next.expected;
  return out;
}

/**
 * Offline/error-safe fallback turn — deterministic, keyword-based, always
 * terminates. Never blocks or traps the visitor waiting on a flaky network.
 */
function _fallbackTurn({ visitorUtterance, answers, reachedCap, langHint }) {
  const text = (visitorUtterance || '').toLowerCase();
  const merged = { ...answers };
  if (!merged.freeText && visitorUtterance) merged.freeText = visitorUtterance.slice(0, 160);

  const KEYWORDS = [
    { k: 'emergency', v: 'Emergency' }, { k: 'aapat', v: 'Emergency' }, { k: 'bachao', v: 'Emergency' },
    { k: 'amazon', v: 'Delivery Partner' }, { k: 'flipkart', v: 'Delivery Partner' },
    { k: 'parcel', v: 'Delivery Partner' }, { k: 'delivery', v: 'Delivery Partner' },
    { k: 'courier', v: 'Courier' }, { k: 'swiggy', v: 'Delivery Partner' }, { k: 'zomato', v: 'Delivery Partner' },
    { k: 'relative', v: 'Relative' }, { k: 'rishtedar', v: 'Relative' }, { k: 'chacha', v: 'Relative' }, { k: 'mama', v: 'Relative' },
    { k: 'family', v: 'Family' }, { k: 'parivaar', v: 'Family' },
    { k: 'friend', v: 'Friend' }, { k: 'dost', v: 'Friend' },
    { k: 'neighbour', v: 'Neighbour' }, { k: 'neighbor', v: 'Neighbour' }, { k: 'padosi', v: 'Neighbour' },
    { k: 'guest', v: 'Guest' },
    { k: 'house help', v: 'House Help' }, { k: 'maid', v: 'Maid' }, { k: 'kaam wali', v: 'Maid' },
    { k: 'driver', v: 'Driver' },
    { k: 'maintenance', v: 'Maintenance' }, { k: 'plumber', v: 'Maintenance' }, { k: 'ac service', v: 'Maintenance' },
    { k: 'technician', v: 'Technician' }, { k: 'electrician', v: 'Technician' }, { k: 'mistri', v: 'Technician' },
    { k: 'government', v: 'Government' }, { k: 'municipal', v: 'Government' }, { k: 'police', v: 'Government' },
    { k: 'electricity', v: 'Utility' }, { k: 'water board', v: 'Utility' }, { k: 'gas connection', v: 'Utility' }, { k: 'bijli', v: 'Utility' },
    { k: 'business', v: 'Business Visitor' }, { k: 'meeting', v: 'Business Visitor' },
    { k: 'doctor', v: 'Medical' }, { k: 'nurse', v: 'Medical' }, { k: 'medical', v: 'Medical' },
    { k: 'sales', v: 'Sales Person' }, { k: 'offer', v: 'Sales Person' }, { k: 'insurance', v: 'Sales Person' },
  ];
  if (!merged.purposeChip) {
    const hit = KEYWORDS.find((kw) => text.includes(kw.k));
    if (hit) merged.purposeChip = hit.v;
  }

  const isEmergency = merged.purposeChip === 'Emergency';
  const done = isEmergency || !!merged.purposeChip || reachedCap;

  return {
    done,
    spokenReply: isEmergency
      ? 'Understood — connecting you immediately.'
      : done
        ? 'Thanks — connecting you now.'
        : (langHint === 'en-IN' ? "Sorry, I didn't catch that — could you repeat?" : 'Maaf kijiye, sunai nahi diya — dobara boliye?'),
    answers: merged,
    langHint,
  };
}

/**
 * Finalizes a voice conversation into the same structured classification
 * shape the chip-based flow produces, by delegating to the existing
 * classifyCallPurpose() — one classification code path, not two.
 * @returns {Promise<object>} see services/aiReceptionist.js#classifyCallPurpose
 */
export async function finalizeVoiceScreening(answers, context) {
  return classifyCallPurpose(answers, context);
}

export default { MAX_VOICE_TURNS, conductVoiceTurn, finalizeVoiceScreening };
