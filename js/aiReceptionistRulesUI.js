/**
 * My Smart Door — AI Voice Receptionist, Owner Rules UI
 * js/aiReceptionistRulesUI.js
 *
 * Self-contained owner-dashboard overlay for managing
 * services/aiReceptionistRules.js rules (Amazon -> Auto Allow, Known
 * Family -> Auto Connect, etc.). Follows the exact same additive pattern
 * as js/activityCenter.js and js/notificationCenter.js: injects its own
 * overlay at runtime, reads the owner id via window.DashboardModule, and
 * exposes itself as window.AIReceptionistRules — does not edit
 * js/dashboard.js or any existing render path.
 *
 * Entry point (see app.html): a single button inside the existing
 * "Owner & AI Settings" card in tab-settings calls
 * AIReceptionistRules.open().
 */

import {
  getRulesForOwner, createRule, updateRule, setRuleActive, deleteRule, RULE_TEMPLATES,
} from '../services/aiReceptionistRules.js';

const ACTION_LABELS = {
  auto_allow: '✅ Auto Allow',
  auto_connect: '📞 Auto Connect',
  auto_decline: '🚫 Auto Decline',
  ask_more: '❓ Ask More Questions',
  ring_owner: '🔔 Ring Owner (default)',
};

const TYPE_LABELS = { visitor_type: 'Visitor type', company: 'Company', keyword: 'Keyword in message' };

