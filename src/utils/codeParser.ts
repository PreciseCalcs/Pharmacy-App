import { MedicineItem, SaleTransaction } from '../types/pharmacy';

export interface ParsedCodeResult {
  raw: string;
  barcode: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  serialNumber?: string;
  matchedMedicine?: MedicineItem;
  matchedSale?: SaleTransaction;
}

/**
 * Normalizes a scanned receipt barcode or typed invoice number by stripping surrounding asterisks
 * or prefixes like 'ZMS-INV:' or '#'
 */
export function normalizeInvoiceCode(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^\*+|\*+$/g, '')
    .replace(/^zms-inv:/i, '')
    .replace(/^invoice\s*#?\s*:?\s*/i, '')
    .replace(/^#/, '')
    .trim();
}

/**
 * Finds a matching SaleTransaction from a scanned receipt barcode or typed invoice number
 */
export function findSaleByReceiptCode(
  rawCode: string,
  sales: SaleTransaction[]
): SaleTransaction | undefined {
  if (!rawCode || !Array.isArray(sales) || sales.length === 0) return undefined;
  const cleaned = normalizeInvoiceCode(rawCode).toLowerCase();
  if (!cleaned) return undefined;

  // 1. Exact match on invoiceNumber or transaction id
  const exact = sales.find(
    (s) =>
      s.invoiceNumber.trim().toLowerCase() === cleaned ||
      s.id.trim().toLowerCase() === cleaned
  );
  if (exact) return exact;

  // 2. If user typed just the trailing 4-digit invoice suffix (e.g. "1042" for "ZMS-20261109-1042")
  if (/^\d{3,6}$/.test(cleaned)) {
    return sales.find((s) =>
      s.invoiceNumber.trim().toLowerCase().endsWith(`-${cleaned}`)
    );
  }

  return undefined;
}

/**
 * Parses raw 1D, 2D QR, GS1 DataMatrix, or Receipt Invoice Barcode scanned by camera or hardware barcode gun
 */
export function parseScannedCode(
  rawCode: string,
  medicines: MedicineItem[],
  sales?: SaleTransaction[]
): ParsedCodeResult {
  const trimmed = rawCode.trim();

  // 0. Check if the scanned code matches a Sale Receipt Invoice Barcode first
  if (sales && sales.length > 0) {
    const matchedReceipt = findSaleByReceiptCode(trimmed, sales);
    if (matchedReceipt) {
      return {
        raw: trimmed,
        barcode: matchedReceipt.invoiceNumber,
        matchedSale: matchedReceipt,
      };
    }
  }

  // 1. Try parsing JSON format (used in internal custom QR labels or QR receipts)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (sales && (parsed.invoiceNumber || parsed.invoice || parsed.txnId)) {
        const invKey = parsed.invoiceNumber || parsed.invoice || parsed.txnId;
        const matchedSale = findSaleByReceiptCode(String(invKey), sales);
        if (matchedSale) {
          return {
            raw: trimmed,
            barcode: matchedSale.invoiceNumber,
            matchedSale,
          };
        }
      }

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
