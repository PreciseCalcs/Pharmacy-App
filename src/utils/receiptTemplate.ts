import { PharmacyDetails, PrintFormat, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { formatDateTime } from './dates';
import { syncEngine } from '../services/syncEngine';

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

      <div style="text-align: center; border-top: 1px dashed #64748b; padding-top: 6px; font-size: 0.85em;">
        <div style="font-weight: 700; margin-bottom: 2px;">${escapeHtml(details.tagline)}</div>
        <div style="color: #475569; margin-bottom: 4px;">${escapeHtml(details.thankYouMessage)}</div>
        <div style="font-size: 0.8em; color: #64748b;">PocketBase Single-Binary POS Engine • Computerized Record</div>
      </div>
    </div>
  `;
}
