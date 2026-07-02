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
import { getLogs, getTodayStats, getWeeklyData, getMonthlyData, getWeeklyGrowth, getScanHeatmapData, logEvent, subscribeToLogs, formatLogForDisplay } from '../services/logs.js';
import { subscribeToNotifications } from '../services/notifications.js';
import { initNotificationDispatcher, notifyEvent, ensureNotificationPermission } from '../services/notificationDispatcher.js';
import { registerDevice, wireSubscriptionRefresh } from '../services/pushRegistration.js';
import { getSecurityRules, updateSecurityRules, updateOwnerStatus, getFamilyMembers, addFamilyMember, removeFamilyMember, reorderFamilyMembers } from '../services/security.js';
import { getSubscription, getRenewalInfo } from '../services/subscriptions.js';
import { getOnboardingProgress, markOnboardingStep } from '../services/customerSuccess.js';
import { getOrderSummary, subscribeToOrderTracking } from '../services/orders.js';
import { getCommunicationLogs, subscribeToCommunicationLogs } from '../services/communication.js';
import { getVoiceNoteUrl } from '../services/voiceNotes.js';
import { VoiceRecorder } from '../services/voiceNotes.js';
import { supabase } from '../services/supabase.js';
import {
  listConversations, subscribeToInbox, getConversationMessages, subscribeToConversation,
  markConversationSeen, pinConversation, setConversationStatus, deleteConversation,
  sendOwnerReply, sendOwnerVoiceReply, STATIC_QUICK_REPLIES, getAISuggestedReplies,
  generateAISummary, getInboxUnreadCount, subscribeToTyping, sendTypingSignal,
} from '../services/messaging.js';

