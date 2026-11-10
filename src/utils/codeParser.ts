import { DosageForm, MedicineCategory, MedicineItem, SaleTransaction } from '../types/pharmacy';

export interface ParsedCodeResult {
  raw: string;
  barcode: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  serialNumber?: string;
  productName?: string;
  genericName?: string;
  strength?: string;
  dosageForm?: DosageForm;
  dosageFormLabel?: string;
  category?: MedicineCategory;
  unitRetailPrice?: number;
  unitsPerPack?: number;
  isGS1DataMatrix?: boolean;
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
 * Converts a 6-digit GS1 YYMMDD string into YYYY-MM-DD.
 * Handles DD === '00' as the last day of that month per GS1 specification.
 */
function parseGS1ExpiryYYMMDD(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  const dd = parseInt(yymmdd.slice(4, 6), 10);

  if (mm < 1 || mm > 12) return undefined;
  const fullYear = 2000 + yy;
  const lastDayOfMonth = new Date(fullYear, mm, 0).getDate();
  const validDay = dd === 0 ? lastDayOfMonth : Math.min(dd, lastDayOfMonth);

  return `${fullYear}-${String(mm).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
}

/**
 * Parses AI (240) pharmaceutical product string such as:
 * "Flutiaze137/50NS120spRs.830.00" or "Augmentin625mgTabRs.470.00"
 */
function parseAI240ProductPayload(raw240: string): {
  productName?: string;
  strength?: string;
  dosageForm?: DosageForm;
  dosageFormLabel?: string;
  category?: MedicineCategory;
  unitRetailPrice?: number;
  unitsPerPack?: number;
} {
  let working = raw240.trim().replace(/\.+$/, '');
  if (!working) return {};

  let unitRetailPrice: number | undefined;

  // 1. Extract MRP Price (e.g., Rs.830.00, Rs. 830, PKR 830.00)
  const priceMatch = working.match(/(?:Rs\.?|PKR\.?)\s*(\d+(?:\.\d{1,2})?)/i);
  if (priceMatch) {
    const parsedPrice = parseFloat(priceMatch[1]);
    if (!isNaN(parsedPrice) && parsedPrice > 0) {
      unitRetailPrice = parsedPrice;
    }
    working = working.slice(0, priceMatch.index).trim();
  }

  // 2. Extract Brand / Product Name (leading alphabetic words before strength digits)
  let productName: string | undefined;
  let specRemainder = working;

  const brandMatch = working.match(/^([A-Za-z][A-Za-z\s-]*?)(?=\d|$)/);
  if (brandMatch) {
    productName = brandMatch[1].replace(/[-_]+$/g, '').trim();
    specRemainder = working.slice(brandMatch[0].length).trim();
  }

  // 3. Extract Strength (e.g., "137/50", "500mg", "20mg", "100mg/5ml")
  let strength: string | undefined;
  let formRemainder = specRemainder;

  const strengthMatch = specRemainder.match(
    /^(\d+(?:[./]\d+)*(?:\s*(?:mg|mcg|g|ml|iu|%))?)/i
  );
  if (strengthMatch) {
    strength = strengthMatch[1].trim();
    formRemainder = specRemainder.slice(strengthMatch[0].length).trim();
  }

  // 4. Determine DosageForm & Category from remaining descriptors (e.g., "NS120sp", "Tab", "Cap", "Syr")
  let dosageForm: DosageForm | undefined;
  let dosageFormLabel: string | undefined;
  let category: MedicineCategory | undefined;
  let unitsPerPack: number | undefined;

  const combinedDescriptor = `${specRemainder} ${formRemainder}`.toLowerCase();

  if (
    /ns\b|ns\d|nasal|spray|\d+\s*sp\b|drop/i.test(formRemainder) ||
    /ns\d+sp/i.test(specRemainder)
  ) {
    dosageForm = 'Drops';
    dosageFormLabel = /ns|nasal|sp/i.test(formRemainder)
      ? 'Drops / Nasal Spray'
      : 'Drops';
    category = 'ENT';
    unitsPerPack = 1;
  } else if (/inh|evohaler|rotacap|resp/i.test(combinedDescriptor)) {
    dosageForm = 'Inhaler';
    dosageFormLabel = 'Inhaler';
    category = 'Respiratory';
    unitsPerPack = 1;
  } else if (/tab/i.test(combinedDescriptor)) {
    dosageForm = 'Tablet';
    dosageFormLabel = 'Tablet';
  } else if (/cap/i.test(combinedDescriptor)) {
    dosageForm = 'Capsule';
    dosageFormLabel = 'Capsule';
  } else if (/syr/i.test(combinedDescriptor)) {
    dosageForm = 'Syrup';
    dosageFormLabel = 'Syrup';
    unitsPerPack = 1;
  } else if (/susp/i.test(combinedDescriptor)) {
    dosageForm = 'Suspension';
    dosageFormLabel = 'Suspension';
    unitsPerPack = 1;
  } else if (/inj|vial|amp/i.test(combinedDescriptor)) {
    dosageForm = 'Injection';
    dosageFormLabel = 'Injection';
    unitsPerPack = 1;
  } else if (/cream|\bcr\b/i.test(combinedDescriptor)) {
    dosageForm = 'Cream';
    dosageFormLabel = 'Cream';
    category = 'Dermatology';
    unitsPerPack = 1;
  } else if (/oint/i.test(combinedDescriptor)) {
    dosageForm = 'Ointment';
    dosageFormLabel = 'Ointment';
    category = 'Dermatology';
    unitsPerPack = 1;
  } else if (/sach/i.test(combinedDescriptor)) {
    dosageForm = 'Sachet';
    dosageFormLabel = 'Sachet';
  } else if (/inf/i.test(combinedDescriptor)) {
    dosageForm = 'Infusion';
    dosageFormLabel = 'Infusion';
    unitsPerPack = 1;
  }

  return {
    productName,
    strength,
    dosageForm,
    dosageFormLabel,
    category,
    unitRetailPrice,
    unitsPerPack,
  };
}

/**
 * Decodes raw or bracketed GS1 DataMatrix strings (including DRAP Pakistan AI 240 extensions).
 * Example: "01089640042395191727093010005240Flutiaze137/50NS120spRs.830.0021009095."
 */
function parseGS1DataMatrixString(trimmed: string): Omit<
  ParsedCodeResult,
  'raw' | 'matchedMedicine' | 'matchedSale'
> | null {
  // Strip optional GS1 symbology prefixes like ]d2 or ]C1
  const clean = trimmed.replace(/^\][A-Za-z]\d/, '').trim();

  const hasBrackets = /\(01\)\d{14}/.test(clean);
  const startsWithRaw01 = /^01\d{14}/.test(clean);

  if (!hasBrackets && !startsWithRaw01) {
    return null;
  }

  let gtin = '';
  let expiryDate: string | undefined;
  let batchNumber: string | undefined;
  let serialNumber: string | undefined;
  let ai240Raw = '';

  if (hasBrackets) {
    const gtinMatch = clean.match(/\(01\)(\d{14})/);
    if (gtinMatch) gtin = gtinMatch[1];

    const expMatch = clean.match(/\(17\)(\d{6})/);
    if (expMatch) expiryDate = parseGS1ExpiryYYMMDD(expMatch[1]);

    const batchMatch = clean.match(/\(10\)([^()]+)/);
    if (batchMatch) batchNumber = batchMatch[1].replace(/\x1d/g, '').trim();

    const ai240Match = clean.match(/\(240\)([^()]+)/);
    if (ai240Match) ai240Raw = ai240Match[1].replace(/\x1d/g, '').trim();

    const serialMatch = clean.match(/\(21\)([^()]+)/);
    if (serialMatch) {
      serialNumber = serialMatch[1].replace(/\x1d/g, '').replace(/\.+$/, '').trim();
    }
  } else {
    // Unbracketed raw stream: e.g. 01089640042395191727093010005240Flutiaze137/50NS120spRs.830.0021009095.
    gtin = clean.slice(2, 16);
    let cursor = clean.slice(16);

    // Check if 17 (Expiry Date) is at the start of cursor or anywhere before 10
    if (cursor.startsWith('17') && /^\d{8}/.test(cursor)) {
      expiryDate = parseGS1ExpiryYYMMDD(cursor.slice(2, 8));
      cursor = cursor.slice(8);
    } else {
      const expIdx = cursor.search(/17\d{6}/);
      if (expIdx === 0) {
        expiryDate = parseGS1ExpiryYYMMDD(cursor.slice(2, 8));
        cursor = cursor.slice(8);
      }
    }

    // Strip any leading Group Separator (\x1d)
    cursor = cursor.replace(/^\x1d+/, '');

    // Extract Batch (AI 10), Additional Info (AI 240), and Serial (AI 21)
    if (cursor.startsWith('10')) {
      const after10 = cursor.slice(2);

      // Look for AI 240 boundary: either \x1d240 or 240 followed by a brand letter [A-Za-z]
      const ai240Match = after10.match(/(?:\x1d240|240(?=[A-Za-z]))/);
      if (ai240Match && ai240Match.index !== undefined) {
        batchNumber = after10.slice(0, ai240Match.index).replace(/\x1d/g, '').trim();
        let after240 = after10.slice(ai240Match.index + ai240Match[0].length);

        // Inside after240, check if AI 21 (Serial Number) follows the price or a \x1d separator
        const gs21Match = after240.match(/\x1d21([A-Za-z0-9._-]+)$/);
        if (gs21Match && gs21Match.index !== undefined) {
          serialNumber = gs21Match[1].replace(/\.+$/, '');
          ai240Raw = after240.slice(0, gs21Match.index);
        } else {
          const priceAndSerialMatch = after240.match(
            /((?:Rs\.?|PKR\.?)\s*\d+(?:\.\d{1,2})?)21([A-Za-z0-9._-]+)$/i
          );
          if (priceAndSerialMatch && priceAndSerialMatch.index !== undefined) {
            const priceEndIdx =
              priceAndSerialMatch.index + priceAndSerialMatch[1].length;
            ai240Raw = after240.slice(0, priceEndIdx);
            serialNumber = priceAndSerialMatch[2].replace(/\.+$/, '');
          } else {
            ai240Raw = after240.replace(/\.+$/, '');
          }
        }
      } else {
        // No AI 240 present; check if AI 21 is separated by \x1d
        const gs21 = after10.split('\x1d21');
        batchNumber = gs21[0].replace(/\x1d/g, '').replace(/\.+$/, '').trim();
        if (gs21[1]) {
          serialNumber = gs21[1].replace(/\.+$/, '').trim();
        }
      }
    }
  }

  const parsed240 = parseAI240ProductPayload(ai240Raw);

  return {
    barcode: gtin || clean,
    batchNumber: batchNumber || undefined,
    expiryDate,
    serialNumber: serialNumber || undefined,
    productName: parsed240.productName,
    strength: parsed240.strength,
    dosageForm: parsed240.dosageForm,
    dosageFormLabel: parsed240.dosageFormLabel,
    category: parsed240.category,
    unitRetailPrice: parsed240.unitRetailPrice,
    unitsPerPack: parsed240.unitsPerPack,
    isGS1DataMatrix: true,
  };
}

/**
 * Parses raw 1D, 2D QR, GS1 DataMatrix, or Receipt Invoice Barcode scanned by camera or hardware barcode gun
 */
export function parseScannedCode(
  rawCode: string,
  medicines: MedicineItem[],
  sales?: SaleTransaction[]
): ParsedCodeResult {
  const trimmed = (rawCode || '').trim();

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

  // 2. Try parsing GS1 DataMatrix (both raw e.g. 01089640042395191727093010005240Flutiaze137/50NS120spRs.830.0021009095. and bracketed)
  const gs1Result = parseGS1DataMatrixString(trimmed);
  if (gs1Result) {
    const gtin = gs1Result.barcode;
    const gtinNoLeadingZero = gtin.replace(/^0+/, '');

    const matched = medicines.find((m) => {
      const medCode = (m.barcode || '').trim();
      const medNoZero = medCode.replace(/^0+/, '');
      if (medCode && (medCode === gtin || medNoZero === gtinNoLeadingZero)) {
        return true;
      }
      if (medCode.length >= 8 && gtin.endsWith(medCode)) {
        return true;
      }
      if (
        gs1Result.productName &&
        m.name.toLowerCase().includes(gs1Result.productName.toLowerCase())
      ) {
        return true;
      }
      return false;
    });

    return {
      raw: trimmed,
      ...gs1Result,
      matchedMedicine: matched,
    };
  }

  // 3. Standard 1D barcode or plain text (EAN-13, Code-128, SKU, etc.)
  const trimmedNoZero = trimmed.replace(/^0+/, '');
  const matched = medicines.find((m) => {
    const medBar = (m.barcode || '').trim().toLowerCase();
    const medBarNoZero = medBar.replace(/^0+/, '');
    const cleanLower = trimmed.toLowerCase();
    return (
      medBar === cleanLower ||
      (medBarNoZero && medBarNoZero === trimmedNoZero.toLowerCase()) ||
      (m.sku || '').trim().toLowerCase() === cleanLower ||
      m.id.toLowerCase() === cleanLower
    );
  });

  return {
    raw: trimmed,
    barcode: trimmed,
    matchedMedicine: matched,
  };
}
