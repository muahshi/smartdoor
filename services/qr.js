/**
 * Smart Door — QR Generation Service
 * services/qr.js
 *
 * Print-ready branded QR codes:
 * - Gold modules on black (#D4AF37 / #000000)
 * - Official SmartDoor shield logo centered (18% of QR width)
 * - 3 corner finder boxes (bottom-right omitted — SmartDoor signature)
 * - Premium rounded modules + gold finder patterns
 * - No text, no plaque, no borders — clean QR only
 * - 1200×1200 px output for high-res print
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
/**
 * Text-free, print-ready QR canvas.
 * Sirf QR + official shield logo — koi text, border, screws, ya plaque nahi.
 * Canvas = QR area only (tight margins), black background.
 * High resolution: 1200×1200 px for crisp print output.
 */
export async function generateBrandedQrCanvas(plateId, ownerName = '') {
  const QRCode = await _loadQRLib();
  const url = getQrUrl(plateId);

  // ── QR data matrix ──
  const qrData = QRCode.create(url, { errorCorrectionLevel: QR_ERROR_LEVEL });
  const modules = qrData.modules;
  const count = modules.size;

  // ── Canvas: 1200×1200 high-res, no extra plaque padding ──
  const SIZE    = 1200;
  const MARGIN  = QR_MARGIN; // 2 modules quiet zone
  const MOD_PX  = SIZE / (count + MARGIN * 2);
  const OFFSET  = MARGIN * MOD_PX; // same offset on all 4 sides

  const canvas = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // ── Solid black background ──
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ── Finder pattern coords ──
  const FINDER = 7;
  const FINDER_COORDS = [
    { r: 0,            c: 0            }, // top-left
    { r: 0,            c: count - FINDER }, // top-right
    { r: count - FINDER, c: 0          }, // bottom-left
    // bottom-right intentionally omitted (SmartDoor design signature)
  ];

  function isInFinder(row, col) {
    return FINDER_COORDS.some(f =>
      row >= f.r - 1 && row <= f.r + FINDER &&
      col >= f.c - 1 && col <= f.c + FINDER
    );
  }

  // ── Logo area — skip modules beneath (18% of QR width) ──
  const centerMod = Math.floor(count / 2);
  const halfLogo  = Math.ceil((count * 0.18) / 2);
  function isInLogoArea(row, col) {
    return row >= centerMod - halfLogo && row <= centerMod + halfLogo &&
           col >= centerMod - halfLogo && col <= centerMod + halfLogo;
  }

  // ── Draw QR modules — gold, rounded ──
  ctx.fillStyle = GOLD;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      if (isInFinder(r, c))   continue;
      if (isInLogoArea(r, c)) continue;

      const x  = OFFSET + c * MOD_PX;
      const y  = OFFSET + r * MOD_PX;
      const ms = MOD_PX - 0.8;
      const br = ms * 0.22;
      ctx.beginPath();
      ctx.roundRect(x, y, ms, ms, br);
      ctx.fill();
    }
  }

  // ── 3 Finder Patterns — premium gold style ──
  function drawFinderBox(startRow, startCol) {
    const px = OFFSET + startCol * MOD_PX;
    const py = OFFSET + startRow * MOD_PX;
    const sz = FINDER * MOD_PX;
    const br = sz * 0.15;

    // Outer gold box
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(px, py, sz, sz, br);
    ctx.fill();

    // Inner black area
    const pad1 = MOD_PX;
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.roundRect(px + pad1, py + pad1, sz - pad1 * 2, sz - pad1 * 2, br * 0.5);
    ctx.fill();

    // Center gold dot
    const pad2 = MOD_PX * 2;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(px + pad2, py + pad2, sz - pad2 * 2, sz - pad2 * 2, br * 0.3);
    ctx.fill();
  }

  drawFinderBox(0,            0           ); // top-left
  drawFinderBox(0,            count - FINDER); // top-right
  drawFinderBox(count - FINDER, 0          ); // bottom-left

  // ── Official SmartDoor Shield Logo — centered, 18% of QR width ──
  // Always loaded from /images/branding/smartdoor-shield.png.
  // Never drawn inline. Never generated with CSS.
  const QR_PX       = count * MOD_PX;                  // pixel width of QR grid
  const LOGO_SIZE   = Math.round(QR_PX * 0.18);        // 18% of QR width
  const logoX       = OFFSET + (QR_PX - LOGO_SIZE) / 2;
  const logoY       = OFFSET + (QR_PX - LOGO_SIZE) / 2;

  const shieldImg = await _loadShieldLogo();

  // Black circular backing — clean separation from QR modules
  const logoCx = logoX + LOGO_SIZE / 2;
  const logoCy = logoY + LOGO_SIZE / 2;
  ctx.beginPath();
  ctx.arc(logoCx, logoCy, LOGO_SIZE / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = BLACK;
  ctx.fill();

  // Draw official logo — pixel-perfect center, square
  ctx.drawImage(shieldImg, logoX, logoY, LOGO_SIZE, LOGO_SIZE);

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
