/**
 * My Smart Door — Communication Center (Phase 7C)
 * services/communicationCenter.js
 *
 * PHASE 7C — ADDITIVE ONLY. No SQL migration, no new tables/columns, no
 * change to auth/RBAC/push/QR/visitor flow. This module only READS data
 * that already exists and is already queried elsewhere in production:
 *
 *   - conversations   (services/messaging.js → listConversations())
 *   - visitor_memory  (owner_id, visitor_fingerprint, visitor_label,
 *                       visit_count, last_seen — same table aiInsights.js
 *                       already reads)
 *
 * IDENTITY MODEL — READ BEFORE MODIFYING
 * ────────────────────────────────────────────────────────────────────────
 * SmartDoor does not store a visitor's real name or phone number anywhere
 * in this pipeline. The only visitor-identifying fields are:
 *   - visitor_fingerprint / visitor_session_id — a device fingerprint
 *     (same localStorage key 'sd_visitor_fp', written by visitor.html and
 *     read identically by services/messaging.js#getVisitorSessionId()) —
 *     this is how a `conversations` row is joined to a `visitor_memory` row
 *     below. It is NOT a phone number and is not shown to the owner raw.
 *   - visitor_label — free text the OWNER types in (e.g. "Courier - Amazon",
 *     "Maid"). This is the only "name" that exists, and it is owner-created,
 *     not visitor-supplied.
 *
 * Because of this, "search" here is a search over labels/categories/plate
 * IDs — never a real name/phone lookup — and "Call" / "WhatsApp" actions
 * are never offered from this module, because SmartDoor has no callable
 * number for a walk-in visitor to reuse later. (The existing masked-call
 * feature in services/communication.js is visitor-initiated in the moment;
 * there is no stored number for the owner to call back with.) Do not wire
 * Call/WhatsApp buttons to this data — there is nothing legitimate to call.
 * ────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase.js';
import { listConversations } from './messaging.js';

const MS_DAY = 86400000;

function daysAgo(n) {
  return new Date(Date.now() - n * MS_DAY);
}

function _startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function _inRange(dateStr, range) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (range === 'today') return d >= _startOfToday();
  if (range === 'yesterday') {
    const start = new Date(_startOfToday());
    start.setDate(start.getDate() - 1);
    return d >= start && d < _startOfToday();
  }
  if (range === '7d') return d >= daysAgo(7);
  if (range === '30d') return d >= daysAgo(30);
  return true; // 'all'
}

// ────────── VISITOR MEMORY (reuses the exact table aiInsights.js reads) ──────────
async function _getVisitorMemoryMap(ownerId) {
  try {
    const { data, error } = await supabase
      .from('visitor_memory')
      .select('visitor_fingerprint, visitor_label, visit_count, last_seen, first_seen')
      .eq('owner_id', ownerId);
    if (error || !data) return {};
    const map = {};
    data.forEach((m) => { map[m.visitor_fingerprint] = m; });
    return map;
  } catch (err) {
    console.error('[CommunicationCenter] _getVisitorMemoryMap error:', err);
    return {};
  }
}

// ────────── DETERMINISTIC PRIORITY BADGES (rule-based only, never AI) ──────────
function _computeBadges({ memory, tags, missedCount }) {
  const badges = [];
  const visitCount = memory?.visit_count || 1;
  const label = (memory?.visitor_label || '').toLowerCase();

  if (visitCount >= 5) {
    badges.push({ id: 'frequent', text: '🔁 Frequent Visitor', color: '#22C55E' });
  }
  if (visitCount >= 2 && (tags.includes('Courier') || tags.includes('Food Delivery'))) {
    badges.push({ id: 'repeat_delivery', text: '📦 Repeat Delivery', color: '#F59E0B' });
  }
  if (missedCount >= 2) {
    badges.push({ id: 'multiple_missed', text: '⏰ Multiple Missed Visits', color: '#EF4444' });
  }
  if (tags.includes('Emergency')) {
    badges.push({ id: 'security', text: '🚨 Security Attention', color: '#EF4444' });
  }
  // "VIP" is only ever applied from something the OWNER explicitly said —
  // either they labeled the visitor VIP, or tagged the thread Family.
  // Never inferred/fabricated from visit frequency alone.
  if (label.includes('vip') || tags.includes('Family')) {
    badges.push({ id: 'vip', text: '⭐ VIP Visitor', color: '#E8C874' });
  }
  return badges;
}

function _followUpReason({ isMissed, tags }) {
  if (!isMissed) return null;
  if (tags.includes('Emergency')) return 'Security';
  if (tags.includes('Courier') || tags.includes('Food Delivery')) return 'Delivery';
  return 'Awaiting Reply';
}

/**
 * Builds the full Communication Center dataset for one owner.
 * Reuses listConversations() (the same call the Inbox tab already makes)
 * plus one additional read of visitor_memory (same table/columns
 * aiInsights.js already reads on the dashboard home screen).
 *
 * @param {string} ownerId
 * @param {object} [opts]
 * @param {('all'|'today'|'yesterday'|'7d'|'30d')} [opts.dateRange]
 * @param {string} [opts.search]     matches visitor_label, category/tags, plate_id ONLY
 * @param {string} [opts.category]   exact tag match, e.g. 'Courier'
 */
