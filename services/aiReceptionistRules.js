/**
 * My Smart Door — AI Voice Receptionist, Owner Rules Engine
 * services/aiReceptionistRules.js
 *
 * Client for sql/53_ai_voice_receptionist.sql. Lets an owner define
 * reusable, extensible rules like:
 *   Amazon        -> Auto Allow
 *   Blinkit       -> Auto Allow
 *   Known Family  -> Auto Connect
 *   Unknown Visitor -> Ask More Questions
 *   Sales Person  -> Recommend Reject
 *   Emergency     -> Immediate Connect
 *
 * evaluateRules() is a pure function (no network, no side effects) so it
 * can run on the visitor page against the classification produced by
 * services/aiVoiceReceptionist.js — it only ever decides how the AI
 * screening step behaves BEFORE the existing WebRTC ring / masked call.
 * It never touches services/webrtcCall.js, services/webrtcOwnerCall.js,
 * or the owner's own accept/reject step once a call is actually ringing.
 *
 * Fail-silent by design, same trust model as services/aiReceptionist.js —
 * any read/write failure here must never block the visitor's call.
 */

import { supabase } from './supabase.js';

export const RULE_TYPES = ['visitor_type', 'company', 'keyword'];
export const RULE_ACTIONS = ['auto_allow', 'auto_connect', 'auto_decline', 'ask_more', 'ring_owner'];

/** Quick-add templates shown in the owner rules UI — not auto-inserted. */
export const RULE_TEMPLATES = [
  { rule_type: 'company', match_value: 'Amazon', action: 'auto_allow', label: 'Amazon deliveries', priority: 10 },
  { rule_type: 'company', match_value: 'Blinkit', action: 'auto_allow', label: 'Blinkit deliveries', priority: 10 },
  { rule_type: 'visitor_type', match_value: 'Family', action: 'auto_connect', label: 'Known family', priority: 5 },
  { rule_type: 'visitor_type', match_value: 'Unknown Visitor', action: 'ask_more', label: 'Unknown visitors', priority: 50 },
  { rule_type: 'visitor_type', match_value: 'Sales Person', action: 'auto_decline', label: 'Sales / promotions', priority: 20 },
  { rule_type: 'visitor_type', match_value: 'Emergency', action: 'auto_connect', label: 'Emergencies', priority: 1 },
];

/**
 * Owner-dashboard read — all rules for the signed-in owner (RLS-protected).
 * @returns {Promise<Array>}
 */
export async function getRulesForOwner() {
  try {
    const { data, error } = await supabase
      .from('ai_receptionist_rules')
      .select('id, rule_type, match_value, action, label, priority, is_active, created_at')
      .order('priority', { ascending: true });
    if (error) { console.error('[AIReceptionistRules] getRulesForOwner failed:', error); return []; }
    return data || [];
  } catch (err) {
    console.error('[AIReceptionistRules] getRulesForOwner threw:', err);
    return [];
  }
}

/** Creates one rule. @returns {Promise<{success:boolean, rule?:object, error?:string}>} */
export async function createRule({ ownerId, ruleType, matchValue, action, label = null, priority = 100 }) {
  if (!ownerId || !RULE_TYPES.includes(ruleType) || !matchValue || !RULE_ACTIONS.includes(action)) {
    return { success: false, error: 'Invalid rule' };
  }
  try {
    const { data, error } = await supabase.from('ai_receptionist_rules').insert({
      owner_id: ownerId, rule_type: ruleType, match_value: matchValue.trim(),
      action, label: label?.trim() || null, priority,
    }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, rule: data };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to create rule' };
  }
}

/** Updates one rule (partial). @returns {Promise<{success:boolean, error?:string}>} */
export async function updateRule(ruleId, updates = {}) {
  if (!ruleId) return { success: false, error: 'Missing rule id' };
  try {
    const { error } = await supabase.from('ai_receptionist_rules').update(updates).eq('id', ruleId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to update rule' };
  }
}

/** Toggles a rule active/inactive. */
export async function setRuleActive(ruleId, isActive) {
  return updateRule(ruleId, { is_active: !!isActive });
}

/** Deletes one rule. */
export async function deleteRule(ruleId) {
  if (!ruleId) return { success: false, error: 'Missing rule id' };
  try {
    const { error } = await supabase.from('ai_receptionist_rules').delete().eq('id', ruleId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to delete rule' };
  }
}

/**
 * Visitor-side (anon) read — active rules for the owner behind a plate,
 * via the SECURITY DEFINER RPC. Never throws; returns [] on any failure
 * so the caller always has a safe default (fall through to the AI's own
 * suggestedAction, i.e. ring the owner as today).
 * @returns {Promise<Array<{id,rule_type,match_value,action,priority}>>}
 */
export async function getRulesForPlate(plateId) {
  if (!plateId) return [];
  try {
    const { data, error } = await supabase.rpc('get_ai_receptionist_rules_for_plate', { p_plate_id: plateId });
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      id: r.id, ruleType: r.rule_type, matchValue: r.match_value, action: r.action, priority: r.priority,
    }));
  } catch (_) {
    return [];
  }
}

/**
 * Pure evaluation — no network calls. Given the AI's classification of a
 * visitor (from services/aiVoiceReceptionist.js or the legacy chip flow's
 * classifyCallPurpose) and the owner's active rules, decides the final
 * action to take BEFORE the call is placed.
 *
 * Rule matching is intentionally simple and predictable (owner-configured,
 * not another AI decision): exact case-insensitive match on visitor type
 * or company, substring match for free-text keywords. First matching rule
 * by priority wins.
 *
 * @param {object} classification  {visitorType, company, suggestedAction, aiSummary, priority, confidence}
 * @param {object} answers         raw screening answers {freeText, purposeChip, ...}
 * @param {Array} rules            from getRulesForPlate()
 * @returns {{action:string, matchedRule:?object}}
 *   action is one of RULE_ACTIONS, or 'ring_owner' (default / no match —
 *   identical to today's always-ring-the-owner behavior).
 */
export function evaluateRules(classification = {}, answers = {}, rules = []) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { action: 'ring_owner', matchedRule: null };
  }

  // Emergency always wins over any owner rule — never let a misconfigured
  // rule delay or suppress an emergency. Mirrors the existing hard-coded
  // Emergency handling in js/aiCallScreeningUI.js / visitor.html.
  if (classification.visitorType === 'Emergency' || classification.priority === 'Critical') {
    return { action: 'auto_connect', matchedRule: { label: 'Emergency (built-in)', action: 'auto_connect' } };
  }

  const visitorType = String(classification.visitorType || '').toLowerCase();
  const company = String(classification.company || answers.company || '').toLowerCase();
  const freeText = String(answers.freeText || '').toLowerCase();

  const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  for (const rule of sorted) {
    const val = String(rule.matchValue || '').toLowerCase();
    if (!val) continue;
    let hit = false;
    if (rule.ruleType === 'visitor_type') hit = visitorType === val;
    else if (rule.ruleType === 'company') hit = !!company && company.includes(val);
    else if (rule.ruleType === 'keyword') hit = !!freeText && freeText.includes(val);
    if (hit) return { action: rule.action, matchedRule: rule };
  }

  return { action: 'ring_owner', matchedRule: null };
}

export default {
  RULE_TYPES, RULE_ACTIONS, RULE_TEMPLATES,
  getRulesForOwner, createRule, updateRule, setRuleActive, deleteRule,
  getRulesForPlate, evaluateRules,
};
