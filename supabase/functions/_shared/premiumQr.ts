/**
 * SmartDoor — Shared Premium QR Renderer
 * supabase/functions/_shared/premiumQr.ts
 *
 * PHASE 4B: This is now the ONLY QR-rendering implementation on the server
 * side. Every Edge Function that produces a QR (generate-qr,
 * admin-plate-status, admin-provision-customer, admin-bulk-provision,
 * admin-print-pack) imports buildPremiumQrSvg / buildPremiumQrPngDataUrl
 * from here instead of carrying its own copy. Previously generate-qr and
 * admin-plate-status each had a verbatim/near-verbatim inline duplicate of
 * this SVG-building logic — those duplicates have been removed and both
 * functions now call into this module (see their headers for details).
 *
 * Design spec (must stay identical across every implementation — this is
 * the "second QR design" / premium black + metallic gold style):
 *   • Gold modules (#D4AF37) on black (#000000)
 *   • Rounded QR modules (25% corner radius)
 *   • 3 premium finder patterns (gold outer, black gap, gold inner)
 *   • Official MySmartDoor QR Center Badge embedded, centered, ~17% of QR width
 *   • Quiet zone: 4 modules
 *   • Error correction: H (required so the center logo doesn't break scans)
 *   • Output: 1500×1500 (or caller-specified width for smaller variants)
 *   • No text, no frame, no plaque, no border, no shadow — QR only.
 *
 * PNG generation: buildPremiumQrPngDataUrl renders a PNG by rasterizing the
 * exact same SVG markup produced by buildPremiumQrSvg (via @resvg/resvg-wasm,
 * a pure-WASM renderer with no native bindings, safe for the Edge Runtime).
 * This means PNG and SVG output are pixel-for-pixel the same design —
 * rounded modules, custom finders, and the shield logo all included — not
 * an approximation. If WASM rasterization fails for any reason (e.g. the
 * package can't be fetched at cold start), it falls back to a plain
 * gold/black QR via the `qrcode` library so QR generation never hard-fails;
 * this fallback is logged loudly so it's never silently shipped.
 */

// @ts-ignore — esm.sh resolves at runtime
import QRCode from 'https://esm.sh/qrcode@1.5.4';
// @ts-ignore — esm.sh resolves at runtime; pure WASM, no native bindings
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';

export const QR_GOLD   = '#D4AF37';
export const QR_BLACK  = '#000000';
export const QR_BUCKET = 'qr-codes';

/**
 * Builds the full branded gold-on-black QR as an SVG string, including the
 * embedded SmartDoor shield logo fetched from Storage.
 *
 * Identical logic/output to generate-qr/index.ts's buildPremiumQrSvg.
 */
