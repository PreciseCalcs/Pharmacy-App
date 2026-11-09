import jsPDF from 'jspdf';
import {
  MedicineItem,
  SaleTransaction,
  ShortBookEntry,
  SupplierAccount,
  ZAHID_PHARMACY_DETAILS,
} from '../types/pharmacy';
import { formatDateTime } from '../utils/dates';
import { formatPKR, getPieceRetailPrice } from '../utils/pharmacyHelpers';
import { syncEngine } from './syncEngine';

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



