/**
 * cameraPreview.js
 * ------------------------------------------------------------------
 * PHASE 5 — "See it on your door" camera preview.
 *
 * This is the concrete implementation of the reusable-renderer hook
 * documented in js/plateRenderer.js (`renderMarkup()` returns a raw
 * <svg> string precisely so it can be composited outside the normal
 * configurator preview box). It does NOT reimplement plate rendering —
 * it reuses SD_Configurator.getRenderOptions() + SD_PlateRenderer so
 * the camera overlay always matches the live preview exactly.
 *
 * UX: opens the device camera full-screen, overlays the plate SVG on
 * top of the video feed, and lets the customer drag to position it
 * and use a slider to size it against their own door/wall — a
 * lightweight "AR-lite" preview (no surface tracking).
 *
 * Public API (window.SD_CameraPreview):
 *   open()  → void   - opens the camera overlay (no-op if unsupported)
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  let stream = null;
  let unsubscribe = null;
  let dragState = null;
  let overlayScale = 0.42; // fraction of the shorter viewport dimension
  let overlayPos = { xFrac: 0.5, yFrac: 0.5 }; // center of overlay, fraction of viewport

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'sd-camera-modal';
    modal.innerHTML = `
      <video id="sd-camera-video" autoplay playsinline muted></video>
      <div id="sd-camera-overlay"></div>
      <div id="sd-camera-toolbar">
        <label class="sd-camera-scale-label">Size
          <input type="range" id="sd-camera-scale" min="20" max="70" value="42" />
        </label>
        <button type="button" id="sd-camera-close" class="sd-camera-btn sd-camera-btn-primary">✕ Close</button>
      </div>
      <div id="sd-camera-hint">Drag the plate to position it on your door — use the slider to resize.</div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function injectStylesOnce() {
    if (document.getElementById('sd-camera-styles')) return;
    const style = document.createElement('style');
    style.id = 'sd-camera-styles';
    style.textContent = `
      #sd-camera-modal { position:fixed; inset:0; z-index:9999; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden; }
      #sd-camera-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      #sd-camera-overlay { position:absolute; touch-action:none; cursor:grab; filter:drop-shadow(0 10px 24px rgba(0,0,0,0.45)); }
      #sd-camera-overlay:active { cursor:grabbing; }
      #sd-camera-overlay svg { width:100%; height:100%; display:block; }
      #sd-camera-toolbar { position:absolute; bottom:22px; left:0; right:0; display:flex; align-items:center; justify-content:center; gap:16px; padding:0 20px; }
      .sd-camera-scale-label { color:#fff; font-family:'Space Grotesk',sans-serif; font-size:0.75rem; display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.45); padding:8px 14px; border-radius:999px; }
      .sd-camera-btn { border:none; border-radius:999px; padding:10px 18px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer; }
      .sd-camera-btn-primary { background:#00A2E8; color:#fff; }
      #sd-camera-hint { position:absolute; top:18px; left:0; right:0; text-align:center; color:rgba(255,255,255,0.85); font-family:'Space Grotesk',sans-serif; font-size:0.78rem; padding:0 20px; }
    `;
    document.head.appendChild(style);
  }

  function renderOverlay() {
    const overlayEl = document.getElementById('sd-camera-overlay');
    if (!overlayEl || !global.SD_Configurator || !global.SD_PlateRenderer) return;
    const opts = global.SD_Configurator.getRenderOptions();
    if (!opts) return;

    const vw = window.innerWidth, vh = window.innerHeight;
    const shortSide = Math.min(vw, vh);
    const overlayW = shortSide * overlayScale;
    const overlayH = overlayW / (opts.aspect || 0.667);

    overlayEl.style.width = `${overlayW}px`;
    overlayEl.style.height = `${overlayH}px`;
    overlayEl.style.left = `${overlayPos.xFrac * vw - overlayW / 2}px`;
    overlayEl.style.top = `${overlayPos.yFrac * vh - overlayH / 2}px`;
    overlayEl.innerHTML = global.SD_PlateRenderer.renderMarkup(opts);
  }

  function clampOverlayPos() {
    overlayPos.xFrac = Math.max(0.05, Math.min(0.95, overlayPos.xFrac));
    overlayPos.yFrac = Math.max(0.05, Math.min(0.95, overlayPos.yFrac));
  }

  function bindDrag(overlayEl) {
    const onPointerDown = (e) => {
      dragState = { startX: e.clientX, startY: e.clientY, startFrac: { ...overlayPos } };
      overlayEl.setPointerCapture && overlayEl.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragState) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      overlayPos.xFrac = dragState.startFrac.xFrac + (e.clientX - dragState.startX) / vw;
      overlayPos.yFrac = dragState.startFrac.yFrac + (e.clientY - dragState.startY) / vh;
      clampOverlayPos();
      renderOverlay();
    };
    const onPointerUp = () => { dragState = null; };

    overlayEl.addEventListener('pointerdown', onPointerDown);
    overlayEl.addEventListener('pointermove', onPointerMove);
    overlayEl.addEventListener('pointerup', onPointerUp);
    overlayEl.addEventListener('pointercancel', onPointerUp);
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function close() {
    stopStream();
    if (unsubscribe && global.SD_Configurator && global.SD_Configurator._removeListener) {
      global.SD_Configurator._removeListener(unsubscribe);
    }
    unsubscribe = null;
    const modal = document.getElementById('sd-camera-modal');
    if (modal) modal.remove();
    window.removeEventListener('resize', renderOverlay);
  }

  async function open() {
    if (!isSupported()) {
      alert('Camera preview needs a browser with camera access. You can still use the Live Preview above.');
      return;
    }
    injectStylesOnce();
    const modal = buildModal();
    const video = document.getElementById('sd-camera-video');
    const overlayEl = document.getElementById('sd-camera-overlay');
    const scaleInput = document.getElementById('sd-camera-scale');
    const closeBtn = document.getElementById('sd-camera-close');

    closeBtn.addEventListener('click', close);
    scaleInput.addEventListener('input', () => {
      overlayScale = Number(scaleInput.value) / 100;
      renderOverlay();
    });
    bindDrag(overlayEl);
    window.addEventListener('resize', renderOverlay);

    renderOverlay();
    unsubscribe = () => renderOverlay();
    if (global.SD_Configurator && global.SD_Configurator.on) global.SD_Configurator.on(unsubscribe);

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
    } catch (err) {
      modal.querySelector('#sd-camera-hint').textContent = "Couldn't access the camera — check your browser's camera permission and try again.";
    }
  }

  global.SD_CameraPreview = { open, close };
})(window);
