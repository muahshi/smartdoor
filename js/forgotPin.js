/**
 * My Smart Door — Forgot PIN / Owner Recovery Flow
 * js/forgotPin.js
 *
 * Standalone module that renders the Forgot PIN UI.
 * Injects into any page that calls ForgotPin.mount(containerEl).
 * Used by: app.html (owner login page), admin PIN reset UI.
 *
 * Flow:
 *   Step 1 → Enter Plate ID + choose channel (SMS/Email)
 *   Step 2 → Enter 6-digit OTP
 *   Step 3 → Enter new 4-digit PIN
 *   Step 4 → Success
 */

import { supabase } from '../services/supabase.js';

const EDGE_FN = 'owner-forgot-pin';

async function callFn(body) {
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FN, { body });
    if (error) return { success: false, message: error.message };
    return data || { success: false, message: 'No response from server.' };
  } catch (err) {
    return { success: false, message: 'Connection error. Please try again.' };
  }
}

const styles = `
  .fp-wrap { font-family:sans-serif; max-width:400px; margin:0 auto; padding:24px; }
  .fp-title { font-size:20px; font-weight:bold; margin-bottom:8px; }
  .fp-sub { font-size:14px; color:#6b7280; margin-bottom:20px; }
  .fp-label { font-size:13px; font-weight:600; display:block; margin-bottom:6px; }
  .fp-input { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:15px; box-sizing:border-box; margin-bottom:14px; }
  .fp-input:focus { outline:2px solid #3b82f6; border-color:#3b82f6; }
  .fp-btn { width:100%; padding:12px; background:#1a1a2e; color:#fff; border:none; border-radius:6px; font-size:15px; cursor:pointer; font-weight:600; }
  .fp-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .fp-btn:hover:not(:disabled) { background:#16213e; }
  .fp-error { color:#ef4444; font-size:13px; margin-bottom:12px; min-height:18px; }
  .fp-success { color:#10b981; font-size:14px; font-weight:600; }
  .fp-back { font-size:13px; color:#6b7280; cursor:pointer; text-decoration:underline; display:inline-block; margin-top:12px; }
  .fp-channel-row { display:flex; gap:10px; margin-bottom:14px; }
  .fp-channel-btn { flex:1; padding:10px; border:1px solid #d1d5db; border-radius:6px; cursor:pointer; font-size:14px; background:#fff; }
  .fp-channel-btn.selected { border-color:#3b82f6; background:#eff6ff; color:#1d4ed8; font-weight:600; }
  .fp-otp-input { letter-spacing:8px; font-size:24px; text-align:center; font-weight:bold; }
  .fp-masked { color:#6b7280; font-size:13px; margin-bottom:14px; }
  .fp-step-indicator { display:flex; gap:4px; margin-bottom:20px; }
  .fp-step-dot { flex:1; height:4px; background:#e5e7eb; border-radius:2px; }
  .fp-step-dot.active { background:#3b82f6; }
  .fp-step-dot.done { background:#10b981; }
`;

