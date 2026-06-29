/**
 * SmartDoor — QR Generation Service
 * services/qr.js
 *
 * Final production QR. Used on every premium nameplate.
 *
 * Design:
 *   • Pure black background (#000000)
 *   • Gold QR modules (#D4AF37) — rounded squares
 *   • 3 premium finder patterns (gold outer, black gap, gold inner)
 *   • Official SmartDoor shield logo — /public/images/branding/smartdoor-shield.png
 *   • Logo: 15–18% of QR width, centered, no backing square
 *   • Quiet zone: 4 modules
 *   • Error correction: H
 *   • Output: 1500×1500 px PNG + SVG wrapper
 *   • No text. No frame. No plaque. No border. No shadow. QR only.
 *
 * Callers: admin.html · adminProvisioning.js · replacementTransfer.js
 */

import { supabase } from './supabase.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const QR_BASE_URL    = window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in';
const QR_BUCKET      = 'qr-codes';
const QR_ERROR_LEVEL = 'H';
const QUIET_MODULES  = 4;   // standard quiet zone
const OUTPUT_PX      = 1500; // minimum print-ready resolution

const GOLD  = '#D4AF37';
const BLACK = '#000000';

// Official logo asset — single source of truth, never recreated
const SHIELD_LOGO_PATH = '/public/images/branding/smartdoor-shield.png';

// ── QR library (ESM CDN) ──────────────────────────────────────────────────────
let _QRCode = null;
async function _loadQRLib() {
  if (_QRCode) return _QRCode;
  const mod = await import('https://esm.sh/qrcode@1.5.4');
  _QRCode = mod.default;
  return _QRCode;
}

// ── Official shield logo loader — cached ──────────────────────────────────────
let _shieldCache = null;
async function _loadShield() {
  if (_shieldCache) return _shieldCache;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => { _shieldCache = img; resolve(img); };
    img.onerror = () => reject(new Error(`[QR] Cannot load shield logo: ${SHIELD_LOGO_PATH}`));
    img.src = SHIELD_LOGO_PATH;
  });
}

// ── Public URL helper ─────────────────────────────────────────────────────────
export function getQrUrl(plateId) {
  return `${QR_BASE_URL}/p/${plateId.toUpperCase()}`;
}

