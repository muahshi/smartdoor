/**
 * Smart Door — Shared Pricing Constants
 * supabase/functions/_shared/pricing.ts
 *
 * SINGLE SOURCE OF TRUTH for hardware product pricing on the server side.
 * Every Edge Function that needs to know a product's price (creating a
 * Razorpay order, inserting an `orders` row, etc.) MUST import from here
 * instead of declaring its own copy. This is what prevents the classic
 * "frontend says ₹1499, Razorpay charges ₹1999" class of bug — there is
 * now exactly ONE place on the server where a rupee amount is decided.
 *
 * These values MUST exactly match the `data-price` attributes on the
 * product cards in index.html:
 *   data-product="acrylic"   data-price="1499"
 *   data-product="wood"      data-price="2499"
 *   data-product="steel"     data-price="2999"
 *
 * (The frontend's product key "wood"/"steel" maps to "teakwood"/"stainless"
 * here via PRODUCT_TYPE_MAP in services/payments.js before this is called.)
 *
 * If you change a price, change it in exactly TWO places and nowhere else:
 *   1. The relevant data-price attribute(s) in index.html
 *   2. PRODUCT_PRICES_PAISE below
 */

// Amounts are in paise (INR × 100) because that's the unit Razorpay's API requires.
export const PRODUCT_PRICES_PAISE: Record<string, number> = {
  acrylic:   149900, // ₹1,499
  teakwood:  249900, // ₹2,499
  stainless: 299900, // ₹2,999
};

// Free shipping on all hardware orders.
export const SHIPPING_PRICE_PAISE = 0;

// 1-year Privacy subscription ships FREE with every plate — never charged
// separately at checkout time. Renewal pricing (year 2+) lives in
// services/subscriptions.js / activate-subscription, which is a completely
// separate flow from the hardware purchase and intentionally not unified
// with this file.
export const SUBSCRIPTION_PRICE_PAISE = 0;

export function getProductPricePaise(productType: string): number | null {
  return PRODUCT_PRICES_PAISE[productType] ?? null;
}

export function isValidProductType(productType: string): boolean {
  return productType in PRODUCT_PRICES_PAISE;
}
