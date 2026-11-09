import jsPDF from 'jspdf';
import { MedicineItem, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
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
