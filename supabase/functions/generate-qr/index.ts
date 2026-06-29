/**
 * SmartDoor — Edge Function: generate-qr
 *
 * Server-side QR generation (Deno runtime).
 * Produces branded gold-on-black QR and uploads PNG + SVG to Supabase Storage.
 *
 * Design spec:
 *   • Gold modules (#D4AF37) on black (#000000)
 *   • 3 premium finder patterns
 *   • SmartDoor shield logo embedded via base64 PNG from Storage
 *   • Quiet zone: 4 modules
 *   • Error correction: H
 *   • Output: 1500×1500 PNG + SVG wrapper
 *   • No text, no frame, no plaque
 *
 * Note: Deno has no DOM Canvas. We use @gfx/canvas (Deno-compatible).
 * Logo is fetched from the qr-codes bucket's public URL at runtime.
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders }  from '../_shared/cors.ts';
// @ts-ignore — esm.sh resolves at runtime
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL              = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET            = 'qr-codes';

// Colors
const GOLD  = '#D4AF37';
const BLACK = '#000000';

// ── Build premium branded QR SVG string ──────────────────────────────────────
// Deno has no Canvas API, so we build the QR as pure SVG markup.
// The shield logo is fetched from Supabase Storage and embedded as base64.
async function buildPremiumQrSvg(
  supabase: ReturnType<typeof createClient>,
  targetUrl: string,
): Promise<string> {
  const OUTPUT    = 1500;
  const QUIET     = 4;     // quiet zone modules
  const ECL       = 'H';
  const FINDER    = 7;
  const LOGO_RATIO = 0.17; // 17% of QR grid width

  // QR data matrix via qrcode lib
  // @ts-ignore
  const qrData   = QRCode.create(targetUrl, { errorCorrectionLevel: ECL });
  const modules  = qrData.modules;
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
      rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${ms.toFixed(2)}" height="${ms.toFixed(2)}" rx="${br.toFixed(2)}" fill="${GOLD}"/>`);
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
      `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${sz.toFixed(2)}" height="${sz.toFixed(2)}" rx="${br.toFixed(2)}" fill="${GOLD}"/>`,
      `<rect x="${(px+g1).toFixed(2)}" y="${(py+g1).toFixed(2)}" width="${inner1.toFixed(2)}" height="${inner1.toFixed(2)}" rx="${(br*0.5).toFixed(2)}" fill="${BLACK}"/>`,
      `<rect x="${(px+g2).toFixed(2)}" y="${(py+g2).toFixed(2)}" width="${inner2.toFixed(2)}" height="${inner2.toFixed(2)}" rx="${(br*0.3).toFixed(2)}" fill="${GOLD}"/>`,
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
    console.warn('[generate-qr] Logo fetch failed (non-fatal):', e);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${OUTPUT}" height="${OUTPUT}" viewBox="0 0 ${OUTPUT} ${OUTPUT}">
  <rect width="${OUTPUT}" height="${OUTPUT}" fill="${BLACK}"/>
  ${rects.join('\n  ')}
  ${findersSvg}
  ${logoElement}
</svg>`;
}

// ── Serve ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { plate_id, order_id } = await req.json();
    if (!plate_id) {
      return Response.json(
        { success: false, message: 'plate_id required.' },
        { status: 400, headers: corsHeaders },
      );
    }

    const pid      = String(plate_id).toUpperCase();
    const targetUrl = `${APP_URL}/p/${pid}`;
    const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Build premium SVG ──
    const svgStyled = await buildPremiumQrSvg(supabase, targetUrl);

    // ── Upload SVG ──
    const svgBlob = new Blob([svgStyled], { type: 'image/svg+xml' });
    const svgPath = `${pid}.svg`;
    const { error: svgErr } = await supabase.storage
      .from(QR_BUCKET)
      .upload(svgPath, svgBlob, { contentType: 'image/svg+xml', upsert: true });
    if (svgErr) throw new Error(`SVG upload: ${svgErr.message}`);
    const { data: svgUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(svgPath);
    const svgPublicUrl = svgUrlData?.publicUrl || null;

    // ── PNG: embed SVG as PNG via qrcode lib (best available in Deno) ──
    // Deno has no Canvas, so we generate a plain high-res PNG and store it.
    // The gold-on-black styled version is the SVG; PNG is the storage fallback.
    let pngPublicUrl: string | null = null;
    try {
      // Use QRCode.toDataURL with gold/black — closest server-side approximation
      const pngDataUrl: string = await QRCode.toDataURL(targetUrl, {
        width: 1500,
        margin: 4,
        errorCorrectionLevel: 'H',
        color: { dark: GOLD, light: BLACK },
      });
      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), c => c.charCodeAt(0));
      const pngBlob  = new Blob([pngBytes], { type: 'image/png' });
      const pngPath  = `${pid}.png`;
      const { error: pngErr } = await supabase.storage
        .from(QR_BUCKET)
        .upload(pngPath, pngBlob, { contentType: 'image/png', upsert: true });
      if (!pngErr) {
        const { data: pngUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(pngPath);
        pngPublicUrl = pngUrlData?.publicUrl || null;
      }
    } catch (_e) {
      console.warn('[generate-qr] PNG upload non-fatal:', _e);
    }

    // ── Update plates table ──
    await supabase.from('plates').update({
      qr_image_url: pngPublicUrl || svgPublicUrl,
      qr_svg_url:   svgPublicUrl,
      qr_slug:      pid,
    }).eq('plate_id', pid);

    if (order_id) {
      await supabase.from('manufacturing').update({
        qr_svg_path: svgPath,
        updated_at:  new Date().toISOString(),
      }).eq('order_id', order_id);
    }

    return Response.json({
      success:      true,
      plate_id:     pid,
      qr_url:       svgPublicUrl,
      qr_image_url: pngPublicUrl || svgPublicUrl,
      qr_svg_url:   svgPublicUrl,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[generate-qr] Error:', err);
    return Response.json(
      { success: false, message: 'QR generation failed.' },
      { status: 500, headers: corsHeaders },
    );
  }
});
