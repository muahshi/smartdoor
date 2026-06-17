/**
 * Smart Door — Dashboard Module
 * Owner Admin Panel Logic & Analytics
 * dashboard.js v2.0 — Phase 3 (Premium OS redesign)
 */

const DashboardModule = (() => {
  // ────────── STATE ──────────
  const state = {
    ownerName: 'Sharma Family',
    callForwarding: true,
    currentStatus: 'available',
    nightModeStart: '22:00',
    nightModeEnd: '06:00',
    chartRange: 'weekly',
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
      blockedSpam: 6,
      weeklyGrowth: 18,
      scansTrend: +12,
      callsTrend: +8,
      voiceTrend: +3,
      bellTrend: +15,
      spamTrend: +4,
    },
    weeklyData: [8, 14, 11, 19, 23, 17, 34],
    monthlyData: [62, 74, 58, 91, 103, 88, 120, 96, 110, 134, 121, 142],
    intentBreakdown: { Delivery: 45, Guest: 25, Spam: 15, Emergency: 5, Unknown: 10 },
  };

  let _statsAnimated = false;

  let _initialized = false;

  function init() {
    if (_initialized) {
      // Already initialized once — just refresh data-driven views, skip skeleton/counter replay
      renderFamilyMembers();
      renderVisitorLogs();
      renderHeatmap('qr-heatmap');
      renderHeatmap('qr-heatmap-desktop');
      updateSubscriptionDays();
      return;
    }
    _initialized = true;

    renderStatsSkeleton();
    setTimeout(() => {
      renderStats();
      _statsAnimated = true;
    }, 450); // brief skeleton phase so the load feels real, not instant
    renderFamilyMembers();
    renderVisitorLogs();
    renderWeeklyChart();
    renderMonthlyChart();
    renderIntentChart();
    renderHeatmap('qr-heatmap');
    renderHeatmap('qr-heatmap-desktop');
    setupToggle();
    setupStatusManager();
    setupNightMode();
    setupAIStatusCustomizer();
    setupFamilyMemberActions();
    setupSecurityTimeline();
    updateSubscriptionDays();
    console.log('[Dashboard] Initialized (v2.0)');
  }

  // ────────── STATS: SKELETON + METRIC CARDS ──────────
  function renderStatsSkeleton() {
    const statsEls = document.querySelectorAll('#dashboard-stats');
    if (!statsEls.length || _statsAnimated) return;
    statsEls.forEach(statsEl => {
      statsEl.innerHTML = Array.from({ length: 6 }).map(() => `
        <div class="metric-card skeleton-card skeleton"></div>
      `).join('');
    });
  }

  function renderStats() {
    const statsEls = document.querySelectorAll('#dashboard-stats');
    if (!statsEls.length) return;

    const items = [
      { label: 'QR Scans', value: state.stats.todayScans, trend: state.stats.scansTrend, icon: '📲', glow: 'rgba(0,162,232,0.2)', chip: 'rgba(0,162,232,0.15)' },
      { label: 'Calls Routed', value: state.stats.callsRouted, trend: state.stats.callsTrend, icon: '📞', glow: 'rgba(0,162,232,0.2)', chip: 'rgba(0,162,232,0.15)' },
      { label: 'Voice Messages', value: state.stats.voiceMessages, trend: state.stats.voiceTrend, icon: '🎤', glow: 'rgba(168,85,247,0.2)', chip: 'rgba(168,85,247,0.15)' },
      { label: 'Bell Rings', value: state.stats.bellRings, trend: state.stats.bellTrend, icon: '🔔', glow: 'rgba(245,158,11,0.2)', chip: 'rgba(245,158,11,0.15)' },
      { label: 'Blocked Spam', value: state.stats.blockedSpam, trend: state.stats.spamTrend, icon: '🚫', glow: 'rgba(239,68,68,0.2)', chip: 'rgba(239,68,68,0.15)', trendDown: false },
      { label: 'Weekly Growth', value: state.stats.weeklyGrowth, suffix: '%', trend: null, icon: '📈', glow: 'rgba(34,197,94,0.2)', chip: 'rgba(34,197,94,0.15)' },
    ];

    statsEls.forEach(statsEl => {
      statsEl.innerHTML = items.map((item, i) => `
        <div class="metric-card fade-in" style="--metric-glow:${item.glow};animation-delay:${i * 40}ms;opacity:1;cursor:default;">
          <div class="metric-icon-chip" style="background:${item.chip};">${item.icon}</div>
          <div class="counter-value stat-number" data-target="${item.value}" data-suffix="${item.suffix || ''}" style="font-size:1.6rem;">0${item.suffix || ''}</div>
          <div class="stat-label">${item.label}</div>
          ${item.trend !== null ? `<div class="stat-trend up">↑ ${item.trend}% this week</div>` : `<div class="stat-trend up">vs last week</div>`}
        </div>
      `).join('');

      animateCounters(statsEl);
    });
  }

  function animateCounters(container) {
    const els = container.querySelectorAll('.counter-value[data-target]');
    els.forEach(el => {
      const target = parseInt(el.dataset.target, 10) || 0;
      const suffix = el.dataset.suffix || '';
      const duration = 900;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
        const current = Math.round(target * eased);
        el.textContent = `${current}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  // ────────── FAMILY MEMBERS (drag-to-reorder priority cards) ──────────
  function renderFamilyMembers() {
    const els = document.querySelectorAll('#family-members-list');
    if (!els.length) return;

    const rankClasses = ['r1', 'r2', 'r3', 'r4'];

    const html = state.familyMembers.map((m, i) => `
      <div class="priority-card" id="family-${m.id}" draggable="true" data-id="${m.id}">
        <div class="drag-handle" title="Drag to reorder">
          <span></span><span></span><span></span>
          <span></span><span></span><span></span>
        </div>
        <div class="priority-rank ${rankClasses[i] || 'r4'}">${i + 1}</div>
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

    els.forEach(el => { el.innerHTML = html; });

    setupFamilyDragReorder();
  }

  function setupFamilyDragReorder() {
    const containers = document.querySelectorAll('#family-members-list');
    containers.forEach(container => {
      let draggedId = null;

      container.querySelectorAll('.priority-card').forEach(card => {
        card.addEventListener('dragstart', () => {
          draggedId = card.dataset.id;
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          container.querySelectorAll('.priority-card').forEach(c => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (card.dataset.id !== draggedId) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('drag-over');
          const targetId = card.dataset.id;
          if (!draggedId || targetId === draggedId) return;
          reorderFamilyMembers(draggedId, targetId);
        });
      });
    });
  }

  function reorderFamilyMembers(draggedId, targetId) {
    const fromIdx = state.familyMembers.findIndex(m => String(m.id) === String(draggedId));
    const toIdx = state.familyMembers.findIndex(m => String(m.id) === String(targetId));
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = state.familyMembers.splice(fromIdx, 1);
    state.familyMembers.splice(toIdx, 0, moved);

    renderFamilyMembers();
    showToast(`Priority order updated — ${moved.name} is now Priority ${toIdx + 1}`, 'success');
    addLog(`Family routing reordered: ${moved.name} → Priority ${toIdx + 1}`, 'status', '#6366F1');
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
    const els = document.querySelectorAll('#visitor-logs');
    if (!els.length) return;

    const html = state.visitorLogs.map(log => `
      <div class="log-item">
        <span class="log-time">${log.time}</span>
        <span class="log-dot" style="background:${log.color};box-shadow:0 0 6px ${log.color}80;"></span>
        <span style="color:rgba(255,255,255,0.75);font-size:0.85rem;">${log.event}</span>
      </div>
    `).join('');

    els.forEach(el => { el.innerHTML = html; });
  }

  function addLog(event, type = 'scan', color = '#00A2E8') {
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    state.visitorLogs.unshift({ time, event, type, color });
    if (state.visitorLogs.length > 20) state.visitorLogs.pop();
    renderVisitorLogs();
  }

  // ────────── CHART RANGE TOGGLE (Weekly / Monthly) ──────────
  function setChartRange(range, btnEl) {
    state.chartRange = range;

    // Update toggle button styles (scoped — there may be a mobile + desktop pair)
    document.querySelectorAll('.chart-range-btn').forEach(b => {
      const isMatch = b.dataset.range === range;
      b.classList.toggle('active', isMatch);
      b.style.background = isMatch ? 'linear-gradient(135deg,rgba(0,162,232,0.25),rgba(0,120,215,0.15))' : 'transparent';
      b.style.color = isMatch ? '#00A2E8' : 'rgba(255,255,255,0.45)';
    });

    document.querySelectorAll('#weekly-chart').forEach(el => { el.style.display = range === 'weekly' ? 'block' : 'none'; });
    document.querySelectorAll('#monthly-chart').forEach(el => { el.style.display = range === 'monthly' ? 'block' : 'none'; });
  }

  // ────────── WEEKLY CHART ──────────
  function renderWeeklyChart() {
    document.querySelectorAll('#weekly-chart').forEach(el => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const max = Math.max(...state.weeklyData);

      el.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px;">
          ${state.weeklyData.map((val, i) => {
            const height = Math.max(8, (val / max) * 90);
            const isToday = i === 6;
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;" class="tooltip">
                <div style="flex:1;width:100%;display:flex;align-items:flex-end;">
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
    });
  }

  // ────────── MONTHLY CHART (horizontal bars, 12 months) ──────────
  function renderMonthlyChart() {
    document.querySelectorAll('#monthly-chart').forEach(el => {
      const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const max = Math.max(...state.monthlyData);

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${state.monthlyData.map((val, i) => {
            const pct = Math.max(4, Math.round((val / max) * 100));
            const isCurrent = i === state.monthlyData.length - 1;
            return `
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:30px;font-size:0.68rem;color:rgba(255,255,255,${isCurrent ? '0.85' : '0.4'});font-family:'Space Grotesk',sans-serif;font-weight:${isCurrent ? '700' : '500'};">${months[i]}</div>
                <div class="month-bar-track">
                  <div class="month-bar-fill" data-pct="${pct}" style="width:0%;${isCurrent ? 'background:linear-gradient(90deg,#00D4FF,#00A2E8);' : ''}"></div>
                </div>
                <div style="width:30px;text-align:right;font-size:0.68rem;color:rgba(255,255,255,0.4);font-family:'Space Grotesk',sans-serif;">${val}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Animate bar fills in on next frame
      requestAnimationFrame(() => {
        el.querySelectorAll('.month-bar-fill').forEach(bar => {
          bar.style.width = `${bar.dataset.pct}%`;
        });
      });
    });
  }

  // ────────── INTENT BREAKDOWN CHART ──────────
  function renderIntentChart() {
    const els = document.querySelectorAll('#intent-chart');
    if (!els.length) return;

    const items = [
      { label: 'Delivery', value: 45, color: '#F59E0B' },
      { label: 'Guest', value: 25, color: '#22C55E' },
      { label: 'Spam', value: 15, color: '#EF4444' },
      { label: 'Emergency', value: 5, color: '#EF4444' },
      { label: 'Unknown', value: 10, color: '#64748B' },
    ];

    const html = `
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

    els.forEach(el => { el.innerHTML = html; });
  }

  // ────────── QR SCAN HEATMAP (placeholder — visual only, no real backend data yet) ──────────
  function renderHeatmap(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;

    // 12 columns (weeks) × 7 rows would be ideal, but we render a flat 84-cell
    // pseudo-random grid as a *visual placeholder*. This is NOT wired to real
    // scan timestamps — swap in actual per-hour scan counts when that data exists.
    const cellCount = 84;
    let html = '';
    for (let i = 0; i < cellCount; i++) {
      const intensity = (Math.sin(i * 1.7) + 1) / 2; // deterministic pseudo-pattern, not random per render
      const opacity = (0.05 + intensity * 0.55).toFixed(2);
      html += `<div class="heatmap-cell" style="--h-opacity:${opacity};"></div>`;
    }
    el.innerHTML = html;
  }

  // ────────── PRIVACY SHIELD TOGGLE ──────────
  function setupToggle() {
    const toggles = document.querySelectorAll('#privacy-toggle');
    if (!toggles.length) return;

    toggles.forEach(toggleEl => {
      toggleEl.checked = state.callForwarding;

      toggleEl.addEventListener('change', (e) => {
        state.callForwarding = e.target.checked;

        // Sync all toggle instances + their status labels (mobile + desktop)
        toggles.forEach(t => { t.checked = state.callForwarding; });
        document.querySelectorAll('#privacy-status-text').forEach(statusEl => {
          statusEl.textContent = state.callForwarding ? 'ON' : 'OFF';
          statusEl.style.color = state.callForwarding ? '#22C55E' : '#EF4444';
        });

        showToast(
          state.callForwarding ? '✅ Call Forwarding Enabled' : '⚠️ Call Forwarding Disabled',
          state.callForwarding ? 'success' : 'warning'
        );
        addLog(`Call Forwarding turned ${state.callForwarding ? 'ON' : 'OFF'}`, 'status', '#22C55E');
      });
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
    document.querySelectorAll('#night-start').forEach(el => { el.value = state.nightModeStart; });
    document.querySelectorAll('#night-end').forEach(el => { el.value = state.nightModeEnd; });

    document.querySelectorAll('#save-night-mode').forEach(saveEl => {
      saveEl.addEventListener('click', () => {
        // Read from whichever start/end inputs are nearest this button's panel,
        // falling back to the first instance found.
        const panel = saveEl.closest('.dash-card') || document;
        const startEl = panel.querySelector('#night-start') || document.querySelector('#night-start');
        const endEl = panel.querySelector('#night-end') || document.querySelector('#night-end');

        state.nightModeStart = startEl?.value || '22:00';
        state.nightModeEnd = endEl?.value || '06:00';

        document.querySelectorAll('#night-start').forEach(el => { el.value = state.nightModeStart; });
        document.querySelectorAll('#night-end').forEach(el => { el.value = state.nightModeEnd; });

        showToast(`🌙 Night Mode: ${state.nightModeStart} – ${state.nightModeEnd}`, 'success');
        addLog(`Night Mode set: ${state.nightModeStart}–${state.nightModeEnd}`, 'status', '#6366F1');
      });
    });
  }

  // ────────── AI STATUS CUSTOMIZER ──────────
  function setupAIStatusCustomizer() {
    const generateEls = document.querySelectorAll('#ai-generate-btn');

    generateEls.forEach(generateEl => {
      const panel = generateEl.closest('.dash-card') || generateEl.parentElement;
      const inputEl = panel?.querySelector('#ai-status-input') || document.querySelector('#ai-status-input');
      const outputEl = panel?.querySelector('#ai-status-output') || document.querySelector('#ai-status-output');
      const useEl = panel?.querySelector('#use-ai-message-btn') || document.querySelector('#use-ai-message-btn');

      const originalLabel = generateEl.innerHTML;

      generateEl.addEventListener('click', async () => {
        const rawNote = inputEl?.value?.trim();
        if (!rawNote) {
          showToast('Please describe your situation first', 'warning');
          return;
        }

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
        generateEl.innerHTML = originalLabel;
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
    });
  }

  // ────────── ADD FAMILY MEMBER FORM ──────────
  function setupFamilyMemberActions() {
    document.querySelectorAll('#add-member-btn').forEach(addBtn => {
      addBtn.addEventListener('click', () => {
        const name = prompt('Family member name:');
        if (!name) return;
        const phone = prompt('Phone number (e.g. +91 98765 43210):');
        if (!phone) return;
        addMember(name.trim(), phone.trim());
      });
    });
  }

  // ────────── SECURITY TIMELINE ──────────
  function setupSecurityTimeline() {
    const els = document.querySelectorAll('#security-timeline');
    if (!els.length) return;

    const events = [
      { time: 'Today 6:45 PM', event: 'Night Mode activated', icon: '🌙', color: '#6366F1' },
      { time: 'Today 2:20 PM', event: 'Spam call blocked by AI', icon: '🚫', color: '#EF4444' },
      { time: 'Today 2:14 PM', event: 'QR scanned by delivery agent', icon: '📲', color: '#00A2E8' },
      { time: 'Yesterday 9:12 AM', event: 'Family Routing updated', icon: '👨‍👩‍👧', color: '#22C55E' },
    ];

    const html = events.map((e, i) => `
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

    els.forEach(el => { el.innerHTML = html; });
  }

  // ────────── SUBSCRIPTION: DAYS REMAINING ──────────
  function updateSubscriptionDays() {
    const renewalDate = new Date('2027-01-14T00:00:00');
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = Math.max(0, Math.ceil((renewalDate - now) / msPerDay));

    const daysEl = document.getElementById('sub-days-remaining');
    if (daysEl) daysEl.textContent = `${daysLeft} days`;
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
    setChartRange,
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
