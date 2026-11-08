import jsPDF from 'jspdf';
import { MedicineItem, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { formatDateTime } from '../utils/dates';
import { formatPKR, getPieceRetailPrice } from '../utils/pharmacyHelpers';

export function generateSalesReportPDF(
  transactions: SaleTransaction[],
  title: string = 'Pharmacy Sales & Revenue Report'
): void {
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
  doc.text(ZAHID_PHARMACY_DETAILS.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${ZAHID_PHARMACY_DETAILS.address}, ${ZAHID_PHARMACY_DETAILS.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(`Drug Licence: ${ZAHID_PHARMACY_DETAILS.drugLicenceNumber} | Phone: ${ZAHID_PHARMACY_DETAILS.phone}`, pageWidth / 2, y, { align: 'center' });

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

  // Summary Metrics
  const totalRevenue = transactions.reduce((acc, t) => acc + t.totalAmount, 0);
  const totalProfit = transactions.reduce((acc, t) => acc + (t.totalProfit || 0), 0);
  const totalItemsSold = transactions.reduce((acc, t) => acc + t.items.reduce((s, i) => s + i.quantity, 0), 0);

  y += 8;
  doc.setFillColor(243, 244, 246);
  doc.rect(14, y, pageWidth - 28, 16, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Orders: ${transactions.length}`, 18, y + 6);
  doc.text(`Units Dispensed: ${totalItemsSold}`, 65, y + 6);
  doc.text(`Total Gross Revenue: ${formatPKR(totalRevenue)}`, 115, y + 6);
  doc.text(`Net Estimated Profit: ${formatPKR(totalProfit)}`, 18, y + 12);
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
  doc.text(`Average Margin: ${margin}%`, 115, y + 12);

  y += 22;

  // Table header
  doc.setFillColor(229, 231, 235);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Invoice #', 16, y + 5);
  doc.text('Date & Time', 45, y + 5);
  doc.text('Customer', 85, y + 5);
  doc.text('Payment', 125, y + 5);
  doc.text('Items', 150, y + 5);
  doc.text('Amount (PKR)', pageWidth - 16, y + 5, { align: 'right' });

  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  transactions.slice(0, 35).forEach((txn) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.text(txn.invoiceNumber, 16, y);
    doc.text(formatDateTime(txn.createdAt), 45, y);
    doc.text((txn.customerName || 'Walk-in').slice(0, 20), 85, y);
    doc.text(txn.paymentMethod, 125, y);
    doc.text(String(txn.items.length), 153, y);
    doc.text(`Rs. ${txn.totalAmount.toLocaleString('en-PK')}`, pageWidth - 16, y, { align: 'right' });
    y += 6;
  });

  if (transactions.length > 35) {
    doc.setFont('helvetica', 'italic');
    doc.text(`... and ${transactions.length - 35} more transactions`, 16, y + 2);
  }

  // Footer
  doc.setFontSize(7.5);
  doc.text(
    'Zahid Medical Store &bull; PocketBase Local Offline Architecture &bull; Official Computerized Record',
    pageWidth / 2,
    288,
    { align: 'center' }
  );

  doc.save(`Zahid_Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateInventoryAuditPDF(medicines: MedicineItem[]): void {
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
  doc.text(ZAHID_PHARMACY_DETAILS.name, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${ZAHID_PHARMACY_DETAILS.address}, ${ZAHID_PHARMACY_DETAILS.city}`, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.text(`Physical Inventory Valuation & Shelf Ledger &bull; Drug Licence: ${ZAHID_PHARMACY_DETAILS.drugLicenceNumber}`, pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // Summary
  const totalValue = medicines.reduce(
    (acc, m) => acc + (m.currentStockPacks * m.unitRetailPrice) + ((m.currentStockLoose || 0) * getPieceRetailPrice(m)),
    0
  );
  const totalCost = medicines.reduce(
    (acc, m) => acc + (m.currentStockPacks * m.unitCostPrice) + ((m.currentStockLoose || 0) * (m.unitCostPrice / (m.unitsPerPack || 1))),
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

  // Table header
  doc.setFillColor(229, 231, 235);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Medicine & Formula', 16, y + 5);
  doc.text('Shelf', 72, y + 5);
  doc.text('Stock (P/L)', 96, y + 5);
  doc.text('Pack MRP', 125, y + 5);
  doc.text('Batch', 150, y + 5);
  doc.text('Expiry', pageWidth - 16, y + 5, { align: 'right' });

  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  medicines.forEach((m) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
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

  doc.save(`Zahid_Inventory_Valuation_${new Date().toISOString().slice(0, 10)}.pdf`);
}
