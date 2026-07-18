/**
 * Smart Door — GST Invoice PDF Service
 * services/gstInvoicePdf.js
 *
 * Phase 8B — GST Billing & Invoicing Platform.
 * Renders a professional, printable GST tax invoice / credit note / debit
 * note as a downloadable PDF, entirely client-side (no new storage bucket,
 * no server-side PDF dependency — generated on demand from the same
 * `invoices` row + `gst_settings` data already fetched via
 * services/invoices.js).
 *
 * Library loaded dynamically via CDN (ESM), same pattern as
 * services/payments.js's loadRazorpaySDK() and services/qr.js's QRCode
 * import — no bundler/build step in this repo, so runtime CDN imports are
 * the established convention here.
 *
 * Usage:
 *   import { downloadInvoicePdf } from './gstInvoicePdf.js';
 *   await downloadInvoicePdf(invoiceId);
 */

import { getInvoiceForPdf } from './invoices.js';
import { getQrUrl } from './qr.js';

const BRAND_BLUE  = [0, 162, 232];
const TEXT_DARK   = [30, 30, 30];
const TEXT_MUTED  = [120, 120, 120];
const LINE_GRAY   = [220, 220, 220];

// ── jsPDF loader (ESM CDN) ──────────────────────────────────────────────────
let _jsPDF = null;
async function _loadJsPDF() {
  if (_jsPDF) return _jsPDF;
  const mod = await import('https://esm.sh/jspdf@2.5.1');
  _jsPDF = mod.jsPDF;
  return _jsPDF;
}

// ── QRCode lib (same CDN module already used by services/qr.js) ────────────
let _QRCode = null;
async function _loadQRLib() {
  if (_QRCode) return _QRCode;
  const mod = await import('https://esm.sh/qrcode@1.5.4');
  _QRCode = mod.default;
  return _QRCode;
}

