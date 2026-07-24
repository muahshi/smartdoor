/**
 * My Smart Door — AI Product Consultant Knowledge Base
 * js/aiConsultantKnowledge.js
 *
 * PHASE 3 — AI PRODUCT CONSULTANT. ADDITIVE ONLY, new file.
 *
 * This is the grounding data fed into the consultant's system prompt
 * (see js/aiProductConsultant.js). Every fact here is sourced from an
 * existing page in this repo (legal/*.html, services/plans.js) rather
 * than invented, with two deliberate exceptions called out below.
 *
 * WHY A SEPARATE FILE (not inline in the prompt string):
 * keeps facts editable in one place without touching the widget logic,
 * and keeps the system prompt honest — the AI is told explicitly which
 * topics it has real data for and which it must defer to a human on.
 *
 * KNOWN GAP (do not paper over this in the prompt): there is no
 * published warranty policy anywhere in this repo. Do NOT let the
 * consultant state a warranty duration or terms — instruct it to
 * defer to support@mysmartdoor.in for warranty questions.
 */
(function (global) {
  'use strict';

  const SD_CONSULTANT_KB = {
    brand: {
      name: 'My Smart Door',
      domain: 'mysmartdoor.in',
      tagline: 'QR-powered smart nameplate and visitor communication platform',
      location: 'Bhopal, Madhya Pradesh, India',
      supportEmail: 'support@mysmartdoor.in',
      supportPhone: '+91 95758 77758'
    },

    privacy: {
      summary: 'Visitors only ever see a QR code — never the owner\'s name or phone number. Scanning it opens a visitor portal for masked communication (call, voice note, text) without exposing personal contact details.',
      neverExposed: ['owner phone number'],
      visitorCanDo: ['send a text message', 'send a voice note', 'request a masked call', 'raise an SOS/emergency alert'],
      privacySubscription: '1 year of the privacy service is included free with every hardware purchase (₹299/year value once renewal applies).'
    },

    howItWorks: [
      'Owner mounts the QR nameplate at their door/gate.',
      'Visitor scans the QR — no app install needed, works on any phone.',
      'Visitor is guided to message, send a voice note, or request a call — all masked.',
      'Owner gets a real-time notification and responds from their dashboard.'
    ],

    plans: {
      note: 'AI Receptionist is a Premium-plan feature, not a separate purchase — recommend upgrading to Premium when a visitor wants AI call handling/analytics, not a standalone add-on.',
      tiers: [
        { name: 'Free', priceMonthly: 0, highlights: ['30 calls/month', '7-day visitor history', 'core QR + messaging'] },
        { name: 'Premium', priceMonthly: 29, highlights: ['AI Receptionist', 'AI-powered visitor analytics', '90-day visitor history', 'priority support', '500 calls/month'] },
        { name: 'Enterprise', priceMonthly: 999, highlights: ['unlimited calls', '365-day history', 'dedicated support', 'built for societies/offices with many units'] }
      ]
    },

    installationContexts: {
      note: 'The hardware and flow are the same across contexts — differences are about scale and who manages it, not different products.',
      apartment: 'Single unit at the flat\'s own door; owner manages their own dashboard.',
      villa: 'Mounted at the main gate; same setup as an apartment, just at the outer boundary.',
      office: 'Mounted at the office entrance; useful for screening client/vendor visits without publishing a personal number.',
      society_or_business: 'Multiple units/gates can each run their own plate; society/business admin tooling exists on the platform for managing many plates at once (recommend directing bulk/society inquiries to support — this is a sales conversation for pricing specifics, not something to quote exact numbers on).'
    },

    // Sourced from legal/shipping-policy.html — do not restate as a guarantee, timelines are stated as estimates in the source too.
    shipping: {
      coverage: 'Ships across India only. No international shipping currently.',
      processing: 'Made-to-order (engraved with owner details + Plate ID); manufacturing typically takes 2–4 business days after payment.',
      deliveryEstimates: [
        { region: 'Bhopal / Madhya Pradesh', days: '2–4 business days after dispatch' },
        { region: 'Major metro cities', days: '4–6 business days after dispatch' },
        { region: 'Rest of India', days: '5–8 business days after dispatch' }
      ],
      note: 'These are estimates and can shift with courier/weather/regional disruptions — do not promise an exact delivery date.'
    },

    // Sourced from legal/refund-policy.html
    refunds: {
      beforeDispatch: 'Full refund if cancelled before the order is dispatched for manufacturing/shipping.',
      afterDispatch: 'Not eligible for refund, but may be eligible for return.',
      defectiveOrWrong: 'Full refund or free replacement if reported within 7 days of delivery with photo/video evidence, or if the wrong item was shipped.',
      subscriptions: 'Subscription fees are non-refundable once a billing cycle starts; cancelling keeps access until the paid period ends.'
    },

    // Deliberate gap — see file header. Never let the AI invent a number here.
    warranty: {
      published: false,
      instruction: 'No warranty policy is published. If asked, say a team member can confirm current warranty terms and point to support — never state a duration or coverage detail.'
    },

    objectionHandling: {
      'too expensive': 'Frame against the value: one-time hardware cost + a full year of privacy included free, versus every stranger and delivery rider having a permanent number to your home.',
      'is my number really hidden': 'Yes — this is the core design, not an add-on. The visitor-facing surface only ever shows the QR and in-app messaging/calling; the phone number is never rendered to a visitor at any point.',
      'what if i want a different design later': 'Font, symbol, and QR style are chosen at order time in the configurator; size and finish vary by product — point them to Configure & Order to see live options for the specific product they\'re considering.'
    }
  };

  global.SD_ConsultantKB = SD_CONSULTANT_KB;
})(window);
