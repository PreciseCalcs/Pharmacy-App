import * as XLSX from 'xlsx';
import { MedicineItem, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { formatDateTime } from '../utils/dates';
import { getPieceCostPrice, getPieceRetailPrice, getTotalPiecesInStock, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';

export function exportInventoryToExcel(medicines: MedicineItem[]): void {
  const data = medicines.map((m) => {
    const totalPieces = getTotalPiecesInStock(m);
    const totalInventoryValue = (m.currentStockPacks * m.unitRetailPrice) + ((m.currentStockLoose || 0) * getPieceRetailPrice(m));
    const totalCostValue = (m.currentStockPacks * m.unitCostPrice) + ((m.currentStockLoose || 0) * getPieceCostPrice(m));

    return {
      'Item ID': m.id,
      'Medicine Name': m.name,
      'Generic Formula': m.genericName,
      'Dosage Form': m.dosageForm,
      'Strength': m.strength,
      'Category': m.category,
      'Barcode / EAN': m.barcode,
      'Internal SKU': m.sku,
      'Packs in Stock': m.currentStockPacks,
      'Loose Pieces': m.currentStockLoose || 0,
      'Units Per Pack': m.unitsPerPack,
      'Total Loose Units': totalPieces,
      'Pack Cost (PKR)': m.unitCostPrice,
      'Pack Retail (PKR)': m.unitRetailPrice,
      'Loose Piece Retail (PKR)': getPieceRetailPrice(m),
      'Total Stock Cost (PKR)': totalCostValue,
      'Total Stock Value (PKR)': totalInventoryValue,
      'Batch Number': m.batchNumber,
      'Expiry Date': m.expiryDate,
      'Shelf Location': m.shelfLocation,
      'Manufacturer': m.manufacturer,
      'Requires Prescription': m.requiresPrescription ? 'Yes' : 'No',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory Stock');

  const fileName = `Zahid_Medical_Store_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportSalesToExcel(sales: SaleTransaction[]): void {
  const flattened: Array<Record<string, unknown>> = [];

  sales.forEach((txn) => {
    txn.items.forEach((item) => {
      flattened.push({
        'Invoice #': txn.invoiceNumber,
        'Date & Time': formatDateTime(txn.createdAt),
        'Customer Name': txn.customerName,
        'Customer Phone': txn.customerPhone || '',
        'Dispensing Staff': txn.staffName,
        'Payment Method': txn.paymentMethod,
        'Item Name': item.medicineName,
        'Generic Name': item.genericName,
        'Unit Type': item.unitType,
        'Quantity': item.quantity,
        'Unit Rate (PKR)': item.pricePerUnit,
        'Item Subtotal (PKR)': item.subtotal,
        'Item Profit (PKR)': item.profit,
        'Invoice Subtotal (PKR)': txn.subtotal,
        'Discount (PKR)': txn.discountAmount,
        'Net Invoice Total (PKR)': txn.totalAmount,
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(flattened);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Register');

  const fileName = `Zahid_Medical_Store_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportExpiryAuditToExcel(medicines: MedicineItem[]): void {
  const auditData = medicines
    .filter((m) => isExpired(m.expiryDate) || isExpiringSoon(m.expiryDate, 120))
    .map((m) => {
      const expired = isExpired(m.expiryDate);
      return {
        'Status': expired ? 'EXPIRED' : 'EXPIRING SOON',
        'Medicine Name': m.name,
        'Generic': m.genericName,
        'Batch': m.batchNumber,
        'Expiry Date': m.expiryDate,
        'Packs in Stock': m.currentStockPacks,
        'Loose Pieces': m.currentStockLoose || 0,
        'Shelf Location': m.shelfLocation,
        'Cost Value at Risk (PKR)': (m.currentStockPacks * m.unitCostPrice) + ((m.currentStockLoose || 0) * getPieceCostPrice(m)),
        'Manufacturer': m.manufacturer,
      };
    });

  const ws = XLSX.utils.json_to_sheet(auditData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expiry & Risk Audit');

  const fileName = `Zahid_Medical_Store_Expiry_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function downloadMedicineImportTemplate(): void {
  const template = [
    {
      'Medicine Name': 'Panadol 500mg',
      'Generic Formula': 'Paracetamol',
      'Category': 'Analgesics & Pain',
      'Dosage Form': 'Tablet',
      'Strength': '500mg',
      'Barcode': '896400010001',
      'SKU': 'PAN-500-TAB',
      'Units Per Pack': 200,
      'Pack Cost Price': 520,
      'Pack Retail Price': 640,
      'Loose Retail Price': 3.2,
      'Current Packs': 15,
      'Current Loose': 40,
      'Min Threshold Packs': 5,
      'Batch Number': 'B-8910',
      'Expiry Date (YYYY-MM-DD)': '2027-08-31',
      'Shelf Location': 'Rack A-01',
      'Manufacturer': 'GSK Pakistan',
      'Requires Prescription (true/false)': 'false',
    },
    {
      'Medicine Name': 'Augmentin 625mg',
      'Generic Formula': 'Amoxicillin + Clavulanic Acid',
      'Category': 'Antibiotics',
      'Dosage Form': 'Tablet',
      'Strength': '625mg',
      'Barcode': '896400010002',
      'SKU': 'AUG-625-TAB',
      'Units Per Pack': 14,
      'Pack Cost Price': 380,
      'Pack Retail Price': 460,
      'Loose Retail Price': 33,
      'Current Packs': 22,
      'Current Loose': 6,
      'Min Threshold Packs': 8,
      'Batch Number': 'B-7721',
      'Expiry Date (YYYY-MM-DD)': '2026-11-30',
      'Shelf Location': 'Rack B-03',
      'Manufacturer': 'GSK Pakistan',
      'Requires Prescription (true/false)': 'true',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Template');

  XLSX.writeFile(wb, 'Zahid_Medicine_Import_Template.xlsx');
}

export async function parseMedicineExcelFile(file: File): Promise<Partial<MedicineItem>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(sheet);

        const parsed: Partial<MedicineItem>[] = rows.map((r, idx) => {
          const name = String(r['Medicine Name'] || r['name'] || '').trim();
          const generic = String(r['Generic Formula'] || r['genericName'] || '').trim();
          const barcode = String(r['Barcode'] || r['barcode'] || '').trim();
          const sku = String(r['SKU'] || r['sku'] || `SKU-${Date.now()}-${idx}`).trim();
          const category = (r['Category'] || r['category'] || 'General / Other') as any;
          const dosageForm = (r['Dosage Form'] || r['dosageForm'] || 'Tablet') as any;
          const strength = String(r['Strength'] || r['strength'] || '').trim();
          const unitsPerPack = Number(r['Units Per Pack'] || r['unitsPerPack'] || 1) || 1;
          const unitCostPrice = Number(r['Pack Cost Price'] || r['unitCostPrice'] || 0) || 0;
          const unitRetailPrice = Number(r['Pack Retail Price'] || r['unitRetailPrice'] || 0) || 0;
          const looseRetailPrice = Number(r['Loose Retail Price'] || r['looseRetailPrice'] || (unitRetailPrice / unitsPerPack).toFixed(2));
          const currentStockPacks = Number(r['Current Packs'] || r['currentStockPacks'] || 0) || 0;
          const currentStockLoose = Number(r['Current Loose'] || r['currentStockLoose'] || 0) || 0;
          const minThresholdPacks = Number(r['Min Threshold Packs'] || r['minThresholdPacks'] || 5) || 5;
          const batchNumber = String(r['Batch Number'] || r['batchNumber'] || 'B-NEW').trim();
          const expiryDate = String(r['Expiry Date (YYYY-MM-DD)'] || r['Expiry Date'] || r['expiryDate'] || '2027-12-31').trim();
          const shelfLocation = String(r['Shelf Location'] || r['shelfLocation'] || 'General').trim();
          const manufacturer = String(r['Manufacturer'] || r['manufacturer'] || 'Local').trim();
          const reqPres = String(r['Requires Prescription (true/false)'] || r['requiresPrescription']).toLowerCase() === 'true';

          return {
            name: name || `Imported Medicine ${idx + 1}`,
            genericName: generic || 'Generic',
            category,
            dosageForm,
            strength,
            barcode: barcode || `BC-${Date.now()}-${idx}`,
            sku,
            unitsPerPack,
            unitCostPrice,
            unitRetailPrice,
            looseCostPrice: Number((unitCostPrice / unitsPerPack).toFixed(2)),
            looseRetailPrice,
            currentStockPacks,
            currentStockLoose,
            minThresholdPacks,
            batchNumber,
            expiryDate,
            shelfLocation,
            manufacturer,
            requiresPrescription: reqPres,
          };
        });

        resolve(parsed.filter((p) => p.name));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}
