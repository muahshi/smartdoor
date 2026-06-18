/**
 * Smart Door — Phase 9 App.js Integration Patch
 * docs/PHASE9_APP_INTEGRATION.md
 *
 * ⚠️  DO NOT overwrite app.js or dashboard.js.
 * These are the minimal additions to wire Phase 9 features.
 *
 * ADD these imports at the top of app.js:
 */

// ══════════════════════════════════════════════
// STEP 1: Add these imports at top of app.js
// ══════════════════════════════════════════════

import { initActivationWizard }  from './activationWizard.js';
import { initBetaFeedback }      from './betaFeedback.js';
import { injectEnvBadge, isFeatureEnabled } from '../config/environment.js';
import { getOnboardingProgress } from '../services/customerSuccess.js';


// ══════════════════════════════════════════════
// STEP 2: Add this block INSIDE your auth success
//         handler, AFTER the user object is set.
//
// Look for: "// User authenticated successfully"
//           or where you currently call loadDashboard()
// ══════════════════════════════════════════════

async function onAuthSuccess(ownerId) {

  // Inject environment badge (staging/dev only)
  injectEnvBadge();

  // Beta Feedback FAB
  if (isFeatureEnabled('betaFeedback')) {
    initBetaFeedback(ownerId);
  }

  // Activation Wizard — only if not yet complete
  if (isFeatureEnabled('activationWizard')) {
    const onboarding = await getOnboardingProgress(ownerId);
    const isActivated = onboarding.onboarding?.steps?.find(s => s.key === 'account_activated')?.done;
    if (!isActivated) {
      await initActivationWizard(ownerId, onboarding.onboarding);
    }
  }
}

// Call onAuthSuccess(userId) from your existing auth success block.


// ══════════════════════════════════════════════
// STEP 3: Mark first visitor scan
//         Find where you handle QR scan events
//         or visitor_logs insert, and add:
// ══════════════════════════════════════════════

import { markOnboardingStep } from '../services/customerSuccess.js';

// Inside your visitor scan handler, after successful insert:
async function onFirstVisitorScan(ownerId) {
  await markOnboardingStep(ownerId, 'first_visitor_scan');
}


// ══════════════════════════════════════════════
// STEP 4: No changes needed in dashboard.js.
//         Admin KPI data is fetched by:
//         getLaunchKPIs() in customerSuccess.js
//         getOperationsDashboard() in customerSuccess.js
//
// Wire to your existing admin dashboard render function.
// ══════════════════════════════════════════════
