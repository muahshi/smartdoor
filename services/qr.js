/**
 * Smart Door — QR Generation Service
 * services/qr.js
 *
 * QR codes generate karta hai:
 * - PNG (display + print)
 * - SVG (manufacturing quality)
 * Supabase Storage bucket: qr-codes
 *
 * Uses: qrcode library (CDN via ESM)
 * URL format: https://smartdoor.in/p/SD-ABX9K7
 */

import { supabase } from './supabase.js';

// ────────── CONFIG ──────────
const QR_BASE_URL    = window.__SD_CONFIG__?.baseUrl || 'https://smartdoor.in';
const QR_BUCKET      = 'qr-codes';
const QR_SIZE_PX     = 400;      // Export resolution
const QR_MARGIN      = 4;        // Quiet zone modules
const QR_ERROR_LEVEL = 'M';      // Error correction: M = 15% recovery

// ────────── LOAD QR LIBRARY (qrcode.js via esm.sh) ──────────
let _QRCode = null;

async function _loadQRLib() {
  if (_QRCode) return _QRCode;
  const mod = await import('https://esm.sh/qrcode@1.5.4');
  _QRCode = mod.default;
  return _QRCode;
}

// ────────── GET QR URL ──────────
/**
 * QR mein encode hone wala URL return karta hai.
 * @param {string} plateId  - SD-ABX9K7
 */
export function getQrUrl(plateId) {
  return `${QR_BASE_URL}/p/${plateId.toUpperCase()}`;
}

// ────────── GENERATE QR DATA URL (Canvas → PNG base64) ──────────
/**
 * Browser mein canvas pe QR render karta hai, PNG data URL return karta hai.
 * @param {string} plateId
 * @returns {Promise<string>}  data:image/png;base64,...
 */
export async function generateQrDataUrl(plateId) {
  const QRCode = await _loadQRLib();
  const url = getQrUrl(plateId);

  const dataUrl = await QRCode.toDataURL(url, {
    width:         QR_SIZE_PX,
    margin:        QR_MARGIN,
    errorCorrectionLevel: QR_ERROR_LEVEL,
    color: {
      dark:  '#000000',
      light: '#FFFFFF',
    },
  });

  return dataUrl;
}

// ────────── GENERATE QR SVG STRING ──────────
/**
 * Manufacturing-quality SVG string generate karta hai.
 * @param {string} plateId
 * @returns {Promise<string>}  SVG markup
 */
export async function generateQrSvg(plateId) {
  const QRCode = await _loadQRLib();
  const url = getQrUrl(plateId);

  const svg = await QRCode.toString(url, {
    type:   'svg',
    margin: QR_MARGIN,
    errorCorrectionLevel: QR_ERROR_LEVEL,
    color: {
      dark:  '#000000',
      light: '#FFFFFF',
    },
  });

  return svg;
}

// ────────── UPLOAD QR TO SUPABASE STORAGE ──────────
/**
 * QR PNG aur SVG dono Supabase Storage mein upload karta hai.
 * Bucket: qr-codes
 * Paths:  qr-codes/SD-ABX9K7.png
 *         qr-codes/SD-ABX9K7.svg
 *
 * @param {string} plateId
 * @returns {{ success, pngPath, svgPath, pngUrl, svgUrl }}
 */
export async function uploadQrToStorage(plateId) {
  try {
    const pid = plateId.toUpperCase();

    // ── PNG ──
    const pngDataUrl = await generateQrDataUrl(pid);
    const pngBlob    = await _dataUrlToBlob(pngDataUrl, 'image/png');
    const pngPath    = `${pid}.png`;

    const { error: pngError } = await supabase.storage
      .from(QR_BUCKET)
      .upload(pngPath, pngBlob, {
        contentType: 'image/png',
        upsert:      true,
      });

    if (pngError) throw new Error(`PNG upload failed: ${pngError.message}`);

    // ── SVG ──
    const svgString = await generateQrSvg(pid);
    const svgBlob   = new Blob([svgString], { type: 'image/svg+xml' });
    const svgPath   = `${pid}.svg`;

    const { error: svgError } = await supabase.storage
      .from(QR_BUCKET)
      .upload(svgPath, svgBlob, {
        contentType: 'image/svg+xml',
        upsert:      true,
      });

    if (svgError) throw new Error(`SVG upload failed: ${svgError.message}`);

    // ── Public URLs ──
    const { data: pngUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(pngPath);
    const { data: svgUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(svgPath);

    return {
      success: true,
      pngPath,
      svgPath,
      pngUrl: pngUrlData.publicUrl,
      svgUrl: svgUrlData.publicUrl,
    };

  } catch (err) {
    console.error('[QR] uploadQrToStorage error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── GET QR PUBLIC URL ──────────
/**
 * Already uploaded QR ka public URL return karta hai.
 * @param {string} plateId
 * @param {'png'|'svg'} format
 */
export function getQrStorageUrl(plateId, format = 'png') {
  const pid  = plateId.toUpperCase();
  const path = `${pid}.${format}`;
  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

// ────────── RENDER QR IN DOM ELEMENT ──────────
/**
 * Kisi bhi <img> ya <div> element mein QR render karo.
 * @param {string} plateId
 * @param {HTMLElement} container  - <img> or <div>
 */
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

// ────────── GENERATE + SAVE COMPLETE QR PACKAGE ──────────
/**
 * Plate ke liye complete QR package:
 * 1. PNG + SVG generate karo
 * 2. Storage mein upload karo
 * 3. Manufacturing table update karo
 *
 * @param {string} plateId
 * @param {string} orderId
 * @returns {{ success, pngUrl, svgUrl }}
 */
export async function generateAndSaveQrPackage(plateId, orderId) {
  // Upload QR files
  const uploadResult = await uploadQrToStorage(plateId);
  if (!uploadResult.success) return uploadResult;

  // Manufacturing record update karo
  const { error } = await supabase
    .from('manufacturing')
    .update({
      qr_png_path: uploadResult.pngPath,
      qr_svg_path: uploadResult.svgPath,
      updated_at:  new Date().toISOString(),
    })
    .eq('order_id', orderId);

  if (error) {
    console.error('[QR] Manufacturing update failed:', error.message);
    // Non-fatal — QR uploaded, just metadata update fail hua
  }

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
  for (let i = 0; i < byteString.length; i++) {
    view[i] = byteString.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}
