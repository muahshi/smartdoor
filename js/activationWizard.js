/**
 * My Smart Door — Activation Wizard
 * js/activationWizard.js
 *
 * Phase 9 — Beta Launch Operations
 *
 * First-login onboarding wizard injected into app.html.
 * Steps: Welcome → Family Setup → Status Setup → Security Setup → Test Visitor Flow
 *
 * Usage:
 *   import { initActivationWizard } from './js/activationWizard.js';
 *   // In app.js, after auth check:
 *   const onboarding = await getOnboardingProgress(ownerId);
 *   if (!onboarding.isComplete && !onboarding.steps.find(s=>s.key==='account_activated')?.done) {
 *     initActivationWizard(ownerId, onboarding);
 *   }
 *
 * Does NOT modify existing dashboard UI, Tailwind classes, or components.
 * Wizard overlays above existing content, removes itself on completion.
 */

import { markOnboardingStep } from '../services/customerSuccess.js';

const WIZARD_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to My Smart Door! 🎉',
    subtitle: 'Your plate is activated. Let\'s set up your home in 4 quick steps.',
    icon: '🏠',
    cta: 'Let\'s Begin',
    skip: false,
  },
  {
    id: 'family',
    title: 'Add Family Members',
    subtitle: 'Add names and photos of family so your AI knows who's home.',
    icon: '👨‍👩‍👧‍👦',
    cta: 'Go to Family Setup',
    skip: true,
    action: 'openTab',
    tabTarget: 'family',
    dbStep: 'family_setup',
  },
  {
    id: 'status',
    title: 'Set Your Status Messages',
    subtitle: 'Tell visitors what to expect — \'Available\', \'Do Not Disturb\', etc.',
    icon: '💬',
    cta: 'Set Status',
    skip: true,
    action: 'openTab',
    tabTarget: 'status',
    dbStep: 'status_setup',
  },
  {
    id: 'security',
    title: 'Configure Security Rules',
    subtitle: 'Block unwanted visitors, set SOS contacts, and configure alerts.',
    icon: '🔒',
    cta: 'Setup Security',
    skip: true,
    action: 'openTab',
    tabTarget: 'security',
    dbStep: 'security_setup',
  },
  {
    id: 'test',
    title: 'Test Your My Smart Door!',
    subtitle: 'Scan your QR code with any phone to see the visitor experience.',
    icon: '📱',
    cta: 'Show My QR Code',
    skip: true,
    action: 'showQR',
    dbStep: null,
  },
];

let _ownerId = null;
let _currentStep = 0;
let _overlay = null;

export async function initActivationWizard(ownerId, onboardingData) {
  _ownerId = ownerId;

  // Find first incomplete step
  const firstIncomplete = WIZARD_STEPS.findIndex(step => {
    if (!step.dbStep) return false;
    const dbStepData = onboardingData.steps.find(s => s.key === step.dbStep);
    return dbStepData && !dbStepData.done;
  });

  _currentStep = firstIncomplete >= 0 ? firstIncomplete : 0;

  _renderWizard();
  await markOnboardingStep(ownerId, 'account_activated');
}

