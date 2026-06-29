/**
 * Smart Door — QR Generation Service
 * services/qr.js
 *
 * Premium branded QR codes generate karta hai:
 * - Gold on black theme
 * - Shield lock logo center mein
 * - 3 corner finder boxes (no bottom-right)
 * - "SMART DOOR" + "HOME PRIVACY. SMARTER LIVING." branding
 * - Plaque-style rounded card for download/print
 *
 * Uses: qrcode library (CDN via ESM)
 * URL format: https://mysmartdoor.in/p/SD-ABX9K7
 */

import { supabase } from './supabase.js';

// ────────── CONFIG ──────────
const QR_BASE_URL    = window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in';
const QR_BUCKET      = 'qr-codes';
const QR_SIZE_PX     = 400;
const QR_MARGIN      = 2;
const QR_ERROR_LEVEL = 'H'; // H = 30% recovery — logo overlay ke liye zaroori

// Colors
const GOLD   = '#D4AF37';
const BLACK  = '#0B0B0B';
const GOLD2  = '#C9972A';

// ────────── LOAD QR LIBRARY ──────────
let _QRCode = null;
async function _loadQRLib() {
  if (_QRCode) return _QRCode;
  const mod = await import('https://esm.sh/qrcode@1.5.4');
  _QRCode = mod.default;
  return _QRCode;
}

// ────────── GET QR URL ──────────
export function getQrUrl(plateId) {
  return `${QR_BASE_URL}/p/${plateId.toUpperCase()}`;
}

// ────────── OFFICIAL LOGO ASSET PATH ──────────
// Single source of truth — always load the official PNG asset.
// Never draw the logo with Canvas or generate it with CSS.
const SHIELD_LOGO_PATH = '/images/branding/smartdoor-shield.png';

// Cache the loaded HTMLImageElement so we only fetch it once per session.
let _shieldLogoCache = null;

/**
 * Official SmartDoor shield PNG asset load karta hai.
 * Cached after first load. Never regenerates the logo.
 * @returns {Promise<HTMLImageElement>}
 */
async function _loadShieldLogo() {
  if (_shieldLogoCache) return _shieldLogoCache;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => { _shieldLogoCache = img; resolve(img); };
    img.onerror = () => reject(new Error(`[QR] Failed to load official shield logo: ${SHIELD_LOGO_PATH}`));
    img.src = SHIELD_LOGO_PATH;
  });
}