function ForgotPinWidget(container, { onSuccess, onBack } = {}) {
  let state = {
    step: 1, // 1: plate+channel, 2: otp, 3: new pin, 4: success
    plateId: '',
    channel: 'phone',
    maskedContact: '',
    loading: false,
    error: '',
  };

  function render() {
    let html = `<style>${styles}</style><div class="fp-wrap">`;

    // Step indicators
    const dots = [1,2,3,4].map(i => {
      const cls = i < state.step ? 'done' : i === state.step ? 'active' : '';
      return `<div class="fp-step-dot ${cls}"></div>`;
    }).join('');
    html += `<div class="fp-step-indicator">${dots}</div>`;

    html += `<div class="fp-error" id="fp-err">${state.error || ''}</div>`;

    if (state.step === 1) {
      html += `
        <div class="fp-title">🔐 Forgot PIN?</div>
        <div class="fp-sub">Enter your Plate ID to receive a one-time password.</div>
        <label class="fp-label">Plate ID</label>
        <input class="fp-input" id="fp-plate-id" type="text" placeholder="SD-XXXXXX" value="${state.plateId}" autocomplete="off" />
        <label class="fp-label">Send OTP via</label>
        <div class="fp-channel-row">
          <button class="fp-channel-btn ${state.channel === 'phone' ? 'selected' : ''}" data-ch="phone">📱 SMS</button>
          <button class="fp-channel-btn ${state.channel === 'email' ? 'selected' : ''}" data-ch="email">📧 Email</button>
        </div>
        <button class="fp-btn" id="fp-send-otp" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Sending OTP…' : 'Send OTP'}</button>
      `;
    } else if (state.step === 2) {
      html += `
        <div class="fp-title">Enter OTP</div>
        <div class="fp-sub">We sent a 6-digit code to</div>
        <div class="fp-masked">${state.maskedContact} &nbsp;&nbsp; <span style="cursor:pointer;text-decoration:underline;font-size:12px;color:#3b82f6" id="fp-resend">Resend</span></div>
        <label class="fp-label">6-Digit OTP</label>
        <input class="fp-input fp-otp-input" id="fp-otp" type="number" placeholder="000000" maxlength="6" autocomplete="one-time-code" />
        <button class="fp-btn" id="fp-verify-otp" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Verifying…' : 'Verify OTP'}</button>
        <span class="fp-back" id="fp-back-1">← Change Plate ID</span>
      `;
    } else if (state.step === 3) {
      html += `
        <div class="fp-title">Set New PIN</div>
        <div class="fp-sub">Enter a new 4-digit PIN for ${state.plateId}</div>
        <label class="fp-label">New PIN</label>
        <input class="fp-input fp-otp-input" id="fp-new-pin" type="password" placeholder="••••" maxlength="4" inputmode="numeric" />
        <label class="fp-label">Confirm PIN</label>
        <input class="fp-input fp-otp-input" id="fp-confirm-pin" type="password" placeholder="••••" maxlength="4" inputmode="numeric" />
        <button class="fp-btn" id="fp-reset-pin" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Resetting…' : 'Reset PIN'}</button>
      `;
    } else if (state.step === 4) {
      html += `
        <div class="fp-title" style="color:#10b981">✅ PIN Reset Successfully</div>
        <div class="fp-sub">Your new PIN is active. You can now log in.</div>
        <button class="fp-btn" id="fp-go-login">Go to Login</button>
      `;
    }

    if (onBack && state.step === 1) {
      html += `<br/><span class="fp-back" id="fp-cancel">← Back to Login</span>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    attachListeners();
  }

  function setState(updates) {
    Object.assign(state, updates);
    render();
  }

  function attachListeners() {
    // Channel select
    container.querySelectorAll('[data-ch]').forEach(btn => {
      btn.addEventListener('click', () => setState({ channel: btn.dataset.ch }));
    });

    // Step 1: Send OTP
    container.querySelector('#fp-send-otp')?.addEventListener('click', async () => {
      const pid = container.querySelector('#fp-plate-id')?.value.trim().toUpperCase();
      if (!pid || pid.length < 3) { setState({ error: 'Please enter your Plate ID.' }); return; }
      setState({ loading: true, error: '', plateId: pid });
      const res = await callFn({ plate_id: pid, channel: state.channel, step: 'request_otp' });
      if (res.success) {
        setState({ loading: false, step: 2, maskedContact: res.masked_contact || '****', error: '' });
      } else {
        setState({ loading: false, error: res.message || 'Failed to send OTP.' });
      }
    });

    // Step 2: Verify OTP (just validates — advances to step 3 client-side, actual reset in step 3)
    container.querySelector('#fp-verify-otp')?.addEventListener('click', async () => {
      const otpVal = String(container.querySelector('#fp-otp')?.value || '').trim();
      if (otpVal.length !== 6) { setState({ error: 'OTP must be 6 digits.' }); return; }
      // Store OTP in closure for step 3
      state._otp = otpVal;
      setState({ step: 3, error: '' });
    });

    // Step 3: Reset PIN
    container.querySelector('#fp-reset-pin')?.addEventListener('click', async () => {
      const newPin = String(container.querySelector('#fp-new-pin')?.value || '').trim();
      const confirmPin = String(container.querySelector('#fp-confirm-pin')?.value || '').trim();
      if (!/^\d{4}$/.test(newPin)) { setState({ error: 'PIN must be exactly 4 digits.' }); return; }
      if (newPin !== confirmPin) { setState({ error: 'PINs do not match.' }); return; }
      setState({ loading: true, error: '' });
      const res = await callFn({
        plate_id: state.plateId,
        otp: state._otp,
        new_pin: newPin,
        step: 'verify_otp',
      });
      if (res.success) {
        setState({ loading: false, step: 4, error: '' });
        onSuccess?.();
      } else {
        setState({ loading: false, error: res.message || 'Failed to reset PIN.' });
        if (res.message?.includes('OTP')) {
          // OTP was wrong or expired — go back to OTP step
          state.step = 2;
          render();
        }
      }
    });

    // Back links
    container.querySelector('#fp-back-1')?.addEventListener('click', () => setState({ step: 1, error: '' }));
    container.querySelector('#fp-cancel')?.addEventListener('click', () => onBack?.());
    container.querySelector('#fp-go-login')?.addEventListener('click', () => onBack?.());

    // Resend OTP
    container.querySelector('#fp-resend')?.addEventListener('click', async () => {
      setState({ loading: true, error: '' });
      const res = await callFn({ plate_id: state.plateId, channel: state.channel, step: 'request_otp' });
      setState({ loading: false, error: res.success ? '' : (res.message || 'Resend failed.') });
      if (res.success) {
        document.getElementById('fp-err').textContent = '✅ OTP resent!';
        document.getElementById('fp-err').style.color = '#10b981';
      }
    });
  }

  render();
}

// ────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────
export const ForgotPin = {
  /**
   * Mount the Forgot PIN widget into a container element.
   * @param {HTMLElement} container
   * @param {{ onSuccess?: Function, onBack?: Function }} options
   */
  mount(container, options = {}) {
    ForgotPinWidget(container, options);
  },
};

export default ForgotPin;
