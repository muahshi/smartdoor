/**
 * Smart Door — Input Sanitization & Validation
 * services/sanitize.js
 *
 * All user input MUST pass through this before touching Supabase or
 * being sent to any API. Prevents XSS, injection, and malformed data.
 *
 * Usage:
 *   import { sanitize, validate } from './services/sanitize.js';
 *   const clean = sanitize.phone(rawPhone);           // '+919876543210' or null
 *   const ok    = validate.plateId('SD-ABX9K7');      // true
 */

// ─── SANITIZERS ───────────────────────────────────────────────────────────────
export const sanitize = {

  /**
   * Strip HTML tags and dangerous characters from any text.
   * Use for: names, house names, messages, comments.
   */
  text(raw, maxLen = 255) {
    if (raw == null) return '';
    return String(raw)
      .replace(/<[^>]*>/g, '')              // Strip HTML tags
      .replace(/[<>"'`]/g, '')             // Strip common injection chars
      .replace(/javascript:/gi, '')         // Strip js: protocol
      .replace(/on\w+\s*=/gi, '')           // Strip event handlers
      .trim()
      .slice(0, maxLen);
  },

  /**
   * Normalize phone number to 10-digit Indian format.
   * Returns null if unparseable.
   */
  phone(raw) {
    if (raw == null) return null;
    const digits = String(raw).replace(/\D/g, '');
    // Accept +91XXXXXXXXXX or 91XXXXXXXXXX or XXXXXXXXXX
    const ten = digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 13 && digits.startsWith('091')
        ? digits.slice(3)
        : digits.length === 10
          ? digits
          : null;
    if (!ten || !/^[6-9]\d{9}$/.test(ten)) return null;
    return ten;
  },

  /**
   * Normalize email — lowercase, trim. Returns null if invalid.
   */
  email(raw) {
    if (raw == null) return null;
    const clean = String(raw).toLowerCase().trim().slice(0, 254);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : null;
  },

  /**
   * Normalize Plate ID: uppercase, trim. Returns null if invalid format.
   */
  plateId(raw) {
    if (raw == null) return null;
    const clean = String(raw).toUpperCase().trim();
    return /^SD-[A-Z0-9]{6}$/.test(clean) ? clean : null;
  },

  /**
   * Normalize PIN: digits only, exactly 4. Returns null if invalid.
   */
  pin(raw) {
    if (raw == null) return null;
    const clean = String(raw).replace(/\D/g, '').trim();
    return /^\d{4}$/.test(clean) ? clean : null;
  },

  /**
   * Sanitize JSON/object — remove keys not in allowlist.
   */
  object(raw, allowedKeys = []) {
    if (typeof raw !== 'object' || raw === null) return {};
    const clean = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        clean[key] = raw[key];
      }
    }
    return clean;
  },

  /**
   * Sanitize shipping address object.
   */
  address(raw) {
    if (typeof raw !== 'object' || raw === null) return {};
    return {
      line1:   sanitize.text(raw.line1,   100),
      line2:   sanitize.text(raw.line2,   100),
      city:    sanitize.text(raw.city,    50),
      state:   sanitize.text(raw.state,   50),
      pincode: String(raw.pincode || '').replace(/\D/g, '').slice(0, 6),
      country: 'IN',
    };
  },

  /**
   * Safe positive integer parse.
   */
  posInt(raw, max = 1_000_000) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return 0;
    return Math.min(n, max);
  },
};

// ─── VALIDATORS ───────────────────────────────────────────────────────────────
export const validate = {
  plateId:  (v) => /^SD-[A-Z0-9]{6}$/.test(String(v || '').toUpperCase()),
  pin:      (v) => /^\d{4}$/.test(String(v || '')),
  phone:    (v) => sanitize.phone(v) !== null,
  email:    (v) => sanitize.email(v) !== null,
  pincode:  (v) => /^\d{6}$/.test(String(v || '')),
  uuidv4:   (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '')),
  productType: (v) => ['acrylic', 'stainless', 'teakwood'].includes(v),
  plan:     (v) => ['hardware_only', 'smartdoor_care'].includes(v),
  nonEmpty: (v) => typeof v === 'string' && v.trim().length > 0,
};

// ─── REQUEST BODY VALIDATORS ──────────────────────────────────────────────────
/**
 * Validate + sanitize a checkout request body.
 * Returns { ok, errors, clean }
 */
export function validateCheckoutBody(raw) {
  const errors = [];
  const clean  = {};

  if (!raw) return { ok: false, errors: ['Empty request body'], clean: {} };

  // Product type
  if (!validate.productType(raw.productType)) {
    errors.push('Invalid productType. Must be acrylic | stainless | teakwood.');
  } else {
    clean.productType = raw.productType;
  }

  // Customer name
  const name = sanitize.text(raw.customerName, 100);
  if (!name) errors.push('customerName is required.');
  else clean.customerName = name;

  // Email
  const email = sanitize.email(raw.customerEmail);
  if (!email) errors.push('Invalid customerEmail.');
  else clean.customerEmail = email;

  // Phone
  const phone = sanitize.phone(raw.customerPhone);
  if (!phone) errors.push('Invalid customerPhone (must be 10-digit Indian mobile).');
  else clean.customerPhone = phone;

  // Address
  clean.shippingAddress = sanitize.address(raw.shippingAddress || {});
  if (!clean.shippingAddress.line1) errors.push('shippingAddress.line1 is required.');
  if (!validate.pincode(clean.shippingAddress.pincode)) errors.push('Invalid pincode (6 digits).');

  // Optional fields
  if (raw.houseName)   clean.houseName  = sanitize.text(raw.houseName, 100);
  if (raw.houseNumber) clean.houseNumber = sanitize.text(raw.houseNumber, 50);
  if (raw.fontStyle)   clean.fontStyle  = ['modern', 'classic', 'bold'].includes(raw.fontStyle)
    ? raw.fontStyle : 'modern';

  return { ok: errors.length === 0, errors, clean };
}

/**
 * Validate a family member addition.
 */
export function validateFamilyMember(raw) {
  const errors = [];
  const clean  = {};

  const name = sanitize.text(raw?.name, 60);
  if (!name) errors.push('name is required.');
  else clean.name = name;

  const phone = sanitize.phone(raw?.phone);
  if (!phone) errors.push('Invalid phone number.');
  else clean.phone = phone;

  const rel = ['family', 'friend', 'staff', 'other'].includes(raw?.relationship)
    ? raw.relationship : 'family';
  clean.relationship = rel;

  return { ok: errors.length === 0, errors, clean };
}

export default { sanitize, validate, validateCheckoutBody, validateFamilyMember };