// ────────── GENERATE BRANDED QR — CANVAS ──────────
/**
 * Canvas pe premium branded QR render karta hai.
 * @param {string} plateId
 * @param {string} [ownerName] - e.g. "SHARMA FAMILY" (optional)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function generateBrandedQrCanvas(plateId, ownerName = '') {
  const QRCode = await _loadQRLib();
  const url = getQrUrl(plateId);

  // Step 1: Raw QR data matrix nikalo
  const qrData = QRCode.create(url, { errorCorrectionLevel: QR_ERROR_LEVEL });
  const modules = qrData.modules;
  const count = modules.size;

  // Canvas dimensions
  const PLAQUE_W = 600;
  const PLAQUE_H = ownerName ? 760 : 700;
  const QR_AREA  = 380;
  const MODULE_SIZE = QR_AREA / (count + QR_MARGIN * 2);
  const OFFSET_X = (PLAQUE_W - QR_AREA) / 2;
  const OFFSET_Y = ownerName ? 180 : 140;
  const FINDER = 7; // finder pattern size in modules

  const canvas = document.createElement('canvas');
  canvas.width  = PLAQUE_W;
  canvas.height = PLAQUE_H;
  const ctx = canvas.getContext('2d');

  // ── Background: rounded plaque ──
  const R = 36;
  ctx.beginPath();
  ctx.moveTo(R, 0);
  ctx.lineTo(PLAQUE_W - R, 0);
  ctx.quadraticCurveTo(PLAQUE_W, 0, PLAQUE_W, R);
  ctx.lineTo(PLAQUE_W, PLAQUE_H - R);
  ctx.quadraticCurveTo(PLAQUE_W, PLAQUE_H, PLAQUE_W - R, PLAQUE_H);
  ctx.lineTo(R, PLAQUE_H);
  ctx.quadraticCurveTo(0, PLAQUE_H, 0, PLAQUE_H - R);
  ctx.lineTo(0, R);
  ctx.quadraticCurveTo(0, 0, R, 0);
  ctx.closePath();
  ctx.fillStyle = BLACK;
  ctx.fill();

  // Gold border
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.stroke();

  // ── Corner screws (gold dots) ──
  const screws = [[28, 28], [PLAQUE_W - 28, 28], [28, PLAQUE_H - 28], [PLAQUE_W - 28, PLAQUE_H - 28]];
  screws.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Screw cross
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.stroke();
  });

  // ── Owner name (if provided) ──
  if (ownerName) {
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 42px Georgia, serif';
    ctx.letterSpacing = '4px';
    ctx.fillText(ownerName.toUpperCase(), PLAQUE_W / 2, 90);

    // Decorative line
    ctx.strokeStyle = GOLD2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 108); ctx.lineTo(PLAQUE_W - 80, 108);
    ctx.stroke();

    // "SCAN TO CONNECT"
    ctx.fillStyle = GOLD2;
    ctx.font = '600 18px Arial, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('SCAN TO CONNECT', PLAQUE_W / 2, 135);
  } else {
    // No owner name — just "SCAN TO CONNECT" at top
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD2;
    ctx.font = '600 18px Arial, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('SCAN TO CONNECT', PLAQUE_W / 2, 110);
  }

  // ── Draw QR modules (skip finder patterns + logo area) ──
  const MARGIN_MOD = QR_MARGIN;
  const FINDER_COORDS = [
    { r: 0, c: 0 },         // top-left
    { r: 0, c: count - FINDER }, // top-right
    { r: count - FINDER, c: 0 }, // bottom-left
    // bottom-right SKIP (count-FINDER, count-FINDER) — intentionally removed
  ];

  function isInFinder(row, col) {
    return FINDER_COORDS.some(f =>
      row >= f.r - 1 && row <= f.r + FINDER &&
      col >= f.c - 1 && col <= f.c + FINDER
    );
  }

  // Logo area center — skip modules under logo (18% of QR area)
  const centerMod = Math.floor(count / 2);
  const halfLogo = Math.ceil((count * 0.18) / 2); // matches 18% logo coverage
  function isInLogoArea(row, col) {
    return row >= centerMod - halfLogo && row <= centerMod + halfLogo &&
           col >= centerMod - halfLogo && col <= centerMod + halfLogo;
  }

  ctx.fillStyle = GOLD;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      if (isInFinder(r, c)) continue;
      if (isInLogoArea(r, c)) continue;

      const x = OFFSET_X + (c + MARGIN_MOD) * MODULE_SIZE;
      const y = OFFSET_Y + (r + MARGIN_MOD) * MODULE_SIZE;
      // Slightly rounded modules for premium look
      const ms = MODULE_SIZE - 0.5;
      const br = ms * 0.2;
      ctx.beginPath();
      ctx.roundRect(x, y, ms, ms, br);
      ctx.fill();
    }
  }

  // ── Draw 3 Finder Patterns (custom gold style) ──
  function drawFinderBox(startRow, startCol) {
    const px = OFFSET_X + (startCol + MARGIN_MOD) * MODULE_SIZE;
    const py = OFFSET_Y + (startRow + MARGIN_MOD) * MODULE_SIZE;
    const sz = FINDER * MODULE_SIZE;
    const br = sz * 0.15;

    // Outer box
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(px, py, sz, sz, br);
    ctx.fill();

    // Inner white area
    const pad1 = MODULE_SIZE;
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.roundRect(px + pad1, py + pad1, sz - pad1 * 2, sz - pad1 * 2, br * 0.5);
    ctx.fill();

    // Center dot
    const pad2 = MODULE_SIZE * 2;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(px + pad2, py + pad2, sz - pad2 * 2, sz - pad2 * 2, br * 0.3);
    ctx.fill();
  }

  drawFinderBox(0, 0);              // top-left
  drawFinderBox(0, count - FINDER); // top-right
  drawFinderBox(count - FINDER, 0); // bottom-left
  // bottom-right intentionally SKIPPED (unique design)

  // ── Official SmartDoor Shield Logo in center ──
  // Always loads /images/branding/smartdoor-shield.png — never drawn or generated inline.
  // Logo size = 18% of QR area for optimal coverage without harming scan reliability.
  const LOGO_DRAW_SIZE = Math.round(QR_AREA * 0.18); // 18% of QR area
  const logoX = OFFSET_X + (QR_AREA - LOGO_DRAW_SIZE) / 2;
  const logoY = OFFSET_Y + (QR_AREA - LOGO_DRAW_SIZE) / 2;

  const shieldImg = await _loadShieldLogo();

  // Black circular backing — isolates logo from QR modules beneath
  const logoCx = logoX + LOGO_DRAW_SIZE / 2;
  const logoCy = logoY + LOGO_DRAW_SIZE / 2;
  const backingR = LOGO_DRAW_SIZE / 2 + 4;
  ctx.beginPath();
  ctx.arc(logoCx, logoCy, backingR, 0, Math.PI * 2);
  ctx.fillStyle = BLACK;
  ctx.fill();

  // Draw official logo — perfectly centered, square aspect ratio preserved
  ctx.drawImage(shieldImg, logoX, logoY, LOGO_DRAW_SIZE, LOGO_DRAW_SIZE);

  // ── Bottom branding ──
  const brandY = OFFSET_Y + QR_AREA + 30;

  // Separator line
  ctx.strokeStyle = GOLD2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, brandY); ctx.lineTo(PLAQUE_W - 80, brandY);
  ctx.stroke();

  // Shield icon + "SMART DOOR"
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 28px Georgia, serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('🛡 SMART DOOR', PLAQUE_W / 2, brandY + 42);

  // Tagline
  ctx.fillStyle = GOLD2;
  ctx.font = '14px Arial, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('HOME PRIVACY. SMARTER LIVING.', PLAQUE_W / 2, brandY + 68);

  return canvas;
}

// ────────── GENERATE QR DATA URL (PNG) ──────────
export async function generateQrDataUrl(plateId, ownerName = '') {
  const canvas = await generateBrandedQrCanvas(plateId, ownerName);
  return canvas.toDataURL('image/png');
}

// ────────── GENERATE QR SVG STRING ──────────
// SVG: branded plaque as SVG (for download/print)
export async function generateQrSvg(plateId, ownerName = '') {
  // Canvas generate karo, fir PNG embed karo SVG mein (plaque wrapper with PNG inside)
  const canvas = await generateBrandedQrCanvas(plateId, ownerName);
  const pngData = canvas.toDataURL('image/png');
  const W = canvas.width, H = canvas.height;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image href="${pngData}" x="0" y="0" width="${W}" height="${H}"/>
</svg>`;
  return svg;
}

// ────────── UPLOAD QR TO SUPABASE STORAGE ──────────
export async function uploadQrToStorage(plateId, ownerName = '') {
  try {
    const pid = plateId.toUpperCase();

    // PNG
    const pngDataUrl = await generateQrDataUrl(pid, ownerName);
    const pngBlob    = await _dataUrlToBlob(pngDataUrl, 'image/png');
    const pngPath    = `${pid}.png`;
    const { error: pngError } = await supabase.storage
      .from(QR_BUCKET).upload(pngPath, pngBlob, { contentType: 'image/png', upsert: true });
    if (pngError) throw new Error(`PNG upload failed: ${pngError.message}`);

    // SVG
    const svgString = await generateQrSvg(pid, ownerName);
    const svgBlob   = new Blob([svgString], { type: 'image/svg+xml' });
    const svgPath   = `${pid}.svg`;
    const { error: svgError } = await supabase.storage
      .from(QR_BUCKET).upload(svgPath, svgBlob, { contentType: 'image/svg+xml', upsert: true });
    if (svgError) throw new Error(`SVG upload failed: ${svgError.message}`);

    const { data: pngUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(pngPath);
    const { data: svgUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(svgPath);

    return {
      success: true, pngPath, svgPath,
      pngUrl: pngUrlData.publicUrl,
      svgUrl: svgUrlData.publicUrl,
    };
  } catch (err) {
    console.error('[QR] uploadQrToStorage error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── GET QR PUBLIC URL ──────────
export function getQrStorageUrl(plateId, format = 'png') {
  const pid  = plateId.toUpperCase();
  const path = `${pid}.${format}`;
  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

// ────────── RENDER QR IN DOM ELEMENT ──────────
export async function renderQrInElement(plateId, container, ownerName = '') {
  if (!container) return;
  const dataUrl = await generateQrDataUrl(plateId, ownerName);
  if (container.tagName === 'IMG') {
    container.src = dataUrl;
    container.alt = `QR Code for ${plateId}`;
  } else {
    const img = document.createElement('img');
    img.src   = dataUrl;
    img.alt   = `QR Code for ${plateId}`;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:16px;';
    container.innerHTML = '';
    container.appendChild(img);
  }
}

// ────────── GENERATE + SAVE COMPLETE QR PACKAGE ──────────
export async function generateAndSaveQrPackage(plateId, orderId, ownerName = '') {
  const uploadResult = await uploadQrToStorage(plateId, ownerName);
  if (!uploadResult.success) return uploadResult;

  const { error } = await supabase
    .from('manufacturing')
    .update({
      qr_png_path: uploadResult.pngPath,
      qr_svg_path: uploadResult.svgPath,
      updated_at:  new Date().toISOString(),
    })
    .eq('order_id', orderId);

  if (error) console.error('[QR] Manufacturing update failed:', error.message);

  return {
    success: true,
    pngPath: uploadResult.pngPath,
    svgPath: uploadResult.svgPath,
    pngUrl:  uploadResult.pngUrl,
    svgUrl:  uploadResult.svgUrl,
  };
}

// ────────── HELPER: Data URL → Blob ──────────
function _dataUrlToBlob(dataUrl, mimeType) {
  const byteString = atob(dataUrl.split(',')[1]);
  const buffer = new ArrayBuffer(byteString.length);
  const view   = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) view[i] = byteString.charCodeAt(i);
  return new Blob([buffer], { type: mimeType });
}
