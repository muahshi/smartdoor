/**
 * Smart Door — Subscription Manager (SaaS Launch)
 * js/subscriptionManager.js
 *
 * Subscription Dashboard: Current Plan, Renewal Date, Usage, Upgrade,
 * Downgrade, Cancel, Invoices / Payment History.
 *
 * ADDITIVE — new file, new DOM overlay injected at runtime. Does not modify
 * WebRTC, Activity Center, or redesign any existing page. Reads owner
 * context via window.DashboardModule.getState(), same convention as
 * js/ownerPremium.js.
 */

import { getSubscription } from '../services/subscriptions.js';
import { getPlanCatalog, planFeatureList } from '../services/plans.js';
import { getUsageSummary, formatUsageLine } from '../services/usageLimits.js';
import { getInvoices, formatInvoiceStatus } from '../services/invoices.js';
import { changePlan, verifySubscriptionPayment, downgradeToFree, cancelSubscription, reactivateSubscription } from '../services/subscriptions.js';
import { loadRazorpaySDK, openRazorpayCheckout } from '../services/payments.js';

const SubscriptionManager = (() => {
  let ownerId = null;
  let billingCycle = 'yearly';  // toggle state for the plan comparison cards
  let _busy = false;

  function _ownerId() {
    if (ownerId) return ownerId;
    const s = window.DashboardModule?.getState?.();
    ownerId = s?.owner?.id || null;
    return ownerId;
  }

  function _toast(msg, type = 'info') {
    if (window.DashboardModule?.showToast) window.DashboardModule.showToast(msg, type);
    else console.log(`[SubscriptionManager] ${msg}`);
  }

  // ────────── OVERLAY SHELL ──────────
  function _ensureOverlay() {
    let el = document.getElementById('sub-mgr-overlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'sub-mgr-overlay';
    el.style.cssText = `
      position:fixed; inset:0; z-index:9999; display:none;
      background:rgba(4,10,18,0.82); backdrop-filter:blur(6px);
      align-items:flex-start; justify-content:center; overflow-y:auto; padding:24px 16px 60px;
    `;
    el.innerHTML = `
      <div id="sub-mgr-panel" style="
        width:100%; max-width:920px; background:var(--dark-card,#0E1B2A);
        border:1px solid var(--brass-border,rgba(201,162,75,0.4)); border-radius:18px;
        box-shadow:0 20px 60px rgba(0,0,0,0.5); overflow:hidden; margin-top:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));">
          <div>
            <div style="font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:1.25rem; color:#fff;">Manage Subscription</div>
            <div style="font-size:0.8rem; color:rgba(255,255,255,0.5); margin-top:2px;">Plans, usage, billing &amp; invoices</div>
          </div>
          <button onclick="SubscriptionManager.close()" style="background:none; border:none; color:rgba(255,255,255,0.6); font-size:1.6rem; cursor:pointer; line-height:1;">&times;</button>
        </div>
        <div id="sub-mgr-body" style="padding:24px;">
          <div style="text-align:center; padding:40px 0; color:rgba(255,255,255,0.5);">Loading…</div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) SubscriptionManager.close(); });
    return el;
  }

  async function open() {
    const oid = _ownerId();
    if (!oid) { _toast('Still loading your dashboard — try again in a moment.', 'info'); return; }

    const overlay = _ensureOverlay();
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    await _render();
  }

  function close() {
    const overlay = document.getElementById('sub-mgr-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ────────── RENDER ──────────
  async function _render() {
    const body = document.getElementById('sub-mgr-body');
    if (!body) return;
    const oid = _ownerId();

    const [subResult, catalogResult, usageResult, invoicesResult] = await Promise.allSettled([
      getSubscription(oid),
      getPlanCatalog(),
      getUsageSummary(oid),
      getInvoices(oid, { limit: 10 }),
    ]);

    const sub      = subResult.status === 'fulfilled' && subResult.value.success ? subResult.value.subscription : null;
    const plans    = catalogResult.status === 'fulfilled' ? catalogResult.value.plans : [];
    const usage    = usageResult.status === 'fulfilled' && usageResult.value.success ? usageResult.value.usage : null;
    const invoices = invoicesResult.status === 'fulfilled' && invoicesResult.value.success ? invoicesResult.value.invoices : [];

    const currentPlanKey = sub?.plan || 'free';
    const normalizedCurrentKey = currentPlanKey === 'hardware_only' ? 'free' : currentPlanKey === 'smartdoor_care' ? 'premium' : currentPlanKey;

    body.innerHTML = `
      ${_currentPlanCard(sub, usage)}
      ${_billingToggle()}
      ${_planCards(plans, normalizedCurrentKey)}
      ${_invoicesSection(invoices)}
    `;
  }

  function _bar(used, limit, label) {
    const unlimited = limit === -1;
    const pct = unlimited ? 100 : Math.min(100, Math.round((Number(used || 0) / Math.max(1, limit)) * 100));
    const danger = !unlimited && pct >= 90;
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:rgba(255,255,255,0.6); margin-bottom:4px;">
          <span>${label}</span><span>${unlimited ? `${used ?? 0} used · Unlimited` : `${used ?? 0} / ${limit}`}</span>
        </div>
        <div style="height:6px; border-radius:3px; background:rgba(255,255,255,0.08); overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${danger ? '#EF4444' : 'var(--brass-bright,#E8C874)'}; border-radius:3px;"></div>
        </div>
      </div>`;
  }

  function _currentPlanCard(sub, usage) {
    const planName = usage?.planName || sub?.planName || 'Free';
    const isFree = (usage?.plan || sub?.plan) === 'free' || (usage?.plan || sub?.plan) === 'hardware_only';
    const daysLeft = sub?.daysLeft;
    const cancelPending = sub?.cancel_at_period_end;

    const usageBars = usage ? `
      ${_bar(usage.calls?.used, usage.calls?.limit, 'Calls this month')}
      ${_bar(usage.photos?.used, usage.photos?.limit, 'Photo uploads this month')}
      ${_bar(usage.exports?.used, usage.exports?.limit, 'Exports this month')}
      ${_bar(usage.family?.used, usage.family?.limit, 'Family members')}
      ${_bar(usage.storage?.usedMb, usage.storage?.limitMb, 'Storage (MB)')}
    ` : '<div style="font-size:0.8rem;color:rgba(255,255,255,0.4);">Usage data unavailable right now.</div>';

    return `
      <div style="background:var(--dark-card-2,#112236); border:1px solid var(--glass-border,rgba(255,255,255,0.08)); border-radius:14px; padding:20px; margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
          <div>
            <div style="font-size:0.7rem; color:var(--brass-bright,#E8C874); text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">Current Plan</div>
            <div style="font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:1.4rem; color:#fff;">${planName}</div>
          </div>
          ${!isFree ? `
            <div style="text-align:right;">
              ${daysLeft !== undefined ? `<div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">${daysLeft} days left</div>` : ''}
              ${cancelPending ? `<div style="font-size:0.72rem; color:#F59E0B; margin-top:2px;">Cancels at period end</div>` : ''}
            </div>` : ''}
        </div>
        ${usageBars}
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
          ${!isFree ? (cancelPending
            ? `<button onclick="SubscriptionManager.reactivate()" style="${_btnStyle('outline')}">Reactivate</button>`
            : `<button onclick="SubscriptionManager.cancel()" style="${_btnStyle('outline')}">Cancel Subscription</button>`
          ) : ''}
        </div>
      </div>`;
  }

  function _billingToggle() {
    return `
      <div style="display:flex; justify-content:center; gap:8px; margin-bottom:18px;">
        <button onclick="SubscriptionManager.setBillingCycle('monthly')" style="${_btnStyle(billingCycle === 'monthly' ? 'active' : 'outline')}">Monthly</button>
        <button onclick="SubscriptionManager.setBillingCycle('yearly')" style="${_btnStyle(billingCycle === 'yearly' ? 'active' : 'outline')}">Yearly <span style="opacity:0.7;font-size:0.68rem;">(save more)</span></button>
      </div>`;
  }

  function _btnStyle(kind) {
    if (kind === 'active') return 'padding:8px 18px; border-radius:8px; font-size:0.8rem; font-weight:700; cursor:pointer; background:var(--brass-bright,#E8C874); color:#0E1B2A; border:1px solid var(--brass-bright,#E8C874);';
    if (kind === 'primary') return 'padding:10px 16px; border-radius:8px; font-size:0.8rem; font-weight:700; cursor:pointer; background:linear-gradient(135deg,var(--brass-bright,#E8C874),var(--brass,#C9A24B)); color:#0E1B2A; border:none; width:100%;';
    return 'padding:8px 18px; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:pointer; background:transparent; color:rgba(255,255,255,0.8); border:1px solid var(--glass-border,rgba(255,255,255,0.15));';
  }

  function _planCards(plans, currentKey) {
    if (!plans || !plans.length) return '';
    const cards = plans.map((p) => {
      const price = billingCycle === 'monthly' ? p.price_monthly : p.price_yearly;
      const isCurrent = p.plan_key === currentKey;
      const isFreePlan = p.plan_key === 'free';
      const features = planFeatureList(p).slice(0, 6);

      let actionBtn;
      if (isCurrent) {
        actionBtn = `<button disabled style="${_btnStyle('outline')};width:100%;opacity:0.5;cursor:default;">Current Plan</button>`;
      } else if (isFreePlan) {
        actionBtn = `<button onclick="SubscriptionManager.downgrade()" style="${_btnStyle('outline')};width:100%;">Downgrade</button>`;
      } else {
        actionBtn = `<button onclick="SubscriptionManager.upgrade('${p.plan_key}')" style="${_btnStyle('primary')}">Upgrade to ${p.name}</button>`;
      }

      return `
        <div style="flex:1; min-width:220px; background:var(--dark-card-2,#112236); border:1px solid ${isCurrent ? 'var(--brass-border,rgba(201,162,75,0.4))' : 'var(--glass-border,rgba(255,255,255,0.08))'}; border-radius:14px; padding:18px; display:flex; flex-direction:column;">
          <div style="font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:1.05rem; color:#fff;">${p.name}</div>
          <div style="font-size:0.75rem; color:rgba(255,255,255,0.5); margin-bottom:10px;">${p.tagline || ''}</div>
          <div style="font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:1.6rem; color:var(--brass-bright,#E8C874); margin-bottom:12px;">
            ${price > 0 ? `₹${price}<span style="font-size:0.7rem;font-weight:600;color:rgba(255,255,255,0.5);">/${billingCycle === 'monthly' ? 'mo' : 'yr'}</span>` : 'Free'}
          </div>
          <ul style="list-style:none; padding:0; margin:0 0 16px 0; flex:1;">
            ${features.map((f) => `<li style="font-size:0.75rem; color:rgba(255,255,255,0.75); padding:3px 0;">✓ ${f}</li>`).join('')}
          </ul>
          ${actionBtn}
        </div>`;
    }).join('');

    return `<div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:24px;">${cards}</div>`;
  }

  function _invoicesSection(invoices) {
    if (!invoices || !invoices.length) {
      return `<div style="font-size:0.8rem; color:rgba(255,255,255,0.4); text-align:center; padding:12px 0;">No invoices yet.</div>`;
    }
    const rows = invoices.map((inv) => {
      const st = formatInvoiceStatus(inv.status);
      const date = new Date(inv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:8px 6px; font-size:0.75rem; color:rgba(255,255,255,0.8);">${inv.invoice_number}</td>
          <td style="padding:8px 6px; font-size:0.75rem; color:rgba(255,255,255,0.6);">${date}</td>
          <td style="padding:8px 6px; font-size:0.75rem; color:rgba(255,255,255,0.8); text-transform:capitalize;">${inv.plan} · ${inv.billing_cycle}</td>
          <td style="padding:8px 6px; font-size:0.75rem; color:rgba(255,255,255,0.8);">₹${inv.amount}</td>
          <td style="padding:8px 6px; font-size:0.72rem; font-weight:700; color:${st.color};">${st.label}</td>
        </tr>`;
    }).join('');

    return `
      <div>
        <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:0.95rem; color:#fff; margin-bottom:10px;">Invoices &amp; Payment History</div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.15);">
                <th style="text-align:left; padding:8px 6px; font-size:0.68rem; color:rgba(255,255,255,0.45); text-transform:uppercase;">Invoice</th>
                <th style="text-align:left; padding:8px 6px; font-size:0.68rem; color:rgba(255,255,255,0.45); text-transform:uppercase;">Date</th>
                <th style="text-align:left; padding:8px 6px; font-size:0.68rem; color:rgba(255,255,255,0.45); text-transform:uppercase;">Plan</th>
                <th style="text-align:left; padding:8px 6px; font-size:0.68rem; color:rgba(255,255,255,0.45); text-transform:uppercase;">Amount</th>
                <th style="text-align:left; padding:8px 6px; font-size:0.68rem; color:rgba(255,255,255,0.45); text-transform:uppercase;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ────────── ACTIONS ──────────
  function setBillingCycle(cycle) {
    billingCycle = cycle;
    _render();
  }

  async function upgrade(planKey) {
    if (_busy) return;
    const oid = _ownerId();
    const s = window.DashboardModule?.getState?.();
    _busy = true;
    try {
      const startResult = await changePlan(oid, planKey, billingCycle);
      if (!startResult.success) { _toast(startResult.error || 'Could not start checkout.', 'danger'); return; }

      await loadRazorpaySDK();
      const paymentResult = await openRazorpayCheckout({
        razorpayOrderId: startResult.razorpayOrderId,
        amount:          startResult.amount,
        customerName:    s?.owner?.full_name || s?.owner?.fullName || '',
        customerEmail:   s?.owner?.email || '',
        customerPhone:   s?.owner?.phone || '',
        description:     `SmartDoor ${planKey} plan (${billingCycle})`,
      });

      const verifyResult = await verifySubscriptionPayment(oid, {
        invoiceId:         startResult.invoiceId,
        razorpayPaymentId: paymentResult.razorpayPaymentId,
        razorpayOrderId:   paymentResult.razorpayOrderId,
        razorpaySignature: paymentResult.razorpaySignature,
      });

      if (!verifyResult.success) { _toast(verifyResult.error || 'Payment verification failed.', 'danger'); return; }

      _toast(`✨ Upgraded to ${planKey}!`, 'success');
      await _render();
    } catch (err) {
      if (err?.message !== 'Payment cancelled by user') {
        _toast('Something went wrong during checkout.', 'danger');
        console.error('[SubscriptionManager] upgrade error:', err);
      }
    } finally {
      _busy = false;
    }
  }

  async function downgrade() {
    if (_busy) return;
    if (!confirm('Move to the Free plan? You will lose access to premium features immediately.')) return;
    _busy = true;
    try {
      const res = await downgradeToFree(_ownerId());
      if (!res.success) { _toast(res.error || 'Downgrade failed.', 'danger'); return; }
      _toast('Moved to the Free plan.', 'success');
      await _render();
    } finally { _busy = false; }
  }

  async function cancel() {
    if (_busy) return;
    if (!confirm('Cancel your subscription? It will stay active until the current period ends, then move to Free.')) return;
    _busy = true;
    try {
      const res = await cancelSubscription(_ownerId());
      if (!res.success) { _toast(res.error || 'Could not cancel.', 'danger'); return; }
      _toast(res.message || 'Subscription set to cancel at period end.', 'success');
      await _render();
    } finally { _busy = false; }
  }

  async function reactivate() {
    if (_busy) return;
    _busy = true;
    try {
      const res = await reactivateSubscription(_ownerId());
      if (!res.success) { _toast(res.error || 'Could not reactivate.', 'danger'); return; }
      _toast('Cancellation reversed.', 'success');
      await _render();
    } finally { _busy = false; }
  }

  return { open, close, setBillingCycle, upgrade, downgrade, cancel, reactivate };
})();

window.SubscriptionManager = SubscriptionManager;
