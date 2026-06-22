/**
 * Smart Door — Groq Proxy Edge Function
 * supabase/functions/groq-proxy/index.ts
 *
 * Proxies requests to Groq API so the GROQ_API_KEY
 * never leaves the server. Browser calls this function;
 * this function calls Groq.
 *
 * Deploy with: supabase functions deploy groq-proxy --no-verify-jwt
 * Required env: GROQ_API_KEY (set in Supabase Dashboard → Settings → Secrets)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_WHITELIST = ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768'];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      return new Response(JSON.stringify({ error: 'Groq API key not configured on server.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { messages, model = 'llama3-70b-8192', max_tokens = 500, temperature = 0.7 } = body;

    if (!GROQ_MODEL_WHITELIST.includes(model)) {
      return new Response(JSON.stringify({ error: 'Model not permitted.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groqResponse = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[groq-proxy] Groq API error:', groqResponse.status, errText);
      return new Response(JSON.stringify({ error: `Groq API error: ${groqResponse.status}` }), {
        status: groqResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await groqResponse.json();
    return new Response(JSON.stringify({
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      usage: data.usage,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[groq-proxy] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
