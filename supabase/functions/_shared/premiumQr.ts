/**
 * SmartDoor — Shared Premium QR Renderer
 * supabase/functions/_shared/premiumQr.ts
 *
 * G2 FIX: This module is the SVG-building logic extracted verbatim from
 * supabase/functions/generate-qr/index.ts (buildPremiumQrSvg), so that the
 * same branded design can be reused by admin-provision-customer,
 * admin-bulk-provision, and admin-print-pack without duplicating it three
 * more times.
 *
 * generate-qr/index.ts and admin-plate-status/index.ts are intentionally
 * NOT changed to import this — they already contain a correct, independent
 * copy of this same logic and are out of scope for this fix.
 *
 * Design spec (must stay identical across every implementation):
 *   • Gold modules (#D4AF37) on black (#000000)
 *   • 3 premium finder patterns (gold outer, black gap, gold inner)
 *   • SmartDoor shield logo embedded (SVG: base64 PNG fetched from Storage)
 *   • Quiet zone: 4 modules
 *   • Error correction: H
 *   • Output: 1500×1500 SVG
 *   • PNG fallback: same qrcode library, gold/black color swap only
 *     (no logo, no rounded modules, no custom finders — this is a known,
 *     accepted approximation already used in production by generate-qr
 *     and admin-plate-status; not a new limitation introduced by this fix)
 *   • No text, no frame, no plaque, no border, no shadow — QR only.
 */

// @ts-ignore — esm.sh resolves at runtime
import QRCode from 'https://esm.sh/qrcode@1.5.4';

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

  // Fetch shield logo from Storage, embed as base64
  let logoElement = '';
  try {
    const { data: logoUrlData } = supabase.storage
      .from(QR_BUCKET)
      .getPublicUrl('branding/smartdoor-shield.png');
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

/**
 * PNG fallback: gold-on-black color swap via the qrcode library.
 * Deno has no Canvas API, so this does NOT include the logo, rounded
 * modules, or custom finder patterns — it is the same accepted
 * approximation already in production use by generate-qr and
 * admin-plate-status for their PNG output.
 */
export async function buildPremiumQrPngDataUrl(
  targetUrl: string,
  opts: { width?: number; margin?: number } = {},
): Promise<string> {
  const { width = 1500, margin = 4 } = opts;
  return await QRCode.toDataURL(targetUrl, {
    width,
    margin,
    errorCorrectionLevel: 'H',
    color: { dark: QR_GOLD, light: QR_BLACK },
  });
}