export async function getCommunicationCenterData(ownerId, { dateRange = 'all', search = '', category = null } = {}) {
  try {
    if (!ownerId) return { success: false, error: 'Missing ownerId', items: [], groups: {} };

    const [convRes, memoryMap] = await Promise.all([
      listConversations(ownerId, { filter: 'all', limit: 300 }),
      _getVisitorMemoryMap(ownerId),
    ]);

    if (!convRes.success) return { success: false, error: convRes.error, items: [], groups: {} };

    // A conversation counts as "missed" when it's still active and the
    // owner has never sent the most recent reply (handled_by stayed 'ai' —
    // this column already exists and is already maintained by
    // sql/31_unified_messaging.sql / services/messaging.js, not new logic).
    const missedByVisitor = {};
    convRes.conversations.forEach((c) => {
      if (c.status === 'active' && c.handled_by !== 'owner') {
        missedByVisitor[c.visitor_session_id] = (missedByVisitor[c.visitor_session_id] || 0) + 1;
      }
    });

    let items = convRes.conversations.map((c) => {
      const memory = memoryMap[c.visitor_session_id] || null;
      const tags = c.tags || [];
      const isMissed = c.status === 'active' && c.handled_by !== 'owner';
      const missedCount = missedByVisitor[c.visitor_session_id] || 0;

      return {
        conversationId: c.id,
        plateId: c.plate_id,
        visitorFingerprint: c.visitor_session_id,
        visitorLabel: memory?.visitor_label || null,   // owner-assigned only — never a real name
        tags,
        category: tags[0] || c.last_intent || 'Unknown',
        lastMessageAt: c.last_message_at,
        lastMessagePreview: c.last_message_preview,
        status: c.status,
        pinned: c.pinned,
        visitCount: memory?.visit_count || 1,
        isMissed,
        isReturned: (memory?.visit_count || 1) > 1 && _inRange(memory?.last_seen, 'today'),
        followUpReason: _followUpReason({ isMissed, tags }),
        badges: _computeBadges({ memory, tags, missedCount }),
        // No callable number exists for a walk-in visitor anywhere in this
        // pipeline — never surface Call/WhatsApp actions from this data.
        canCall: false,
        canWhatsApp: false,
        raw: c,
      };
    });

    // ── Search: label / category / tags / plate ID only — see header note ──
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((i) =>
        (i.visitorLabel || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.plateId || '').toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (category) items = items.filter((i) => i.tags.includes(category) || i.category === category);
    if (dateRange && dateRange !== 'all') items = items.filter((i) => _inRange(i.lastMessageAt, dateRange));

    const groups = {
      today:    items.filter((i) => _inRange(i.lastMessageAt, 'today')),
      missed:   items.filter((i) => i.isMissed),
      returned: items.filter((i) => i.isReturned),
      repeat:   items.filter((i) => i.visitCount >= 2),
      frequent: items.filter((i) => i.visitCount >= 5),
      priority: items.filter((i) => i.badges.some((b) => ['security', 'multiple_missed', 'vip'].includes(b.id))),
      followup: items.filter((i) => !!i.followUpReason || missedByVisitor[i.visitorFingerprint] >= 2),
    };

    return { success: true, items, groups };
  } catch (err) {
    console.error('[CommunicationCenter] getCommunicationCenterData error:', err);
    return { success: false, error: err.message, items: [], groups: {} };
  }
}

export default { getCommunicationCenterData };
