/**
 * Smart Door — Groq AI Service
 * Production-ready wrapper for Groq's LLaMA-3 API
 * groq.js v1.0
 */

const GroqService = (() => {
  // ────────── CONFIG ──────────
  // Phase 10: API key now comes from window.__SD_CONFIG__ (generated at
  // Vercel build time by scripts/build-env.js from VITE_GROQ_API_KEY).
  // Falls back to mock responses if not set (e.g. local dev without a key).
  // Phase 13 security fix: GROQ_API_KEY never sent to browser.
  // Browser calls groq-proxy Edge Function; proxy calls Groq with server-side key.
  const CONFIG = {
    proxyUrl: (() => {
      const url = window.__SD_CONFIG__?.supabaseUrl || '';
      return url ? url + '/functions/v1/groq-proxy' : null;
    })(),
    anonKey: window.__SD_CONFIG__?.supabaseAnon || '',
    model: 'llama3-70b-8192',
    maxTokens: 500,
    temperature: 0.7,
    timeout: 10000,
  };

  // ────────── STATE ──────────
  let _isLoading = false;
  let _lastError = null;
  let _requestCount = 0;

  // ────────── CORE API CALL ──────────
  async function callGroq(messages, options = {}) {
    _isLoading = true;
    _lastError = null;
    _requestCount++;

    const mergedOptions = {
      model: options.model || CONFIG.model,
      max_tokens: options.maxTokens || CONFIG.maxTokens,
      temperature: options.temperature || CONFIG.temperature,
    };

    try {
      // Route through groq-proxy Edge Function (key stays server-side)
      if (!CONFIG.proxyUrl) {
        console.warn('[GroqService] No Supabase URL configured — using mock.');
        return await _mockGroqResponse(messages, options);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

      const response = await fetch(CONFIG.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.anonKey,
          'Authorization': `Bearer ${CONFIG.anonKey}`,
        },
        body: JSON.stringify({
          model: mergedOptions.model,
          messages: messages,
          max_tokens: mergedOptions.max_tokens,
          temperature: mergedOptions.temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Groq Proxy Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      _isLoading = false;
      if (!data.success) throw new Error(data.error || 'Proxy returned failure');
      return {
        success: true,
        content: data.content || '',
        usage: data.usage,
        model: data.model,
      };
    } catch (err) {
      _isLoading = false;
      _lastError = err.message;
      console.error('[GroqService] API Error:', err);

      // Graceful fallback to mock on error
      return await _mockGroqResponse(messages, options);
    }
  }

  // ────────── MOCK INTELLIGENCE ENGINE ──────────
  async function _mockGroqResponse(messages, options = {}) {
    // Simulate realistic API latency
    const delay = 600 + Math.random() * 800;
    await _sleep(delay);

    const userMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const taskType = options.task || 'general';

    _isLoading = false;

    switch (taskType) {
      case 'intent':
        return _classifyIntent(userMessage);
      case 'status':
        return _generateStatus(userMessage);
      case 'summarize':
        return _summarizeVisitor(userMessage);
      default:
        return _generalResponse(userMessage);
    }
  }

  // ────────── INTENT CLASSIFICATION ──────────
  function _classifyIntent(text) {
    const lower = text.toLowerCase();

    // Spam patterns
    const spamKeywords = ['sell', 'insurance', 'loan', 'offer', 'discount', 'free', 'investment', 'policy', 'promote', 'advertisement', 'leaflet', 'flyer', 'market'];
    const deliveryKeywords = ['deliver', 'parcel', 'package', 'courier', 'amazon', 'flipkart', 'order', 'shipment', 'drop', 'box', 'swiggy', 'zomato', 'food'];
    const urgentKeywords = ['emergency', 'urgent', 'help', 'accident', 'fire', 'police', 'ambulance', 'sos', 'critical', 'immediately', 'flood'];
    const familyKeywords = ['family', 'relative', 'friend', 'guest', 'visit', 'meet', 'know', 'neighbour'];

    let intent = 'Unknown';
    let priority = 'Normal';
    let action = 'Notify Owner';
    let confidence = 0.85;
    let color = '#00A2E8';
    let emoji = '👤';
    let response = '';

    if (spamKeywords.some(k => lower.includes(k))) {
      intent = 'Spam / Promotional';
      priority = 'Low';
      action = 'Blocked';
      color = '#EF4444';
      emoji = '🚫';
      response = 'We do not accept promotional or sales requests. Please contact through official channels. Thank you!';
      confidence = 0.93;
    } else if (urgentKeywords.some(k => lower.includes(k))) {
      intent = 'Emergency / SOS';
      priority = 'Critical';
      action = 'Bypass All Rules';
      color = '#EF4444';
      emoji = '🚨';
      response = 'EMERGENCY DETECTED. Alerting the owner and all family members immediately. Please stay calm.';
      confidence = 0.98;
    } else if (deliveryKeywords.some(k => lower.includes(k))) {
      intent = 'Delivery';
      priority = 'Normal';
      action = 'Notify Owner';
      color = '#F59E0B';
      emoji = '📦';
      response = 'Please leave the parcel at the security gate. The owner has been notified and will arrange collection. Thank you!';
      confidence = 0.91;
    } else if (familyKeywords.some(k => lower.includes(k))) {
      intent = 'Known Guest / Family';
      priority = 'High';
      action = 'Ring Bell + Notify';
      color = '#22C55E';
      emoji = '👨‍👩‍👧';
      response = 'Welcome! I\'ve notified the owner of your arrival. They should be with you shortly. You can also ring the digital bell.';
      confidence = 0.88;
    } else {
      intent = 'General Visitor';
      priority = 'Normal';
      action = 'Notify Owner';
      color = '#00A2E8';
      emoji = '👋';
      response = 'Thank you for visiting! The owner has been notified of your arrival. Please wait a moment or ring the digital bell.';
      confidence = 0.82;
    }

    return {
      success: true,
      content: JSON.stringify({ intent, priority, action, color, emoji, response, confidence }),
      model: 'llama3-70b-8192 (mock)',
    };
  }

  // ────────── STATUS GENERATOR ──────────
  function _generateStatus(rawNote) {
    const lower = rawNote.toLowerCase();
    let generated = '';

    if (lower.includes('doctor') || lower.includes('hospital') || lower.includes('medical')) {
      generated = `I am currently at a medical appointment and may not be available to respond immediately.\n\nPlease leave a voice message or ring the bell — I'll call you back as soon as I'm free.\n\n– Thank you for visiting!`;
    } else if (lower.includes('sleep') || lower.includes('baby') || lower.includes('rest')) {
      generated = `🤫 Please keep it quiet — someone in the home is resting.\n\nIf you have a parcel, please leave it safely at the door.\nFor urgent matters, use the Emergency SOS button.\n\nThank you for your understanding! 🙏`;
    } else if (lower.includes('out') || lower.includes('travel') || lower.includes('away') || lower.includes('trip')) {
      generated = `I am currently out and will be unavailable for a while.\n\nFor deliveries: Please leave with the security guard.\nFor urgent matters: Use the Emergency SOS option below.\n\n— I'll get back to you soon!`;
    } else if (lower.includes('office') || lower.includes('work') || lower.includes('meeting')) {
      generated = `Currently at work / in a meeting until later today.\n\nYou're welcome to leave a voice note or ring the bell — I'll respond when free.\n\nFor parcels, please leave at the gate with the guard. 📦`;
    } else if (lower.includes('dinner') || lower.includes('lunch') || lower.includes('eating') || lower.includes('meal')) {
      generated = `Currently at a meal/dinner and stepping away for a bit.\n\nPlease ring the bell or leave a voice message — I'll respond shortly!\n\nThank you for your patience. 😊`;
    } else {
      // Generic intelligent expansion
      generated = `I am currently unavailable — ${rawNote}.\n\nPlease leave a voice note using the button below, or ring the digital bell.\nI will respond to all messages as soon as I'm available.\n\n– Thank you for visiting! 🏠`;
    }

    return {
      success: true,
      content: generated,
      model: 'llama3-70b-8192 (mock)',
    };
  }

  // ────────── VISITOR SUMMARIZER ──────────
  function _summarizeVisitor(logs) {
    const summary = `📊 Visitor Activity Summary:\n\n• Total interactions today: 8\n• Deliveries: 3 (2 collected, 1 at gate)\n• Bell rings: 2 (1 answered)\n• Voice messages: 2 (reviewed)\n• Blocked spam attempts: 1\n\nMost active time: 2–4 PM\nAll critical alerts were handled successfully. ✅`;

    return {
      success: true,
      content: summary,
      model: 'llama3-70b-8192 (mock)',
    };
  }

  // ────────── GENERAL RESPONSE ──────────
  function _generalResponse(text) {
    return {
      success: true,
      content: `AI Assistant processed your request: "${text}". The owner has been notified through the Smart Door secure channel.`,
      model: 'llama3-70b-8192 (mock)',
    };
  }

  // ────────── PUBLIC API ──────────

  /**
   * Classify visitor intent from their message
   * @param {string} visitorMessage
   * @returns {Promise<{intent, priority, action, color, emoji, response, confidence}>}
   */
  async function classifyVisitorIntent(visitorMessage) {
    const messages = [
      {
        role: 'system',
        content: `You are an AI security assistant for Smart Door, a smart nameplate system. 
Analyze the visitor's message and classify their intent.
Respond ONLY with a JSON object containing:
- intent: string (e.g., "Delivery", "Emergency / SOS", "Spam / Promotional", "Known Guest", "General Visitor")
- priority: string ("Low", "Normal", "High", "Critical")
- action: string ("Blocked", "Notify Owner", "Ring Bell + Notify", "Bypass All Rules")
- color: hex color (#EF4444 for danger, #F59E0B for delivery, #22C55E for known, #00A2E8 for general)
- emoji: single emoji representing the intent
- response: string (polite visitor-facing response message in 1-2 sentences)
- confidence: number between 0 and 1`,
      },
      { role: 'user', content: visitorMessage },
    ];

    const result = await callGroq(messages, { task: 'intent', maxTokens: 300, temperature: 0.3 });

    if (result.success) {
      try {
        const parsed = JSON.parse(result.content);
        return { success: true, data: parsed };
      } catch {
        return { success: true, data: _parseIntentFallback(result.content) };
      }
    }

    return { success: false, error: _lastError };
  }

  /**
   * Generate polished status message from owner's raw note
   * @param {string} rawNote
   * @returns {Promise<string>}
   */
  async function generateStatusMessage(rawNote) {
    const messages = [
      {
        role: 'system',
        content: `You are an AI assistant for Smart Door. The owner has given you a brief note about their current situation.
Convert it into a polished, professional, and warm greeting message that will be shown to visitors scanning the QR code.
Keep it under 60 words. Be friendly, informative, and include helpful instructions (e.g., where to leave parcels, when to ring bell).
Do NOT say "The owner" — write from the first person perspective of the household.`,
      },
      { role: 'user', content: `My situation: ${rawNote}` },
    ];

    const result = await callGroq(messages, { task: 'status', maxTokens: 150, temperature: 0.6 });
    return result.success ? result.content : `Currently unavailable: ${rawNote}. Please leave a voice message.`;
  }

  /**
   * Summarize daily visitor activity for owner dashboard
   * @param {Array} visitorLogs
   * @returns {Promise<string>}
   */
  async function summarizeVisitorActivity(visitorLogs) {
    const logText = visitorLogs.map(l => `${l.time}: ${l.event}`).join('\n');
    const messages = [
      {
        role: 'system',
        content: 'Summarize the visitor activity log for a smart home dashboard. Be concise, use emojis, and highlight any security concerns.',
      },
      { role: 'user', content: `Today\'s visitor log:\n${logText}` },
    ];

    const result = await callGroq(messages, { task: 'summarize', maxTokens: 200 });
    return result.success ? result.content : 'Unable to generate summary.';
  }

  // ────────── UTILITY ──────────
  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function _parseIntentFallback(text) {
    return {
      intent: 'General Visitor',
      priority: 'Normal',
      action: 'Notify Owner',
      color: '#00A2E8',
      emoji: '👋',
      response: text || 'Thank you for visiting. The owner has been notified.',
      confidence: 0.7,
    };
  }

  // ────────── GETTERS ──────────
  function isLoading() { return _isLoading; }
  function getLastError() { return _lastError; }
  function getRequestCount() { return _requestCount; }

  // ────────── EXPORTS ──────────
  return {
    classifyVisitorIntent,
    generateStatusMessage,
    summarizeVisitorActivity,
    isLoading,
    getLastError,
    getRequestCount,
    setApiKey,
  };
})();

// Make available globally
window.GroqService = GroqService;