// deno-lint-ignore no-explicit-any
export async function buildPremiumQrSvg(supabase: any, targetUrl: string): Promise<string> {
  const OUTPUT     = 1500;
  const QUIET      = 4;     // quiet zone modules
  const ECL        = 'H';
  const FINDER     = 7;
  const LOGO_RATIO = 0.17;  // 17% of QR grid width

  // QR data matrix via qrcode lib
  // @ts-ignore
  const qrData  = QRCode.create(targetUrl, { errorCorrectionLevel: ECL });
  const modules = qrData.modules;
  const count: number = modules.size;

  const TOTAL_MODS = count + QUIET * 2;
  const MOD_PX     = OUTPUT / TOTAL_MODS;
  const OFFSET     = QUIET * MOD_PX;

  // Finder pattern origins
  const finderOrigins = [
    { r: 0,             c: 0              },
    { r: 0,             c: count - FINDER  },
    { r: count - FINDER, c: 0             },
  ];

  function isInFinder(row: number, col: number): boolean {
    return finderOrigins.some(f =>
      row >= f.r - 1 && row <= f.r + FINDER &&
      col >= f.c - 1 && col <= f.c + FINDER
    );
  }

  const centerMod   = Math.floor(count / 2);
  const halfExclude = Math.ceil((count * LOGO_RATIO) / 2);
  function isInLogoZone(row: number, col: number): boolean {
    return row >= centerMod - halfExclude && row <= centerMod + halfExclude &&
           col >= centerMod - halfExclude && col <= centerMod + halfExclude;
  }

  // Collect SVG rects for data modules
  const rects: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      if (isInFinder(r, c))   continue;
      if (isInLogoZone(r, c)) continue;

      const x  = OFFSET + c * MOD_PX;
      const y  = OFFSET + r * MOD_PX;
      const ms = MOD_PX - 1;
      const br = ms * 0.25;
      rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${ms.toFixed(2)}" height="${ms.toFixed(2)}" rx="${br.toFixed(2)}" fill="${QR_GOLD}"/>`);
    }
  }

  // Build finder pattern SVG groups
  function finderSvg(startRow: number, startCol: number): string {
    const px = OFFSET + startCol * MOD_PX;
    const py = OFFSET + startRow * MOD_PX;
    const sz = FINDER * MOD_PX;
    const br = sz * 0.12;

    const g1 = MOD_PX;
    const g2 = MOD_PX * 2;
    const inner1 = sz - g1 * 2;
    const inner2 = sz - g2 * 2;

    return [
      `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${sz.toFixed(2)}" height="${sz.toFixed(2)}" rx="${br.toFixed(2)}" fill="${QR_GOLD}"/>`,
      `<rect x="${(px+g1).toFixed(2)}" y="${(py+g1).toFixed(2)}" width="${inner1.toFixed(2)}" height="${inner1.toFixed(2)}" rx="${(br*0.5).toFixed(2)}" fill="${QR_BLACK}"/>`,
      `<rect x="${(px+g2).toFixed(2)}" y="${(py+g2).toFixed(2)}" width="${inner2.toFixed(2)}" height="${inner2.toFixed(2)}" rx="${(br*0.3).toFixed(2)}" fill="${QR_GOLD}"/>`,
    ].join('\n    ');
  }

  const findersSvg = [
    finderSvg(0,             0            ),
    finderSvg(0,             count - FINDER),
    finderSvg(count - FINDER, 0            ),
  ].join('\n  ');

  // Fetch the official QR Center Badge from Storage, embed as base64.
  // This object must be uploaded once to the qr-codes bucket at
  // branding/qr-center-badge.png — see the deployment notes in this
  // module's header / the branding-standardization PR for the manual
  // upload step (Edge Functions cannot read the repo filesystem).
  let logoElement = '';
  try {
    const { data: logoUrlData } = supabase.storage
      .from(QR_BUCKET)
      .getPublicUrl('branding/qr-center-badge.png');
    const logoUrl = logoUrlData?.publicUrl;

    if (logoUrl) {
      const logoResp = await fetch(logoUrl);
      if (logoResp.ok) {
        const logoBuf  = await logoResp.arrayBuffer();
        const logoB64  = btoa(String.fromCharCode(...new Uint8Array(logoBuf)));
        const QR_GRID  = count * MOD_PX;
        const LOGO_PX  = QR_GRID * LOGO_RATIO;
        const logoX    = OFFSET + (QR_GRID - LOGO_PX) / 2;
        const logoY    = OFFSET + (QR_GRID - LOGO_PX) / 2;
        logoElement = `<image href="data:image/png;base64,${logoB64}" x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${LOGO_PX.toFixed(2)}" height="${LOGO_PX.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
      }
    }
  } catch (e) {
    console.warn('[premiumQr] Logo fetch failed (non-fatal):', e);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${OUTPUT}" height="${OUTPUT}" viewBox="0 0 ${OUTPUT} ${OUTPUT}">
  <rect width="${OUTPUT}" height="${OUTPUT}" fill="${QR_BLACK}"/>
  ${rects.join('\n  ')}
  ${findersSvg}
  ${logoElement}
</svg>`;
}

// Converts a large byte array to base64 in chunks — spreading a full-size
// (e.g. 1500×1500) PNG buffer directly into String.fromCharCode(...) can
// exceed the JS engine's max-arguments limit and throw.
function _bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── WASM init (lazy, cached across invocations within the same isolate) ──────
let _wasmReady: Promise<void> | null = null;
function _ensureResvgWasm(): Promise<void> {
  if (!_wasmReady) {
    _wasmReady = (async () => {
      const wasmResp = await fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm');
      // @ts-ignore — accepts a Response or ArrayBuffer
      await initWasm(wasmResp);
    })();
  }
  return _wasmReady;
}

/**
 * PNG output — rasterizes the exact same SVG as buildPremiumQrSvg, so PNG
 * and SVG are pixel-for-pixel identical (rounded modules, custom finders,
 * shield logo). `width` controls the output pixel size (SVG is built at a
 * fixed 1500×1500 internal grid and scaled down/up on rasterization).
 *
 * `margin` is only used by the legacy plain-QR fallback path below; the
 * primary path always uses the fixed 4-module quiet zone baked into
 * buildPremiumQrSvg, per the design spec.
 */
// deno-lint-ignore no-explicit-any
export async function buildPremiumQrPngDataUrl(
  supabase: any,
  targetUrl: string,
  opts: { width?: number; margin?: number } = {},
): Promise<string> {
  const { width = 1500, margin = 4 } = opts;

  try {
    await _ensureResvgWasm();
    const svgString = await buildPremiumQrSvg(supabase, targetUrl);
    // @ts-ignore
    const resvg = new Resvg(svgString, { fitTo: { mode: 'width', value: width } });
    const rendered = resvg.render();
    const pngBuffer: Uint8Array = rendered.asPng();
    const b64 = _bytesToBase64(pngBuffer);
    return `data:image/png;base64,${b64}`;
  } catch (e) {
    // Never let QR generation hard-fail because the rasterizer had a bad
    // day — fall back to a plain gold/black QR (no logo/rounded corners),
    // and log loudly so this doesn't silently ship in production.
    console.error('[premiumQr] resvg-wasm rasterization failed, using plain fallback PNG:', e);
    return await QRCode.toDataURL(targetUrl, {
      width,
      margin,
      errorCorrectionLevel: 'H',
      color: { dark: QR_GOLD, light: QR_BLACK },
    });
  }
}
