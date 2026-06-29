/**
 * Smart Door — Edge Function: generate-qr
 * Styled QR with center lock icon — print-ready SVG + PNG
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
// @ts-ignore
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL              = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET            = 'qr-codes';

// ── Inject center lock icon into QR SVG ──
function injectCenterLogo(svgString: string): string {
  // Parse actual width/height from SVG tag
  const whMatch = svgString.match(/width="([0-9.]+)"[^>]*height="([0-9.]+)"/);
  const vbMatch = svgString.match(/viewBox="([0-9. ]+)"/);

  let w = 400, h = 400;
  if (whMatch) {
    w = parseFloat(whMatch[1]);
    h = parseFloat(whMatch[2]);
  } else if (vbMatch) {
    const parts = vbMatch[1].split(' ');
    w = parseFloat(parts[2]);
    h = parseFloat(parts[3]);
  }

  const cx = w / 2;
  const cy = h / 2;
  const logoR = Math.min(w, h) * 0.11;   // ~11% of size = white circle radius
  const iconScale = logoR * 1.1 / 12;     // scale 24x24 icon to fit
  const tx = cx - 12 * iconScale;
  const ty = cy - 12 * iconScale;

  // Ensure SVG has viewBox so overlay scales correctly
  let svg = svgString;
  if (!vbMatch) {
    svg = svg.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
  }

  const overlay = `
  <circle cx="${cx}" cy="${cy}" r="${logoR + 2}" fill="white"/>
  <circle cx="${cx}" cy="${cy}" r="${logoR}" fill="white" stroke="#000" stroke-width="${logoR * 0.06}"/>
  <g transform="translate(${tx},${ty}) scale(${iconScale})">
    <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V6L12 2z" fill="#111"/>
    <rect x="9" y="11" width="6" height="5" rx="1" fill="white"/>
    <path d="M10 11V9a2 2 0 1 1 4 0v2" stroke="white" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <circle cx="12" cy="13.5" r="0.8" fill="#111"/>
    <rect x="11.6" y="13.5" width="0.8" height="1.2" rx="0.3" fill="#111"/>
  </g>`;

  return svg.replace('</svg>', overlay + '\n</svg>');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { plate_id, order_id } = await req.json();
    if (!plate_id) {
      return Response.json({ success: false, message: 'plate_id required.' }, { status: 400, headers: corsHeaders });
    }

    const pid    = String(plate_id).toUpperCase();
    const qrUrl  = `${APP_URL}/p/${pid}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Generate base SVG ──
    const svgRaw: string = await QRCode.toString(qrUrl, {
      type: 'svg',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',   // H = high error correction (needed for center logo)
      color: { dark: '#000000', light: '#ffffff' },
    });

    // ── Inject center lock icon ──
    const svgStyled = injectCenterLogo(svgRaw);

    // ── Upload SVG ──
    const svgBlob = new Blob([svgStyled], { type: 'image/svg+xml' });
    const svgPath = `${pid}.svg`;
    const { error: svgErr } = await supabase.storage
      .from(QR_BUCKET)
      .upload(svgPath, svgBlob, { contentType: 'image/svg+xml', upsert: true });
    if (svgErr) throw new Error(`SVG upload failed: ${svgErr.message}`);

    const { data: svgUrlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(svgPath);
    const svgPublicUrl = svgUrlData?.publicUrl || null;

    // ── Generate PNG (best-effort) ──
    let pngPublicUrl: string | null = null;
    try {
      const pngDataUrl: string = await QRCode.toDataURL(qrUrl, {
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#ffffff' },
      });
      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
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
      console.warn('[generate-qr] PNG failed (non-fatal):', _e);
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
      success: true,
      plate_id: pid,
      qr_url: svgPublicUrl,
      qr_image_url: pngPublicUrl || svgPublicUrl,
      qr_svg_url: svgPublicUrl,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[generate-qr] Error:', err);
    return Response.json({ success: false, message: 'QR generation failed.' }, { status: 500, headers: corsHeaders });
  }
});
