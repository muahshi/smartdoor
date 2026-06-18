/**
 * Smart Door — WhatsApp Provider Abstraction
 * services/whatsapp.js
 *
 * ARCHITECTURE ONLY — not wired into any live flow yet.
 * Vendor is never hardcoded into calling code; everything goes through
 * `sendWhatsApp()` below, which dispatches to the `send-whatsapp` Edge
 * Function. The Edge Function reads WHATSAPP_PROVIDER from its environment
 * and picks the right backend at runtime:
 *   - msg91   → services/_shared/providers/msg91.ts        (India-first, cheapest)
 *   - meta    → Meta Cloud API direct (official, more setup)
 *   - twilio  → Twilio WhatsApp Business API (reuses Twilio account)
 *
 * To add a new vendor later: implement it in
 * supabase/functions/_shared/providers/<vendor>.ts and add one line to the
 * switch in supabase/functions/send-whatsapp/index.ts. No client code changes.
 */

import { supabase } from './supabase.js';

export const SUPPORTED_PROVIDERS = ['msg91', 'meta', 'twilio'];

/**
 * @param {object} params
 * @param {string} params.ownerId
 * @param {string} params.toPhone        recipient (owner or family member), E.164 format
 * @param {string} params.templateName   pre-approved WhatsApp template name
 * @param {object} [params.templateVars] variables to interpolate into the template
 * @param {('normal'|'high'|'critical')} [params.priority]
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsApp({ ownerId, toPhone, templateName, templateVars = {}, priority = 'normal' }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: { ownerId, toPhone, templateName, templateVars, priority },
    });

    if (error || !data?.success) {
      return { success: false, error: data?.message || error?.message || 'WhatsApp send failed' };
    }
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('[WhatsApp] sendWhatsApp() error:', err);
    return { success: false, error: 'WhatsApp service unreachable' };
  }
}

export default { SUPPORTED_PROVIDERS, sendWhatsApp };