function money(n) {
  const v = Number(n || 0);
  return `Rs. ${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const INVOICE_TYPE_LABEL = {
  tax_invoice: 'TAX INVOICE',
  credit_note: 'CREDIT NOTE',
  debit_note:  'DEBIT NOTE',
};

/**
 * Builds the jsPDF document for a given invoice bundle.
 * Exported separately from downloadInvoicePdf() so the admin panel can
 * reuse the exact same renderer (no duplicate layout code between owner
 * dashboard and admin panel).
 *
 * @param {object} bundle  - { invoice, order, gstSettings } from getInvoiceForPdf()
 */
export async function renderInvoicePdf(bundle) {
  const { invoice, order, gstSettings } = bundle;
  const JsPDFCtor = await _loadJsPDF();
  const doc = new JsPDFCtor({ unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 50;

  // ── Header: brand + invoice type ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_BLUE);
  doc.text('SmartDoor', margin, y);

  doc.setFontSize(14);
  doc.setTextColor(...TEXT_DARK);
  const typeLabel = INVOICE_TYPE_LABEL[invoice.invoice_type] || 'TAX INVOICE';
  doc.text(typeLabel, pageWidth - margin, y, { align: 'right' });

  y += 20;
  doc.setDrawColor(...LINE_GRAY);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Seller details (left) + Invoice meta (right) ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_DARK);

  const sellerLines = [
    gstSettings?.seller_legal_name || 'SmartDoor',
    gstSettings?.seller_address_line1 || '',
    gstSettings?.seller_address_line2 || '',
    [gstSettings?.seller_city, gstSettings?.seller_state, gstSettings?.seller_pincode].filter(Boolean).join(', '),
    gstSettings?.seller_gstin ? `GSTIN: ${gstSettings.seller_gstin}` : 'GSTIN: Not registered',
    gstSettings?.seller_email || '',
  ].filter(Boolean);

  let sy = y;
  sellerLines.forEach((line) => { doc.text(line, margin, sy); sy += 13; });

  const metaLines = [
    [`Invoice No:`, invoice.invoice_number],
    [`Date:`, fmtDate(invoice.created_at)],
    [`Place of Supply:`, `${invoice.place_of_supply_state || '—'} (${invoice.place_of_supply_code || '—'})`],
    [`Type:`, invoice.is_interstate ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'],
  ];
  if (invoice.invoice_type !== 'tax_invoice' && invoice.reference_invoice_id) {
    metaLines.push([`Ref. Invoice:`, invoice.reference_invoice_id]);
  }

  let my = y;
  metaLines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(String(label), pageWidth - margin - 180, my);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || '—'), pageWidth - margin, my, { align: 'right' });
    my += 13;
  });

  y = Math.max(sy, my) + 15;
  doc.setDrawColor(...LINE_GRAY);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Bill To ──
  const snap = invoice.billing_snapshot || {};
  const addr = snap.address || order?.shipping_address || {};
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Bill To:', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const buyerLines = [
    snap.name || order?.customer_name || '—',
    addr.line1 || '',
    [addr.city, addr.state, addr.pincode].filter(Boolean).join(', '),
    snap.email || order?.customer_email || '',
    snap.phone || order?.customer_phone || '',
    invoice.buyer_gstin ? `GSTIN: ${invoice.buyer_gstin}` : '',
  ].filter(Boolean);
  buyerLines.forEach((line) => { doc.text(line, margin, y); y += 13; });

  y += 15;

  // ── Line item table ──
  const colX = { desc: margin, hsn: 300, qty: 355, rate: 400, amount: pageWidth - margin };
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, y - 12, pageWidth - margin * 2, 20, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DESCRIPTION', colX.desc + 4, y);
  doc.text('HSN/SAC', colX.hsn, y);
  doc.text('QTY', colX.qty, y);
  doc.text('RATE', colX.rate, y);
  doc.text('AMOUNT', colX.amount, y, { align: 'right' });
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const description = invoice.line_description || (order ? `SmartDoor ${order.product_type} QR Nameplate` : `${invoice.plan} Plan Subscription`);
  doc.text(description, colX.desc + 4, y, { maxWidth: 250 });
  doc.text(invoice.hsn_sac || '—', colX.hsn, y);
  doc.text('1', colX.qty, y);
  doc.text(money(invoice.taxable_value), colX.rate, y);
  doc.text(money(invoice.taxable_value), colX.amount, y, { align: 'right' });
  y += 25;

  doc.setDrawColor(...LINE_GRAY);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Tax summary (right-aligned block) ──
  const summaryX = pageWidth - margin - 200;
  const summaryRows = [['Taxable Value', money(invoice.taxable_value)]];

  if (invoice.is_interstate) {
    summaryRows.push([`IGST @ ${invoice.igst_rate || 0}%`, money(invoice.igst_amount)]);
  } else {
    summaryRows.push([`CGST @ ${invoice.cgst_rate || 0}%`, money(invoice.cgst_amount)]);
    summaryRows.push([`SGST @ ${invoice.sgst_rate || 0}%`, money(invoice.sgst_amount)]);
  }
  if (Number(invoice.round_off || 0) !== 0) {
    summaryRows.push(['Round Off', money(invoice.round_off)]);
  }

  doc.setFontSize(9);
  summaryRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, summaryX, y);
    doc.text(value, pageWidth - margin, y, { align: 'right' });
    y += 15;
  });

  doc.setDrawColor(...TEXT_DARK);
  doc.line(summaryX, y, pageWidth - margin, y);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Invoice Total', summaryX, y);
  doc.text(money(invoice.invoice_total || invoice.amount), pageWidth - margin, y, { align: 'right' });
  y += 30;

  // ── Payment details ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Payment Status: ${(invoice.status || '').toUpperCase()}`, margin, y);
  y += 13;
  if (invoice.razorpay_payment_id) {
    doc.text(`Payment Ref: ${invoice.razorpay_payment_id}`, margin, y);
    y += 13;
  }
  if (invoice.notes) {
    doc.text(`Notes: ${invoice.notes}`, margin, y, { maxWidth: pageWidth - margin * 2 });
    y += 13;
  }

  // ── Verification QR (reuses the same qrcode@1.5.4 module as services/qr.js) ──
  try {
    const QRCode = await _loadQRLib();
    const verifyUrl = order?.order_number
      ? `${getQrUrl(order.order_number).replace('/p/', '/verify-invoice/')}`
      : `https://mysmartdoor.in/verify-invoice/${invoice.invoice_number}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 70, y + 10, 70, 70);
    doc.setFontSize(7);
    doc.text('Scan to verify', pageWidth - margin - 70, y + 88);
  } catch (e) {
    console.warn('[gstInvoicePdf] QR generation skipped:', e.message);
  }

  // ── Footer ──
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('This is a computer-generated invoice and does not require a physical signature.', margin, pageHeight - 30);
  doc.text(gstSettings?.seller_gstin ? '' : 'Seller is not currently GST-registered — no tax has been charged on this document.', margin, pageHeight - 18);

  return doc;
}

/**
 * Fetches the invoice bundle and triggers a browser download of the
 * rendered PDF. Used by both the owner dashboard (subscriptionManager.js)
 * and the admin panel (admin.html).
 *
 * @param {string} invoiceId
 */
export async function downloadInvoicePdf(invoiceId) {
  const result = await getInvoiceForPdf(invoiceId);
  if (!result.success) {
    return { success: false, error: result.error || 'Could not load invoice.' };
  }

  try {
    const doc = await renderInvoicePdf(result);
    const filename = `${result.invoice.invoice_number.replace(/\//g, '-')}.pdf`;
    doc.save(filename);
    return { success: true, filename };
  } catch (err) {
    console.error('[gstInvoicePdf] PDF generation failed:', err);
    return { success: false, error: 'Could not generate PDF. Please try again.' };
  }
}
