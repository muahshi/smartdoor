/**
 * Smart Door — MSG91 WhatsApp Provider (Server-Side)
 * supabase/functions/_shared/providers/msg91.ts
 *
 * One of three interchangeable WhatsApp backends (see also meta.ts, twilio
 * WhatsApp via providers/twilio.ts). Selected at runtime by
 * supabase/functions/send-whatsapp/index.ts based on WHATSAPP_PROVIDER.
 * Holds MSG91_API_KEY — never reaches the browser.
 *
 * Docs reference (verify against current MSG91 API version before going live):
 *   POST https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/
 */

export interface WhatsAppRequest {
  toPhone: string;
  templateName: string;
  templateVars: Record<string, string>;
}

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendMessage({ toPhone, templateName, templateVars }: WhatsAppRequest): Promise<WhatsAppResult> {
  const apiKey = Deno.env.get('MSG91_API_KEY');
  if (!apiKey) {
    return { success: false, error: 'MSG91 credentials not configured' };
  }

  try {
    const resp = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
      method: 'POST',
      headers: {
        authkey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrated_number: Deno.env.get('MSG91_WHATSAPP_NUMBER') || '',
        content_type: 'template',
        payload: {
          to: toPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en', policy: 'deterministic' },
            namespace: Deno.env.get('MSG91_NAMESPACE') || '',
            to_and_components: [{ to: [toPhone], components: templateVars }],
          },
        },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, error: data?.message || `MSG91 returned ${resp.status}` };
    }
    return { success: true, messageId: data?.request_id || data?.message_id };
  } catch (err) {
    return { success: false, error: `MSG91 request failed: ${(err as Error).message}` };
  }
}
