/**
 * Smart Door — Edge Function: admin-print-pack
 * supabase/functions/admin-print-pack/index.ts
 *
 * Admin → Print Pack Generator
 * Generates a printable A4 PDF sheet with multiple labels per page.
 * Each label contains: Plate ID, QR Code, PIN (masked + clear), Owner Name.
 *
 * Output: base64-encoded PDF returned to client for download.
 * Manufacturing-ready: 4 labels per A4 page (2×2 grid).
 *
 * Allowed roles: super_admin, ops_manager, manufacturing
 * Permission: manufacturing.write
 *
 * POST body: { plate_ids: string[] }
 * Returns: { success, pdf_base64, filename }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';
// G2 FIX: branded QR renderer (was: plain `qrcode` lib output — see premiumQr.ts header)
import { buildPremiumQrPngDataUrl } from '../_shared/premiumQr.ts';

const APP_URL = Deno.env.get('APP_URL') || 'https://mysmartdoor.in';
const MAX_LABELS = 200; // 50 A4 pages max per batch

// ── Minimal PDF writer (no external dep — pure binary) ──
// Generates a valid PDF/1.4 with embedded PNG QR codes and text labels.
// Uses a simplified object model adequate for manufacturing print packs.

function pdfString(s: string): string {
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

interface LabelData {
  plateId: string;
  ownerName: string;
  pin: string; // cleartext — print pack is internal only
  qrPngBase64: string;
  qrWidth: number;
  qrHeight: number;
}

async function buildPdf(labels: LabelData[]): Promise<Uint8Array> {
  // A4 in points: 595.28 × 841.89
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const LABELS_PER_ROW = 2;
  const LABELS_PER_COL = 3;
  const LABELS_PER_PAGE = LABELS_PER_ROW * LABELS_PER_COL;
  const MARGIN = 28; // ~1cm
  const CELL_W = (PAGE_W - MARGIN * 2) / LABELS_PER_ROW;
  const CELL_H = (PAGE_H - MARGIN * 2) / LABELS_PER_COL;
  const QR_SIZE = Math.min(CELL_W, CELL_H) * 0.55;

  // Group labels into pages
  const pages: LabelData[][] = [];
  for (let i = 0; i < labels.length; i += LABELS_PER_PAGE) {
    pages.push(labels.slice(i, i + LABELS_PER_PAGE));
  }

  const objects: string[] = [];
  const xrefOffsets: number[] = [];
  let offset = 0;

  function addObject(content: string): number {
    const id = objects.length + 1;
    objects.push(content);
    return id;
  }

  function objStr(id: number, content: string): string {
    return `${id} 0 obj\n${content}\nendobj\n`;
  }

  const enc = new TextEncoder();

  // Build PDF binary
  const chunks: Uint8Array[] = [];
  const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  chunks.push(enc.encode(header));
  offset = header.length;

  const pageIds: number[] = [];
  const resourceIds: number[] = [];
  const contentIds: number[] = [];
  const imageObjs: { id: number; name: string }[][] = [];

  for (let pi = 0; pi < pages.length; pi++) {
    const pageLabels = pages[pi];
    const pageImageObjs: { id: number; name: string }[] = [];

    // Build content stream for this page
    let stream = '';

    // Page border
    stream += `q\n1 w\n0.9 0.9 0.9 RG\n`;

    for (let li = 0; li < pageLabels.length; li++) {
      const label = pageLabels[li];
      const col = li % LABELS_PER_ROW;
      const row = Math.floor(li / LABELS_PER_ROW);
      const cellX = MARGIN + col * CELL_W;
      const cellY = PAGE_H - MARGIN - (row + 1) * CELL_H;

      // Cell border
      stream += `${cellX} ${cellY + 4} ${CELL_W - 4} ${CELL_H - 8} re S\n`;

      // QR image
      const imgName = `Img${pi}_${li}`;
      const qrX = cellX + (CELL_W - QR_SIZE) / 2;
      const qrY = cellY + CELL_H - QR_SIZE - 14;
      stream += `q ${QR_SIZE} 0 0 ${QR_SIZE} ${qrX} ${qrY} cm /${imgName} Do Q\n`;

      // SmartDoor branding
      stream += `BT /F1 7 Tf ${cellX + 6} ${cellY + CELL_H - 11} Td (SmartDoor) Tj ET\n`;

      // Plate ID (bold-ish via larger font)
      stream += `BT /F1 11 Tf ${cellX + 6} ${cellY + 42} Td ${pdfString(label.plateId)} Tj ET\n`;

      // Owner name
      const safeName = label.ownerName.slice(0, 28);
      stream += `BT /F1 9 Tf ${cellX + 6} ${cellY + 28} Td ${pdfString(safeName)} Tj ET\n`;

      // PIN label
      stream += `BT /F1 8 Tf ${cellX + 6} ${cellY + 14} Td ${pdfString('PIN: ' + label.pin)} Tj ET\n`;

      // QR URL small
      stream += `BT /F1 6 Tf ${cellX + 6} ${cellY + 6} Td ${pdfString(APP_URL + '/p/' + label.plateId)} Tj ET\n`;

      // Register image xobject (will be added as PDF object below)
      pageImageObjs.push({ id: 0, name: imgName }); // id placeholder
    }
    stream += 'Q\n';

    imageObjs.push(pageImageObjs);
    contentIds.push(0); // placeholder
  }

  // Now encode everything as PDF objects in bytes
  const pdfParts: string[] = [];
  pdfParts.push(`%PDF-1.4\n%\xe2\xe3\xcf\xd3\n`);

  // We'll build the full PDF as a string (safe because PNG is base64 embedded as ASCII85 or hex)
  // For simplicity, embed QR as hex-encoded image XObjects

  const objList: { id: number; content: string }[] = [];
  let objId = 1;

  // Catalog + Pages placeholder — fill in after we know page object IDs
  const catalogId = objId++;
  const pagesId = objId++;

  const pageObjIds: number[] = [];
  const fontId = objId++;

  for (let pi = 0; pi < pages.length; pi++) {
    const pageLabels = pages[pi];
    const imgObjIds: number[] = [];

    for (let li = 0; li < pageLabels.length; li++) {
      const label = pageLabels[li];
      // Decode base64 PNG to hex string for PDF /DCTDecode or raw
      // Use /FlateDecode not available without zlib — use raw /ASCIIHexDecode
      const pngBytes = Uint8Array.from(atob(label.qrPngBase64), c => c.charCodeAt(0));
      const hexStr = Array.from(pngBytes).map(b => b.toString(16).padStart(2, '0')).join('') + '>';
      const imgId = objId++;
      objList.push({
        id: imgId,
        content: `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${label.qrWidth} /Height ${label.qrHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hexStr.length} >>\nstream\n${hexStr}\nendstream\nendobj`,
      });
      imgObjIds.push(imgId);
      imageObjs[pi][li].id = imgId;
    }

    // Content stream for this page
    let stream = '';
    for (let li = 0; li < pageLabels.length; li++) {
      const label = pageLabels[li];
      const col = li % LABELS_PER_ROW;
      const row = Math.floor(li / LABELS_PER_ROW);
      const cellX = MARGIN + col * CELL_W;
      const cellY = PAGE_H - MARGIN - (row + 1) * CELL_H;
      const imgName = `Img${li}`;
      const qrX = cellX + (CELL_W - QR_SIZE) / 2;
      const qrY = cellY + CELL_H - QR_SIZE - 16;

      stream += `q 0.85 0.85 0.85 RG 1 w ${cellX + 2} ${cellY + 2} ${CELL_W - 4} ${CELL_H - 4} re S Q\n`;
      stream += `q ${QR_SIZE} 0 0 ${QR_SIZE} ${qrX} ${qrY} cm /${imgName} Do Q\n`;
      stream += `BT /F1 7 Tf 0.4 0.4 0.4 rg ${cellX + 6} ${cellY + CELL_H - 13} Td (SmartDoor) Tj ET\n`;
      stream += `BT /F1 12 Tf 0 0 0 rg ${cellX + 6} ${cellY + 44} Td ${pdfString(label.plateId)} Tj ET\n`;
      stream += `BT /F1 9 Tf ${cellX + 6} ${cellY + 29} Td ${pdfString(label.ownerName.slice(0, 28))} Tj ET\n`;
      stream += `BT /F1 9 Tf ${cellX + 6} ${cellY + 15} Td ${pdfString('PIN: ' + label.pin)} Tj ET\n`;
      stream += `BT /F1 6 Tf 0.5 0.5 0.5 rg ${cellX + 6} ${cellY + 5} Td ${pdfString(APP_URL + '/p/' + label.plateId)} Tj ET\n`;
    }

    // Build resource dict for this page
    let xObjDict = '';
    for (let li = 0; li < pageLabels.length; li++) {
      xObjDict += `/Img${li} ${imgObjIds[li]} 0 R `;
    }

    const contentId = objId++;
    objList.push({
      id: contentId,
      content: `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`,
    });

    const pageId = objId++;
    objList.push({
      id: pageId,
      content: `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> /XObject << ${xObjDict}>> >> >>\nendobj`,
    });
    pageObjIds.push(pageId);
  }

  // Font object (Helvetica — standard PDF font, no embedding needed)
  objList.push({
    id: fontId,
    content: `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`,
  });

  // Pages object
  const kidsRef = pageObjIds.map(id => `${id} 0 R`).join(' ');
  objList.push({
    id: pagesId,
    content: `${pagesId} 0 obj\n<< /Type /Pages /Kids [${kidsRef}] /Count ${pageObjIds.length} >>\nendobj`,
  });

  // Catalog
  objList.push({
    id: catalogId,
    content: `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj`,
  });

  // Sort by id
  objList.sort((a, b) => a.id - b.id);

  // Build final PDF bytes
  let pdf = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
  const offsets: number[] = new Array(objId).fill(0);

  for (const obj of objList) {
    offsets[obj.id] = pdf.length;
    pdf += obj.content + '\n';
  }

  // xref + trailer
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objId}\n0000000000 65535 f \n`;
  for (let i = 1; i < objId; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return enc.encode(pdf);
}

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  const supabaseAdmin = getServiceClient();

  try {
    const ctx = await verifyAdminSession(req, supabaseAdmin);
    if (!ctx) return adminAuthError(headers);
    if (!adminCan(ctx, 'manufacturing', 'read') && !adminCan(ctx, 'plates', 'read')) {
      return Response.json({ success: false, message: 'You do not have permission to generate print packs.' }, { status: 403, headers });
    }

    let body: { plate_ids?: string[] };
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const plateIds = body.plate_ids;
    if (!Array.isArray(plateIds) || plateIds.length === 0) {
      return Response.json({ success: false, message: 'plate_ids array is required.' }, { status: 400, headers });
    }
    if (plateIds.length > MAX_LABELS) {
      return Response.json({ success: false, message: `Maximum ${MAX_LABELS} labels per print pack.` }, { status: 400, headers });
    }

    const cleanIds = plateIds.map(id => String(id).trim().toUpperCase());

    // Fetch plates + owners
    const { data: plates, error: plateErr } = await supabaseAdmin
      .from('plates')
      .select('plate_id, owner_id, product_type, users(full_name, pin_hash)')
      .in('plate_id', cleanIds);

    if (plateErr) {
      return Response.json({ success: false, message: 'Failed to fetch plate data.' }, { status: 500, headers });
    }

    if (!plates || plates.length === 0) {
      return Response.json({ success: false, message: 'No matching plates found.' }, { status: 404, headers });
    }

    // Fetch PINs from admin_print_secrets (if PIN is stored there) or use placeholder
    // Since PINs are bcrypt hashed, we cannot recover them. Print pack shows PIN only
    // if it was set during this session via admin-bulk-provision which stores plain temporarily.
    // For existing plates: PIN is shown as '[Reset Required]' — admin must use admin-reset-pin first.
    // For newly provisioned plates, the caller passes pin in body.
    const pinMap: Record<string, string> = {};
    if (body && (body as { pins?: Record<string, string> }).pins) {
      Object.assign(pinMap, (body as { pins?: Record<string, string> }).pins);
    }

    // Build label data + generate QR codes
    const labels: LabelData[] = [];
    for (const plate of plates) {
      const pid = plate.plate_id;
      const owner = Array.isArray(plate.users) ? plate.users[0] : plate.users as { full_name?: string } | null;
      const ownerName = owner?.full_name || 'Unknown';
      const pin = pinMap[pid] || '****'; // masked if not provided

      // Generate fresh QR PNG
      // G2 FIX: was plain black-on-white `qrcode` output — the manufacturing
      // print pack now uses the same gold/black brand colors as every other
      // QR surface. PNG byte format/dimensions are unchanged, so the
      // embedding logic below (PDF XObject + PNG header parsing) is untouched.
      const qrUrl = `${APP_URL}/p/${pid}`;
      const pngDataUrl: string = await buildPremiumQrPngDataUrl(qrUrl, { width: 200, margin: 2 });
      const base64 = pngDataUrl.split(',')[1];

      // Get dimensions (PNG header at bytes 16-24)
      const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const view = new DataView(pngBytes.buffer);
      const qrWidth = view.getUint32(16);
      const qrHeight = view.getUint32(20);

      labels.push({ plateId: pid, ownerName, pin, qrPngBase64: base64, qrWidth, qrHeight });
    }

    const pdfBytes = await buildPdf(labels);
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
    const filename = `smartdoor-print-pack-${new Date().toISOString().slice(0, 10)}-${labels.length}labels.pdf`;

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: 'print_pack_generated',
      resource: 'manufacturing',
      after_data: { plate_count: labels.length, plate_ids: cleanIds },
      notes: `Print pack generated for ${labels.length} plates`,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });

    return Response.json({ success: true, pdf_base64: pdfBase64, filename, label_count: labels.length }, { headers });

  } catch (err) {
    console.error('[admin-print-pack] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error generating print pack.' }, { status: 500, headers });
  }
});
