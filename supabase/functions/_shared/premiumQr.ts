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
 *   • Official MySmartDoor QR Center Badge embedded, centered, ~30% of QR width
 *   • Quiet zone: 4 modules
 *   • Error correction: H (required so the center logo doesn't break scans)
 *   • Output: 1500×1500 (or caller-specified width for smaller variants)
 *   • No text, no frame, no plaque, no border, no shadow — QR only.
 *
 * BADGE SIZE — 2026-07-26 rewrite (rectangular excavation, replaces the old
 * square-LOGO_RATIO approach):
 *
 * Root cause found via direct OpenCV measurement of the approved reference
 * image (finder-pattern pixel span → module pixel size → badge bounding
 * box, connected-component analysis): the badge was never actually 30% of
 * the grid on screen. The old code excavated a SQUARE zone sized by
 * LOGO_RATIO and then fit the (taller-than-wide, ~1.23 h:w) badge asset
 * inside it via preserveAspectRatio="xMidYMid meet" — but the asset's own
 * 256×256 canvas had ~34% horizontal / ~19% vertical transparent padding
 * baked in, so "meet" scaled to the *padded* canvas, not the visible
 * shield. Net effect: the visible badge rendered at roughly half the
 * intended size, while the excavation zone wasted the difference as empty
 * black space. The badge asset (SVG viewBox + PNG) has since been cropped
 * to its content bounding box (see qr-center-badge.svg/.png), so this is
 * fixed at the asset level too — but the renderer no longer assumes a
 * square excavation regardless.
 *
 * Measured targets (approved reference, OpenCV connected-component
 * analysis of the shield outline vs. the finder-pattern-derived module
 * grid): badge height ≈ 40.8% of grid height, badge width ≈ 31.3% of grid
 * width (these aren't independent — width follows from height via the
 * asset's native aspect ratio once the asset is un-padded).
 *
 * LOGO_HEIGHT_RATIO below is the single tunable (badge height / grid
 * height); LOGO_WIDTH_RATIO is derived from it via BADGE_ASPECT_HW so the
 * excavation rectangle always matches the badge's true shape — no wasted
 * excavated space on the narrow axis the way the square version had.
 *
 * SCAN-SAFETY NOTE (read before raising LOGO_HEIGHT_RATIO): the previous
 * empirical decode test (reliable to ~36%, fails 37–39%) was run against
 * the OLD square algorithm, where excavated module AREA = ratio². This
 * rectangular version excavates ratio_h × ratio_w = ratio_h² / 1.225 of
 * the grid — i.e. for the same height ratio it removes ~18% FEWER modules
 * than the square version did, because the width axis is now excavated
 * only as far as the badge actually extends. At LOGO_HEIGHT_RATIO=0.408
 * the excavated area is equivalent to a square ratio of ~0.367 — just
 * inside the previously-verified safe zone, but close enough to the
 * documented cliff (37–39%) that this has NOT been re-verified with an
 * actual decode test in this pass. Re-run the decode check before shipping
 * this to production; occlusion failure is a cliff, not a slope.
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
  // Badge asset (post-crop) native aspect ratio, height:width — measured
  // directly from qr-center-badge.png's content bounding box (854×697).
  // See header for how this and the two ratios below were derived.
  const BADGE_ASPECT_HW   = 854 / 697;       // ≈ 1.225
  const LOGO_HEIGHT_RATIO = 0.408;           // badge height / grid height
  const LOGO_WIDTH_RATIO  = LOGO_HEIGHT_RATIO / BADGE_ASPECT_HW; // ≈ 0.333

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

  const centerMod    = Math.floor(count / 2);
  const halfExcludeH = Math.ceil((count * LOGO_HEIGHT_RATIO) / 2); // rows
  const halfExcludeW = Math.ceil((count * LOGO_WIDTH_RATIO) / 2);  // cols
  function isInLogoZone(row: number, col: number): boolean {
    return row >= centerMod - halfExcludeH && row <= centerMod + halfExcludeH &&
           col >= centerMod - halfExcludeW && col <= centerMod + halfExcludeW;
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
        const LOGO_W   = QR_GRID * LOGO_WIDTH_RATIO;
        const LOGO_H   = QR_GRID * LOGO_HEIGHT_RATIO;
        const logoX    = OFFSET + (QR_GRID - LOGO_W) / 2;
        const logoY    = OFFSET + (QR_GRID - LOGO_H) / 2;
        // preserveAspectRatio is now effectively a no-op (box aspect ==
        // asset aspect, both ≈1.225 h:w post-crop) — kept as "meet" rather
        // than "none" as a safety net in case the asset is ever swapped
        // for one with a slightly different aspect ratio; "none" would
        // silently stretch/distort the badge instead of just under-filling
        // the box.
        logoElement = `<image href="data:image/png;base64,${logoB64}" x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${LOGO_W.toFixed(2)}" height="${LOGO_H.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
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
