/**
 * Smart Door — Main App Module
 * Visitor PWA + Owner Dashboard Interactions
 * app.js v1.0
 */

// ────────── PWA REGISTRATION ──────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.log('[SW] Registration failed:', err));
  });
}

// ────────── APP STATE ──────────
const AppState = {
  currentView: 'visitor', // 'visitor' | 'owner'
  ownerName: 'Sharma Family',
  currentStatus: 'available',
  callForwarding: true,
  isCallActive: false,
  isBellRinging: false,
  isRecording: false,
  nightModeActive: false,
  installPrompt: null,
};

// ────────── DOM READY ──────────
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  setupViewSwitcher();
  setupCallButton();
  setupBellButton();
  setupVoiceButton();
  setupSOSButton();
  setupAIAssistant();
  checkNightMode();
  setupPWAInstall();
  animateOnLoad();
  console.log('[SmartDoor] App initialized');
}

// ────────── VIEW SWITCHER (Preview Tabs) ──────────
function setupViewSwitcher() {
  const tabs = document.querySelectorAll('[data-view-tab]');
  const views = document.querySelectorAll('[data-view]');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.viewTab;

      tabs.forEach(t => {
        t.style.background = 'transparent';
        t.style.color = 'rgba(255,255,255,0.5)';
        t.style.borderColor = 'transparent';
      });

      tab.style.background = 'linear-gradient(135deg,#00A2E8,#0078D7)';
      tab.style.color = '#fff';
      tab.style.borderColor = '#00A2E8';

      views.forEach(v => {
        v.style.display = v.dataset.view === target ? 'block' : 'none';
        if (v.dataset.view === target) {
          v.style.animation = 'slide-in-up 0.4s ease';
        }
      });

      AppState.currentView = target;

      if (target === 'owner') {
        setTimeout(() => {
          if (window.DashboardModule) DashboardModule.init();
        }, 100);
      }
    });
  });
}

// ────────── CALL BUTTON ──────────
function setupCallButton() {
  const callBtn = document.getElementById('btn-call');
  if (!callBtn) return;

  callBtn.addEventListener('click', () => {
    if (!AppState.callForwarding) {
      showModal('call-blocked-modal');
      return;
    }
    triggerCall();
  });
}

function triggerCall() {
  AppState.isCallActive = true;
  showModal('call-modal');

  // Simulate call routing animation
  const steps = [
    { text: '🔐 Encrypting your identity...', delay: 0 },
    { text: '☁️ Connecting via cloud telephony...', delay: 1200 },
    { text: '📡 Routing to owner securely...', delay: 2400 },
    { text: '📞 Ringing owner\'s device...', delay: 3600 },
  ];

  const statusEl = document.getElementById('call-status-text');
  steps.forEach(({ text, delay }) => {
    setTimeout(() => {
      if (statusEl && AppState.isCallActive) {
        statusEl.style.opacity = '0';
        setTimeout(() => {
          statusEl.textContent = text;
          statusEl.style.opacity = '1';
        }, 200);
      }
    }, delay);
  });
}

function endCall() {
  AppState.isCallActive = false;
  closeModal('call-modal');
  if (window.DashboardModule) {
    DashboardModule.addLog('Masked call completed (45 sec)', 'call', '#22C55E');
  }
}

// ────────── BELL BUTTON ──────────
function setupBellButton() {
  const bellBtn = document.getElementById('btn-bell');
  if (!bellBtn) return;

  bellBtn.addEventListener('click', () => {
    if (AppState.isBellRinging) return;
    triggerBell();
  });
}

function triggerBell() {
  AppState.isBellRinging = true;
  const bellBtn = document.getElementById('btn-bell');
  const bellIcon = document.getElementById('bell-icon');

  // Visual bell animation
  if (bellIcon) {
    bellIcon.style.animation = 'bell-ring 1s ease-in-out';
    setTimeout(() => { bellIcon.style.animation = ''; }, 1000);
  }

  // Show bell feedback
  showModal('bell-modal');

  // Play bell sound (simulate)
  playBellSound();

  // Log it
  if (window.DashboardModule) {
    DashboardModule.addLog('Digital Bell Rung by visitor', 'bell', '#F59E0B');
    DashboardModule.showToast('🔔 Bell rung! Notifying owner...', 'warning');
  }

  // Ripple feedback on button
  if (bellBtn) {
    bellBtn.style.boxShadow = '0 0 0 0 rgba(0,162,232,0.5)';
    bellBtn.style.animation = 'glow-pulse 0.5s ease 3';
  }

  setTimeout(() => {
    AppState.isBellRinging = false;
    if (bellBtn) bellBtn.style.animation = '';
    closeModal('bell-modal');
  }, 3000);
}

