/**
 * SmartDoor — Edge Function: generate-qr
 *
 * Server-side QR generation (Deno runtime).
 * Produces the branded premium black + gold QR and uploads PNG + SVG to
 * Supabase Storage.
 *
 * PHASE 4B: This function used to carry its own inline copy of the SVG
 * builder (buildPremiumQrSvg) plus a separate, uncustomized PNG path. Both
 * are removed — this is now a thin caller of the single shared renderer in
 * supabase/functions/_shared/premiumQr.ts, so there is exactly one place
 * where the QR design is defined for every server-side caller. See that
 * file's header for the full design spec.
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders }  from '../_shared/cors.ts';
import { buildPremiumQrSvg, buildPremiumQrPngDataUrl } from '../_shared/premiumQr.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL              = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET            = 'qr-codes';

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

    // ── PNG: same premium design as the SVG, via the shared renderer ──
    let pngPublicUrl: string | null = null;
    try {
      const pngDataUrl: string = await buildPremiumQrPngDataUrl(supabase, targetUrl, { width: 1500, margin: 4 });
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
