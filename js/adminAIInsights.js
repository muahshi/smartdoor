/**
 * My Smart Door — Admin AI Insights Panel
 * js/adminAIInsights.js
 *
 * PHASE 3.2 — OWNER/ADMIN AI INSIGHTS DASHBOARD. ADDITIVE ONLY, new file.
 *
 * Renders the "AI Insights" panel (#panel-aiInsights in admin.html) using
 * data that already exists in production:
 *   - get_ai_consultant_funnel()   (sql/68 — unchanged, reused as-is)
 *   - get_ai_consultant_insights() (sql/69 — new, additive)
 * both served through the existing `admin-analytics` Edge Function
 * (Phase 13, unchanged — this file only ADDS a second `type` it already
 * understands: 'ai_consultant_insights').
 *
 * Deliberately a plain classic script, NOT an ES module — admin.html's
 * live inline script (adminCall, getAdminSession, lineChart, barChart,
 * escapeHtml, _charts) is itself a classic script with zero imports
 * ("Zero ES module imports — all Edge Function calls via fetch()"), so
 * this file matches that same pattern to share those globals directly.
 * The old js/adminPhase13.js + services/adminAnalytics.js (ES modules)
 * were never actually wired into admin.html — this file replaces that
 * dead code path for the admin UI, without deleting or modifying it.
 *
 * Reliability (Step 4 requirement): every network call below is wrapped
 * in try/catch and never re-throws. A failure in this panel can only
 * ever leave THIS panel's own cards showing an inline error — it cannot
 * reach loadPanel(), switchPanel(), or any other panel's code.
 */