function playBellSound() {
  // Web Audio API bell simulation
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 1.5);
  } catch (e) {
    console.log('Audio not supported');
  }
}

// ────────── VOICE BUTTON ──────────
function setupVoiceButton() {
  const voiceBtn = document.getElementById('btn-voice');
  if (!voiceBtn) return;

  let recordingTimer = null;
  let seconds = 0;

  voiceBtn.addEventListener('click', () => {
    if (!AppState.isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  function startRecording() {
    AppState.isRecording = true;
    seconds = 0;

    voiceBtn.style.background = 'linear-gradient(135deg, #EF4444, #DC2626)';
    voiceBtn.style.animation = 'glow-pulse 1s ease-in-out infinite';

    const timerEl = document.getElementById('voice-timer');
    const statusEl = document.getElementById('voice-status');

    if (statusEl) statusEl.textContent = '🔴 Recording... Tap to stop';

    recordingTimer = setInterval(() => {
      seconds++;
      if (timerEl) timerEl.textContent = `${seconds}s`;
      if (seconds >= 10) {
        stopRecording();
      }
    }, 1000);
  }

  function stopRecording() {
    AppState.isRecording = false;
    clearInterval(recordingTimer);

    voiceBtn.style.background = '';
    voiceBtn.style.animation = '';

    const statusEl = document.getElementById('voice-status');
    if (statusEl) statusEl.textContent = '✅ Voice note sent!';

    if (window.DashboardModule) {
      DashboardModule.addLog(`Voice Message Left (${seconds} sec)`, 'voice', '#22C55E');
      DashboardModule.showToast('🎤 Voice note delivered to owner!', 'success');
    }

    setTimeout(() => {
      if (statusEl) statusEl.textContent = '🎤 Tap to record (max 10s)';
      const timerEl = document.getElementById('voice-timer');
      if (timerEl) timerEl.textContent = '';
      seconds = 0;
    }, 3000);
  }
}

// ────────── SOS BUTTON ──────────
function setupSOSButton() {
  const sosBtn = document.getElementById('btn-sos');
  if (!sosBtn) return;

  let pressTimer = null;
  let isPressed = false;

  sosBtn.addEventListener('mousedown', () => {
    isPressed = true;
    sosBtn.style.transform = 'scale(0.97)';
    pressTimer = setTimeout(() => {
      if (isPressed) triggerSOS();
    }, 2000); // Hold 2s to trigger
  });

  sosBtn.addEventListener('mouseup', () => {
    isPressed = false;
    sosBtn.style.transform = '';
    clearTimeout(pressTimer);
  });

  sosBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isPressed = true;
    sosBtn.style.transform = 'scale(0.97)';
    pressTimer = setTimeout(() => {
      if (isPressed) triggerSOS();
    }, 2000);
  });

  sosBtn.addEventListener('touchend', () => {
    isPressed = false;
    sosBtn.style.transform = '';
    clearTimeout(pressTimer);
  });

  // Tap = show info
  sosBtn.addEventListener('click', () => {
    showModal('sos-modal');
  });
}

function triggerSOS() {
  closeModal('sos-modal');

  // Flash red
  document.body.style.transition = 'background 0.1s';
  let flashes = 0;
  const flashInterval = setInterval(() => {
    document.body.style.background = flashes % 2 === 0 ? 'rgba(239,68,68,0.2)' : '';
    flashes++;
    if (flashes > 5) {
      clearInterval(flashInterval);
      document.body.style.background = '';
    }
  }, 200);

  showModal('sos-active-modal');

  if (window.DashboardModule) {
    DashboardModule.addLog('🚨 SOS EMERGENCY TRIGGERED', 'sos', '#EF4444');
    DashboardModule.showToast('🚨 SOS Alert sent to all family members!', 'danger');
  }
}

// ────────── AI ASSISTANT ──────────
function setupAIAssistant() {
  const inputEl = document.getElementById('ai-visitor-input');
  const sendBtn = document.getElementById('ai-send-btn');
  const outputEl = document.getElementById('ai-output');
  const micBtn = document.getElementById('ai-mic-btn');

  if (!sendBtn) return;

  async function processInput() {
    const text = inputEl?.value?.trim();
    if (!text) return;

    if (inputEl) inputEl.value = '';

    // Show user message
    appendAIMessage('You', text, 'user');

    // Show thinking
    const thinkingId = appendAIMessage('AI', null, 'thinking');

    // Process with Groq
    try {
      const result = await window.GroqService.classifyVisitorIntent(text);

      // Remove thinking bubble
      document.getElementById(thinkingId)?.remove();

      if (result.success && result.data) {
        const d = result.data;

        // Show intent badge
        appendIntentBadge(d);

        // Show AI response
        appendAIMessage('Smart Door AI', d.response, 'ai', d.color);

        // Handle intent actions
        if (d.action === 'Blocked') {
          showBlockedOverlay(d.response);
        } else if (d.priority === 'Critical') {
          showPriorityAccessOverlay(d.response);
          highlightSOS();
        }

        // Log it
        if (window.DashboardModule) {
          DashboardModule.addLog(`AI: Intent Detected (${d.intent})`, 'ai', d.color);
        }
      }
    } catch (err) {
      document.getElementById(thinkingId)?.remove();
      appendAIMessage('Smart Door AI', 'I\'m having trouble processing your request. Please use the buttons below.', 'ai');
    }
  }

  sendBtn.addEventListener('click', processInput);
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') processInput();
  });

  // Mic button (simulated)
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      const samples = [
        'I am here to deliver a parcel',
        'I want to sell insurance',
        'This is an emergency, please help!',
        'I am a friend of the family',
        'I have a delivery from Amazon',
      ];
      const random = samples[Math.floor(Math.random() * samples.length)];
      if (inputEl) inputEl.value = random;
      processInput();
    });
  }
}

