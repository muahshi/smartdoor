/**
 * My Smart Door — Grace Period Engine
 * services/gracePeriod.js
 *
 * Phase 11 — Real World Operations
 *
 * SUBSCRIPTION EXPIRY FLOW
 *   Expired Plate → Grace Period → Limited Functionality → Renewal Required
 *
 * Pure, read-only logic computed from existing plates/subscriptions data —
 * does NOT modify services/subscriptions.js or services/renewalEngine.js.
 * Consumed by the visitor route (visitor.html / visitorExperience.js) to
 * decide what a visitor is allowed to do, and by the owner dashboard to
 * show renewal urgency banners.
 */

export const GRACE_PERIOD_DAYS = 15;

/**
 * Computes where a plate/subscription sits in the expiry lifecycle.
 * @param {object} params
 * @param {object} params.plate         - row from `plates` (status, expiry_date)
 * @param {object|null} params.subscription - row from `subscriptions` (status, expiry_date)
 * @returns {{ status: 'no_subscription'|'active'|'grace_period'|'expired_locked',
 *             daysSinceExpiry: number|null, daysLeftInGrace: number|null, graceEndsAt: string|null }}
 */
export function getPlateLifecycleStatus({ plate, subscription }) {
  if (!subscription || !subscription.expiry_date) {
    return { status: 'no_subscription', daysSinceExpiry: null, daysLeftInGrace: null, graceEndsAt: null };
  }

  const now = new Date();
  const expiry = new Date(subscription.expiry_date);
  const graceEnds = new Date(expiry.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  if (now <= expiry && subscription.status === 'active') {
    return { status: 'active', daysSinceExpiry: null, daysLeftInGrace: null, graceEndsAt: null };
  }

  const daysSinceExpiry = Math.floor((now - expiry) / (1000 * 60 * 60 * 24));

  if (now <= graceEnds) {
    const daysLeftInGrace = Math.max(0, Math.ceil((graceEnds - now) / (1000 * 60 * 60 * 24)));
    return {
      status: 'grace_period',
      daysSinceExpiry,
      daysLeftInGrace,
      graceEndsAt: graceEnds.toISOString(),
    };
  }

  return {
    status: 'expired_locked',
    daysSinceExpiry,
    daysLeftInGrace: 0,
    graceEndsAt: graceEnds.toISOString(),
  };
}

/**
 * Determines which visitor-facing actions are allowed given the plate's
 * lifecycle status. SOS always stays enabled — safety is never gated
 * behind a subscription.
 * @param {string} lifecycleStatus
 * @returns {{ allowCall: boolean, allowVoice: boolean, allowText: boolean,
 *             allowSos: boolean, bannerType: 'none'|'grace'|'locked', bannerMessage: string|null }}
 */
export function getVisitorPermissions(lifecycleStatus) {
  switch (lifecycleStatus) {
    case 'active':
    case 'no_subscription': // hardware-only / legacy plates default to full access
      return { allowCall: true, allowVoice: true, allowText: true, allowSos: true, bannerType: 'none', bannerMessage: null };

    case 'grace_period':
      // Limited functionality: core communication stays on so residents
      // don't lose contact with visitors mid-renewal, but voice notes
      // (storage cost) are paused until renewal completes.
      return {
        allowCall: true,
        allowVoice: false,
        allowText: true,
        allowSos: true,
        bannerType: 'grace',
        bannerMessage: 'This My Smart Door subscription has expired and is in its grace period. Some features are limited until renewal.',
      };

    case 'expired_locked':
      return {
        allowCall: false,
        allowVoice: false,
        allowText: false,
        allowSos: true,
        bannerType: 'locked',
        bannerMessage: 'This My Smart Door subscription has expired. Renewal is required to restore full visitor access.',
      };

    default:
      return { allowCall: true, allowVoice: true, allowText: true, allowSos: true, bannerType: 'none', bannerMessage: null };
  }
}

/**
 * Convenience wrapper: takes the plate/subscription pair and directly
 * returns the permission set the visitor UI needs to render.
 */
export function evaluateAccess({ plate, subscription }) {
  const lifecycle = getPlateLifecycleStatus({ plate, subscription });
  const permissions = getVisitorPermissions(lifecycle.status);
  return { ...lifecycle, ...permissions };
}