(function (global) {
  'use strict';

  // ── Local Edge Function caller — same session/timeout/retry contract
  // as admin.html's adminCall(), but targets `admin-analytics` (Phase 13)
  // instead of `admin-data`, since that is where get_ai_consultant_funnel
  // / get_ai_consultant_insights are actually exposed. ──
  async function aiAnalyticsCall(type, extra) {
    extra = extra || {};
    try {
      const s = (typeof getAdminSession === 'function') ? getAdminSession() : null;
      if (!s || !s.token) return { success: false, error: 'Session expired' };
      const base = (global.__SD_CONFIG__ && global.__SD_CONFIG__.supabaseUrl) || '';
      if (!base) return { success: false, error: 'Configuration error: Supabase URL missing.' };

      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 15000);
      let res;
      try {
        res = await fetch(base + '/functions/v1/admin-analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.token },
          body: JSON.stringify(Object.assign({ type: type }, extra)),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 401) return { success: false, error: 'Session expired' };
      const data = await res.json();
      return (data && data.success) ? data : { success: false, error: (data && data.message) || 'Request failed' };
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      return { success: false, error: timedOut ? 'Request timed out.' : 'Connection error.' };
    }
  }

  // ── State for the Daily/Weekly/Monthly trend toggle — re-aggregates
  // the already-fetched daily_trend client-side, no re-fetch needed. ──
  let _lastDailyTrend = [];
  let _trendGranularity = 'day';

  function fmtPct(x) { return Math.round((Number(x) || 0) * 100) + '%'; }
  function fmtMs(x) { return Math.round(Number(x) || 0) + 'ms'; }
  function escapeHtmlLocal(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function destroyChart(cid) {
    if (global._charts && global._charts[cid]) {
      global._charts[cid].destroy();
      delete global._charts[cid];
    }
  }

  // ── Trend chart (multi-dataset — the shared lineChart()/barChart()
  // helpers only draw one dataset, so this one draws its own) ──
  function renderTrendChart(dailyRows, granularity) {
    const cid = 'aiTrendChart';
    destroyChart(cid);
    const ctx = document.getElementById(cid);
    if (!ctx || !global.Chart) return;

    let labels, conversations, configured;
    if (granularity === 'day') {
      labels = dailyRows.map(function (r) { return r.date.slice(5); });
      conversations = dailyRows.map(function (r) { return r.conversations; });
      configured = dailyRows.map(function (r) { return r.configured; });
    } else {
      // Weekly/Monthly: bucket the same daily rows client-side.
      const buckets = {};
      const order = [];
      dailyRows.forEach(function (r) {
        const d = new Date(r.date + 'T00:00:00Z');
        let key;
        if (granularity === 'week') {
          const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const week = Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
          key = d.getUTCFullYear() + '-W' + week;
        } else {
          key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
        }
        if (!buckets[key]) { buckets[key] = { conversations: 0, configured: 0 }; order.push(key); }
        buckets[key].conversations += r.conversations;
        buckets[key].configured += r.configured;
      });
      labels = order;
      conversations = order.map(function (k) { return buckets[k].conversations; });
      configured = order.map(function (k) { return buckets[k].configured; });
    }

    global._charts = global._charts || {};
    global._charts[cid] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Conversations', data: conversations, borderColor: '#FF4500', backgroundColor: '#FF450020', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 2 },
          { label: 'Configure Clicks', data: configured, borderColor: '#3B82F6', backgroundColor: '#3B82F620', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#9AABC4', font: { size: 11 } } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5A6A85', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5A6A85', font: { size: 11 } }, beginAtZero: true },
        },
      },
    });
  }

  global.setAiTrendGranularity = function (gran, el) {
    _trendGranularity = gran;
    document.querySelectorAll('#panel-aiInsights .tab').forEach(function (t) { t.classList.remove('active'); });
    if (el) el.classList.add('active');
    renderTrendChart(_lastDailyTrend, _trendGranularity);
  };

  function renderFunnelChart(funnel) {
    const cid = 'aiFunnelChart';
    destroyChart(cid);
    const ctx = document.getElementById(cid);
    if (!ctx || !global.Chart || !funnel) return;
    const stages = [
      ['opened', 'Opened Widget'],
      ['messaged', 'Sent a Message'],
      ['recommended', 'Got Recommendation'],
      ['configured', 'Clicked Configure'],
    ];
    global._charts = global._charts || {};
    global._charts[cid] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: stages.map(function (s) { return s[1]; }),
        datasets: [{ label: 'Sessions', data: stages.map(function (s) { return funnel[s[0]] || 0; }), backgroundColor: '#8B5CF680', borderColor: '#8B5CF6', borderWidth: 1, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5A6A85', font: { size: 11 } }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: '#5A6A85', font: { size: 11 } } },
        },
      },
    });
  }

  function renderProductChart(productPerformance) {
    const cid = 'aiProductChart';
    destroyChart(cid);
    const ctx = document.getElementById(cid);
    if (!ctx || !global.Chart) return;
    const rows = productPerformance || [];
    global._charts = global._charts || {};
    global._charts[cid] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.product_key; }),
        datasets: [
          { label: 'Recommended', data: rows.map(function (r) { return r.recommended; }), backgroundColor: '#F59E0B80', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 4 },
          { label: 'Selected (Configure)', data: rows.map(function (r) { return r.configured; }), backgroundColor: '#10B98180', borderColor: '#10B981', borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#9AABC4', font: { size: 11 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#5A6A85', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5A6A85', font: { size: 11 } }, beginAtZero: true },
        },
      },
    });
  }

  function renderIntentChart(intentCategories) {
    const cid = 'aiIntentChart';
    destroyChart(cid);
    const ctx = document.getElementById(cid);
    if (!ctx || !global.Chart) return;
    const rows = intentCategories || [];
    const palette = ['#FF4500', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#14B8A6', '#EF4444'];
    global._charts = global._charts || {};
    global._charts[cid] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map(function (r) { return r.category; }),
        datasets: [{ data: rows.map(function (r) { return r.times_asked; }), backgroundColor: rows.map(function (_, i) { return palette[i % palette.length]; }) }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: '#9AABC4', font: { size: 10 }, boxWidth: 10 } } },
      },
    });
  }

  function renderTopQuestions(topQuestions) {
    const el = document.getElementById('aiTopQuestions');
    if (!el) return;
    const rows = topQuestions || [];
    el.innerHTML = rows.length
      ? rows.map(function (q) {
          return '<div style="padding:6px 0;border-bottom:1px solid var(--border)">\u201c' + escapeHtmlLocal(q.question_text) + '\u201d <span style="color:var(--muted)">— asked ' + q.times_asked + '\u00d7</span></div>';
        }).join('')
      : '<div class="empty-state">No repeated questions yet.</div>';
  }

  // ── Business insights (Step 3) — deterministic, derived only from
  // numbers already computed above. Anything that would need data we
  // don't have (e.g. per-intent conversion, or "frequently requested
  // unavailable features") is a documented gap, not guessed here. ──
  function renderBusinessInsights(insights, funnel) {
    const el = document.getElementById('aiBusinessInsights');
    if (!el) return;
    const lines = [];
    const products = (insights.product_performance || []).slice();

    const bestSelling = products.filter(function (p) { return p.configured > 0; })
      .sort(function (a, b) { return b.configured - a.configured; })[0];
    if (bestSelling) {
      lines.push('🏆 <b>' + escapeHtmlLocal(bestSelling.product_key) + '</b> gets the most Configure clicks through the AI (' + bestSelling.configured + ').');
    }

    const abandoned = products.filter(function (p) { return p.recommended >= 3 && p.selection_rate < 0.2; })
      .sort(function (a, b) { return b.recommended - a.recommended; })[0];
    if (abandoned) {
      lines.push('⚠️ <b>' + escapeHtmlLocal(abandoned.product_key) + '</b> is recommended often (' + abandoned.recommended + '×) but rarely selected (' + fmtPct(abandoned.selection_rate) + ') — worth reviewing price or positioning.');
    }

    if (funnel && (funnel.error_rate || 0) > 0.05) {
      lines.push('🛠️ AI error rate is ' + fmtPct(funnel.error_rate) + ' — above 5%. Worth checking the groq-proxy logs.');
    }
    if ((insights.cta_ctr || 0) < 0.15 && (insights.total_conversations || 0) >= 10) {
      lines.push('💡 Configure button CTR is ' + fmtPct(insights.cta_ctr) + ' — consider a stronger call-to-action after a recommendation.');
    }
    if (!lines.length) {
      lines.push('Not enough data yet for a business insight — check back once there\u2019s more AI conversation volume.');
    }

    lines.push('<hr style="border-color:var(--border);margin:10px 0">');
    lines.push('<span style="color:var(--muted)">Not available yet: which intents convert best (needs per-session intent→outcome linkage) · frequently requested unavailable features (no such event is tracked today) · true AI-attributed sales (orders isn\u2019t linked to a consultant session_id).</span>');

    el.innerHTML = lines.map(function (l) { return '<div style="padding:4px 0">' + l + '</div>'; }).join('');
  }

  // ── Main entry point — called from admin.html's loadPanel() switch. ──
  global.loadAIInsights = async function () {
    const daysSel = document.getElementById('aiInsightsDays');
    const days = daysSel ? Number(daysSel.value || 30) : 30;
    const errEl = document.getElementById('aiInsightsFunnelError');
    if (errEl) errEl.style.display = 'none';

    const results = await Promise.allSettled([
      aiAnalyticsCall('ai_consultant_funnel', { days: days }),
      aiAnalyticsCall('ai_consultant_insights', { days: days }),
    ]);

    // ── Funnel-derived KPIs + funnel chart (independent of insights) ──
    try {
      const funnelRes = results[0].status === 'fulfilled' ? results[0].value : { success: false, error: 'Request failed' };
      if (funnelRes.success && funnelRes.funnel) {
        const f = funnelRes.funnel;
        setText('ai-avg-latency', fmtMs(f.avg_latency_ms));
        setText('ai-error-rate', fmtPct(f.error_rate));
        renderFunnelChart(f.funnel);
        renderTopQuestions(f.top_questions);
        window._aiLastFunnel = f;
      } else {
        if (errEl) { errEl.textContent = funnelRes.error || 'Failed to load AI conversation funnel.'; errEl.style.display = 'block'; }
      }
    } catch (err) {
      console.error('[adminAIInsights] funnel render error:', err);
      if (errEl) { errEl.textContent = 'Failed to render AI conversation funnel.'; errEl.style.display = 'block'; }
    }

    // ── New Phase 3.2 metrics (independent — a failure here never
    // touches the KPIs/funnel/questions rendered above) ──
    try {
      const insightsRes = results[1].status === 'fulfilled' ? results[1].value : { success: false, error: 'Request failed' };
      if (insightsRes.success && insightsRes.insights) {
        const ins = insightsRes.insights;
        setText('ai-total-conversations', ins.total_conversations != null ? ins.total_conversations : '—');
        setText('ai-conversion-rate', fmtPct(ins.conversion_rate));
        setText('ai-cta-ctr', fmtPct(ins.cta_ctr));
        setText('ai-completion-rate', fmtPct(ins.completion_rate));

        _lastDailyTrend = ins.daily_trend || [];
        renderTrendChart(_lastDailyTrend, _trendGranularity);
        renderProductChart(ins.product_performance);
        renderIntentChart(ins.intent_categories);
        renderBusinessInsights(ins, window._aiLastFunnel);
      } else {
        const el = document.getElementById('aiBusinessInsights');
        if (el) el.innerHTML = '<div class="empty-state">' + escapeHtmlLocal(insightsRes.error || 'Failed to load AI insights.') + '</div>';
      }
    } catch (err) {
      console.error('[adminAIInsights] insights render error:', err);
      const el = document.getElementById('aiBusinessInsights');
      if (el) el.innerHTML = '<div class="empty-state">Failed to render AI insights.</div>';
    }
  };

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
})(window);