let _messageCounter = 0;

function appendAIMessage(sender, text, type, color = '#00A2E8') {
  const outputEl = document.getElementById('ai-output');
  if (!outputEl) return null;

  const id = `msg-${++_messageCounter}`;
  const isUser = type === 'user';
  const isThinking = type === 'thinking';

  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = `
    display:flex;flex-direction:column;
    align-items:${isUser ? 'flex-end' : 'flex-start'};
    margin-bottom:10px;animation:slide-in-up 0.3s ease;
  `;

  if (isThinking) {
    div.innerHTML = `
      <div style="
        padding:10px 14px;border-radius:12px 12px ${isUser ? '2px' : '12px'} 12px;
        background:rgba(0,162,232,0.1);border:1px solid rgba(0,162,232,0.2);
        display:flex;gap:6px;align-items:center;
      ">
        <span class="ai-dot"></span>
        <span class="ai-dot"></span>
        <span class="ai-dot"></span>
      </div>
    `;
  } else {
    div.innerHTML = `
      <div style="
        font-size:0.7rem;color:rgba(255,255,255,0.4);
        margin-bottom:3px;font-family:'Space Grotesk',sans-serif;
      ">${sender}</div>
      <div style="
        max-width:85%;padding:10px 14px;
        border-radius:${isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px'};
        background:${isUser ? 'linear-gradient(135deg,#00A2E8,#0078D7)' : `rgba(${hexToRgb(color)},0.1)`};
        border:1px solid ${isUser ? '#00A2E8' : `rgba(${hexToRgb(color)},0.25)`};
        font-size:0.83rem;color:${isUser ? '#fff' : '#C8E8F8'};
        line-height:1.5;
      ">${text}</div>
    `;
  }

  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
  return id;
}

