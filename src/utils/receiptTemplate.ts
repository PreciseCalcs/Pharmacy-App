import { PharmacyDetails, PrintFormat, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { formatDateTime } from './dates';
import { syncEngine } from '../services/syncEngine';

export const DEFAULT_URDU_REFUND_POLICY =
  'فروخت شدہ ادویات 3 دن کے اندر اصل کمپیوٹرائزڈ رسید کے ساتھ واپس یا تبدیل ہو سکتی ہیں۔ فریج والی ادویات، کھلے پتے اور سیرپ واپس نہیں ہوں گے۔';

export const RECEIPT_MARKETING_FOOTER =
  'For POS & Inventory Software, Contact: 0321-6336959 | 0306-7617080';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeImageUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return escapeHtml(trimmed);
  }
  return '';
}

/**
 * Standard Code-128 (Set B) 11-module bit patterns (values 0..106)
 * Allows genuine 1D laser/CCD barcode scanners and camera scanners to scan printed receipts.
 */
const CODE128_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

/**
 * Generates an inline SVG Code-128B barcode for the receipt's unique invoice number.
 */
export function generateInvoiceBarcodeSvg(
  invoiceNumber: string,
  heightPx: number = 38
): string {
  const cleanText = (invoiceNumber || 'ZMS-0000').trim().toUpperCase();
  const startCodeB = 104;
  let checksum = startCodeB;
  const patterns: string[] = [CODE128_PATTERNS[startCodeB]];

  for (let i = 0; i < cleanText.length; i++) {
    const charCode = cleanText.charCodeAt(i);
    // Printable ASCII 32..126 maps to Code 128B value 0..94
    const value = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    patterns.push(CODE128_PATTERNS[value]);
    checksum += value * (i + 1);
  }

  const checksumValue = checksum % 103;
  patterns.push(CODE128_PATTERNS[checksumValue]);
  patterns.push(CODE128_PATTERNS[106]); // Stop pattern (13 modules)

  const fullBitString = patterns.join('');
  const quietZone = 10;
  const totalModules = fullBitString.length + quietZone * 2;

  let rects = '';
  let i = 0;
  while (i < fullBitString.length) {
    if (fullBitString[i] === '1') {
      let runLength = 1;
      while (
        i + runLength < fullBitString.length &&
        fullBitString[i + runLength] === '1'
      ) {
        runLength++;
      }
      rects += `<rect x="${quietZone + i}" y="0" width="${runLength}" height="${heightPx}" fill="#0f172a" />`;
      i += runLength;
    } else {
      i++;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${heightPx}" style="width: 100%; max-width: 230px; height: ${heightPx}px; display: block; margin: 0 auto;" shape-rendering="crispEdges">${rects}</svg>`;
}

export function generateReceiptHtml(
  txn: SaleTransaction,
  format: PrintFormat = 'thermal-80',
  customDetails?: PharmacyDetails
): string {
  const isThermal58 = format === 'thermal-58';
  const isA4 = format === 'a4';
  const details = customDetails || syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;

  const containerWidth = isThermal58 ? '54mm' : isA4 ? '190mm' : '72mm';
  const fontSize = isThermal58 ? '10px' : isA4 ? '13px' : '11px';
  const safeLogoUrl = sanitizeImageUrl(details.logoUrl);
  const barcodeHeight = isThermal58 ? 30 : isA4 ? 44 : 36;
  const barcodeSvg = generateInvoiceBarcodeSvg(txn.invoiceNumber, barcodeHeight);

  const urduRefundText =
    details.urduRefundPolicy?.trim() || DEFAULT_URDU_REFUND_POLICY;

  const itemsHtml = txn.items
    .map((item, idx) => {
      const unitLabel = item.unitType === 'loose' ? 'loose' : 'pack';
      const safeMedName = escapeHtml(item.medicineName);
      const safeBatch = item.batchNumber ? ` • B: ${escapeHtml(item.batchNumber)}` : '';
      return `
        <tr>
          <td style="padding: 3px 0; border-bottom: 1px dashed #cbd5e1;">
            <div style="font-weight: 700; color: #0f172a;">${idx + 1}. ${safeMedName}</div>
            <div style="font-size: 0.9em; color: #475569;">
              ${Number(item.quantity)} ${unitLabel} × Rs. ${Number(item.pricePerUnit).toLocaleString('en-PK')}${safeBatch}
            </div>
          </td>
          <td style="padding: 3px 0; border-bottom: 1px dashed #cbd5e1; text-align: right; font-weight: 700; vertical-align: top;">
            Rs. ${Number(item.subtotal).toLocaleString('en-PK')}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="width: ${containerWidth}; max-width: 100%; margin: 0 auto; font-family: 'Courier New', monospace; font-size: ${fontSize}; color: #0f172a; line-height: 1.35;">
      <div style="text-align: center; border-bottom: 1.5px dashed #0f172a; padding-bottom: 6px; margin-bottom: 6px;">
        ${
          safeLogoUrl
            ? `<img src="${safeLogoUrl}" alt="Logo" style="max-height: 38px; margin: 0 auto 4px auto; object-fit: contain;" />`
            : ''
        }
        <h1 style="font-size: 1.25em; font-weight: 800; margin: 0;">${escapeHtml(details.name)}</h1>
        <div>${escapeHtml(details.address)}</div>
        <div>${escapeHtml(details.city)}</div>
        <div style="font-size: 0.9em;">
          Licence: ${escapeHtml(details.drugLicenceNumber)} ${
            details.ntnNumber ? `• NTN: ${escapeHtml(details.ntnNumber)}` : ''
          }
        </div>
        <div style="font-size: 0.9em;">Phone: ${escapeHtml(details.phone)}</div>
      </div>

      <div style="border-bottom: 1px dashed #64748b; padding-bottom: 5px; margin-bottom: 6px; font-size: 0.95em;">
        ${
          txn.status === 'refunded'
            ? `<div style="background: #ffe4e6; color: #9f1239; border: 1px solid #f43f5e; font-weight: 800; text-align: center; padding: 3px 6px; margin-bottom: 5px; border-radius: 4px;">
                REFUNDED / RETURNED${txn.refundReason ? ` (${escapeHtml(txn.refundReason)})` : ''}
              </div>`
            : ''
        }
        <div style="display: flex; justify-content: space-between;">
          <span><strong>Invoice #:</strong> ${escapeHtml(txn.invoiceNumber)}</span>
          <span>${escapeHtml(formatDateTime(txn.createdAt))}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span><strong>Customer:</strong> ${escapeHtml(txn.customerName || 'Walk-in Customer')}</span>
          <span>${escapeHtml(txn.customerPhone || '')}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span><strong>Counter:</strong> ${escapeHtml(txn.counterName || 'Main Counter')}</span>
          <span><strong>Pay:</strong> ${escapeHtml(txn.paymentMethod)}</span>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
        <thead>
          <tr style="border-bottom: 1px solid #0f172a; text-align: left;">
            <th style="padding-bottom: 3px;">Item Description</th>
            <th style="padding-bottom: 3px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top: 1px solid #0f172a; padding-top: 5px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Subtotal:</span>
          <span>Rs. ${Number(txn.subtotal).toLocaleString('en-PK')}</span>
        </div>
        ${
          txn.discountAmount > 0
            ? `<div style="display: flex; justify-content: space-between;">
                <span>Discount (${Number(txn.discountPercent)}%):</span>
                <span>- Rs. ${Number(txn.discountAmount).toLocaleString('en-PK')}</span>
              </div>`
            : ''
        }
        <div style="display: flex; justify-content: space-between; font-size: 1.15em; font-weight: 800; border-top: 1px dashed #64748b; margin-top: 3px; padding-top: 3px;">
          <span>Net Total:</span>
          <span>Rs. ${Number(txn.totalAmount).toLocaleString('en-PK')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-top: 2px;">
          <span>Tendered: Rs. ${Number(txn.receivedAmount).toLocaleString('en-PK')}</span>
          <span>Change: Rs. ${Number(txn.changeAmount).toLocaleString('en-PK')}</span>
        </div>
      </div>

      <!-- Scannable Unique Receipt Barcode -->
      <div style="text-align: center; border-top: 1px dashed #64748b; padding: 7px 0 5px 0; margin-bottom: 4px;">
        ${barcodeSvg}
        <div style="font-size: 0.85em; font-weight: 800; letter-spacing: 1.5px; margin-top: 3px; color: #0f172a;">
          *${escapeHtml(txn.invoiceNumber)}*
        </div>
      </div>

      <!-- Urdu Customer Refund & Exchange Policy Instructions -->
      <div dir="rtl" style="text-align: center; border-top: 1px dashed #64748b; padding: 5px 4px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 0.88em; line-height: 1.5; color: #0f172a; background: #f8fafc; border-radius: 4px; margin-bottom: 5px;">
        <div style="font-weight: 800; margin-bottom: 1px;">ہدایات برائے واپسی و تبدیلی:</div>
        <div style="font-weight: 600; color: #1e293b;">${escapeHtml(urduRefundText)}</div>
      </div>

      <!-- Store Tagline & Software Marketing Footer -->
      <div style="text-align: center; border-top: 1px dashed #64748b; padding-top: 5px; font-size: 0.85em;">
        <div style="font-weight: 700; margin-bottom: 2px;">${escapeHtml(
          !details.tagline || details.tagline === 'Your Trusted Health & Community Pharmacy'
            ? 'Wishing you speedy recovery & good health'
            : details.tagline
        )}</div>
        <div style="margin-top: 4px; padding: 3px 5px; border-top: 1px dotted #94a3b8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 0.86em; font-weight: 700; color: #0f172a;">
          ${escapeHtml(RECEIPT_MARKETING_FOOTER)}
        </div>
      </div>
    </div>
  `;
}