const DashboardModule = (() => {
  // ────────── STATE ──────────
  const state = {
    owner: null,
    securityRules: {},
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
    inbox: { conversations: [], activeId: null, activeConversation: null, filter: 'all', search: '', quickReplies: STATIC_QUICK_REPLIES.slice(0, 3) },
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

    // Request notification permission & clear badge
    _initNotifications();

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
    setupOwnerSettings();
    setupNightMode();
    setupAIStatusCustomizer();
    setupFamilyMemberActions();
    setupSecurityTimeline();
    updateSubscriptionDays();
    setupInbox();

    // Initial unread badge load
    _refreshUnreadBadge(state.owner.id);
    _refreshInboxUnreadBadge();

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
      state.securityRules   = r;
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

  // ── PREMIUM DOORBELL SOUND — louder two-tone digital chime ────────────────
  let _audioCtx = null;

  // FIX (notification pipeline audit): resume() is async but was previously
  // called fire-and-forget, then `ctx.currentTime` was read immediately
  // after on a context that was often still suspended (frozen clock). Every
  // _tone() call scheduled its start/stop times off that frozen value, so by
  // the time the context actually resumed, the scheduled times were already
  // in the past — on repeat doorbell presses (2nd/3rd/4th) this is exactly
  // the "no sound" symptom: the browser auto-suspends an idle AudioContext
  // between presses, so only the very first press (context freshly created
  // and already running) reliably played. Now we await resume() before any
  // scheduling happens.
  async function _getAudioCtx() {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') {
      try { await _audioCtx.resume(); } catch (_) {}
    }
    return _audioCtx;
  }

  function _tone({ freq, startTime, duration, volume = 0.6, type = 'sine', ctx }) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // NOTE: OS-level showNotification() for doorbell/QR/voice/text/SOS is now
  // owned exclusively by services/notificationDispatcher.js (one dispatch
  // path, unique tag per event, delivery log). The functions below are
  // in-tab audio/vibration feedback ONLY — they no longer also fire a
  // notification themselves, which used to cause two separate code paths
  // fighting over the same fixed 'smartdoor-doorbell' tag.
  async function playBellSound() {
    try {
      const ctx = await _getAudioCtx();
      const now = ctx.currentTime;
      _tone({ freq: 1046, startTime: now,        duration: 0.9, volume: 0.65, ctx });
      _tone({ freq: 784,  startTime: now + 0.05, duration: 0.8, volume: 0.45, ctx });
      _tone({ freq: 880,  startTime: now + 0.55, duration: 0.9, volume: 0.6,  ctx });
      _tone({ freq: 659,  startTime: now + 0.60, duration: 0.8, volume: 0.4,  ctx });
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
    } catch (_) {}
  }

  async function playSosSound() {
    try {
      const ctx = await _getAudioCtx();
      const now = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        _tone({ freq: 1200 + (i % 2) * 200, startTime: now + i * 0.2, duration: 0.18, volume: 0.8, type: 'square', ctx });
      }
      if ('vibrate' in navigator) navigator.vibrate([400, 100, 400, 100, 400]);
    } catch (_) {}
  }

  // FIX (notification pipeline audit): qr_scan, voice, and text events
  // previously had ZERO audible/haptic feedback — only a silent in-page
  // toast, which is invisible unless the dashboard tab is open and in
  // focus. Each now gets a short, distinct chime + vibrate so they're
  // noticeable even if the owner isn't staring at the screen.
  async function playScanSound() {
    try {
      const ctx = await _getAudioCtx();
      const now = ctx.currentTime;
      _tone({ freq: 660, startTime: now, duration: 0.18, volume: 0.35, ctx });
      if ('vibrate' in navigator) navigator.vibrate([120]);
    } catch (_) {}
  }

  async function playMessageSound() {
    try {
      const ctx = await _getAudioCtx();
      const now = ctx.currentTime;
      _tone({ freq: 523, startTime: now,        duration: 0.16, volume: 0.4, ctx });
      _tone({ freq: 659, startTime: now + 0.12, duration: 0.2,  volume: 0.4, ctx });
      if ('vibrate' in navigator) navigator.vibrate([150, 60, 150]);
    } catch (_) {}
  }

  function _initNotifications() {
    if (document.visibilityState === 'visible') {
      ensureNotificationPermission().catch(() => {});
    }
    navigator.serviceWorker?.ready.then(reg => {
      reg.active?.postMessage({ type: 'CLEAR_BADGE' });
    }).catch(() => {});
  }

  // ────────── REALTIME SETUP ──────────
  function _setupRealtime() {
    const ownerId = state.owner.id;

    // New visitor log → prepend to list + update stats counter + notify.
    // FIX (channel-bloat bug): this used to be TWO separate subscriptions to
    // the same visitor_logs table (this one for the UI feed, plus
    // subscribeToSOS() below for SOS-only, PLUS a third dedicated channel
    // this file's dispatcher used to open just to call showNotification()).
    // A single dashboard session was opening 3 channels against one table.
    // That's very likely why message notifications specifically were
    // silently failing — the extra channels were the last ones created and
    // the most likely to lose the join race. Now there is exactly ONE
    // subscription to visitor_logs, and it drives UI + sound + OS
    // notification together, in order, for every row.
    const unsubLogs = subscribeToLogs(ownerId, (newLog) => {
      const formatted = formatLogForDisplay(newLog);
      state.visitorLogs.unshift(formatted);
      if (state.visitorLogs.length > 20) state.visitorLogs.pop();
      renderVisitorLogs();
      showToast(`${formatted.icon} ${formatted.event}`, _logToToastType(newLog.event_type));
      _bumpStat(newLog.event_type);

      if (newLog.event_type === 'bell_ring') {
        notifyEvent('bell_ring', newLog, ownerId);
        playBellSound();
      } else if (newLog.event_type === 'qr_scan') {
        notifyEvent('qr_scan', newLog, ownerId);
        playScanSound();
      } else if (newLog.event_type === 'sos_triggered' || newLog.event_type === 'sos') {
        notifyEvent('sos', newLog, ownerId);
        playSosSound();
        document.body.style.background = 'rgba(239,68,68,0.1)';
        setTimeout(() => { document.body.style.background = ''; }, 2000);
      }
    });

    // Permission request + click-tracking + visibility-regain catch-up.
    // Opens NO realtime channels of its own (see services/notificationDispatcher.js).
    const unsubDispatcher = initNotificationDispatcher(ownerId);

    // Register THIS device for background push (Web Push VAPID, or FCM once
    // a Firebase project is configured) so notifications keep arriving after
    // the PWA is closed/backgrounded — see services/pushRegistration.js and
    // sql/33_push_notifications.sql. Silently no-ops if permission was
    // denied or no push provider is configured yet; existing in-app/local
    // notification behavior is unaffected either way.
    registerDevice(ownerId).catch(() => {});
    const unsubPushRefresh = wireSubscriptionRefresh(ownerId);

    // FIX (stabilization audit): services/notifications.js' dispatch()/
    // createNotification() writes to the `notifications` table for every
    // lifecycle event (order created, shipped, delivered, activated,
    // subscription expiry, etc.) but NOTHING in the app ever read that table
    // — getNotifications/subscribeToNotifications/markNotificationRead had
    // zero callers anywhere in the codebase. Those notifications were
    // silently write-only. Wire the realtime channel in so owners actually
    // see them. Bell/call/voice/SOS already surface via visitor_logs /
    // message_logs / call_logs above, so only surface 'status_change' here
    // (order + subscription lifecycle) to avoid duplicate toasts.
    const unsubNotifications = subscribeToNotifications(ownerId, (notif) => {
      if (notif.type !== 'status_change') return;
      showToast(`${notif.title}${notif.body ? ' — ' + notif.body : ''}`, notif.priority === 'high' ? 'warning' : 'info');
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
        const rawType = formatted.raw.message_type; // 'voice' | 'text' | 'emergency'
        const isEmergency = rawType === 'emergency';
        // FIX (notification pipeline audit): this used to bump 'voice_message'
        // for ANY non-emergency message, including plain text messages —
        // inflating the "Voice Messages" stat card every time a visitor sent
        // a text instead of a voice note. Only count actual voice notes.
        if (rawType === 'voice') _bumpStat('voice_message');
        showToast(`${formatted.icon} ${formatted.event}`, isEmergency ? 'danger' : 'success');

        // Notification + sound, driven straight off this ONE existing
        // channel — no second channel opened just for this.
        const notifType = isEmergency ? 'sos' : rawType; // 'sos' | 'voice' | 'text'
        notifyEvent(notifType, formatted.raw, ownerId);
        if (isEmergency) {
          playSosSound();
          document.body.style.background = 'rgba(239,68,68,0.1)';
          setTimeout(() => { document.body.style.background = ''; }, 2000);
        } else {
          playMessageSound();
        }

        // Update unread badge
        _refreshUnreadBadge(ownerId);
      }
    });

    state._realtimeUnsubs = [unsubLogs, unsubComms, unsubNotifications, unsubDispatcher, unsubPushRefresh];

    // ────────── NOTIFICATION CLICK → OPEN EXACT CONVERSATION (Req 6) ──────────
    // sw.js posts { type:'notification_click', notifData } to this window on
    // click (see services/notificationDispatcher.js's own listener, which
    // only logs it). notifData.conversationId is now populated for every
    // event type (bell/QR/voice/text/SOS all attach conversation_id — see
    // sql/32_conversation_unification_v2.sql + visitor.html), so this is the
    // single place that turns "tapped a notification" into "Inbox thread is
    // open, scrolled to the right conversation" — no new channel, reuses the
    // existing Inbox rendering functions (openThread/refreshInbox) as-is.
    if ('serviceWorker' in navigator) {
      const onNotifClick = (event) => {
        const msg = event.data;
        if (msg?.type !== 'notification_click') return;
        const conversationId = msg.notifData?.conversationId;
        if (!conversationId) return; // nothing to deep-link to — app.html already opened via sw.js's own openWindow/focus
        if (typeof window.switchMobileTab === 'function') {
          window.switchMobileTab('inbox', document.querySelector('.tab-btn[data-tab="inbox"]'), document.querySelector('.bottom-nav-item[onclick*="inbox"]'));
        }
        refreshInbox().then(() => openThread(conversationId));
      };
      navigator.serviceWorker.addEventListener('message', onNotifClick);
      state._realtimeUnsubs.push(() => navigator.serviceWorker.removeEventListener('message', onNotifClick));
    }
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

  // ── Unread badge — fetches count and renders badge on any element with
  //    data-unread-badge attribute (e.g. Messages nav item)
  async function _refreshUnreadBadge(ownerId) {
    try {
      const { data, error } = await supabase.rpc('get_unread_counts', { p_owner_id: ownerId });
      if (error || !data) return;
      const total = data.total || 0;
      // Update any badge elements
      document.querySelectorAll('[data-unread-badge]').forEach(el => {
        el.textContent = total > 0 ? (total > 99 ? '99+' : String(total)) : '';
        el.style.display = total > 0 ? 'inline-flex' : 'none';
      });
      // Update page title if there are unread messages
      if (total > 0) {
        document.title = `(${total}) Smart Door — Dashboard`;
      } else {
        document.title = 'Smart Door — Dashboard';
      }
    } catch (err) {
      console.warn('[Dashboard] _refreshUnreadBadge error:', err);
    }
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

  // ────────── OWNER & AI RECEPTIONIST SETTINGS ──────────
  // Handles both mobile (#set-*) and desktop (#set-*-d) form variants.
  function setupOwnerSettings() {
    const FIELD_MAP = [
      ['visitor-welcome-title', 'visitor_welcome_title'],
      ['residence-name',      'residence_name'],
      ['family-name',         'family_name'],
      ['owner-display-name',  'owner_display_name'],
      ['welcome-message',     'welcome_message'],
      ['visitor-greeting',    'visitor_greeting'],
      ['ai-name',             'ai_name'],
      ['ai-voice-gender',     'ai_voice_gender'],
      ['greeting-style',      'greeting_style'],
      ['preferred-language',  'preferred_language'],
      ['hours-start',         'business_hours_start'],
      ['hours-end',           'business_hours_end'],
      ['emergency-behaviour', 'emergency_behaviour'],
    ];

    function populateForm(suffix) {
      const rules = state.securityRules || {};
      FIELD_MAP.forEach(([domId, col]) => {
        const el = document.getElementById(`set-${domId}${suffix}`);
        if (el && rules[col] != null) el.value = rules[col];
      });
      const autoReplyEl = document.getElementById(`set-auto-reply${suffix}`);
      if (autoReplyEl) autoReplyEl.checked = rules.auto_reply_enabled !== false;
    }

    function readForm(suffix) {
      const updates = {};
      FIELD_MAP.forEach(([domId, col]) => {
        const el = document.getElementById(`set-${domId}${suffix}`);
        if (el) updates[col] = el.value.trim() || null;
      });
      const autoReplyEl = document.getElementById(`set-auto-reply${suffix}`);
      if (autoReplyEl) updates.auto_reply_enabled = autoReplyEl.checked;
      return updates;
    }

    async function saveSettings(suffix, statusElId) {
      if (!state.owner) return;
      const updates = readForm(suffix);
      const btn = document.getElementById(`save-owner-settings-btn${suffix}`);
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

      const res = await updateSecurityRules(state.owner.id, updates);

      if (btn) { btn.disabled = false; btn.textContent = '💾 Save Settings'; }

      if (res.success) {
        state.securityRules = { ...state.securityRules, ...res.rules };
        // Keep both mobile + desktop forms in sync
        populateForm('');
        populateForm('-d');
        showToast('🏡 Owner & AI settings saved', 'success');
        addLog('Owner profile / AI settings updated', 'status', '#00A2E8');

        const statusEl = document.getElementById(statusElId);
        if (statusEl) {
          statusEl.style.display = 'block';
          setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
        }
      } else {
        showToast(res.error || 'Failed to save settings', 'error');
      }
    }

    // Populate on load
    populateForm('');
    populateForm('-d');

    document.getElementById('save-owner-settings-btn')?.addEventListener('click', () => saveSettings('', 'owner-settings-status'));
    document.getElementById('save-owner-settings-btn-d')?.addEventListener('click', () => saveSettings('-d', 'owner-settings-status-d'));
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

  // ══════════════════════════════════════════════════════════════
  // INBOX (Phase 4 — Unified Messaging)
  // ══════════════════════════════════════════════════════════════
  let _inboxUnsub = null;
  let _threadUnsub = null;
  let _typingUnsub = null;
  let _inboxRecorder = null;

  function setupInbox() {
    // Search (mobile + desktop)
    ['inbox-search', 'inbox-search-d'].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', _debounce(() => {
        state.inbox.search = el.value;
        refreshInbox();
      }, 300));
    });

    // Filter chips (mobile + desktop)
    ['inbox-filter-chips', 'inbox-filter-chips-d'].forEach((containerId) => {
      const container = document.getElementById(containerId);
      container?.querySelectorAll('.inbox-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          document.querySelectorAll(`#${containerId} .inbox-chip`).forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          state.inbox.filter = chip.dataset.filter;
          refreshInbox();
        });
      });
    });

    // Reply send (mobile + desktop)
    [['inbox-reply-input', 'inbox-reply-send'], ['inbox-reply-input-d', 'inbox-reply-send-d']].forEach(([inputId, btnId]) => {
      const input = document.getElementById(inputId);
      const btn = document.getElementById(btnId);
      const doSend = () => _sendActiveReply(input);
      btn?.addEventListener('click', doSend);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
      input?.addEventListener('input', _debounce(() => {
        if (state.inbox.activeId) sendTypingSignal(state.inbox.activeId, 'owner');
      }, 400));
    });

    // Voice reply (mobile + desktop)
    ['inbox-voice-btn', 'inbox-voice-btn-d'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => _toggleVoiceReply(id));
    });

    // Realtime — refresh list on any conversation/message change for this owner
    if (state.owner?.id) {
      _inboxUnsub = subscribeToInbox(state.owner.id, () => {
        refreshInbox();
        _refreshInboxUnreadBadge();
      });
      state._realtimeUnsubs.push(_inboxUnsub);
    }

    refreshInbox();
  }

  async function refreshInbox() {
    if (!state.owner?.id) return;
    const { conversations } = await listConversations(state.owner.id, {
      filter: ['all','unread','pinned','archived','resolved','active'].includes(state.inbox.filter) ? state.inbox.filter : 'all',
      tag: ['all','unread','pinned','archived','resolved','active'].includes(state.inbox.filter) ? null : state.inbox.filter,
      search: state.inbox.search,
    });
    state.inbox.conversations = conversations;
    renderInboxList();
    _refreshInboxUnreadBadge();
  }

  function renderInboxList() {
    const rows = state.inbox.conversations.map((c) => {
      const tagPill = c.tags?.[0] ? `<span class="inbox-tag-pill">${_esc(c.tags[0])}</span>` : (c.last_intent ? `<span class="inbox-tag-pill">${_esc(c.last_intent)}</span>` : '');
      const time = _formatRelativeTime(c.last_message_at);
      const avatar = c.status === 'archived' ? '🗄️' : c.status === 'resolved' ? '✅' : (c.last_intent === 'Emergency' ? '🚨' : '💬');
      return `
        <div class="inbox-row" data-conv-id="${c.id}">
          <div class="inbox-avatar">${avatar}</div>
          <div class="inbox-meta">
            <div class="inbox-name">${c.pinned ? '📌 ' : ''}${_esc(c.plate_id)} ${tagPill}</div>
            <div class="inbox-preview">${_esc(c.last_message_preview || 'New conversation')}</div>
          </div>
          <div class="inbox-right">
            <div class="inbox-time">${time}</div>
            ${c.unread_count > 0 ? `<div class="inbox-unread-dot">${c.unread_count}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    const empty = !state.inbox.conversations.length;
    const listHTML = rows || '';
    ['inbox-list', 'inbox-list-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = listHTML;
    });
    ['inbox-empty', 'inbox-empty-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = empty ? 'block' : 'none';
    });

    document.querySelectorAll('.inbox-row').forEach((row) => {
      row.addEventListener('click', () => openThread(row.dataset.convId));
    });

    const countLabel = document.getElementById('inbox-count-label');
    if (countLabel) countLabel.textContent = state.inbox.conversations.length ? `${state.inbox.conversations.length} conversation${state.inbox.conversations.length === 1 ? '' : 's'}` : '';
  }

  async function openThread(conversationId) {
    state.inbox.activeId = conversationId;
    state.inbox.activeConversation = state.inbox.conversations.find((c) => c.id === conversationId) || null;

    // Show panels
    const overlay = document.getElementById('inbox-thread-overlay');
    if (overlay) overlay.style.display = 'flex';
    const emptyD = document.getElementById('inbox-thread-empty-d');
    const panelD = document.getElementById('inbox-thread-panel-d');
    if (emptyD) emptyD.style.display = 'none';
    if (panelD) panelD.style.display = 'flex';

    _renderThreadHeader();
    await _loadAndRenderThreadMessages(conversationId);
    markConversationSeen(conversationId).then(() => { refreshInbox(); });

    // Live updates for this thread
    _threadUnsub?.();
    _threadUnsub = subscribeToConversation(conversationId, (msg) => {
      _appendThreadBubble(msg);
      if (msg.sender_type === 'visitor') markConversationSeen(conversationId);
    });

    // Typing indicator
    _typingUnsub?.();
    _typingUnsub = subscribeToTyping(conversationId, (payload) => {
      if (payload.who !== 'visitor') return;
      ['inbox-typing-indicator', 'inbox-typing-indicator-d'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'block';
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
      });
    });

    _renderQuickReplies();
    document.getElementById('inbox-summary-banner')?.style && (document.getElementById('inbox-summary-banner').style.display = 'none');
    document.getElementById('inbox-summary-banner-d')?.style && (document.getElementById('inbox-summary-banner-d').style.display = 'none');
    if (state.inbox.activeConversation?.ai_summary) _showSummary(state.inbox.activeConversation.ai_summary);
  }

  function closeInboxThread() {
    const overlay = document.getElementById('inbox-thread-overlay');
    if (overlay) overlay.style.display = 'none';
    _threadUnsub?.(); _threadUnsub = null;
    _typingUnsub?.(); _typingUnsub = null;
  }

  function _renderThreadHeader() {
    const c = state.inbox.activeConversation;
    if (!c) return;
    const title = `${c.plate_id}${c.tags?.[0] ? ' · ' + c.tags[0] : ''}`;
    const subtitle = c.handled_by === 'ai' ? '🤖 Handled by AI receptionist' : (c.status === 'resolved' ? '✅ Resolved' : c.status === 'archived' ? '🗄️ Archived' : 'Active conversation');
    ['inbox-thread-title', 'inbox-thread-title-d'].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = title; });
    ['inbox-thread-subtitle', 'inbox-thread-subtitle-d'].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = subtitle; });
    ['inbox-pin-btn', 'inbox-pin-btn-d'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.opacity = c.pinned ? '1' : '0.4'; });
  }

  async function _loadAndRenderThreadMessages(conversationId) {
    const { messages } = await getConversationMessages(conversationId);
    ['inbox-thread-messages', 'inbox-thread-messages-d'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    messages.forEach((m) => _appendThreadBubble(m, { skipScroll: true }));
    _scrollThreadToBottom();
  }

  function _appendThreadBubble(m, { skipScroll = false } = {}) {
    if (m.conversation_id !== state.inbox.activeId) return;
    const time = new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const ticks = m.sender_type === 'owner' ? (m.seen_at ? '✓✓' : m.delivered_at ? '✓✓' : '✓') : '';
    const bubbleClass = m.sender_type === 'owner' ? 'owner' : m.sender_type === 'ai' ? 'ai' : m.sender_type === 'system' ? 'system' : 'visitor';
    const senderLabel = m.sender_type === 'ai' ? `🤖 ${_esc(m.sender_name || 'AI Receptionist')}` : m.sender_type === 'owner' ? '' : m.sender_type === 'system' ? '' : '👤 Visitor';

    if (m.sender_type === 'system') {
      const html = `<div class="inbox-bubble system">${_esc(m.text || '')} · ${time}</div>`;
      ['inbox-thread-messages', 'inbox-thread-messages-d'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.insertAdjacentHTML('beforeend', html);
      });
      if (!skipScroll) _scrollThreadToBottom();
      return;
    }

    let bodyHTML;
    if (m.message_type === 'voice') {
      const btnId = `play-${m.id}`;
      bodyHTML = `🎤 Voice message (${m.voice_duration_secs || 0}s) <button id="${btnId}" style="margin-left:6px;background:rgba(255,255,255,0.1);border:none;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.72rem;">▶ Play</button>`;
    } else {
      bodyHTML = _esc(m.text || '');
    }

    const html = `
      <div class="inbox-bubble ${bubbleClass}">
        ${senderLabel ? `<div style="font-size:0.62rem;opacity:0.6;margin-bottom:3px;">${senderLabel}</div>` : ''}
        <div>${bodyHTML}</div>
        <div class="inbox-bubble-meta">${time} ${ticks}</div>
      </div>`;

    ['inbox-thread-messages', 'inbox-thread-messages-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.insertAdjacentHTML('beforeend', html);
    });

    if (m.message_type === 'voice') {
      document.querySelectorAll(`#play-${m.id}`).forEach((btn) => {
        btn.addEventListener('click', () => playVoiceNote(m.voice_url));
      });
    }

    if (!skipScroll) _scrollThreadToBottom();
  }

  function _scrollThreadToBottom() {
    ['inbox-thread-messages', 'inbox-thread-messages-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function _sendActiveReply(input) {
    const text = input?.value?.trim();
    if (!text || !state.inbox.activeId || !state.owner?.id) return;
    const c = state.inbox.activeConversation;
    input.value = '';
    await sendOwnerReply({ conversationId: state.inbox.activeId, ownerId: state.owner.id, plateId: c?.plate_id, text, senderName: state.owner.full_name || 'Owner' });
  }

  async function _toggleVoiceReply(btnId) {
    const btn = document.getElementById(btnId);
    if (!state.inbox.activeId) return;
    const c = state.inbox.activeConversation;
    if (!_inboxRecorder) {
      try {
        _inboxRecorder = await VoiceRecorder.start({ maxDurationSecs: 30, onTick: () => {} });
        btn.textContent = '⏺️';
        btn.style.background = 'rgba(239,68,68,0.2)';
      } catch (err) { showToast(err.message || 'Microphone access failed', 'danger'); }
      return;
    }
    const { blob, durationSecs, mimeType } = await _inboxRecorder.stop();
    _inboxRecorder = null;
    btn.textContent = '🎤';
    btn.style.background = 'rgba(139,92,246,0.15)';
    await sendOwnerVoiceReply({ conversationId: state.inbox.activeId, ownerId: state.owner.id, plateId: c?.plate_id, blob, durationSecs, senderName: state.owner.full_name || 'Owner' });
  }

  async function _renderQuickReplies() {
    const c = state.inbox.activeConversation;
    let replies = STATIC_QUICK_REPLIES.slice(0, 4);
    // Ask AI for context-aware suggestions based on the visitor's last message
    try {
      const { messages } = await getConversationMessages(state.inbox.activeId, { limit: 20 });
      const lastVisitorMsg = [...messages].reverse().find((m) => m.sender_type === 'visitor' && m.text);
      if (lastVisitorMsg) {
        const r = await getAISuggestedReplies({ lastVisitorText: lastVisitorMsg.text, intent: c?.last_intent });
        if (r.replies?.length) replies = r.replies;
      }
    } catch (_) {}

    const html = replies.map((r) => `<div class="inbox-quick-chip">${_esc(r)}</div>`).join('');
    ['inbox-quick-replies', 'inbox-quick-replies-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = html;
      el.querySelectorAll('.inbox-quick-chip').forEach((chip, i) => {
        chip.addEventListener('click', async () => {
          if (!state.inbox.activeId) return;
          await sendOwnerReply({ conversationId: state.inbox.activeId, ownerId: state.owner.id, plateId: c?.plate_id, text: replies[i], senderName: state.owner.full_name || 'Owner' });
        });
      });
    });
  }

  function toggleInboxMenu() {
    const menu = document.getElementById('inbox-menu');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }

  async function togglePinActive() {
    const c = state.inbox.activeConversation;
    if (!c) return;
    await pinConversation(c.id, !c.pinned);
    c.pinned = !c.pinned;
    _renderThreadHeader();
    refreshInbox();
  }

  async function resolveActive() {
    if (!state.inbox.activeId) return;
    await setConversationStatus(state.inbox.activeId, 'resolved');
    showToast('✅ Marked as resolved', 'success');
    toggleInboxMenu();
    refreshInbox();
    _renderThreadHeader();
  }

  async function archiveActive() {
    if (!state.inbox.activeId) return;
    await setConversationStatus(state.inbox.activeId, 'archived');
    showToast('🗄️ Conversation archived', 'success');
    toggleInboxMenu();
    closeInboxThread();
    refreshInbox();
  }

  async function deleteActive() {
    if (!state.inbox.activeId) return;
    if (!window.confirm('Delete this conversation permanently? This cannot be undone.')) return;
    await deleteConversation(state.inbox.activeId);
    showToast('🗑️ Conversation deleted', 'success');
    toggleInboxMenu();
    closeInboxThread();
    refreshInbox();
  }

  async function generateSummaryActive() {
    const c = state.inbox.activeConversation;
    if (!c) return;
    showToast('🧠 Generating AI summary…', 'info');
    const r = await generateAISummary(c.id, state.owner.id, c.plate_id);
    if (r.success) { _showSummary(r.summary); c.ai_summary = r.summary; }
    else showToast(r.error || 'Could not generate summary', 'danger');
  }

  function _showSummary(text) {
    ['inbox-summary-banner', 'inbox-summary-banner-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = `🧠 ${text}`;
      el.style.display = 'block';
    });
  }

  async function _refreshInboxUnreadBadge() {
    if (!state.owner?.id) return;
    try {
      const count = await getInboxUnreadCount(state.owner.id);
      document.querySelectorAll('[data-inbox-unread-badge]').forEach((el) => {
        el.textContent = count > 99 ? '99+' : String(count);
        el.style.display = count > 0 ? 'inline-block' : 'none';
      });
    } catch (_) {}
  }

  function _formatRelativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }


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
    refreshInbox,
    openThread,
    closeInboxThread,
    togglePinActive,
    toggleInboxMenu,
    resolveActive,
    archiveActive,
    deleteActive,
    generateSummaryActive,
    getState: () => ({ ...state }),
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dashboard-stats') || document.getElementById('visitor-logs')) {
    DashboardModule.init();
  }
});

window.DashboardModule = DashboardModule;