function appendIntentBadge(data) {
  const outputEl = document.getElementById('ai-output');
  if (!outputEl) return;

  const confidencePct = Math.round((data.confidence || 0.8) * 100);

  const div = document.createElement('div');
  div.style.cssText = 'display:flex;justify-content:center;margin:8px 0;animation:slide-in-up 0.3s ease;';
  div.innerHTML = `
    <div style="
      padding:10px 14px;border-radius:14px;min-width:220px;
      background:rgba(${hexToRgb(data.color)},0.1);
      border:1px solid rgba(${hexToRgb(data.color)},0.3);
    ">
      <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem;">
        <span>${data.emoji}</span>
        <span style="color:rgba(255,255,255,0.6);">Intent:</span>
        <span style="color:${data.color};font-weight:700;font-family:'Space Grotesk',sans-serif;">${data.intent}</span>
        <span style="color:rgba(255,255,255,0.3);">|</span>
        <span style="color:rgba(255,255,255,0.5);">${data.priority}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
        <span style="font-size:0.65rem;color:rgba(255,255,255,0.4);">Confidence</span>
        <span style="font-size:0.68rem;color:${data.color};font-weight:700;font-family:'Space Grotesk',sans-serif;">${confidencePct}%</span>
      </div>
      <div class="confidence-track">
        <div class="confidence-fill" style="width:${confidencePct}%;background:${data.color};"></div>
      </div>
    </div>
  `;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function showBlockedOverlay(message) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:500;
    background:rgba(239,68,68,0.15);
    backdrop-filter:blur(4px);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    animation:slide-in-up 0.3s ease;padding:24px;
  `;
  overlay.innerHTML = `
    <div style="
      background:rgba(14,27,42,0.95);
      border:1px solid rgba(239,68,68,0.4);
      border-radius:24px;padding:32px;max-width:340px;width:100%;
      text-align:center;box-shadow:0 0 40px rgba(239,68,68,0.2);
    ">
      <div style="font-size:3rem;margin-bottom:16px;">🚫</div>
      <div style="color:#EF4444;font-size:1.1rem;font-weight:700;margin-bottom:8px;font-family:'Space Grotesk',sans-serif;">Access Restricted</div>
      <div style="color:rgba(255,255,255,0.6);font-size:0.88rem;line-height:1.6;">${message}</div>
      <button onclick="this.parentElement.parentElement.remove()" style="
        margin-top:20px;padding:10px 24px;
        background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);
        color:#EF4444;border-radius:10px;cursor:pointer;font-weight:600;
        font-family:'Space Grotesk',sans-serif;font-size:0.88rem;
      ">Understood</button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 6000);
}

function showPriorityAccessOverlay(message) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:500;
    background:rgba(239,68,68,0.1);
    backdrop-filter:blur(4px);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    animation:slide-in-up 0.3s ease;padding:24px;
  `;
  overlay.innerHTML = `
    <div style="
      background:rgba(14,27,42,0.95);
      border:1px solid rgba(239,68,68,0.5);
      border-radius:24px;padding:32px;max-width:340px;width:100%;
      text-align:center;box-shadow:0 0 50px rgba(239,68,68,0.25);
      animation:glow-pulse 1.2s ease-in-out infinite;
    ">
      <div style="font-size:3rem;margin-bottom:16px;">🚨</div>
      <div style="color:#EF4444;font-size:1.1rem;font-weight:700;margin-bottom:8px;font-family:'Space Grotesk',sans-serif;">Priority Access Granted</div>
      <div style="color:rgba(255,255,255,0.6);font-size:0.88rem;line-height:1.6;">${message}</div>
      <button onclick="this.parentElement.parentElement.remove()" style="
        margin-top:20px;padding:10px 24px;
        background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);
        color:#EF4444;border-radius:10px;cursor:pointer;font-weight:600;
        font-family:'Space Grotesk',sans-serif;font-size:0.88rem;
      ">Understood</button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 6000);
}

function highlightSOS() {
  const sosBtn = document.getElementById('btn-sos');
  if (sosBtn) {
    sosBtn.style.animation = 'glow-pulse 0.5s ease-in-out 5';
    setTimeout(() => { sosBtn.style.animation = ''; }, 2500);
  }
}

// ────────── MODAL SYSTEM ──────────
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
  AppState.isCallActive = false;
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
    AppState.isCallActive = false;
  }
});

// Expose globally for inline onclick
window.endCall = endCall;
window.closeModal = closeModal;
window.showModal = showModal;

// ────────── NIGHT MODE CHECK ──────────
function checkNightMode() {
  const hour = new Date().getHours();
  AppState.nightModeActive = hour >= 22 || hour < 6;

  if (AppState.nightModeActive) {
    const nightBanner = document.getElementById('night-mode-banner');
    if (nightBanner) {
      nightBanner.style.display = 'flex';
    }
  }
}

// ────────── PWA INSTALL ──────────
function setupPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.installPrompt = e;

    const banner = document.getElementById('install-banner');
    if (banner) {
      banner.style.display = 'flex';
    }
  });

  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (AppState.installPrompt) {
        AppState.installPrompt.prompt();
        const { outcome } = await AppState.installPrompt.userChoice;
        if (outcome === 'accepted') {
          const banner = document.getElementById('install-banner');
          if (banner) banner.style.display = 'none';
        }
        AppState.installPrompt = null;
      }
    });
  }

  const dismissBtn = document.getElementById('install-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'none';
    });
  }
}

// ────────── ANIMATE ON LOAD ──────────
function animateOnLoad() {
  const elements = document.querySelectorAll('[data-animate]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'float-up 0.6s ease forwards';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
}

// ────────── UTILITIES ──────────
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
    : '0,162,232';
}

window.hexToRgb = hexToRgb;
