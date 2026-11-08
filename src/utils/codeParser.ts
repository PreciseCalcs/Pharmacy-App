import { MedicineItem } from '../types/pharmacy';

export interface ParsedCodeResult {
  raw: string;
  barcode: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  serialNumber?: string;
  matchedMedicine?: MedicineItem;
}

/**
 * Parses raw 1D, 2D QR, or GS1 DataMatrix code scanned by camera or hardware barcode gun
 */
export function parseScannedCode(
  rawCode: string,
  medicines: MedicineItem[]
): ParsedCodeResult {
  const trimmed = rawCode.trim();

  // 1. Try parsing JSON format (used in internal custom QR labels)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const barcode = parsed.barcode || parsed.sku || parsed.id || '';
      const matched = medicines.find(
        (m) =>
          m.id === parsed.id ||
          (barcode && m.barcode === barcode) ||
          (barcode && m.sku === barcode)
      );
      return {
        raw: trimmed,
        barcode: barcode || trimmed,
        batchNumber: parsed.batchNumber || parsed.batch,
        expiryDate: parsed.expiryDate || parsed.expiry,
        matchedMedicine: matched,
      };
    } catch {
      // Not JSON, continue to other formats
    }
  }

  // 2. Try parsing GS1 DataMatrix (e.g. (01)08901234567890(17)261231(10)B1042)
  if (trimmed.includes('(01)') || trimmed.startsWith('01')) {
    let gtin = '';
    let expiry = '';
    let batch = '';

    const gtinMatch = trimmed.match(/(?:\(01\)|01)(\d{14})/);
    if (gtinMatch) gtin = gtinMatch[1];

    const expMatch = trimmed.match(/(?:\(17\)|17)(\d{6})/);
    if (expMatch) {
      const expRaw = expMatch[1]; // YYMMDD
      const year = `20${expRaw.slice(0, 2)}`;
      const month = expRaw.slice(2, 4);
      const day = expRaw.slice(4, 6);
      expiry = `${year}-${month}-${day}`;
    }

    const batchMatch = trimmed.match(/(?:\(10\)|10)([A-Za-z0-9-_]+)/);
    if (batchMatch) batch = batchMatch[1];

    const matched = medicines.find(
      (m) =>
        m.barcode === gtin ||
        (m.barcode && gtin.endsWith(m.barcode)) ||
        (batch && m.batchNumber.toLowerCase() === batch.toLowerCase())
    );

    return {
      raw: trimmed,
      barcode: gtin || trimmed,
      batchNumber: batch || undefined,
      expiryDate: expiry || undefined,
      matchedMedicine: matched,
    };
  }

  // 3. Standard 1D barcode or plain text (EAN-13, Code-128, SKU, etc.)
  const matched = medicines.find(
    (m) =>
      m.barcode.trim().toLowerCase() === trimmed.toLowerCase() ||
      m.sku.trim().toLowerCase() === trimmed.toLowerCase() ||
      m.id.toLowerCase() === trimmed.toLowerCase()
  );

  return {
    raw: trimmed,
    barcode: trimmed,
    matchedMedicine: matched,
  };
}
