/**
 * Smart Door — Edge Function: generate-qr
 * supabase/functions/generate-qr/index.ts
 *
 * Plate ID ke liye QR PNG generate karta hai aur
 * Supabase Storage bucket "qr-codes" mein upload karta hai.
 * plates table mein qr_image_url update karta hai.
 *
 * Uses: qrcode (npm via esm.sh), canvas not available in Deno —
 * we use qrcode's SVG output + store as SVG; PNG via toDataURL fallback.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
// @ts-ignore — esm.sh resolves at runtime
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL              = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const QR_BUCKET            = 'qr-codes';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { plate_id, order_id } = await req.json();
    if (!plate_id) {
      return Response.json({ success: false, message: 'plate_id required.' }, { status: 400, headers: corsHeaders });
    }

    const pid     = String(plate_id).toUpperCase();
    const qrUrl   = `${APP_URL}/visitor.html?plate=${pid}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Generate SVG ──
    const svgString: string = await QRCode.toString(qrUrl, {
      type:  'svg',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const svgPath = `${pid}.svg`;

    const { error: svgErr } = await supabase.storage
      .from(QR_BUCKET)
      .upload(svgPath, svgBlob, { contentType: 'image/svg+xml', upsert: true });

    if (svgErr) throw new Error(`SVG upload failed: ${svgErr.message}`);

    // ── Public URL ──
    const { data: urlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(svgPath);
    const publicUrl = urlData?.publicUrl || null;

    // ── Update plates table ──
    await supabase.from('plates').update({
      qr_image_url: publicUrl,
      qr_slug:      pid,
    }).eq('plate_id', pid);

    // ── Update manufacturing record ──
    if (order_id) {
      await supabase.from('manufacturing').update({
        qr_svg_path: svgPath,
        updated_at:  new Date().toISOString(),
      }).eq('order_id', order_id);
    }

    return Response.json({ success: true, plate_id: pid, qr_url: publicUrl }, { headers: corsHeaders });

  } catch (err) {
    console.error('[generate-qr] Error:', err);
    return Response.json({ success: false, message: 'QR generation failed.' }, { status: 500, headers: corsHeaders });
  }
});
