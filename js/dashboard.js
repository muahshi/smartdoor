/**
 * Smart Door — Dashboard Module (Phase 4)
 * dashboard.js v3.0 — Supabase Connected
 *
 * CHANGES from v2.0:
 * - All mock data replaced with real Supabase calls
 * - Realtime subscriptions for live visitor feed
 * - Auth check on init
 * - Family members CRUD → Supabase
 * - Security rules → Supabase
 * - Stats → real DB counts
 *
 * UI is NOT modified — only data layer replaced.
 */

import { getCurrentOwner, requireAuth, logoutOwner, startInactivityTimer } from '../services/auth.js';
import { getLogs, getTodayStats, getWeeklyData, getMonthlyData, getWeeklyGrowth, getScanHeatmapData, logEvent, subscribeToLogs, subscribeToSOS, formatLogForDisplay } from '../services/logs.js';
import { getSecurityRules, updateSecurityRules, updateOwnerStatus, getFamilyMembers, addFamilyMember, removeFamilyMember, reorderFamilyMembers } from '../services/security.js';
import { getSubscription, getRenewalInfo } from '../services/subscriptions.js';
import { getOnboardingProgress, markOnboardingStep } from '../services/customerSuccess.js';
import { getOrderSummary, subscribeToOrderTracking } from '../services/orders.js';
import { getCommunicationLogs, subscribeToCommunicationLogs } from '../services/communication.js';
import { getVoiceNoteUrl } from '../services/voiceNotes.js';