// ── Core canvas renderer ──────────────────────────────────────────────────────
/**
 * Renders the final production QR onto a 1500×1500 canvas.
 * No text, no frame, no plaque — pure QR + logo.
 *
 * @param {string} plateId
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function generateBrandedQrCanvas(plateId) {
  const QRCode = await _loadQRLib();
  const url    = getQrUrl(plateId);

  // Build QR data matrix
  const qrData  = QRCode.create(url, { errorCorrectionLevel: QR_ERROR_LEVEL });
  const modules = qrData.modules;
  const count   = modules.size; // number of modules per side

  // Canvas — 1500×1500, quiet zone = 4 modules on each side
  const TOTAL_MODS = count + QUIET_MODULES * 2;
  const MOD_PX     = OUTPUT_PX / TOTAL_MODS;
  const OFFSET     = QUIET_MODULES * MOD_PX; // pixel offset to QR grid start

  const canvas  = document.createElement('canvas');
  canvas.width  = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const ctx = canvas.getContext('2d');

  // ── Black background ──
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);

  // ── Finder pattern geometry ──
  const FINDER = 7; // 7×7 modules per finder pattern
  const finderOrigins = [
    { r: 0,            c: 0             }, // top-left
    { r: 0,            c: count - FINDER }, // top-right
    { r: count - FINDER, c: 0            }, // bottom-left
  ];

  function isInFinder(row, col) {
    return finderOrigins.some(f =>
      row >= f.r - 1 && row <= f.r + FINDER &&
      col >= f.c - 1 && col <= f.c + FINDER
    );
  }

  // ── Logo exclusion zone — 17% of QR grid width, centered ──
  const LOGO_RATIO  = 0.17;
  const centerMod   = Math.floor(count / 2);
  const halfExclude = Math.ceil((count * LOGO_RATIO) / 2);
  function isInLogoZone(row, col) {
    return row >= centerMod - halfExclude && row <= centerMod + halfExclude &&
           col >= centerMod - halfExclude && col <= centerMod + halfExclude;
  }

  // ── Draw data modules — gold rounded squares ──
  ctx.fillStyle = GOLD;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      if (isInFinder(r, c))   continue;
      if (isInLogoZone(r, c)) continue;

      const x  = OFFSET + c * MOD_PX;
      const y  = OFFSET + r * MOD_PX;
      const ms = MOD_PX - 1;           // 1px gap between modules
      const br = ms * 0.25;            // 25% border-radius — rounded square
      ctx.beginPath();
      ctx.roundRect(x, y, ms, ms, br);
      ctx.fill();
    }
  }

  // ── Draw 3 finder patterns — premium style ──
  function drawFinder(startRow, startCol) {
    const px = OFFSET + startCol * MOD_PX;
    const py = OFFSET + startRow * MOD_PX;
    const sz = FINDER * MOD_PX;
    const br = sz * 0.12;

    // Outer gold square
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(px, py, sz, sz, br);
    ctx.fill();

    // Black gap (1 module wide)
    const g1 = MOD_PX;
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.roundRect(px + g1, py + g1, sz - g1 * 2, sz - g1 * 2, br * 0.5);
    ctx.fill();

    // Inner gold square (3×3 modules)
    const g2 = MOD_PX * 2;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(px + g2, py + g2, sz - g2 * 2, sz - g2 * 2, br * 0.3);
    ctx.fill();
  }

  drawFinder(0,            0            ); // top-left
  drawFinder(0,            count - FINDER); // top-right
  drawFinder(count - FINDER, 0           ); // bottom-left

  // ── Official SmartDoor shield logo ──
  // Loaded from SHIELD_LOGO_PATH. Never redrawn. Never generated inline.
  // Sits inside QR with transparent background — looks embedded, not pasted.
  const QR_GRID_PX  = count * MOD_PX;
  const LOGO_PX     = Math.round(QR_GRID_PX * LOGO_RATIO);
  const logoX       = OFFSET + (QR_GRID_PX - LOGO_PX) / 2;
  const logoY       = OFFSET + (QR_GRID_PX - LOGO_PX) / 2;

  const shield = await _loadShield();
  // No backing square. No circle. No border. Just the logo on black.
  ctx.drawImage(shield, logoX, logoY, LOGO_PX, LOGO_PX);

  return canvas;
}

// ── PNG data URL ──────────────────────────────────────────────────────────────
export async function generateQrDataUrl(plateId) {
  const canvas = await generateBrandedQrCanvas(plateId);
  return canvas.toDataURL('image/png');
}

// ── SVG (PNG embedded inside SVG for download/print) ─────────────────────────
export async function generateQrSvg(plateId) {
  const canvas  = await generateBrandedQrCanvas(plateId);
  const pngData = canvas.toDataURL('image/png');
  const W = canvas.width;
  const H = canvas.height;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image href="${pngData}" x="0" y="0" width="${W}" height="${H}"/>
</svg>`;
}

// ── Upload PNG + SVG to Supabase Storage ─────────────────────────────────────
export async function uploadQrToStorage(plateId) {
  try {
    const pid = plateId.toUpperCase();

    const pngDataUrl = await generateQrDataUrl(pid);
    const pngBlob    = _dataUrlToBlob(pngDataUrl, 'image/png');
    const pngPath    = `${pid}.png`;
    const { error: pngErr } = await supabase.storage
      .from(QR_BUCKET).upload(pngPath, pngBlob, { contentType: 'image/png', upsert: true });
    if (pngErr) throw new Error(`PNG upload failed: ${pngErr.message}`);

    const svgString = await generateQrSvg(pid);
    const svgBlob   = new Blob([svgString], { type: 'image/svg+xml' });
    const svgPath   = `${pid}.svg`;
    const { error: svgErr } = await supabase.storage
      .from(QR_BUCKET).upload(svgPath, svgBlob, { contentType: 'image/svg+xml', upsert: true });
    if (svgErr) throw new Error(`SVG upload failed: ${svgErr.message}`);

    const { data: pngUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(pngPath);
    const { data: svgUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(svgPath);

    return {
      success: true,
      pngPath, svgPath,
      pngUrl: pngUrlData.publicUrl,
      svgUrl: svgUrlData.publicUrl,
    };
  } catch (err) {
    console.error('[QR] uploadQrToStorage:', err);
    return { success: false, error: err.message };
  }
}

// ── Public URL from Storage ───────────────────────────────────────────────────
export function getQrStorageUrl(plateId, format = 'png') {
  const pid  = plateId.toUpperCase();
  const path = `${pid}.${format}`;
  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

// ── Render QR into a DOM element ──────────────────────────────────────────────
export async function renderQrInElement(plateId, container) {
  if (!container) return;
  const dataUrl = await generateQrDataUrl(plateId);
  if (container.tagName === 'IMG') {
    container.src = dataUrl;
    container.alt = `QR Code for ${plateId}`;
  } else {
    const img = document.createElement('img');
    img.src   = dataUrl;
    img.alt   = `QR Code for ${plateId}`;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    container.innerHTML = '';
    container.appendChild(img);
  }
}

// ── Upload + update manufacturing record ──────────────────────────────────────
export async function generateAndSaveQrPackage(plateId, orderId) {
  const result = await uploadQrToStorage(plateId);
  if (!result.success) return result;

  const { error } = await supabase
    .from('manufacturing')
    .update({
      qr_png_path: result.pngPath,
      qr_svg_path: result.svgPath,
      updated_at:  new Date().toISOString(),
    })
    .eq('order_id', orderId);

  if (error) console.error('[QR] manufacturing update failed:', error.message);

  return { success: true, ...result };
}

// ── Helper ────────────────────────────────────────────────────────────────────
function _dataUrlToBlob(dataUrl, mimeType) {
  const byteStr = atob(dataUrl.split(',')[1]);
  const buf     = new ArrayBuffer(byteStr.length);
  const view    = new Uint8Array(buf);
  for (let i = 0; i < byteStr.length; i++) view[i] = byteStr.charCodeAt(i);
  return new Blob([buf], { type: mimeType });
}
