/**
 * Smart Door — Dashboard Module
 * Owner Admin Panel Logic & Analytics
 * dashboard.js v1.0
 */

const DashboardModule = (() => {
  // ────────── STATE ──────────
  const state = {
    ownerName: 'Sharma Family',
    callForwarding: true,
    currentStatus: 'available',
    nightModeStart: '22:00',
    nightModeEnd: '06:00',
    familyMembers: [
      { id: 1, name: 'Father', phone: '+91 98765 43210', active: true },
      { id: 2, name: 'Mother', phone: '+91 98765 43211', active: true },
      { id: 3, name: 'Son', phone: '+91 98765 43212', active: true },
      { id: 4, name: 'Daughter', phone: '+91 98765 43213', active: false },
    ],
    visitorLogs: [
      { time: '2:14 PM', event: 'Courier scanned QR', type: 'scan', color: '#00A2E8' },
      { time: '2:15 PM', event: 'Digital Bell Rung', type: 'bell', color: '#F59E0B' },
      { time: '2:16 PM', event: 'Voice Message Left (10 sec)', type: 'voice', color: '#22C55E' },
      { time: '2:20 PM', event: 'AI: Intent Detected (Delivery)', type: 'ai', color: '#00A2E8' },
      { time: '6:45 PM', event: 'Status changed to Baby Sleeping', type: 'status', color: '#9333EA' },
    ],
    stats: {
      todayScans: 34,
      callsRouted: 12,
      voiceMessages: 7,
      bellRings: 19,
      scansTrend: +12,
      callsTrend: +8,
      voiceTrend: +3,
      bellTrend: +15,
    },
    weeklyData: [8, 14, 11, 19, 23, 17, 34],
    intentBreakdown: { Delivery: 45, Guest: 25, Spam: 15, Emergency: 5, Unknown: 10 },
  };

  // ────────── INIT ──────────
  function init() {
    renderStats();
    renderFamilyMembers();
    renderVisitorLogs();
    renderWeeklyChart();
    renderIntentChart();
    setupToggle();
    setupStatusManager();
    setupNightMode();
    setupAIStatusCustomizer();
    setupFamilyMemberActions();
    setupSecurityTimeline();
    console.log('[Dashboard] Initialized');
  }

  // ────────── STATS ──────────
  function renderStats() {
    const statsEl = document.getElementById('dashboard-stats');
    if (!statsEl) return;

    const items = [
      { label: "Today's Scans", value: state.stats.todayScans, trend: state.stats.scansTrend, icon: '📲' },
      { label: 'Calls Routed', value: state.stats.callsRouted, trend: state.stats.callsTrend, icon: '📞' },
      { label: 'Voice Messages', value: state.stats.voiceMessages, trend: state.stats.voiceTrend, icon: '🎤' },
      { label: 'Bell Rings', value: state.stats.bellRings, trend: state.stats.bellTrend, icon: '🔔' },
    ];

    statsEl.innerHTML = items.map(item => `
      <div class="stat-card" style="cursor:default;">
        <div style="font-size:1.5rem;margin-bottom:8px;">${item.icon}</div>
        <div class="stat-number">${item.value}</div>
        <div class="stat-label">${item.label}</div>
        <div class="stat-trend up">↑ ${item.trend}% this week</div>
      </div>
    `).join('');
  }

  // ────────── FAMILY MEMBERS ──────────
  function renderFamilyMembers() {
    const el = document.getElementById('family-members-list');
    if (!el) return;

    el.innerHTML = state.familyMembers.map((m, i) => `
      <div class="family-member-row" id="family-${m.id}" style="
        display:flex;align-items:center;gap:12px;padding:12px;
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
        border-radius:10px;transition:all 0.25s;
      ">
        <div style="
          width:32px;height:32px;border-radius:50%;
          background:linear-gradient(135deg,#00A2E8,#0078D7);
          display:flex;align-items:center;justify-content:center;
          font-size:0.85rem;font-weight:700;color:#fff;flex-shrink:0;
        ">${i + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.9rem;color:#E2ECF4;">${m.name}</div>
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.4);font-family:'Space Grotesk',sans-serif;">${m.phone}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="
            width:8px;height:8px;border-radius:50%;flex-shrink:0;
            background:${m.active ? '#22C55E' : 'rgba(255,255,255,0.2)'};
            box-shadow:${m.active ? '0 0 8px rgba(34,197,94,0.5)' : 'none'};
          "></span>
          <button onclick="DashboardModule.removeMember(${m.id})" style="
            background:none;border:none;cursor:pointer;
            color:rgba(255,255,255,0.3);font-size:1rem;padding:4px;
            transition:all 0.2s;border-radius:4px;
          " onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='rgba(255,255,255,0.3)'">✕</button>
        </div>
      </div>
    `).join('');
  }

  function removeMember(id) {
    const member = state.familyMembers.find(m => m.id === id);
    if (!member) return;
    if (confirm(`Remove ${member.name} from family routing?`)) {
      state.familyMembers = state.familyMembers.filter(m => m.id !== id);
      renderFamilyMembers();
      showToast(`${member.name} removed from routing`, 'warning');
    }
  }

  function addMember(name, phone) {
    if (state.familyMembers.length >= 4) {
      showToast('Maximum 4 family members allowed', 'danger');
      return;
    }
    const id = Date.now();
    state.familyMembers.push({ id, name, phone, active: true });
    renderFamilyMembers();
    showToast(`${name} added to family routing`, 'success');
  }

  // ────────── VISITOR LOGS ──────────
  function renderVisitorLogs() {
    const el = document.getElementById('visitor-logs');
    if (!el) return;

    el.innerHTML = state.visitorLogs.map(log => `
      <div class="log-item">
        <span class="log-time">${log.time}</span>
        <span class="log-dot" style="background:${log.color};box-shadow:0 0 6px ${log.color}80;"></span>
        <span style="color:rgba(255,255,255,0.75);font-size:0.85rem;">${log.event}</span>
      </div>
    `).join('');
  }

  function addLog(event, type = 'scan', color = '#00A2E8') {
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    state.visitorLogs.unshift({ time, event, type, color });
    if (state.visitorLogs.length > 20) state.visitorLogs.pop();
    renderVisitorLogs();
  }

  // ────────── WEEKLY CHART ──────────
  function renderWeeklyChart() {
    const el = document.getElementById('weekly-chart');
    if (!el) return;

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const max = Math.max(...state.weeklyData);

    el.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px;">
        ${state.weeklyData.map((val, i) => {
          const height = Math.max(8, (val / max) * 90);
          const isToday = i === 6;
          return `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;" class="tooltip">
              <div style="
                flex:1;width:100%;display:flex;align-items:flex-end;
              ">
                <div style="
                  width:100%;height:${height}%;min-height:8px;
                  background:${isToday ? 'linear-gradient(180deg,#00D4FF,#0078D7)' : 'rgba(0,162,232,0.25)'};
                  border-radius:6px 6px 2px 2px;
                  transition:all 0.3s;
                  box-shadow:${isToday ? '0 0 10px rgba(0,162,232,0.4)' : 'none'};
                  cursor:pointer;
                " onmouseover="this.style.background='linear-gradient(180deg,#00D4FF,#0078D7)';this.style.boxShadow='0 0 10px rgba(0,162,232,0.4)'"
                   onmouseout="this.style.background='${isToday ? 'linear-gradient(180deg,#00D4FF,#0078D7)' : 'rgba(0,162,232,0.25)'}';this.style.boxShadow='${isToday ? '0 0 10px rgba(0,162,232,0.4)' : 'none'}'"></div>
              </div>
              <div style="font-size:0.65rem;color:rgba(255,255,255,${isToday ? '0.8' : '0.35'});font-family:'Space Grotesk',sans-serif;font-weight:${isToday ? '700' : '400'};">${days[i]}</div>
              <span class="tooltip-text">${val} scans</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ────────── INTENT BREAKDOWN CHART ──────────
  function renderIntentChart() {
    const el = document.getElementById('intent-chart');
    if (!el) return;

    const items = [
      { label: 'Delivery', value: 45, color: '#F59E0B' },
      { label: 'Guest', value: 25, color: '#22C55E' },
      { label: 'Spam', value: 15, color: '#EF4444' },
      { label: 'Emergency', value: 5, color: '#EF4444' },
      { label: 'Unknown', value: 10, color: '#64748B' },
    ];

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map(item => `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="
              width:10px;height:10px;border-radius:3px;
              background:${item.color};flex-shrink:0;
            "></div>
            <div style="flex:1;font-size:0.8rem;color:rgba(255,255,255,0.65);">${item.label}</div>
            <div style="font-size:0.8rem;font-weight:600;color:#E2ECF4;font-family:'Space Grotesk',sans-serif;">${item.value}%</div>
            <div style="width:60px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
              <div style="width:${item.value}%;height:100%;background:${item.color};border-radius:3px;transition:width 0.8s ease;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ────────── PRIVACY SHIELD TOGGLE ──────────
  function setupToggle() {
    const toggleEl = document.getElementById('privacy-toggle');
    const statusEl = document.getElementById('privacy-status-text');
    if (!toggleEl) return;

    toggleEl.checked = state.callForwarding;

    toggleEl.addEventListener('change', (e) => {
      state.callForwarding = e.target.checked;
      if (statusEl) {
        statusEl.textContent = state.callForwarding ? 'ON' : 'OFF';
        statusEl.style.color = state.callForwarding ? '#22C55E' : '#EF4444';
      }
      showToast(
        state.callForwarding ? '✅ Call Forwarding Enabled' : '⚠️ Call Forwarding Disabled',
        state.callForwarding ? 'success' : 'warning'
      );
      addLog(`Call Forwarding turned ${state.callForwarding ? 'ON' : 'OFF'}`, 'status', '#22C55E');
    });
  }

  // ────────── STATUS MANAGER ──────────
  function setupStatusManager() {
    const statusOptions = document.querySelectorAll('[data-status]');
    statusOptions.forEach(option => {
      option.addEventListener('click', () => {
        statusOptions.forEach(o => {
          o.style.borderColor = 'rgba(255,255,255,0.07)';
          o.style.background = 'rgba(255,255,255,0.03)';
          o.style.boxShadow = 'none';
          const dot = o.querySelector('.check-icon');
          if (dot) dot.style.opacity = '0';
        });

        option.style.borderColor = 'rgba(0,162,232,0.5)';
        option.style.background = 'rgba(0,162,232,0.08)';
        option.style.boxShadow = '0 0 15px rgba(0,162,232,0.15)';
        const dot = option.querySelector('.check-icon');
        if (dot) dot.style.opacity = '1';

        state.currentStatus = option.dataset.status;
        const label = option.dataset.label || state.currentStatus;
        showToast(`Status updated: ${label}`, 'success');
        addLog(`Status changed to: ${label}`, 'status', '#9333EA');
      });
    });
  }

  // ────────── NIGHT MODE ──────────
  function setupNightMode() {
    const startEl = document.getElementById('night-start');
    const endEl = document.getElementById('night-end');
    const saveEl = document.getElementById('save-night-mode');

    if (startEl) startEl.value = state.nightModeStart;
    if (endEl) endEl.value = state.nightModeEnd;

    if (saveEl) {
      saveEl.addEventListener('click', () => {
        state.nightModeStart = startEl?.value || '22:00';
        state.nightModeEnd = endEl?.value || '06:00';
        showToast(`🌙 Night Mode: ${state.nightModeStart} – ${state.nightModeEnd}`, 'success');
        addLog(`Night Mode set: ${state.nightModeStart}–${state.nightModeEnd}`, 'status', '#6366F1');
      });
    }
  }

  // ────────── AI STATUS CUSTOMIZER ──────────
  function setupAIStatusCustomizer() {
    const inputEl = document.getElementById('ai-status-input');
    const generateEl = document.getElementById('ai-generate-btn');
    const outputEl = document.getElementById('ai-status-output');
    const useEl = document.getElementById('use-ai-message-btn');

    if (!generateEl) return;

    generateEl.addEventListener('click', async () => {
      const rawNote = inputEl?.value?.trim();
      if (!rawNote) {
        showToast('Please describe your situation first', 'warning');
        return;
      }

      // Show loading
      generateEl.disabled = true;
      generateEl.innerHTML = `<span style="display:flex;align-items:center;gap:8px;"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span> Generating...</span>`;

      if (outputEl) {
        outputEl.innerHTML = `
          <div class="ai-thinking" style="justify-content:center;padding:20px;">
            <span class="ai-dot"></span>
            <span class="ai-dot"></span>
            <span class="ai-dot"></span>
          </div>
        `;
      }

      try {
        const message = await window.GroqService.generateStatusMessage(rawNote);

        if (outputEl) {
          outputEl.innerHTML = `
            <div style="
              white-space:pre-line;
              font-size:0.88rem;
              color:#C8E8F8;
              line-height:1.7;
              animation:slide-in-up 0.3s ease;
            ">${message}</div>
          `;
        }

        if (useEl) {
          useEl.style.display = 'flex';
          useEl._generatedMessage = message;
        }
      } catch (err) {
        showToast('AI generation failed. Please try again.', 'danger');
      }

      generateEl.disabled = false;
      generateEl.innerHTML = `✨ Generate with AI`;
    });

    if (useEl) {
      useEl.addEventListener('click', () => {
        const msg = useEl._generatedMessage;
        if (msg) {
          showToast('✅ AI message is now live for visitors!', 'success');
          addLog('AI-generated status message activated', 'ai', '#9333EA');
        }
      });
    }
  }

  // ────────── ADD FAMILY MEMBER FORM ──────────
  function setupFamilyMemberActions() {
    const addBtn = document.getElementById('add-member-btn');
    if (!addBtn) return;

    addBtn.addEventListener('click', () => {
      const name = prompt('Family member name:');
      if (!name) return;
      const phone = prompt('Phone number (e.g. +91 98765 43210):');
      if (!phone) return;
      addMember(name.trim(), phone.trim());
    });
  }

  // ────────── SECURITY TIMELINE ──────────
  function setupSecurityTimeline() {
    const el = document.getElementById('security-timeline');
    if (!el) return;

    const events = [
      { time: 'Today 6:45 PM', event: 'Night Mode activated', icon: '🌙', color: '#6366F1' },
      { time: 'Today 2:20 PM', event: 'Spam call blocked by AI', icon: '🚫', color: '#EF4444' },
      { time: 'Today 2:14 PM', event: 'QR scanned by delivery agent', icon: '📲', color: '#00A2E8' },
      { time: 'Yesterday 9:12 AM', event: 'Family Routing updated', icon: '👨‍👩‍👧', color: '#22C55E' },
    ];

    el.innerHTML = events.map((e, i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;${i < events.length - 1 ? 'padding-bottom:16px;border-bottom:1px dashed rgba(255,255,255,0.06);margin-bottom:4px;' : ''}">
        <div style="
          width:32px;height:32px;border-radius:50%;background:${e.color}20;
          border:1px solid ${e.color}40;display:flex;align-items:center;
          justify-content:center;font-size:0.85rem;flex-shrink:0;
        ">${e.icon}</div>
        <div>
          <div style="font-size:0.85rem;color:#E2ECF4;font-weight:500;">${e.event}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-top:2px;">${e.time}</div>
        </div>
      </div>
    `).join('');
  }

  // ────────── TOAST NOTIFICATIONS ──────────
  function showToast(message, type = 'info') {
    const colors = {
      success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', text: '#22C55E' },
      warning: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B' },
      danger: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#EF4444' },
      info: { bg: 'rgba(0,162,232,0.15)', border: 'rgba(0,162,232,0.4)', text: '#00A2E8' },
    };

    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:14px 20px;border-radius:12px;
      background:${c.bg};border:1px solid ${c.border};
      color:${c.text};font-size:0.88rem;font-weight:600;
      font-family:'Inter',sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
      animation:slide-in-up 0.3s ease;
      max-width:300px;backdrop-filter:blur(20px);
    `;
    toast.textContent = message;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ────────── PUBLIC API ──────────
  return {
    init,
    addLog,
    showToast,
    addMember,
    removeMember,
    getState: () => ({ ...state }),
  };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dashboard-stats') || document.getElementById('visitor-logs')) {
    DashboardModule.init();
  }
});

window.DashboardModule = DashboardModule;