const DashboardModule = (() => {
  // ────────── STATE ──────────
  const state = {
    owner: null,
    callForwarding: true,
    currentStatus: 'available',
    nightModeStart: '22:00',
    nightModeEnd: '06:00',
    chartRange: 'weekly',
    familyMembers: [],
    visitorLogs: [],
    stats: { todayScans: 0, callsRouted: 0, voiceMessages: 0, bellRings: 0, blockedSpam: 0, weeklyGrowth: 0 },
    weeklyData: [0, 0, 0, 0, 0, 0, 0],
    monthlyData: new Array(12).fill(0),
    heatmapData: new Array(84).fill(0),
    intentBreakdown: {},
    subscription: null,
    orderSummary: null,          // Phase 6: latest order tracking
    onboarding: null,            // Setup checklist progress
    _realtimeUnsubs: [],
  };

  let _statsAnimated = false;
  let _initialized = false;

  // ────────── INIT ──────────
  async function init() {
    // Auth guard
    const authed = await requireAuth();
    if (!authed) return;

    if (_initialized) {
      await _refreshData();
      return;
    }
    _initialized = true;

    // Start inactivity timer
    startInactivityTimer();

    // Load owner profile
    state.owner = await getCurrentOwner();
    if (!state.owner) {
      showToast('Session expired. Please log in again.', 'danger');
      setTimeout(() => { window.location.href = '/'; }, 2000);
      return;
    }

    // Show skeleton while loading
    renderStatsSkeleton();

    // Load all data in parallel
    await _loadAllData();

    // Setup realtime
    _setupRealtime();

    // Render everything
    renderStats();
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

    // Setup checklist — new owner onboarding guidance
    await _loadAndRenderSetupChecklist();
    if (state.orderSummary && state.orderSummary.manufacturingStatus !== 'delivered') {
      const trackCard = document.getElementById('order-tracking-card');
      if (trackCard) trackCard.style.display = 'block';

      // Live tracking subscribe karo
      const unsub = subscribeToOrderTracking(state.orderSummary.orderId, (event) => {
        state.orderSummary.events.push(event);
        state.orderSummary.trackingStatus = event.event_type;
        _renderOrderTrackingCard();
        showToast(`📦 ${event.event_label}`, 'info');
      });
      state._realtimeUnsubs.push(unsub);
    }

    // Update owner name display
    _updateOwnerNameUI();

    console.log('[Dashboard] Initialized v3.0 (Supabase connected)');
  }

  // ────────── LOAD ALL DATA ──────────
  async function _loadAllData() {
    const ownerId = state.owner.id;

    const [logsResult, statsResult, weeklyResult, monthlyResult, growthResult, heatmapResult, rulesResult, familyResult, subResult, commsResult, orderResult] = await Promise.allSettled([
      getLogs(ownerId, { limit: 20 }),
      getTodayStats(ownerId),
      getWeeklyData(ownerId),
      getMonthlyData(ownerId),
      getWeeklyGrowth(ownerId),
      getScanHeatmapData(ownerId),
      getSecurityRules(ownerId),
      getFamilyMembers(ownerId),
      getSubscription(ownerId),
      getCommunicationLogs(ownerId, { limit: 20 }),
      getOrderSummary(ownerId),   // Phase 6: latest order
    ]);

    // Visitor logs
    if (logsResult.status === 'fulfilled' && logsResult.value.success) {
      state.visitorLogs = logsResult.value.logs.map(formatLogForDisplay);
    }

    // Communication logs (call history, voice notes, messages, emergency alerts)
    // — merged into the same unified timeline the dashboard already renders
    // via #visitor-logs / #security-timeline, newest first.
    if (commsResult.status === 'fulfilled' && commsResult.value.success) {
      state.visitorLogs = [...state.visitorLogs, ...commsResult.value.logs]
        .sort((a, b) => new Date(b.raw.created_at) - new Date(a.raw.created_at))
        .slice(0, 20);
    }

    // Stats
    if (statsResult.status === 'fulfilled' && statsResult.value.success) {
      const s = statsResult.value.stats;
      state.stats = {
        todayScans:    s.todayScans,
        callsRouted:   s.callsRouted,
        voiceMessages: s.voiceMessages,
        bellRings:     s.bellRings,
        blockedSpam:   s.blockedSpam,
        weeklyGrowth:  growthResult.status === 'fulfilled' ? growthResult.value.weeklyGrowth : 0,
        scansTrend:    0,
        callsTrend:    0,
        voiceTrend:    0,
        bellTrend:     0,
        spamTrend:     0,
      };
      state.intentBreakdown = statsResult.value.intentBreakdown;
    }

    // Weekly chart data
    if (weeklyResult.status === 'fulfilled' && weeklyResult.value.success) {
      state.weeklyData = weeklyResult.value.weeklyData;
    }

    // Monthly chart data
    if (monthlyResult.status === 'fulfilled' && monthlyResult.value.success) {
      state.monthlyData = monthlyResult.value.monthlyData;
    }

    // QR scan heatmap data
    if (heatmapResult.status === 'fulfilled' && heatmapResult.value.success) {
      state.heatmapData = heatmapResult.value.intensities;
    }

    // Security rules
    if (rulesResult.status === 'fulfilled' && rulesResult.value.success) {
      const r = rulesResult.value.rules;
      state.callForwarding  = r.call_forwarding;
      state.currentStatus   = r.current_status;
      state.nightModeStart  = r.night_mode_start || '22:00';
      state.nightModeEnd    = r.night_mode_end   || '06:00';
    }

    // Family members
    if (familyResult.status === 'fulfilled' && familyResult.value.success) {
      state.familyMembers = familyResult.value.members.map(m => ({
        id:     m.id,
        name:   m.name,
        phone:  m.phone,
        active: m.is_active,
      }));
    }

    // Subscription
    if (subResult.status === 'fulfilled' && subResult.value.success) {
      state.subscription = subResult.value.subscription;
    }

    // Phase 6: Latest order summary
    if (orderResult.status === 'fulfilled' && orderResult.value.success) {
      state.orderSummary = orderResult.value.summary;
    }
  }

  async function _refreshData() {
    if (!state.owner) {
      state.owner = await getCurrentOwner();
      if (!state.owner) return;
    }
    await _loadAllData();
    renderFamilyMembers();
    renderVisitorLogs();
    renderHeatmap('qr-heatmap');
    renderHeatmap('qr-heatmap-desktop');
    updateSubscriptionDays();
  }

  // ────────── REALTIME SETUP ──────────
  function _setupRealtime() {
    const ownerId = state.owner.id;

    // New visitor log → prepend to list + update stats counter
    const unsubLogs = subscribeToLogs(ownerId, (newLog) => {
      const formatted = formatLogForDisplay(newLog);
      state.visitorLogs.unshift(formatted);
      if (state.visitorLogs.length > 20) state.visitorLogs.pop();
      renderVisitorLogs();
      showToast(`${formatted.icon} ${formatted.event}`, _logToToastType(newLog.event_type));
      _bumpStat(newLog.event_type);
    });

    // SOS alert → special notification
    const unsubSOS = subscribeToSOS(ownerId, () => {
      showToast('🚨 SOS EMERGENCY ALERT!', 'danger');
      // Flash the dashboard
      document.body.style.background = 'rgba(239,68,68,0.1)';
      setTimeout(() => { document.body.style.background = ''; }, 2000);
    });

    // Communication engine: call history + voice notes + messages + emergency alerts
    const unsubComms = subscribeToCommunicationLogs(ownerId, (formatted, kind) => {
      state.visitorLogs.unshift(formatted);
      if (state.visitorLogs.length > 20) state.visitorLogs.pop();
      renderVisitorLogs();
      setupSecurityTimeline();

      if (kind === 'call') {
        if (formatted.raw.call_status === 'completed') _bumpStat('call_attempt');
        showToast(`${formatted.icon} ${formatted.event}`, formatted.raw.call_status === 'completed' ? 'success' : 'info');
      } else if (kind === 'message') {
        const isEmergency = formatted.raw.message_type === 'emergency';
        if (!isEmergency) _bumpStat('voice_message');
        showToast(`${formatted.icon} ${formatted.event}`, isEmergency ? 'danger' : 'success');
        if (isEmergency) {
          document.body.style.background = 'rgba(239,68,68,0.1)';
          setTimeout(() => { document.body.style.background = ''; }, 2000);
        }
      }
    });

    state._realtimeUnsubs = [unsubLogs, unsubSOS, unsubComms];
  }

  function _bumpStat(eventType) {
    const map = {
      qr_scan:       'todayScans',
      call_attempt:  'callsRouted',
      voice_message: 'voiceMessages',
      bell_ring:     'bellRings',
      spam_blocked:  'blockedSpam',
    };
    if (map[eventType]) {
      state.stats[map[eventType]]++;
      renderStats(); // re-render stat cards
    }
  }

  function _logToToastType(eventType) {
    const map = { sos: 'danger', spam_blocked: 'danger', bell_ring: 'warning', voice_message: 'success' };
    return map[eventType] || 'info';
  }

  function _updateOwnerNameUI() {
    const name = state.owner?.full_name || 'My Home';
    document.querySelectorAll('[data-owner-name]').forEach(el => { el.textContent = name; });
    document.querySelectorAll('[data-plate-id]').forEach(el => { el.textContent = state.owner?.plate_id || ''; });
  }

  // ────────── RENDER STATS ──────────
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
      { label: 'QR Scans',       value: state.stats.todayScans,    trend: state.stats.scansTrend,  icon: '📲', glow: 'rgba(0,162,232,0.2)',   chip: 'rgba(0,162,232,0.15)'  },
      { label: 'Calls Routed',   value: state.stats.callsRouted,   trend: state.stats.callsTrend,  icon: '📞', glow: 'rgba(0,162,232,0.2)',   chip: 'rgba(0,162,232,0.15)'  },
      { label: 'Voice Messages', value: state.stats.voiceMessages, trend: state.stats.voiceTrend,  icon: '🎤', glow: 'rgba(168,85,247,0.2)',  chip: 'rgba(168,85,247,0.15)' },
      { label: 'Bell Rings',     value: state.stats.bellRings,     trend: state.stats.bellTrend,   icon: '🔔', glow: 'rgba(245,158,11,0.2)',  chip: 'rgba(245,158,11,0.15)' },
      { label: 'Blocked Spam',   value: state.stats.blockedSpam,   trend: state.stats.spamTrend,   icon: '🚫', glow: 'rgba(239,68,68,0.2)',   chip: 'rgba(239,68,68,0.15)'  },
      { label: 'Weekly Growth',  value: state.stats.weeklyGrowth,  suffix: '%', trend: null,       icon: '📈', glow: 'rgba(34,197,94,0.2)',   chip: 'rgba(34,197,94,0.15)'  },
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
    _statsAnimated = true;
  }

  function animateCounters(container) {
    const els = container.querySelectorAll('.counter-value[data-target]');
    els.forEach(el => {
      const target   = parseInt(el.dataset.target, 10) || 0;
      const suffix   = el.dataset.suffix || '';
      const duration = 900;
      const start    = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        el.textContent = `${Math.round(target * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  // ────────── FAMILY MEMBERS ──────────
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
          <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
            background:${m.active ? '#22C55E' : 'rgba(255,255,255,0.2)'};
            box-shadow:${m.active ? '0 0 8px rgba(34,197,94,0.5)' : 'none'};"></span>
          <button onclick="DashboardModule.removeMember('${m.id}')" style="
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
        card.addEventListener('dragstart', () => { draggedId = card.dataset.id; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); container.querySelectorAll('.priority-card').forEach(c => c.classList.remove('drag-over')); });
        card.addEventListener('dragover', (e) => { e.preventDefault(); if (card.dataset.id !== draggedId) card.classList.add('drag-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); card.classList.remove('drag-over');
          if (!draggedId || card.dataset.id === draggedId) return;
          _reorderMembersLocal(draggedId, card.dataset.id);
        });
      });
    });
  }

  function _reorderMembersLocal(draggedId, targetId) {
    const fromIdx = state.familyMembers.findIndex(m => String(m.id) === String(draggedId));
    const toIdx   = state.familyMembers.findIndex(m => String(m.id) === String(targetId));
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = state.familyMembers.splice(fromIdx, 1);
    state.familyMembers.splice(toIdx, 0, moved);
    renderFamilyMembers();

    // Persist to Supabase
    const orderedIds = state.familyMembers.map(m => m.id);
    reorderFamilyMembers(state.owner.id, orderedIds).then(() => {
      showToast(`Priority order updated — ${moved.name} is now Priority ${toIdx + 1}`, 'success');
    });
  }

  async function removeMember(id) {
    const member = state.familyMembers.find(m => String(m.id) === String(id));
    if (!member) return;
    if (!confirm(`Remove ${member.name} from family routing?`)) return;

    const result = await removeFamilyMember(id, state.owner.id);
    if (result.success) {
      state.familyMembers = state.familyMembers.filter(m => String(m.id) !== String(id));
      renderFamilyMembers();
      showToast(`${member.name} removed from routing`, 'warning');
    } else {
      showToast('Failed to remove member. Try again.', 'danger');
    }
  }

  async function _addMember(name, phone) {
    if (state.familyMembers.length >= 4) {
      showToast('Maximum 4 family members allowed', 'danger');
      return;
    }
    const result = await addFamilyMember(state.owner.id, { name, phone });
    if (result.success) {
      state.familyMembers.push({
        id: result.member.id,
        name: result.member.name,
        phone: result.member.phone,
        active: result.member.is_active,
      });
      renderFamilyMembers();
      showToast(`${name} added to family routing`, 'success');
      // Mark onboarding step
      markOnboardingStep(state.owner.id, 'family_setup').catch(() => {});
      _loadAndRenderSetupChecklist();
    } else {
      showToast(result.error || 'Failed to add member', 'danger');
    }
  }

  // ────────── VISITOR LOGS ──────────
  function renderVisitorLogs() {
    const els = document.querySelectorAll('#visitor-logs');
    if (!els.length) return;

    const html = state.visitorLogs.length
      ? state.visitorLogs.map(log => `
          <div class="log-item">
            <span class="log-time">${log.time}</span>
            <span class="log-dot" style="background:${log.color};box-shadow:0 0 6px ${log.color}80;"></span>
            <span style="color:rgba(255,255,255,0.75);font-size:0.85rem;">${log.event}</span>
          </div>
        `).join('')
      : `<div style="color:rgba(255,255,255,0.3);font-size:0.85rem;text-align:center;padding:20px 0;">No visitor activity yet today</div>`;

    els.forEach(el => { el.innerHTML = html; });
  }

  function addLog(event, type = 'scan', color = '#00A2E8') {
    const now  = new Date();
    const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    state.visitorLogs.unshift({ time, event, type, color, icon: '📋' });
    if (state.visitorLogs.length > 20) state.visitorLogs.pop();
    renderVisitorLogs();

    // Also persist to Supabase
    if (state.owner) {
      logEvent({
        ownerId:   state.owner.id,
        plateId:   state.owner.plate_id,
        eventType: type,
        eventData: { event },
      }).catch(console.error);
    }
  }

  // ────────── CHARTS ──────────
  function setChartRange(range) {
    state.chartRange = range;
    document.querySelectorAll('.chart-range-btn').forEach(b => {
      const isMatch = b.dataset.range === range;
      b.classList.toggle('active', isMatch);
      b.style.background = isMatch ? 'linear-gradient(135deg,rgba(0,162,232,0.25),rgba(0,120,215,0.15))' : 'transparent';
      b.style.color = isMatch ? '#00A2E8' : 'rgba(255,255,255,0.45)';
    });
    document.querySelectorAll('#weekly-chart').forEach(el => { el.style.display = range === 'weekly' ? 'block' : 'none'; });
    document.querySelectorAll('#monthly-chart').forEach(el => { el.style.display = range === 'monthly' ? 'block' : 'none'; });
  }

  function renderWeeklyChart() {
    document.querySelectorAll('#weekly-chart').forEach(el => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const max  = Math.max(...state.weeklyData, 1);
      el.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px;">
          ${state.weeklyData.map((val, i) => {
            const height  = Math.max(8, (val / max) * 90);
            const isToday = i === 6;
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;" class="tooltip">
                <div style="flex:1;width:100%;display:flex;align-items:flex-end;">
                  <div style="width:100%;height:${height}%;min-height:8px;
                    background:${isToday ? 'linear-gradient(180deg,#00D4FF,#0078D7)' : 'rgba(0,162,232,0.25)'};
                    border-radius:6px 6px 2px 2px;transition:all 0.3s;
                    box-shadow:${isToday ? '0 0 10px rgba(0,162,232,0.4)' : 'none'};cursor:pointer;"
                    onmouseover="this.style.background='linear-gradient(180deg,#00D4FF,#0078D7)';this.style.boxShadow='0 0 10px rgba(0,162,232,0.4)'"
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

  function renderMonthlyChart() {
    document.querySelectorAll('#monthly-chart').forEach(el => {
      const months = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
      const data   = state.monthlyData;
      const max    = Math.max(...data, 1);
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${data.map((val, i) => {
            const pct       = Math.max(4, Math.round((val / max) * 100));
            const isCurrent = i === data.length - 1;
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
      requestAnimationFrame(() => {
        el.querySelectorAll('.month-bar-fill').forEach(bar => { bar.style.width = `${bar.dataset.pct}%`; });
      });
    });
  }

  function renderIntentChart() {
    const els = document.querySelectorAll('#intent-chart');
    if (!els.length) return;

    const colorMap = { Delivery: '#F59E0B', Guest: '#22C55E', 'Spam / Promotional': '#EF4444', 'Emergency / SOS': '#EF4444', Unknown: '#64748B', 'General Visitor': '#00A2E8' };
    const items = Object.entries(state.intentBreakdown).map(([label, count]) => ({
      label, value: count, color: colorMap[label] || '#00A2E8',
    }));
    const total = items.reduce((s, i) => s + i.value, 0) || 1;

    const html = items.length
      ? `<div style="display:flex;flex-direction:column;gap:8px;">
          ${items.map(item => {
            const pct = Math.round((item.value / total) * 100);
            return `
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:10px;height:10px;border-radius:3px;background:${item.color};flex-shrink:0;"></div>
                <div style="flex:1;font-size:0.8rem;color:rgba(255,255,255,0.65);">${item.label}</div>
                <div style="font-size:0.8rem;font-weight:600;color:#E2ECF4;font-family:'Space Grotesk',sans-serif;">${pct}%</div>
                <div style="width:60px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:${item.color};border-radius:3px;transition:width 0.8s ease;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>`
      : `<div style="color:rgba(255,255,255,0.3);font-size:0.85rem;text-align:center;padding:10px;">No AI intent data yet</div>`;

    els.forEach(el => { el.innerHTML = html; });
  }

  function renderHeatmap(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const cellCount = 84;
    let html = '';
    for (let i = 0; i < cellCount; i++) {
      const intensity = state.heatmapData[i] || 0;
      const opacity   = (0.05 + intensity * 0.55).toFixed(2);
      html += `<div class="heatmap-cell" style="--h-opacity:${opacity};"></div>`;
    }
    el.innerHTML = html;
  }

  // ────────── TOGGLE (Call Forwarding) ──────────
  function setupToggle() {
    const toggles = document.querySelectorAll('#privacy-toggle');
    toggles.forEach(toggleEl => {
      toggleEl.checked = state.callForwarding;
      toggleEl.addEventListener('change', async (e) => {
        state.callForwarding = e.target.checked;
        toggles.forEach(t => { t.checked = state.callForwarding; });
        document.querySelectorAll('#privacy-status-text').forEach(el => {
          el.textContent = state.callForwarding ? 'ON' : 'OFF';
          el.style.color = state.callForwarding ? '#22C55E' : '#EF4444';
        });
        showToast(state.callForwarding ? '✅ Call Forwarding Enabled' : '⚠️ Call Forwarding Disabled', state.callForwarding ? 'success' : 'warning');

        // Persist
        if (state.owner) {
          await updateSecurityRules(state.owner.id, { call_forwarding: state.callForwarding });
        }
      });
    });
  }

  // ────────── STATUS MANAGER ──────────
  function setupStatusManager() {
    const statusOptions = document.querySelectorAll('[data-status]');
    statusOptions.forEach(option => {
      option.addEventListener('click', async () => {
        statusOptions.forEach(o => {
          o.style.borderColor = 'rgba(255,255,255,0.07)';
          o.style.background  = 'rgba(255,255,255,0.03)';
          o.style.boxShadow   = 'none';
          const dot = o.querySelector('.check-icon');
          if (dot) dot.style.opacity = '0';
        });
        option.style.borderColor = 'rgba(0,162,232,0.5)';
        option.style.background  = 'rgba(0,162,232,0.08)';
        option.style.boxShadow   = '0 0 15px rgba(0,162,232,0.15)';
        const dot = option.querySelector('.check-icon');
        if (dot) dot.style.opacity = '1';

        state.currentStatus = option.dataset.status;
        const label = option.dataset.label || state.currentStatus;
        showToast(`Status updated: ${label}`, 'success');
        addLog(`Status changed to: ${label}`, 'status', '#9333EA');

        // Persist
        if (state.owner) {
          await updateOwnerStatus(state.owner.id, state.currentStatus);
          // Mark onboarding step
          markOnboardingStep(state.owner.id, 'status_setup').catch(() => {});
          _loadAndRenderSetupChecklist();
        }
      });
    });
  }

  // ────────── NIGHT MODE ──────────
  function setupNightMode() {
    document.querySelectorAll('#night-start').forEach(el => { el.value = state.nightModeStart; });
    document.querySelectorAll('#night-end').forEach(el => { el.value = state.nightModeEnd; });
    document.querySelectorAll('#save-night-mode').forEach(saveEl => {
      saveEl.addEventListener('click', async () => {
        const panel   = saveEl.closest('.dash-card') || document;
        const startEl = panel.querySelector('#night-start') || document.querySelector('#night-start');
        const endEl   = panel.querySelector('#night-end')   || document.querySelector('#night-end');
        state.nightModeStart = startEl?.value || '22:00';
        state.nightModeEnd   = endEl?.value   || '06:00';
        document.querySelectorAll('#night-start').forEach(el => { el.value = state.nightModeStart; });
        document.querySelectorAll('#night-end').forEach(el => { el.value = state.nightModeEnd; });
        showToast(`🌙 Night Mode: ${state.nightModeStart} – ${state.nightModeEnd}`, 'success');
        addLog(`Night Mode set: ${state.nightModeStart}–${state.nightModeEnd}`, 'status', '#6366F1');

        if (state.owner) {
          await updateSecurityRules(state.owner.id, {
            night_mode_start: state.nightModeStart,
            night_mode_end:   state.nightModeEnd,
            night_mode_on:    true,
          });
        }
      });
    });
  }

  // ────────── AI STATUS CUSTOMIZER ──────────
  function setupAIStatusCustomizer() {
    const generateEls = document.querySelectorAll('#ai-generate-btn');
    generateEls.forEach(generateEl => {
      const panel    = generateEl.closest('.dash-card') || generateEl.parentElement;
      const inputEl  = panel?.querySelector('#ai-status-input') || document.querySelector('#ai-status-input');
      const outputEl = panel?.querySelector('#ai-status-output') || document.querySelector('#ai-status-output');
      const useEl    = panel?.querySelector('#use-ai-message-btn') || document.querySelector('#use-ai-message-btn');
      const originalLabel = generateEl.innerHTML;

      generateEl.addEventListener('click', async () => {
        const rawNote = inputEl?.value?.trim();
        if (!rawNote) { showToast('Please describe your situation first', 'warning'); return; }

        generateEl.disabled = true;
        generateEl.innerHTML = `<span style="display:flex;align-items:center;gap:8px;"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span> Generating...</span>`;
        if (outputEl) outputEl.innerHTML = `<div class="ai-thinking" style="justify-content:center;padding:20px;"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>`;

        try {
          const message = await window.GroqService.generateStatusMessage(rawNote);
          if (outputEl) {
            const messageEl = document.createElement('div');
            messageEl.style.whiteSpace = 'pre-line';
            messageEl.style.fontSize = '0.88rem';
            messageEl.style.color = '#C8E8F8';
            messageEl.style.lineHeight = '1.7';
            messageEl.style.animation = 'slide-in-up 0.3s ease';
            messageEl.textContent = message;
            outputEl.textContent = '';
            outputEl.appendChild(messageEl);
          }
          if (useEl) { useEl.style.display = 'flex'; useEl._generatedMessage = message; }
        } catch {
          showToast('AI generation failed. Please try again.', 'danger');
        }

        generateEl.disabled = false;
        generateEl.innerHTML = originalLabel;
      });

      if (useEl) {
        useEl.addEventListener('click', async () => {
          const msg = useEl._generatedMessage;
          if (msg && state.owner) {
            await updateOwnerStatus(state.owner.id, 'custom', msg);
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
        const name  = prompt('Family member name:');
        if (!name) return;
        const phone = prompt('Phone number (e.g. +91 98765 43210):');
        if (!phone) return;
        _addMember(name.trim(), phone.trim());
      });
    });
  }

  // ────────── SECURITY TIMELINE ──────────
  function setupSecurityTimeline() {
    const els = document.querySelectorAll('#security-timeline');
    if (!els.length) return;

    // Use recent logs for timeline
    const recentLogs = state.visitorLogs.slice(0, 4);
    if (!recentLogs.length) return;

    const html = recentLogs.map((log, i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;${i < recentLogs.length - 1 ? 'padding-bottom:16px;border-bottom:1px dashed rgba(255,255,255,0.06);margin-bottom:4px;' : ''}">
        <div style="width:32px;height:32px;border-radius:50%;background:${log.color}20;border:1px solid ${log.color}40;display:flex;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0;">${log.icon || '📋'}</div>
        <div>
          <div style="font-size:0.85rem;color:#E2ECF4;font-weight:500;">${log.event}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-top:2px;">Today ${log.time}</div>
        </div>
      </div>
    `).join('');

    els.forEach(el => { el.innerHTML = html; });
  }

  // ────────── SUBSCRIPTION: DAYS REMAINING + RENEWAL LINE ──────────
  function updateSubscriptionDays() {
    const daysEl    = document.getElementById('sub-days-remaining');
    const renewalEl = document.getElementById('sub-renewal-line');

    if (!daysEl) return;

    if (state.subscription?.daysLeft !== undefined) {
      daysEl.textContent = `${state.subscription.daysLeft} days`;

      // Renewal line update karo
      if (renewalEl && state.subscription.expiry_date) {
        const expiryDate  = new Date(state.subscription.expiry_date);
        const price       = state.subscription.planPrice || 0;
        const renewalText = `₹${price}/year · Renews ${expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        renewalEl.textContent = renewalText;
      }

      // Expiry warning color
      if (state.subscription.daysLeft <= 7) {
        daysEl.style.color = '#EF4444';
      } else if (state.subscription.daysLeft <= 30) {
        daysEl.style.color = '#F59E0B';
      }
    } else {
      // Fallback — no subscription yet (order pending)
      if (state.orderSummary) {
        daysEl.textContent = 'Activates on delivery';
        daysEl.style.color = '#00A2E8';
        if (renewalEl) renewalEl.textContent = `Order ${state.orderSummary.orderNumber} · In progress`;
      } else {
        daysEl.textContent = '—';
        if (renewalEl) renewalEl.textContent = 'No active subscription';
      }
    }

    // Order tracking section update karo
    _renderOrderTrackingCard();
  }

  // ────────── ORDER TRACKING CARD ──────────
  function _renderOrderTrackingCard() {
    const container = document.getElementById('order-tracking-card');
    if (!container || !state.orderSummary) return;

    const o       = state.orderSummary;
    const events  = o.events || [];
    const lastEv  = events[events.length - 1];
    const progress = o.progress || 0;

    container.innerHTML = `
      <div style="font-size:0.7rem;color:#00A2E8;font-weight:600;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📦 Order Status</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div>
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.88rem;color:#fff;">${o.orderNumber || '—'}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:2px;">${lastEv?.event_label || _statusLabel(o.manufacturingStatus)}</div>
        </div>
        <div style="font-size:0.72rem;padding:3px 8px;border-radius:6px;font-weight:700;font-family:'Space Grotesk',sans-serif;${_statusBadge(o.manufacturingStatus)}">${_statusLabel(o.manufacturingStatus).toUpperCase()}</div>
      </div>
      <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;margin-bottom:8px;">
        <div style="width:${progress}%;height:100%;background:linear-gradient(90deg,#00A2E8,#22C55E);border-radius:4px;transition:width 0.8s ease;"></div>
      </div>
      ${o.plateId ? `<div style="font-size:0.72rem;color:rgba(255,255,255,0.4);">Plate ID: <span style="color:#00A2E8;font-weight:700;font-family:'Space Grotesk',sans-serif;">${o.plateId}</span></div>` : ''}
    `;
  }

  function _statusLabel(status) {
    const labels = {
      queued:       'In Queue',
      in_production:'In Production',
      packed:       'Packed',
      dispatched:   'Shipped',
      delivered:    'Delivered',
    };
    return labels[status] || status || 'Processing';
  }

  function _statusBadge(status) {
    if (status === 'delivered')    return 'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22C55E;';
    if (status === 'dispatched')   return 'background:rgba(0,162,232,0.15);border:1px solid rgba(0,162,232,0.3);color:#00A2E8;';
    if (status === 'in_production') return 'background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#F59E0B;';
    return 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);';
  }

  // ────────── TOAST ──────────
  function showToast(message, type = 'info') {
    const colors = {
      success: { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.4)',  text: '#22C55E' },
      warning: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B' },
      danger:  { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',  text: '#EF4444' },
      info:    { bg: 'rgba(0,162,232,0.15)',  border: 'rgba(0,162,232,0.4)',  text: '#00A2E8' },
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 20px;border-radius:12px;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:0.88rem;font-weight:600;font-family:'Inter',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:slide-in-up 0.3s ease;max-width:300px;backdrop-filter:blur(20px);`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ────────── SETUP CHECKLIST (First-time owner onboarding) ──────────

  async function _loadAndRenderSetupChecklist() {
    try {
      const ownerId = state.owner?.id;
      if (!ownerId) return;

      const result = await getOnboardingProgress(ownerId);
      if (!result.success) return;

      state.onboarding = result.onboarding;

      // Only show if owner has not completed the 3 key in-app steps
      const CHECKLIST_STEPS = ['status_setup', 'family_setup', 'first_visitor_scan'];
      const pending = CHECKLIST_STEPS.filter(key => {
        const step = state.onboarding.steps.find(s => s.key === key);
        return step && !step.done;
      });

      if (pending.length === 0) {
        // All done — hide card
        ['setup-checklist-card', 'setup-checklist-card-desktop'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        return;
      }

      _renderSetupChecklist(state.onboarding, CHECKLIST_STEPS);
    } catch (e) {
      console.warn('[Dashboard] Setup checklist load failed:', e.message);
    }
  }

  function _renderSetupChecklist(onboarding, keys) {
    const steps = keys.map(key => onboarding.steps.find(s => s.key === key)).filter(Boolean);
    const completedCount = steps.filter(s => s.done).length;
    const totalCount = steps.length;
    const pct = Math.round((completedCount / totalCount) * 100);

    const stepHTML = steps.map(s => {
      const done = s.done;
      const actions = {
        status_setup:        { label: 'Set your status',      tab: 'settings', icon: '💬' },
        family_setup:        { label: 'Add a family member',  tab: 'settings', icon: '👨‍👩‍👧' },
        first_visitor_scan:  { label: 'Test your QR code',    tab: null,        icon: '📱', isQR: true },
      };
      const a = actions[s.key] || { label: s.label, icon: '⚙️' };

      return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <div style="width:22px;height:22px;border-radius:50%;flex-shrink:0;
            background:${done ? 'linear-gradient(135deg,#22C55E,#16A34A)' : 'rgba(255,255,255,0.07)'};
            border:1.5px solid ${done ? '#22C55E' : 'rgba(255,255,255,0.15)'};
            display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#fff;">
            ${done ? '✓' : a.icon}
          </div>
          <div style="flex:1;">
            <div style="font-size:0.8rem;color:${done ? 'rgba(255,255,255,0.35)' : '#fff'};
              font-weight:${done ? '400' : '600'};
              text-decoration:${done ? 'line-through' : 'none'};
              font-family:'Space Grotesk',sans-serif;">
              ${a.label}
            </div>
          </div>
          ${!done ? `<button onclick="_setupChecklistAction('${s.key}')" style="
            padding:4px 10px;border-radius:6px;font-size:0.7rem;font-weight:700;cursor:pointer;
            background:rgba(0,162,232,0.12);border:1px solid rgba(0,162,232,0.3);
            color:#00A2E8;font-family:'Space Grotesk',sans-serif;white-space:nowrap;">
            Do it →
          </button>` : ''}
        </div>`;
    }).join('');

    const cardHTML = `
      <div style="padding:14px 16px;border-radius:14px;margin-bottom:14px;
        background:linear-gradient(135deg,rgba(0,162,232,0.08),rgba(99,102,241,0.05));
        border:1px solid rgba(0,162,232,0.2);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.88rem;color:#fff;">
            🚀 Setup Your Smart Door
          </div>
          <div style="font-size:0.72rem;color:#00A2E8;font-weight:700;font-family:'Space Grotesk',sans-serif;">
            ${completedCount}/${totalCount} done
          </div>
        </div>
        <div style="height:4px;border-radius:4px;background:rgba(255,255,255,0.07);margin-bottom:14px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;border-radius:4px;
            background:linear-gradient(90deg,#00A2E8,#6366F1);transition:width 0.5s ease;"></div>
        </div>
        ${stepHTML}
      </div>`;

    ['setup-checklist-card', 'setup-checklist-card-desktop'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = cardHTML;
        el.style.display = 'block';
      }
    });
  }

  // Called by inline onclick buttons in checklist
  window._setupChecklistAction = function(stepKey) {
    if (stepKey === 'status_setup' || stepKey === 'family_setup') {
      // Switch to Settings tab (mobile)
      const settingsTab = document.querySelector('[data-tab="settings"]');
      if (settingsTab) settingsTab.click();
      // Scroll to relevant section
      setTimeout(() => {
        const target = stepKey === 'family_setup'
          ? document.getElementById('family-members-list')
          : document.querySelector('.status-option');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    } else if (stepKey === 'first_visitor_scan') {
      // Show QR test instruction toast
      showToast('📱 Open your Smart Door QR link in another browser tab to test!', 'info');
    }
  };

  // ────────── VOICE NOTE PLAYBACK ──────────
  async function playVoiceNote(storagePath) {
    const result = await getVoiceNoteUrl(storagePath);
    if (!result.success) {
      showToast('Could not load voice note', 'danger');
      return;
    }
    const audio = new Audio(result.url);
    audio.play().catch(() => showToast('Playback failed', 'danger'));
  }

  // ────────── PUBLIC API ──────────
  return {
    init,
    addLog,
    showToast,
    removeMember,
    setChartRange,
    playVoiceNote,
    getState: () => ({ ...state }),
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dashboard-stats') || document.getElementById('visitor-logs')) {
    DashboardModule.init();
  }
});

window.DashboardModule = DashboardModule;