function _renderWizard() {
  // Remove existing if present
  const existing = document.getElementById('sd-activation-wizard');
  if (existing) existing.remove();

  _overlay = document.createElement('div');
  _overlay.id = 'sd-activation-wizard';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    font-family: inherit; padding: 1rem;
  `;

  _overlay.innerHTML = _buildStepHTML(_currentStep);
  document.body.appendChild(_overlay);
  _bindEvents();
}

function _buildStepHTML(stepIndex) {
  const step = WIZARD_STEPS[stepIndex];
  const total = WIZARD_STEPS.length;
  const percent = Math.round(((stepIndex) / (total - 1)) * 100);

  const dots = WIZARD_STEPS.map((s, i) => `
    <div style="
      width: 8px; height: 8px; border-radius: 50%;
      background: ${i <= stepIndex ? '#f59e0b' : 'rgba(255,255,255,0.3)'};
      transition: background 0.3s;
    "></div>
  `).join('');

  return `
    <div style="
      background: #1a1a2e; border: 1px solid rgba(245,158,11,0.3);
      border-radius: 1.5rem; padding: 2.5rem 2rem; max-width: 480px; width: 100%;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      text-align: center; color: #fff;
    ">
      <!-- Progress dots -->
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:2rem;">
        ${dots}
      </div>

      <!-- Icon -->
      <div style="font-size:3.5rem;margin-bottom:1rem;line-height:1;">${step.icon}</div>

      <!-- Title -->
      <h2 style="font-size:1.4rem;font-weight:700;margin:0 0 0.75rem;color:#f59e0b;">
        ${step.title}
      </h2>

      <!-- Subtitle -->
      <p style="color:rgba(255,255,255,0.7);font-size:0.95rem;margin:0 0 2rem;line-height:1.6;">
        ${step.subtitle}
      </p>

      <!-- CTA Button -->
      <button id="sd-wiz-cta" style="
        background: linear-gradient(135deg,#f59e0b,#ef4444);
        color:#fff;border:none;border-radius:0.75rem;
        padding:0.875rem 2rem;font-size:1rem;font-weight:600;
        cursor:pointer;width:100%;margin-bottom:0.75rem;
        transition: opacity 0.2s;
      ">${step.cta}</button>

      <!-- Skip / Close -->
      ${step.skip ? `
        <button id="sd-wiz-skip" style="
          background:transparent;border:none;color:rgba(255,255,255,0.4);
          font-size:0.85rem;cursor:pointer;padding:0.5rem;
        ">Skip this step →</button>
      ` : ''}

      ${stepIndex === WIZARD_STEPS.length - 1 ? `
        <button id="sd-wiz-finish" style="
          background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);
          color:#10b981;border-radius:0.75rem;padding:0.75rem 1.5rem;
          font-size:0.9rem;cursor:pointer;width:100%;margin-top:0.5rem;
        ">✅ I'm all set — Go to Dashboard</button>
      ` : ''}

      <!-- Step counter -->
      <p style="color:rgba(255,255,255,0.25);font-size:0.75rem;margin-top:1.5rem;">
        Step ${stepIndex + 1} of ${total}
      </p>
    </div>
  `;
}

function _bindEvents() {
  const cta = document.getElementById('sd-wiz-cta');
  const skip = document.getElementById('sd-wiz-skip');
  const finish = document.getElementById('sd-wiz-finish');

  if (cta) cta.addEventListener('click', () => _handleCTA());
  if (skip) skip.addEventListener('click', () => _nextStep());
  if (finish) finish.addEventListener('click', () => _completeWizard());
}

async function _handleCTA() {
  const step = WIZARD_STEPS[_currentStep];

  if (step.dbStep) {
    await markOnboardingStep(_ownerId, step.dbStep);
  }

  if (step.action === 'openTab' && step.tabTarget) {
    _closeOverlay();
    // Trigger existing tab switch — compatible with app.js tab system
    const tabBtn = document.querySelector(`[data-tab="${step.tabTarget}"], #tab-${step.tabTarget}`);
    if (tabBtn) tabBtn.click();
    return;
  }

  if (step.action === 'showQR') {
    _closeOverlay();
    const qrBtn = document.querySelector('#btn-show-qr, [data-action="show-qr"]');
    if (qrBtn) qrBtn.click();
    return;
  }

  _nextStep();
}

function _nextStep() {
  _currentStep++;
  if (_currentStep >= WIZARD_STEPS.length) {
    _completeWizard();
    return;
  }
  _overlay.innerHTML = _buildStepHTML(_currentStep);
  _bindEvents();
}

async function _completeWizard() {
  await markOnboardingStep(_ownerId, 'account_activated');
  _closeOverlay();

  // Show brief success toast
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
    background: #10b981; color: #fff; padding: 0.875rem 1.5rem;
    border-radius: 0.75rem; font-size: 0.95rem; font-weight: 600;
    z-index: 9998; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  `;
  toast.textContent = '🎉 My Smart Door setup complete!';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function _closeOverlay() {
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
}
