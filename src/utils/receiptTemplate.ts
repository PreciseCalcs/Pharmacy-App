import { PharmacyDetails, PrintFormat, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { formatDateTime } from './dates';
import { syncEngine } from '../services/syncEngine';

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

  const itemsHtml = txn.items
    .map((item, idx) => {
      const unitLabel = item.unitType === 'loose' ? 'loose' : 'pack';
      return `
      <tr style="border-bottom: 1px dashed #d1d5db; padding: 4px 0;">
        <td style="padding: 4px 0; text-align: left; vertical-align: top;">
          <div style="font-weight: bold; color: #111827;">${idx + 1}. ${item.medicineName}</div>
          <div style="font-size: 85%; color: #6b7280;">
            ${item.quantity} ${unitLabel} &times; Rs. ${item.pricePerUnit.toLocaleString('en-PK')}
            ${item.batchNumber ? ` &bull; B: ${item.batchNumber}` : ''}
          </div>
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top; font-weight: bold; font-family: monospace;">
          Rs. ${item.subtotal.toLocaleString('en-PK')}
        </td>
      </tr>
    `;
    })
    .join('');

  return `
    <div style="width: ${containerWidth}; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: ${fontSize}; line-height: 1.35; color: #111827;">
      <!-- Store Header -->
      <div style="text-align: center; border-bottom: 2px dashed #9ca3af; padding-bottom: 8px; margin-bottom: 8px;">
        ${
          details.logoUrl
            ? `<div style="text-align: center; margin-bottom: 4px;"><img src="${details.logoUrl}" style="max-height: 40px; margin: 0 auto; display: block;" /></div>`
            : ''
        }
        <h1 style="margin: 0; font-size: 140%; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
          ${details.name}
        </h1>
        <div style="font-size: 85%; color: #4b5563; margin-top: 2px;">
          ${details.address}
        </div>
        <div style="font-size: 85%; color: #4b5563;">
          ${details.city}
        </div>
        <div style="font-size: 80%; font-weight: 600; color: #1f2937; margin-top: 4px; background: #f3f4f6; display: inline-block; padding: 2px 6px; border-radius: 4px;">
          Licence: ${details.drugLicenceNumber} ${details.ntnNumber ? `&bull; NTN: ${details.ntnNumber}` : ''}
        </div>
        <div style="font-size: 85%; font-weight: 600; margin-top: 2px;">
          Phone: ${details.phone}
        </div>
      </div>

      <!-- Invoice Details Meta -->
      <div style="margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; font-size: 90%;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span><strong>Invoice #:</strong> ${txn.invoiceNumber}</span>
          <span style="font-family: monospace;">${formatDateTime(txn.createdAt)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span><strong>Customer:</strong> ${txn.customerName || 'Walk-in Customer'}</span>
          <span>${txn.customerPhone || ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span><strong>Counter:</strong> ${txn.counterName || 'Main Counter'}</span>
          <span style="font-weight: 600; text-transform: uppercase;">${txn.paymentMethod}</span>
        </div>
      </div>

      <!-- Prescription Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        <thead>
          <tr style="border-bottom: 1px solid #9ca3af; font-size: 85%; text-transform: uppercase; color: #4b5563;">
            <th style="text-align: left; padding: 4px 0;">Item Description</th>
            <th style="text-align: right; padding: 4px 0;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Financial Totals -->
      <div style="border-top: 1px solid #9ca3af; padding-top: 6px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Subtotal:</span>
          <span style="font-family: monospace;">Rs. ${txn.subtotal.toLocaleString('en-PK')}</span>
        </div>
        ${
          txn.discountAmount > 0
            ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #15803d;">
            <span>Discount (${txn.discountPercent}%):</span>
            <span style="font-family: monospace;">- Rs. ${txn.discountAmount.toLocaleString('en-PK')}</span>
          </div>
        `
            : ''
        }
        <div style="display: flex; justify-content: space-between; font-size: 125%; font-weight: 800; border-top: 2px solid #111827; padding-top: 4px; margin-top: 4px;">
          <span>Net Total:</span>
          <span style="font-family: monospace;">Rs. ${txn.totalAmount.toLocaleString('en-PK')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 90%; color: #4b5563;">
          <span>Tendered: Rs. ${txn.receivedAmount.toLocaleString('en-PK')}</span>
          <span>Change: Rs. ${txn.changeAmount.toLocaleString('en-PK')}</span>
        </div>
      </div>

      <!-- Footer Policy -->
      <div style="text-align: center; border-top: 1px dashed #9ca3af; padding-top: 8px; font-size: 78%; color: #4b5563;">
        <p style="margin: 0 0 4px 0; font-weight: bold;">
          ${details.tagline}
        </p>
        <p style="margin: 0 0 6px 0;">
          ${details.thankYouMessage}
        </p>
        <div style="font-size: 70%; color: #9ca3af; text-transform: uppercase;">
          PocketBase Single-Binary POS Engine &bull; Computerized Record
        </div>
      </div>
    </div>
  `;
}