const AIReceptionistRules = (() => {
  let _overlayEl = null;
  let rules = [];

  function _ownerId() {
    return window.DashboardModule?.getState?.()?.owner?.id || null;
  }
  function _toast(msg, type = 'info') {
    window.DashboardModule?.showToast?.(msg, type);
  }
  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _ensureDom() {
    if (_overlayEl) return;
    const style = document.createElement('style');
    style.id = 'sd-air-styles';
    style.textContent = `
      #sd-air-overlay { position: fixed; inset: 0; z-index: 99996; display: none; align-items: flex-end; justify-content: center; background: rgba(5,6,10,0.7); backdrop-filter: blur(6px); }
      #sd-air-overlay.sd-air-show { display: flex; }
      #sd-air-sheet { width: min(480px, 100vw); max-height: 88vh; overflow-y: auto; background: linear-gradient(165deg,#10151c,#0a0b0f); border-radius: 20px 20px 0 0; padding: 18px 18px 26px; color: #fff; border-top: 1px solid rgba(0,162,232,0.25); }
      #sd-air-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px; }
      #sd-air-title { font-weight: 700; font-size: 15px; }
      #sd-air-close { background:none; border:none; color:rgba(255,255,255,0.5); font-size:18px; cursor:pointer; }
      #sd-air-sub { font-size: 11.5px; color: #9CA3AF; margin-bottom: 14px; line-height:1.4; }
      .sd-air-rule { display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
      .sd-air-rule-main { flex: 1; min-width: 0; }
      .sd-air-rule-title { font-size: 13px; font-weight: 600; }
      .sd-air-rule-meta { font-size: 11px; color: #9CA3AF; margin-top: 2px; }
      .sd-air-rule-toggle { width: 38px; height: 22px; border-radius: 11px; border:none; cursor:pointer; position:relative; background: rgba(255,255,255,0.15); flex: none; }
      .sd-air-rule-toggle.on { background: #22C55E; }
      .sd-air-rule-toggle::after { content:''; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; transition: transform 0.15s ease; }
      .sd-air-rule-toggle.on::after { transform: translateX(16px); }
      .sd-air-rule-del { background:none; border:none; color:#EF4444; font-size:16px; cursor:pointer; flex:none; }
      #sd-air-templates { display:flex; flex-wrap:wrap; gap:6px; margin: 10px 0 16px; }
      .sd-air-chip { padding:6px 10px; border-radius:10px; font-size:11.5px; background:rgba(0,162,232,0.1); border:1px solid rgba(0,162,232,0.3); color:#7DD3FC; cursor:pointer; }
      #sd-air-form { display:none; background:rgba(255,255,255,0.04); border-radius:12px; padding:12px; margin-top:6px; }
      #sd-air-form.show { display:block; }
      #sd-air-form select, #sd-air-form input { width:100%; box-sizing:border-box; margin-top:6px; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.16); border-radius:8px; padding:8px 10px; color:#fff; font-size:13px; }
      #sd-air-form label { font-size:11px; color:#9CA3AF; display:block; margin-top:8px; }
      #sd-air-add-btn { width:100%; margin-top:12px; padding:10px; border-radius:10px; border:none; background:rgba(255,255,255,0.08); color:#cbd5e1; font-weight:600; font-size:13px; cursor:pointer; }
      #sd-air-save-btn { width:100%; margin-top:10px; padding:10px; border-radius:10px; border:none; background:linear-gradient(135deg,#00A2E8,#0066cc); color:#fff; font-weight:600; font-size:13px; cursor:pointer; }
      #sd-air-empty { font-size:12px; color:#9CA3AF; text-align:center; padding: 14px 0; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'sd-air-overlay';
    overlay.innerHTML = `
      <div id="sd-air-sheet">
        <div id="sd-air-head">
          <div id="sd-air-title">🤖 AI Receptionist Rules</div>
          <button type="button" id="sd-air-close">✕</button>
        </div>
        <div id="sd-air-sub">Configure how the AI Voice Receptionist handles visitors before ringing you — e.g. Amazon → Auto Allow, Known Family → Auto Connect. Emergencies always connect immediately regardless of rules.</div>
        <div id="sd-air-templates"></div>
        <div id="sd-air-list"></div>
        <button type="button" id="sd-air-add-btn">+ Add custom rule</button>
        <div id="sd-air-form">
          <label>Match type</label>
          <select id="sd-air-f-type">
            <option value="visitor_type">Visitor type (e.g. Family, Sales Person)</option>
            <option value="company">Company (e.g. Amazon, Blinkit)</option>
            <option value="keyword">Keyword in what they say</option>
          </select>
          <label>Match value</label>
          <input type="text" id="sd-air-f-value" maxlength="60" placeholder="e.g. Amazon" />
          <label>Action</label>
          <select id="sd-air-f-action">
            <option value="auto_allow">✅ Auto Allow</option>
            <option value="auto_connect">📞 Auto Connect</option>
            <option value="auto_decline">🚫 Auto Decline</option>
            <option value="ask_more">❓ Ask More Questions</option>
          </select>
          <label>Label (optional, shown in this list)</label>
          <input type="text" id="sd-air-f-label" maxlength="40" placeholder="e.g. Amazon deliveries" />
          <button type="button" id="sd-air-save-btn">Save rule</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    _overlayEl = overlay;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('sd-air-close')?.addEventListener('click', close);
    document.getElementById('sd-air-add-btn')?.addEventListener('click', () => {
      document.getElementById('sd-air-form')?.classList.toggle('show');
    });
    document.getElementById('sd-air-save-btn')?.addEventListener('click', _onSaveNewRule);
  }

  function _renderTemplates() {
    const el = document.getElementById('sd-air-templates');
    if (!el) return;
    const existingValues = new Set(rules.map((r) => `${r.rule_type}:${r.match_value.toLowerCase()}`));
    const remaining = RULE_TEMPLATES.filter((t) => !existingValues.has(`${t.rule_type}:${t.match_value.toLowerCase()}`));
    if (!remaining.length) { el.innerHTML = ''; return; }
    el.innerHTML = remaining.map((t, i) => `<button type="button" class="sd-air-chip" data-tpl="${i}">+ ${_esc(t.label)}</button>`).join('');
    el.querySelectorAll('[data-tpl]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const t = remaining[Number(btn.dataset.tpl)];
        const ownerId = _ownerId();
        if (!ownerId) return;
        btn.disabled = true;
        const res = await createRule({ ownerId, ruleType: t.rule_type, matchValue: t.match_value, action: t.action, label: t.label, priority: t.priority });
        if (res.success) { _toast(`Added: ${t.label}`, 'success'); await _reload(); }
        else { _toast(res.error || 'Failed to add rule', 'error'); btn.disabled = false; }
      });
    });
  }

  function _renderList() {
    const el = document.getElementById('sd-air-list');
    if (!el) return;
    if (!rules.length) { el.innerHTML = '<div id="sd-air-empty">No rules yet — every visitor rings you as usual. Add a rule below to automate common cases.</div>'; return; }
    el.innerHTML = rules.map((r) => `
      <div class="sd-air-rule" data-id="${r.id}">
        <div class="sd-air-rule-main">
          <div class="sd-air-rule-title">${_esc(r.label || r.match_value)}</div>
          <div class="sd-air-rule-meta">${TYPE_LABELS[r.rule_type] || r.rule_type}: “${_esc(r.match_value)}” → ${ACTION_LABELS[r.action] || r.action}</div>
        </div>
        <button type="button" class="sd-air-rule-toggle ${r.is_active ? 'on' : ''}" data-toggle="${r.id}" title="${r.is_active ? 'Active' : 'Inactive'}"></button>
        <button type="button" class="sd-air-rule-del" data-del="${r.id}" title="Delete">🗑️</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.toggle;
        const rule = rules.find((r) => r.id === id);
        if (!rule) return;
        const res = await setRuleActive(id, !rule.is_active);
        if (res.success) { rule.is_active = !rule.is_active; _renderList(); }
        else _toast(res.error || 'Failed to update rule', 'error');
      });
    });
    el.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this rule?')) return;
        const id = btn.dataset.del;
        const res = await deleteRule(id);
        if (res.success) { rules = rules.filter((r) => r.id !== id); _renderList(); _renderTemplates(); _toast('Rule deleted', 'success'); }
        else _toast(res.error || 'Failed to delete rule', 'error');
      });
    });
  }

  async function _onSaveNewRule() {
    const ownerId = _ownerId();
    if (!ownerId) return;
    const ruleType = document.getElementById('sd-air-f-type')?.value;
    const matchValue = document.getElementById('sd-air-f-value')?.value?.trim();
    const action = document.getElementById('sd-air-f-action')?.value;
    const label = document.getElementById('sd-air-f-label')?.value?.trim();
    if (!matchValue) { _toast('Enter a value to match', 'error'); return; }
    const btn = document.getElementById('sd-air-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const res = await createRule({ ownerId, ruleType, matchValue, action, label: label || matchValue, priority: 100 });
    if (btn) { btn.disabled = false; btn.textContent = 'Save rule'; }
    if (res.success) {
      _toast('Rule added', 'success');
      document.getElementById('sd-air-f-value').value = '';
      document.getElementById('sd-air-f-label').value = '';
      document.getElementById('sd-air-form')?.classList.remove('show');
      await _reload();
    } else {
      _toast(res.error || 'Failed to save rule', 'error');
    }
  }

  async function _reload() {
    rules = await getRulesForOwner();
    _renderList();
    _renderTemplates();
  }

  async function open() {
    _ensureDom();
    _overlayEl.classList.add('sd-air-show');
    document.getElementById('sd-air-list').innerHTML = '<div id="sd-air-empty">Loading…</div>';
    await _reload();
  }

  function close() {
    _overlayEl?.classList.remove('sd-air-show');
  }

  return { open, close };
})();

window.AIReceptionistRules = AIReceptionistRules;
export default AIReceptionistRules;
