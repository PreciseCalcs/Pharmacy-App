import jsPDF from 'jspdf';
import {
  MedicineItem,
  SaleTransaction,
  ShortBookEntry,
  SupplierAccount,
  GallaClosingRecord,
  CustomerKhata,
  KhataOrderItem,
  ZAHID_PHARMACY_DETAILS,
} from '../types/pharmacy';
import { formatDateTime } from '../utils/dates';
import { formatPKR, getPieceRetailPrice } from '../utils/pharmacyHelpers';
import { syncEngine } from './syncEngine';
import { encodeCode128B } from '../components/BarcodeGenerator';

export function generateSalesReportPDF(
  transactions: SaleTransaction[],
  title: string = 'Pharmacy Sales & Revenue Report'
): void {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(details.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(
    `Drug Licence: ${details.drugLicenceNumber}${details.ntnNumber ? ` | NTN: ${details.ntnNumber}` : ''} | Phone: ${details.phone}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, y, { align: 'right' });

  // Summary Metrics (calculated from active non-refunded sales)
  const activeTransactions = transactions.filter((t) => t.status !== 'refunded');
  const refundedCount = transactions.length - activeTransactions.length;
  const totalRevenue = activeTransactions.reduce((acc, t) => acc + t.totalAmount, 0);
  const totalProfit = activeTransactions.reduce((acc, t) => acc + (t.totalProfit || 0), 0);
  const totalItemsSold = activeTransactions.reduce(
    (acc, t) => acc + t.items.reduce((s, i) => s + i.quantity, 0),
    0
  );

  y += 8;
  doc.setFillColor(243, 244, 246);
  doc.rect(14, y, pageWidth - 28, 16, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Active Orders: ${activeTransactions.length}${refundedCount > 0 ? ` (${refundedCount} Refunded)` : ''}`,
    18,
    y + 6
  );
  doc.text(`Units Dispensed: ${totalItemsSold}`, 65, y + 6);
  doc.text(`Net Gross Revenue: ${formatPKR(totalRevenue)}`, 115, y + 6);
  doc.text(`Net Estimated Profit: ${formatPKR(totalProfit)}`, 18, y + 12);
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
  doc.text(`Average Margin: ${margin}%`, 115, y + 12);

  y += 22;

  const drawSalesTableHeader = (yPos: number) => {
    doc.setFillColor(229, 231, 235);
    doc.rect(14, yPos, pageWidth - 28, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Invoice #', 16, yPos + 5);
    doc.text('Date & Time', 48, yPos + 5);
    doc.text('Customer', 88, yPos + 5);
    doc.text('Payment', 126, yPos + 5);
    doc.text('Items', 150, yPos + 5);
    doc.text('Amount (PKR)', pageWidth - 16, yPos + 5, { align: 'right' });
  };

  drawSalesTableHeader(y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  // Render all transactions across multiple A4 pages
  transactions.forEach((txn) => {
    if (y > 272) {
      doc.addPage();
      y = 18;
      drawSalesTableHeader(y);
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    const isRef = txn.status === 'refunded';
    doc.text(isRef ? `${txn.invoiceNumber} [REF]` : txn.invoiceNumber, 16, y);
    doc.text(formatDateTime(txn.createdAt), 48, y);
    doc.text((txn.customerName || 'Walk-in').slice(0, 18), 88, y);
    doc.text(txn.paymentMethod, 126, y);
    doc.text(String(txn.items.length), 153, y);
    doc.text(
      `${isRef ? 'REFUNDED ' : ''}Rs. ${txn.totalAmount.toLocaleString('en-PK')}`,
      pageWidth - 16,
      y,
      { align: 'right' }
    );
    y += 6;
  });

  // Add footer with page numbers on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `${details.name} | PocketBase Local Offline Architecture | Page ${p} of ${totalPages}`,
      pageWidth / 2,
      288,
      { align: 'center' }
    );
  }

  const safeSlug = details.name.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`${safeSlug}_Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateInventoryAuditPDF(medicines: MedicineItem[]): void {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(details.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(
    `Physical Inventory Valuation & Shelf Ledger | Drug Licence: ${details.drugLicenceNumber}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // Summary
  const totalValue = medicines.reduce(
    (acc, m) =>
      acc +
      m.currentStockPacks * m.unitRetailPrice +
      (m.currentStockLoose || 0) * getPieceRetailPrice(m),
    0
  );
  const totalCost = medicines.reduce(
    (acc, m) =>
      acc +
      m.currentStockPacks * m.unitCostPrice +
      (m.currentStockLoose || 0) * (m.unitCostPrice / (m.unitsPerPack || 1)),
    0
  );

  y += 8;
  doc.setFillColor(240, 253, 244);
  doc.rect(14, y, pageWidth - 28, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Total SKU Items: ${medicines.length}`, 18, y + 6);
  doc.text(`Inventory Cost: ${formatPKR(totalCost)}`, 75, y + 6);
  doc.text(`Total Retail Valuation: ${formatPKR(totalValue)}`, 135, y + 6);
  doc.text(`Potential Gross Profit: ${formatPKR(totalValue - totalCost)}`, 18, y + 11);

  y += 18;

  const drawInventoryTableHeader = (yPos: number) => {
    doc.setFillColor(229, 231, 235);
    doc.rect(14, yPos, pageWidth - 28, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Medicine & Formula', 16, yPos + 5);
    doc.text('Shelf', 72, yPos + 5);
    doc.text('Stock (P/L)', 96, yPos + 5);
    doc.text('Pack MRP', 125, yPos + 5);
    doc.text('Batch', 150, yPos + 5);
    doc.text('Expiry', pageWidth - 16, yPos + 5, { align: 'right' });
  };

  drawInventoryTableHeader(y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  medicines.forEach((m) => {
    if (y > 272) {
      doc.addPage();
      y = 18;
      drawInventoryTableHeader(y);
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    }
    const nameLine = `${m.name} (${m.strength})`;
    doc.text(nameLine.slice(0, 32), 16, y);
    doc.text(m.shelfLocation || '-', 72, y);
    doc.text(`${m.currentStockPacks}p / ${m.currentStockLoose || 0}l`, 96, y);
    doc.text(`Rs. ${m.unitRetailPrice}`, 125, y);
    doc.text(m.batchNumber, 150, y);
    doc.text(m.expiryDate, pageWidth - 16, y, { align: 'right' });
    y += 5.5;
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `${details.name} | Inventory Valuation Ledger | Page ${p} of ${totalPages}`,
      pageWidth / 2,
      288,
      { align: 'center' }
    );
  }

  const safeSlug = details.name.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`${safeSlug}_Inventory_Valuation_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generatePurchaseOrderPDF(
  medicines: MedicineItem[],
  scopeLabel?: string
): void {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Filter to items at or below reorder threshold and sort Out-of-Stock first
  const lowStockItems = medicines
    .filter((m) => m.currentStockPacks <= (m.minThresholdPacks || 5))
    .map((m) => {
      const threshold = m.minThresholdPacks || 5;
      const current = m.currentStockPacks;
      const rawDeficit = Math.max(0, threshold - current);
      // Ensure at least 1 pack is requested even when current === threshold
      const demandPacks = rawDeficit > 0 ? rawDeficit : Math.max(1, Math.ceil(threshold * 0.5));
      const unitCost = m.unitCostPrice || 0;
      const lineCost = demandPacks * unitCost;
      const percentOfThreshold = Math.round((current / threshold) * 100);
      return {
        ...m,
        threshold,
        current,
        demandPacks,
        unitCost,
        lineCost,
        percentOfThreshold,
        isOutOfStock: current === 0,
      };
    })
    .sort((a, b) => {
      if (a.isOutOfStock && !b.isOutOfStock) return -1;
      if (!a.isOutOfStock && b.isOutOfStock) return 1;
      return a.percentOfThreshold - b.percentOfThreshold;
    });

  const pageWidth = doc.internal.pageSize.getWidth();
  const dateCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const poNumber = `PO-${dateCompact}-${String(lowStockItems.length).padStart(3, '0')}`;
  let y = 16;

  // Store Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(details.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(
    `Drug Licence: ${details.drugLicenceNumber}${details.ntnNumber ? ` | NTN: ${details.ntnNumber}` : ''} | Phone: ${details.phone}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // Document Title & PO Reference
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  const titleText =
    scopeLabel && scopeLabel !== 'All' && scopeLabel !== 'all'
      ? `SUPPLIER PURCHASE ORDER / DEMAND LIST (${scopeLabel.toUpperCase()})`
      : 'SUPPLIER PURCHASE ORDER / DEMAND LIST';
  doc.text(titleText, 14, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`PO Ref: ${poNumber}`, pageWidth - 14, y - 2, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Date: ${new Date().toLocaleString('en-PK')}`, pageWidth - 14, y + 3, {
    align: 'right',
  });

  // Summary Totals
  const outOfStockCount = lowStockItems.filter((i) => i.isOutOfStock).length;
  const orderedCount = lowStockItems.filter((i) => i.reorderStatus === 'ordered').length;
  const totalDemandPacks = lowStockItems.reduce((sum, i) => sum + i.demandPacks, 0);
  const totalEstimatedBudget = lowStockItems.reduce((sum, i) => sum + i.lineCost, 0);

  y += 8;
  doc.setFillColor(254, 242, 242);
  doc.rect(14, y, pageWidth - 28, 15, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`Low-Stock SKUs: ${lowStockItems.length}`, 18, y + 6);
  doc.text(`Out of Stock (0 Packs): ${outOfStockCount}`, 68, y + 6);
  doc.text(`Total Packs Requested: +${totalDemandPacks} packs`, 125, y + 6);
  doc.text(
    `Prepared By: ${details.ownerName || 'Chief Pharmacist'} (${details.phone})`,
    18,
    y + 11.5
  );
  doc.text(
    `Estimated Purchase Cost: ${formatPKR(totalEstimatedBudget)}${orderedCount > 0 ? ` (${orderedCount} marked ordered)` : ''}`,
    125,
    y + 11.5
  );

  y += 20;

  const drawPoTableHeader = (yPos: number) => {
    doc.setFillColor(229, 231, 235);
    doc.rect(14, yPos, pageWidth - 28, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('#', 16, yPos + 5);
    doc.text('Medicine / Item & Strength', 23, yPos + 5);
    doc.text('Supplier / Mfg', 84, yPos + 5);
    doc.text('Stock / Min', 120, yPos + 5);
    doc.text('Demand Qty', 143, yPos + 5);
    doc.text('Pack Cost', 166, yPos + 5);
    doc.text('Est. Total', pageWidth - 16, yPos + 5, { align: 'right' });
  };

  drawPoTableHeader(y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  if (lowStockItems.length === 0) {
    doc.text('All catalog items are currently stocked above their reorder threshold.', 16, y);
    y += 10;
  } else {
    lowStockItems.forEach((item, index) => {
      if (y > 262) {
        doc.addPage();
        y = 18;
        drawPoTableHeader(y);
        y += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
      }

      const itemTitle = `${item.name} ${item.strength ? `(${item.strength})` : ''}`.trim();
      const supplierOrMfg = (item.supplier || item.manufacturer || item.category || '-').slice(
        0,
        19
      );
      const stockStatus = item.isOutOfStock
        ? `0p / ${item.threshold}p [OUT]`
        : `${item.current}p / ${item.threshold}p`;
      const demandLabel = `+${item.demandPacks} pk${item.reorderStatus === 'ordered' ? ' [ORD]' : ''}`;

      doc.text(String(index + 1), 16, y);
      doc.setFont('helvetica', item.isOutOfStock ? 'bold' : 'normal');
      doc.text(itemTitle.slice(0, 33), 23, y);
      doc.setFont('helvetica', 'normal');
      doc.text(supplierOrMfg, 84, y);
      doc.text(stockStatus, 120, y);
      doc.setFont('helvetica', 'bold');
      doc.text(demandLabel, 143, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`Rs. ${item.unitCost.toLocaleString('en-PK')}`, 166, y);
      doc.setFont('helvetica', 'bold');
      doc.text(`Rs. ${item.lineCost.toLocaleString('en-PK')}`, pageWidth - 16, y, {
        align: 'right',
      });
      doc.setFont('helvetica', 'normal');

      y += 6;
    });
  }

  // Also include Counter Short Book (Patient Want List) entries if any exist
  const shortBookEntries = syncEngine.getShortBook();
  if (shortBookEntries.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    } else {
      y += 6;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(
      `COUNTER SHORT BOOK / PATIENT DEMAND LIST (${shortBookEntries.length} REQUESTED ITEMS)`,
      14,
      y
    );
    y += 5;

    doc.setFillColor(254, 243, 199);
    doc.rect(14, y, pageWidth - 28, 7, 'F');
    doc.setFontSize(8);
    doc.text('#', 16, y + 5);
    doc.text('Requested Medicine / Item', 24, y + 5);
    doc.text('Strength / Pack', 90, y + 5);
    doc.text('Supplier / Note', 125, y + 5);
    doc.text('Asked', 162, y + 5);
    doc.text('Order Qty', pageWidth - 16, y + 5, { align: 'right' });

    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    shortBookEntries.forEach((entry, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.text(String(idx + 1), 16, y);
      doc.setFont('helvetica', entry.priority === 'urgent' ? 'bold' : 'normal');
      doc.text(
        `${entry.itemName}${entry.priority === 'urgent' ? ' [URGENT]' : ''}`.slice(0, 36),
        24,
        y
      );
      doc.setFont('helvetica', 'normal');
      doc.text((entry.strengthOrPack || '-').slice(0, 18), 90, y);
      doc.text((entry.supplierName || entry.customerNote || '-').slice(0, 20), 125, y);
      doc.text(`${entry.requestCount}x`, 163, y);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `+${entry.requestedPacks} pk${entry.status === 'ordered' ? ' [ORD]' : ''}`,
        pageWidth - 16,
        y,
        { align: 'right' }
      );
      doc.setFont('helvetica', 'normal');
      y += 5.5;
    });
  }

  // Grand Total & Signature Block
  if (y > 248) {
    doc.addPage();
    y = 22;
  }

  y += 4;
  doc.setLineWidth(0.4);
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Total Demand Packs: +${totalDemandPacks} packs`, 14, y);
  doc.text(
    `Total Estimated Purchase Order Amount: ${formatPKR(totalEstimatedBudget)}`,
    pageWidth - 14,
    y,
    { align: 'right' }
  );

  y += 16;
  doc.setLineWidth(0.3);
  doc.line(14, y, 78, y);
  doc.line(pageWidth - 78, y, pageWidth - 14, y);

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Authorized Signature (${details.ownerName || details.name})`, 14, y);
  doc.text('Supplier / Distributor Stamp & Receiver Sign', pageWidth - 14, y, {
    align: 'right',
  });

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `${details.name} | Purchase Order Demand List (${poNumber}) | Page ${p} of ${totalPages}`,
      pageWidth / 2,
      288,
      { align: 'center' }
    );
  }

  const safeSlug = details.name.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`${safeSlug}_Purchase_Order_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateShortBookPDF(entries?: ShortBookEntry[]): void {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const list = entries || syncEngine.getShortBook();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const dateCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const refNo = `SB-${dateCompact}-${String(list.length).padStart(3, '0')}`;
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(details.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(
    `Drug Licence: ${details.drugLicenceNumber} | Phone: ${details.phone}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('COUNTER SHORT BOOK / ORDER BOOKER WANT LIST', 14, y);

  doc.setFontSize(9);
  doc.text(`Ref: ${refNo}`, pageWidth - 14, y, { align: 'right' });

  const totalPacks = list.reduce((s, e) => s + (e.requestedPacks || 0), 0);
  const urgentCount = list.filter((e) => e.priority === 'urgent').length;

  y += 7;
  doc.setFillColor(254, 243, 199);
  doc.rect(14, y, pageWidth - 28, 12, 'F');
  doc.setFontSize(8.5);
  doc.text(`Requested Items: ${list.length}`, 18, y + 7.5);
  doc.text(`Urgent Requests: ${urgentCount}`, 75, y + 7.5);
  doc.text(`Total Packs to Order: +${totalPacks} packs`, 130, y + 7.5);

  y += 17;
  doc.setFillColor(229, 231, 235);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFontSize(8);
  doc.text('#', 16, y + 5);
  doc.text('Medicine / Item Name', 24, y + 5);
  doc.text('Strength / Pack', 88, y + 5);
  doc.text('Supplier / Patient Note', 122, y + 5);
  doc.text('Asked', 162, y + 5);
  doc.text('Order Qty', pageWidth - 16, y + 5, { align: 'right' });

  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  list.forEach((item, idx) => {
    if (y > 268) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(idx + 1), 16, y);
    doc.setFont('helvetica', item.priority === 'urgent' ? 'bold' : 'normal');
    doc.text(
      `${item.itemName}${item.priority === 'urgent' ? ' [URGENT]' : ''}`.slice(0, 35),
      24,
      y
    );
    doc.setFont('helvetica', 'normal');
    doc.text((item.strengthOrPack || '-').slice(0, 18), 88, y);
    doc.text((item.supplierName || item.customerNote || '-').slice(0, 20), 122, y);
    doc.text(`${item.requestCount}x`, 163, y);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `+${item.requestedPacks} pk${item.status === 'ordered' ? ' [ORD]' : ''}`,
      pageWidth - 16,
      y,
      { align: 'right' }
    );
    doc.setFont('helvetica', 'normal');
    y += 6;
  });

  const safeSlug = details.name.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`${safeSlug}_Short_Book_Demand_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateSupplierStatementPDF(supplier: SupplierAccount): void {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(details.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(
    `Drug Licence: ${details.drugLicenceNumber} | Phone: ${details.phone}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(`SUPPLIER KHATA & GRN STATEMENT: ${supplier.distributorName}`, 14, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Order Booker: ${supplier.orderBookerName} (${supplier.orderBookerPhone}) | Visit Day: ${supplier.visitDay}`,
    14,
    y
  );

  y += 6;
  doc.setFillColor(240, 253, 244);
  doc.rect(14, y, pageWidth - 28, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`Total Purchased: ${formatPKR(supplier.totalPurchasedAmount)}`, 18, y + 6);
  doc.text(`Total Paid: ${formatPKR(supplier.totalPaidAmount)}`, 78, y + 6);
  doc.text(`Balance Payable: ${formatPKR(supplier.balancePayable)}`, 135, y + 6);
  doc.text(
    `Trade Bonus Savings (Free Packs Value): ${formatPKR(supplier.totalBonusValueSaved || 0)}`,
    18,
    y + 11.5
  );

  y += 20;
  doc.setFillColor(229, 231, 235);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFontSize(8);
  doc.text('Date', 16, y + 5);
  doc.text('Type / Ref #', 46, y + 5);
  doc.text('Description & Bonus Scheme', 84, y + 5);
  doc.text('Billed (PKR)', 156, y + 5, { align: 'right' });
  doc.text('Paid (PKR)', pageWidth - 16, y + 5, { align: 'right' });

  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  supplier.ledger.forEach((entry) => {
    if (y > 268) {
      doc.addPage();
      y = 20;
    }
    doc.text(formatDateTime(entry.date).slice(0, 16), 16, y);
    doc.setFont('helvetica', 'bold');
    doc.text(
      (entry.supplierInvoiceNumber || entry.grnNumber || entry.type.toUpperCase()).slice(0, 18),
      46,
      y
    );
    doc.setFont('helvetica', 'normal');
    doc.text(entry.description.slice(0, 38), 84, y);
    doc.text(
      entry.totalBilledAmount > 0 ? formatPKR(entry.totalBilledAmount) : '-',
      156,
      y,
      { align: 'right' }
    );
    doc.setFont('helvetica', 'bold');
    doc.text(
      entry.paidAmount > 0 ? formatPKR(entry.paidAmount) : '-',
      pageWidth - 16,
      y,
      { align: 'right' }
    );
    doc.setFont('helvetica', 'normal');
    y += 6;
  });

  const safeSup = supplier.distributorName.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`${safeSup}_Khata_Statement_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateGallaClosingPDF(record: GallaClosingRecord): void {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(details.name.toUpperCase(), pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.text(
    `Drug Licence: ${details.drugLicenceNumber} | Phone: ${details.phone}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`DAILY GALLA (CASH DRAWER) CLOSING & SHIFT RECONCILIATION`, 14, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Closing Slip #: ${record.closingNumber} | Counter: ${record.counterName} | Shift: ${record.shiftSlot}`,
    14,
    y
  );

  y += 5.5;
  doc.text(
    `Date: ${record.date} | Closed By: ${record.closedByStaff} (${record.closedByRole.toUpperCase()}) | Time: ${formatDateTime(record.closedAt)}`,
    14,
    y
  );

  y += 8;
  // Formula Box
  doc.setFillColor(240, 253, 244);
  doc.rect(14, y, pageWidth - 28, 48, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('1. EXPECTED PHYSICAL CASH FORMULA BREAKDOWN', 18, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('(+) Opening Drawer Float (Start Cash):', 20, y + 15);
  doc.text(formatPKR(record.openingFloat), pageWidth - 20, y + 15, { align: 'right' });

  doc.text(
    `(+) Cash POS Sales (${record.cashPosInvoiceCount} cash invoices):`,
    20,
    y + 22
  );
  doc.text(formatPKR(record.cashPosSales), pageWidth - 20, y + 22, { align: 'right' });

  doc.text(
    `(+) Cash Khata Recoveries (${record.cashKhataRecoveryCount} cash collections):`,
    20,
    y + 29
  );
  doc.text(formatPKR(record.cashKhataRecoveries), pageWidth - 20, y + 29, { align: 'right' });

  doc.text(
    `(-) Daily Cash Expenses Paid from Galla (${record.dailyCashExpenseCount} vouchers):`,
    20,
    y + 36
  );
  doc.text(`- ${formatPKR(record.dailyCashExpenses)}`, pageWidth - 20, y + 36, {
    align: 'right',
  });

  doc.setLineWidth(0.3);
  doc.line(18, y + 39.5, pageWidth - 18, y + 39.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('(=) EXPECTED PHYSICAL CASH IN DRAWER:', 20, y + 45);
  doc.text(formatPKR(record.expectedPhysicalCash), pageWidth - 20, y + 45, {
    align: 'right',
  });

  y += 56;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, pageWidth - 28, 36, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('2. ACTUAL PHYSICAL COUNT & VARIANCE RECONCILIATION', 18, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Actual Physical Cash Counted by Cashier:', 20, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(formatPKR(record.actualCashCounted), pageWidth - 20, y + 15, {
    align: 'right',
  });

  const statusLabel =
    record.varianceStatus === 'balanced'
      ? 'EXACT MATCH (BALANCED)'
      : record.varianceStatus === 'shortage'
      ? `CASH SHORTAGE (${formatPKR(Math.abs(record.varianceAmount))})`
      : `CASH SURPLUS (+${formatPKR(record.varianceAmount)})`;

  doc.setFont('helvetica', 'normal');
  doc.text('Drawer Reconciliation Status / Variance:', 20, y + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, pageWidth - 20, y + 22, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.text('Cash Handed Over to Owner (Safe Drop):', 20, y + 29);
  doc.text(formatPKR(record.cashHandedToOwner), 100, y + 29);

  doc.text('Retained in Drawer for Next Shift Float:', 115, y + 29);
  doc.text(formatPKR(record.closingFloatKeptInDrawer), pageWidth - 20, y + 29, {
    align: 'right',
  });

  y += 44;

  if (record.denominations) {
    const d = record.denominations;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('3. PKR CURRENCY DENOMINATION COUNT', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Rs.5000 x ${d.n5000} (${formatPKR(d.n5000 * 5000)})  |  Rs.1000 x ${d.n1000} (${formatPKR(
        d.n1000 * 1000
      )})  |  Rs.500 x ${d.n500} (${formatPKR(d.n500 * 500)})  |  Rs.100 x ${d.n100} (${formatPKR(
        d.n100 * 100
      )})`,
      14,
      y
    );
    y += 5;
    doc.text(
      `Rs.50 x ${d.n50} (${formatPKR(d.n50 * 50)})  |  Rs.20 x ${d.n20} (${formatPKR(
        d.n20 * 20
      )})  |  Rs.10 x ${d.n10} (${formatPKR(d.n10 * 10)})  |  Coins: ${formatPKR(d.coins)}`,
      14,
      y
    );
    y += 8;
  }

  if (record.note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(`Shift Note: ${record.note}`, 14, y);
    y += 10;
  }

  y += 14;
  doc.setLineWidth(0.3);
  doc.line(18, y, 78, y);
  doc.line(pageWidth - 78, y, pageWidth - 18, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Cashier Signature (${record.closedByStaff})`, 22, y + 5);
  doc.text(`Owner / Pharmacist Verification (${details.ownerName})`, pageWidth - 76, y + 5);

  doc.save(`${record.closingNumber}_Galla_Reconciliation.pdf`);
}

export function generateCustomerKhataPDF(
  customer: CustomerKhata,
  options: { autoDownload?: boolean } = { autoDownload: true }
): { blob: Blob; fileName: string } {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
  const allSales = syncEngine.getSales();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // Store Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(details.name, pageWidth / 2, y, { align: 'center' });

  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${details.address}, ${details.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(8.5);
  doc.text(
    `Drug Licence: ${details.drugLicenceNumber}${details.ntnNumber ? ` | NTN: ${details.ntnNumber}` : ''} | Phone: ${details.phone}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  if (details.tagline) {
    y += 4.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(details.tagline, pageWidth / 2, y, { align: 'center' });
  }

  y += 5;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('CUSTOMER CREDIT KHATA STATEMENT & ORDER HISTORY', 14, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Statement Date: ${new Date().toLocaleString('en-PK')}`, pageWidth - 14, y, {
    align: 'right',
  });

  // Calculate Totals
  const totalCreditPurchases = customer.history
    .filter((h) => h.type === 'sale')
    .reduce((sum, h) => sum + h.amount, 0);
  const totalPaymentsAndRefunds = customer.history
    .filter((h) => h.type === 'payment' || h.type === 'refund')
    .reduce((sum, h) => sum + h.amount, 0);
  const creditInvoicesCount = customer.history.filter((h) => h.type === 'sale').length;

  y += 6;
  // Customer & Balance Summary Card
  doc.setFillColor(240, 253, 244);
  doc.rect(14, y, pageWidth - 28, 26, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Customer: ${customer.name}`, 18, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Phone / WhatsApp: ${customer.phone || 'N/A'}`, 18, y + 13.5);
  doc.text(`Address: ${customer.address || 'Local Customer'}`, 18, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Total Credit Purchases (${creditInvoicesCount} bills): ${formatPKR(totalCreditPurchases)}`,
    pageWidth - 18,
    y + 7,
    { align: 'right' }
  );
  doc.text(
    `Total Payments Received: ${formatPKR(totalPaymentsAndRefunds)}`,
    pageWidth - 18,
    y + 13.5,
    { align: 'right' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    `NET BALANCE DUE: ${formatPKR(customer.balanceDue)}`,
    pageWidth - 18,
    y + 21,
    { align: 'right' }
  );

  y += 33;

  const drawLedgerTableHeader = (yPos: number) => {
    doc.setFillColor(226, 232, 240);
    doc.rect(14, yPos, pageWidth - 28, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Date & Time', 16, yPos + 5.2);
    doc.text('Invoice # / Type', 50, yPos + 5.2);
    doc.text('Purchased Medicines & Order Details', 86, yPos + 5.2);
    doc.text('Credit Bill (+)', 164, yPos + 5.2, { align: 'right' });
    doc.text('Paid (-)', pageWidth - 16, yPos + 5.2, { align: 'right' });
  };

  drawLedgerTableHeader(y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  if (customer.history.length === 0) {
    doc.text('No credit orders or payment entries recorded yet.', 16, y);
    y += 10;
  } else {
    customer.history.forEach((entry) => {
      // Resolve items from entry.items or matching SaleTransaction
      let resolvedItems: KhataOrderItem[] = entry.items || [];
      if (resolvedItems.length === 0 && entry.invoiceNumber) {
        const matchedSale = allSales.find((s) => s.invoiceNumber === entry.invoiceNumber);
        if (matchedSale?.items?.length) {
          resolvedItems = matchedSale.items.map((it) => ({
            medicineId: it.medicineId,
            medicineName: it.medicineName,
            quantity: it.quantity,
            unitType: it.unitType,
            pricePerUnit: it.pricePerUnit,
            subtotal: it.subtotal,
          }));
        }
      }

      const itemLines: string[] = [];
      if (resolvedItems.length > 0) {
        resolvedItems.forEach((it) => {
          const unitLabel = it.unitType === 'pack' ? (it.quantity > 1 ? 'Packs' : 'Pack') : 'Loose';
          itemLines.push(
            `• ${it.medicineName} (${it.quantity} ${unitLabel} x Rs.${it.pricePerUnit} = Rs.${it.subtotal})`
          );
        });
        if (entry.note) {
          itemLines.push(`Note: ${entry.note}`);
        }
      } else {
        itemLines.push(entry.description + (entry.note ? ` (${entry.note})` : ''));
      }

      // Wrap lines to fit column width (approx 52mm)
      const wrappedDetails: string[] = [];
      itemLines.forEach((line) => {
        const split = doc.splitTextToSize(line, 54) as string[];
        wrappedDetails.push(...split);
      });

      const rowHeight = Math.max(7, wrappedDetails.length * 4.2 + 2.5);

      if (y + rowHeight > 272) {
        doc.addPage();
        y = 18;
        drawLedgerTableHeader(y);
        y += 12;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
      }

      const dateStr = formatDateTime(entry.date);
      const typeOrInvoice =
        entry.type === 'sale'
          ? entry.invoiceNumber || 'Credit Bill'
          : entry.type === 'refund'
          ? `Refund (${entry.invoiceNumber || ''})`
          : `Payment (${entry.paymentMethod || 'Cash'})`;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(dateStr.substring(0, 19), 16, y);

      doc.setFont('helvetica', entry.type === 'sale' ? 'bold' : 'normal');
      doc.text(typeOrInvoice.substring(0, 20), 50, y);

      doc.setFont('helvetica', 'normal');
      wrappedDetails.forEach((wLine, idx) => {
        doc.text(wLine, 86, y + idx * 4.1);
      });

      if (entry.type === 'sale') {
        doc.setFont('helvetica', 'bold');
        doc.text(`+ ${formatPKR(entry.amount)}`, 164, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.text('-', pageWidth - 16, y, { align: 'right' });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.text('-', 164, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(`- ${formatPKR(entry.amount)}`, pageWidth - 16, y, { align: 'right' });
      }

      const bottomLineY = y + Math.max(2, (wrappedDetails.length - 1) * 4.1) + 2.5;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, bottomLineY, pageWidth - 14, bottomLineY);

      y = bottomLineY + 5;
    });
  }

  // Final Net Summary Footer Box
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  y += 4;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, pageWidth - 28, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `NET OUTSTANDING KHATA BALANCE PAYABLE TO ${details.name.toUpperCase()}:`,
    18,
    y + 8
  );
  doc.setFontSize(12);
  doc.text(formatPKR(customer.balanceDue), pageWidth - 18, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Kindly clear your outstanding balance at your earliest convenience. Store Contact: ${details.phone}`,
    18,
    y + 15.5
  );

  if (details.marketingFooter) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(details.marketingFooter, pageWidth / 2, 287, { align: 'center' });
  }

  const cleanName = customer.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Customer';
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `${cleanName}_Khata_Statement_${datePart}.pdf`;

  if (options.autoDownload !== false) {
    doc.save(fileName);
  }

  const blob = doc.output('blob');
  return { blob, fileName };
}

export type BarcodeLabelPaperLayout =
  | 'a4_40' // 4 x 10 grid on A4 (52.5 x 29.7mm)
  | 'a4_24' // 3 x 8 grid on A4 (70 x 37mm)
  | 'a4_65' // 5 x 13 grid on A4 (38.1 x 21.2mm)
  | 'thermal_50x25' // 50 x 25mm continuous thermal label roll
  | 'thermal_40x30'; // 40 x 30mm continuous thermal label roll

export interface BarcodeLabelPrintJobItem {
  id: string;
  productName: string;
  genericOrStrength?: string;
  barcodeValue: string;
  sku?: string;
  packPrice: number;
  unitPrice?: number;
  priceDisplayMode: 'pack' | 'unit' | 'both' | 'none';
  batchNumber?: string;
  expiryDate?: string;
  shelfLocation?: string;
  copies: number;
}

export interface BarcodeLabelPrintConfig {
  layout: BarcodeLabelPaperLayout;
  showStoreHeader: boolean;
  showBatchAndExpiry: boolean;
  showShelfLocation: boolean;
  showCutBorders: boolean;
}

function drawVectorCode128OnPdf(
  doc: jsPDF,
  barcodeValue: string,
  x: number,
  y: number,
  maxWidthMm: number,
  barHeightMm: number
) {
  const bars = encodeCode128B(barcodeValue || '0000000000');
  const totalUnits = bars.reduce((sum, b) => sum + b.width, 0) || 1;
  const unitWidthMm = maxWidthMm / totalUnits;

  doc.setFillColor(0, 0, 0);
  let cursorX = x;
  for (const bar of bars) {
    const w = bar.width * unitWidthMm;
    if (bar.isBlack) {
      doc.rect(cursorX, y, w, barHeightMm, 'F');
    }
    cursorX += w;
  }
}

export function generateBarcodeLabelsPDF(
  items: BarcodeLabelPrintJobItem[],
  config: BarcodeLabelPrintConfig
): { fileName: string; totalStickers: number } {
  const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;

  // Expand copies into flat sticker list
  const expandedStickers: BarcodeLabelPrintJobItem[] = [];
  for (const item of items) {
    const count = Math.max(1, Math.min(500, item.copies || 1));
    for (let i = 0; i < count; i++) {
      expandedStickers.push(item);
    }
  }

  if (expandedStickers.length === 0) {
    throw new Error('No barcode stickers in print queue.');
  }

  const isThermal =
    config.layout === 'thermal_50x25' || config.layout === 'thermal_40x30';

  if (isThermal) {
    const labelW = config.layout === 'thermal_50x25' ? 50 : 40;
    const labelH = config.layout === 'thermal_50x25' ? 25 : 30;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [labelW, labelH],
    });

    expandedStickers.forEach((sticker, index) => {
      if (index > 0) {
        doc.addPage([labelW, labelH], 'landscape');
      }

      if (config.showCutBorders) {
        doc.setDrawColor(210, 214, 220);
        doc.setLineWidth(0.2);
        doc.rect(1, 1, labelW - 2, labelH - 2);
      }

      let curY = 3.2;

      if (config.showStoreHeader) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.8);
        doc.setTextColor(15, 23, 42);
        doc.text(details.name.toUpperCase().slice(0, 28), labelW / 2, curY, {
          align: 'center',
        });
        curY += 2.6;
      }

      // Product Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(0, 0, 0);
      doc.text(sticker.productName.slice(0, 24), labelW / 2, curY, {
        align: 'center',
      });
      curY += 2.5;

      // Strength / Generic + Price Line
      let priceStr = '';
      if (sticker.priceDisplayMode === 'pack') {
        priceStr = `Rs.${sticker.packPrice}`;
      } else if (sticker.priceDisplayMode === 'unit') {
        priceStr = `Rs.${(sticker.unitPrice ?? sticker.packPrice).toFixed(1)}/u`;
      } else if (sticker.priceDisplayMode === 'both') {
        priceStr = `Rs.${sticker.packPrice} (${(sticker.unitPrice ?? sticker.packPrice).toFixed(1)}/u)`;
      }

      const subLine = [
        sticker.genericOrStrength ? sticker.genericOrStrength.slice(0, 14) : '',
        priceStr,
      ]
        .filter(Boolean)
        .join(' • ');

      if (subLine) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text(subLine, labelW / 2, curY, { align: 'center' });
        curY += 1.6;
      }

      // Vector Code-128 Barcode
      const barcodeMarginX = 3;
      const barcodeW = labelW - barcodeMarginX * 2;
      const barcodeH = config.layout === 'thermal_50x25' ? 7.8 : 9.5;
      drawVectorCode128OnPdf(doc, sticker.barcodeValue, barcodeMarginX, curY, barcodeW, barcodeH);
      curY += barcodeH + 2.4;

      // Human-readable barcode digits
      doc.setFont('courier', 'bold');
      doc.setFontSize(6.5);
      doc.text(sticker.barcodeValue, labelW / 2, curY, { align: 'center' });
      curY += 2.2;

      // Optional Batch / Expiry / Shelf Footer
      if (config.showBatchAndExpiry || config.showShelfLocation) {
        const metaParts: string[] = [];
        if (config.showBatchAndExpiry && sticker.batchNumber) {
          metaParts.push(`B:${sticker.batchNumber}`);
        }
        if (config.showBatchAndExpiry && sticker.expiryDate) {
          metaParts.push(`EXP:${sticker.expiryDate}`);
        }
        if (config.showShelfLocation && sticker.shelfLocation) {
          metaParts.push(sticker.shelfLocation);
        }
        if (metaParts.length > 0 && curY <= labelH - 1.2) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(4.8);
          doc.text(metaParts.join(' | ').slice(0, 34), labelW / 2, curY, {
            align: 'center',
          });
        }
      }
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `Zahid_Thermal_Barcodes_${config.layout}_${dateStamp}.pdf`;
    doc.save(fileName);
    return { fileName, totalStickers: expandedStickers.length };
  }

  // A4 Sticker Grid Sheet Layouts
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const gridSpec =
    config.layout === 'a4_24'
      ? { cols: 3, rows: 8, marginX: 6, marginY: 8.5, cellW: 66, cellH: 35 }
      : config.layout === 'a4_65'
      ? { cols: 5, rows: 13, marginX: 4.7, marginY: 10.7, cellW: 38.1, cellH: 21.2 }
      : { cols: 4, rows: 10, marginX: 5, marginY: 8.5, cellW: 50, cellH: 28 }; // a4_40 default

  const perPage = gridSpec.cols * gridSpec.rows;

  expandedStickers.forEach((sticker, idx) => {
    const pageIndex = Math.floor(idx / perPage);
    const slotInPage = idx % perPage;
    if (idx > 0 && slotInPage === 0) {
      doc.addPage('a4', 'portrait');
    }

    const col = slotInPage % gridSpec.cols;
    const row = Math.floor(slotInPage / gridSpec.cols);

    const cellX = gridSpec.marginX + col * gridSpec.cellW;
    const cellY = gridSpec.marginY + row * gridSpec.cellH;

    if (config.showCutBorders) {
      doc.setDrawColor(220, 224, 230);
      doc.setLineWidth(0.18);
      doc.rect(cellX + 0.6, cellY + 0.6, gridSpec.cellW - 1.2, gridSpec.cellH - 1.2);
    }

    const centerX = cellX + gridSpec.cellW / 2;
    const isMini = config.layout === 'a4_65';
    const isLarge = config.layout === 'a4_24';

    let curY = cellY + (isMini ? 3.0 : 3.8);

    if (config.showStoreHeader) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isMini ? 4.6 : isLarge ? 6.4 : 5.4);
      doc.setTextColor(15, 23, 42);
      doc.text(
        details.name.toUpperCase().slice(0, isMini ? 22 : 30),
        centerX,
        curY,
        { align: 'center' }
      );
      curY += isMini ? 2.1 : 2.6;
    }

    // Product Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isMini ? 5.8 : isLarge ? 8.2 : 6.8);
    doc.setTextColor(0, 0, 0);
    doc.text(
      sticker.productName.slice(0, isMini ? 20 : isLarge ? 30 : 24),
      centerX,
      curY,
      { align: 'center' }
    );
    curY += isMini ? 2.1 : 2.6;

    // Price & Strength Row
    let priceStr = '';
    if (sticker.priceDisplayMode === 'pack') {
      priceStr = `MRP: Rs.${sticker.packPrice}`;
    } else if (sticker.priceDisplayMode === 'unit') {
      priceStr = `Rs.${(sticker.unitPrice ?? sticker.packPrice).toFixed(1)}/Unit`;
    } else if (sticker.priceDisplayMode === 'both') {
      priceStr = `Rs.${sticker.packPrice} (${(sticker.unitPrice ?? sticker.packPrice).toFixed(1)}/u)`;
    }

    const subText = [
      !isMini && sticker.genericOrStrength ? sticker.genericOrStrength.slice(0, 14) : '',
      priceStr,
    ]
      .filter(Boolean)
      .join(' • ');

    if (subText) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isMini ? 5.0 : isLarge ? 6.6 : 5.6);
      doc.text(subText, centerX, curY, { align: 'center' });
      curY += isMini ? 1.2 : 1.7;
    }

    // Vector Code-128 Bars
    const barPadX = isMini ? 2.2 : 3.2;
    const barW = gridSpec.cellW - barPadX * 2;
    const barH = isMini ? 6.0 : isLarge ? 10.5 : 8.0;
    drawVectorCode128OnPdf(doc, sticker.barcodeValue, cellX + barPadX, curY, barW, barH);
    curY += barH + (isMini ? 2.0 : 2.5);

    // Human-readable Code
    doc.setFont('courier', 'bold');
    doc.setFontSize(isMini ? 5.2 : isLarge ? 7.2 : 6.2);
    doc.text(sticker.barcodeValue, centerX, curY, { align: 'center' });
    curY += isMini ? 1.8 : 2.3;

    // Optional Batch / Expiry / Shelf Footer
    if ((config.showBatchAndExpiry || config.showShelfLocation) && curY <= cellY + gridSpec.cellH - 1.2) {
      const metaParts: string[] = [];
      if (config.showBatchAndExpiry && sticker.batchNumber) {
        metaParts.push(`B:${sticker.batchNumber}`);
      }
      if (config.showBatchAndExpiry && sticker.expiryDate) {
        metaParts.push(`EXP:${sticker.expiryDate}`);
      }
      if (config.showShelfLocation && sticker.shelfLocation && !isMini) {
        metaParts.push(sticker.shelfLocation);
      }
      if (metaParts.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(isMini ? 4.2 : 4.8);
        doc.text(metaParts.join(' | ').slice(0, isMini ? 24 : 34), centerX, curY, {
          align: 'center',
        });
      }
    }

    void pageIndex;
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `Zahid_Barcode_Sheet_${config.layout}_${dateStamp}.pdf`;
  doc.save(fileName);
  return { fileName, totalStickers: expandedStickers.length };
}





