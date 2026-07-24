/**
 * brandConfig.js
 * ------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for brand text across the SmartDoor site.
 *
 * Phase 2B.1 — Brand Standardization. Official brand display name is
 * now "My Smart Door". This file exists so brand text is never
 * hardcoded again: any page/script that needs to show the brand name,
 * short name, tagline, site name, or copyright line reads it from
 * here.
 *
 * IMPORTANT — this file changes DISPLAY TEXT ONLY:
 *   - domain (mysmartdoor.in), API endpoints, routes, product IDs,
 *     Supabase/Razorpay integration, and all business logic are
 *     UNCHANGED and must never be derived from this file.
 *   - Do not use BRAND.name in URLs, slugs, data-attributes, or
 *     anything a backend/consumer depends on structurally.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var BRAND = {
    name: 'My Smart Door',
    shortName: 'My Smart Door',
    legalName: 'My Smart Door',
    logoText: 'MY SMART DOOR',
    tagline: 'HOME PRIVACY OS',
    siteName: 'My Smart Door',
    domain: 'mysmartdoor.in',
    url: 'https://mysmartdoor.in',
    copyright: '© ' + new Date().getFullYear() + ' My Smart Door. All rights reserved.'
  };

  global.SD_Brand = BRAND;
})(window);
