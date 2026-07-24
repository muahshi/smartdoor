/**
 * My Smart Door — Commerce Service (Phase 8A)
 * services/commerce.js
 *
 * Two audiences, two call styles (mirrors the existing split between
 * services/payments.js (public, supabase.functions.invoke) and
 * services/adminData.js (admin-authenticated, raw fetch + Bearer session
 * token) — see adminData.js's header comment for why admin calls must NOT
 * use supabase.functions.invoke()):
 *
 *   - validateCoupon()  → public checkout helper, calls validate-coupon
 *     (no admin auth — safe for the storefront/checkout page)
 *   - everything else   → admin panel helpers, calls commerce-engine
 *     (admin session token required, same as services/adminData.js)
 */

import { supabase } from './supabase.js';
import { fetchWithTimeout } from './httpClient.js';

function _edgeBase() { return `${window.__SD_CONFIG__?.supabaseUrl || ''}/functions/v1`; }

// ────────── PUBLIC: CHECKOUT COUPON PREVIEW ──────────
/**
 * Dry-run coupon check for the checkout page — no admin auth required.
 * Does NOT reserve the coupon; the real reservation happens inside
 * createRazorpayOrder() (services/payments.js) via the couponCode param.
 * @param {string} code
 * @param {number} orderTotal  - rupees, pre-discount
 * @param {string} productType
 */
export async function validateCoupon(code, orderTotal, productType = 'acrylic') {
  try {
    const { data, error } = await supabase.functions.invoke('validate-coupon', {
      body: { code, orderTotal, productType },
    });
    if (error) return { success: false, error: error.message || 'Could not validate coupon.' };
    return data;
  } catch (err) {
    console.error('[Commerce] validateCoupon error:', err);
    return { success: false, error: 'Network error. Please retry.' };
  }
}

// ────────── ADMIN: commerce-engine CALL HELPER ──────────
async function _call(action, extra = {}) {
  const raw = localStorage.getItem('sd_admin_session');
  if (!raw) return { success: false, error: 'Admin session expired. Please sign in again.' };

  let session;
  try { session = JSON.parse(raw); }
  catch { return { success: false, error: 'Corrupt admin session. Please sign in again.' }; }

  const token = session?.token;
  if (!token) return { success: false, error: 'Admin session expired. Please sign in again.' };

  try {
    const res = await fetchWithTimeout(`${_edgeBase()}/commerce-engine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    }, 15000);

    if (!res.ok && res.status === 401) {
      localStorage.removeItem('sd_admin_session');
      window.location.href = '/admin-login.html';
      return { success: false, error: 'Session expired.' };
    }

    const data = await res.json();
    if (!data?.success) return { success: false, error: data?.message || 'Request failed.' };
    return data;
  } catch (err) {
    console.error(`[Commerce] ${action} error:`, err);
    return { success: false, error: err?.isTimeout ? 'Request timed out.' : 'Connection error. Try again.' };
  }
}

// ────────── ADMIN: COUPONS ──────────
export const listCoupons        = () => _call('coupon_list');
export const upsertCoupon       = (coupon) => _call('coupon_upsert', { coupon });
export const toggleCoupon       = (couponId, isActive) => _call('coupon_toggle', { coupon_id: couponId, is_active: isActive });

// ────────── ADMIN: PRICING RULES ──────────
export const listPricingRules   = () => _call('pricing_rule_list');
export const upsertPricingRule  = (rule) => _call('pricing_rule_upsert', { rule });
export const togglePricingRule  = (ruleId, isActive) => _call('pricing_rule_toggle', { rule_id: ruleId, is_active: isActive });

// ────────── ADMIN: CAMPAIGNS ──────────
export const listCampaigns      = () => _call('campaign_list');
export const upsertCampaign     = (campaign) => _call('campaign_upsert', { campaign });
export const toggleCampaign     = (campaignId, disabled) => _call('campaign_toggle', { campaign_id: campaignId, disabled });

// ────────── ADMIN: DEALER / FRANCHISE PRICE LISTS ──────────
export const listPartnerPricing   = () => _call('partner_price_list_list');
export const upsertPartnerPricing = (priceList) => _call('partner_price_list_upsert', { priceList });

// ────────── ADMIN: BULK PRICING TIERS ──────────
export const listBulkPricingTiers   = () => _call('bulk_pricing_tier_list');
export const upsertBulkPricingTier  = (tier) => _call('bulk_pricing_tier_upsert', { tier });

// ────────── ADMIN: ANALYTICS + PREVIEW ──────────
export const getCommerceAnalytics = () => _call('commerce_analytics');
export const previewPricing       = (productType, quantity = 1, partnerAdminId = null, partnerRoleName = null) =>
  _call('pricing_preview', { productType, quantity, partnerAdminId, partnerRoleName });
