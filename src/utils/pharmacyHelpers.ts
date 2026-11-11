import { DosageForm, MedicineItem, MedicineStockBatchEntry } from '../types/pharmacy';

export function getUnitsPerPack(med: MedicineItem): number {
  return med.unitsPerPack > 0 ? med.unitsPerPack : 1;
}

export function getPieceUnitName(dosageForm: DosageForm): string {
  switch (dosageForm) {
    case 'Tablet':
      return 'Tab';
    case 'Capsule':
      return 'Cap';
    case 'Syrup':
    case 'Suspension':
      return 'Btl';
    case 'Injection':
      return 'Amp';
    case 'Drops':
      return 'Drp';
    case 'Ointment':
    case 'Cream':
      return 'Tube';
    case 'Inhaler':
      return 'Inh';
    case 'Sachet':
      return 'Sach';
    case 'Patch':
      return 'Ptc';
    case 'Infusion':
      return 'Bag';
    default:
      return 'Pcs';
  }
}

export function getPieceRetailPrice(med: MedicineItem): number {
  if (med.looseRetailPrice && med.looseRetailPrice > 0) {
    return med.looseRetailPrice;
  }
  const units = getUnitsPerPack(med);
  return Number((med.unitRetailPrice / units).toFixed(2));
}

export function getPieceCostPrice(med: MedicineItem): number {
  if (med.looseCostPrice && med.looseCostPrice > 0) {
    return med.looseCostPrice;
  }
  const units = getUnitsPerPack(med);
  return Number((med.unitCostPrice / units).toFixed(2));
}

export function getTotalPiecesInStock(med: MedicineItem): number {
  const units = getUnitsPerPack(med);
  return (med.currentStockPacks * units) + (med.currentStockLoose || 0);
}

export function hasSpecialDiscount(med: MedicineItem): boolean {
  return Boolean(med.specialDiscountPercent && med.specialDiscountPercent > 0);
}

export function getSpecialDiscountPercent(med: MedicineItem): number {
  const pct = Number(med.specialDiscountPercent || 0);
  return pct > 0 ? Math.min(90, Math.round(pct * 100) / 100) : 0;
}

export function getDiscountedPackPrice(med: MedicineItem): number {
  const pct = getSpecialDiscountPercent(med);
  if (pct <= 0) return med.unitRetailPrice;
  return Number((med.unitRetailPrice * (1 - pct / 100)).toFixed(2));
}

export function getDiscountedPiecePrice(med: MedicineItem): number {
  const basePiece = getPieceRetailPrice(med);
  const pct = getSpecialDiscountPercent(med);
  if (pct <= 0) return basePiece;
  return Number((basePiece * (1 - pct / 100)).toFixed(2));
}

export function formatPKR(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}

export function formatPKRDecimal(amount: number): string {
  return `Rs. ${Number(amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getDaysUntilExpiry(expiryDateStr: string): number {
  if (!expiryDateStr) return 999;
  const expiry = new Date(expiryDateStr);
  if (isNaN(expiry.getTime())) return 999;
  const now = new Date();
  expiry.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function isExpired(expiryDateStr: string): boolean {
  return getDaysUntilExpiry(expiryDateStr) <= 0;
}

export function isExpiringSoon(expiryDateStr: string, thresholdDays = 90): boolean {
  const days = getDaysUntilExpiry(expiryDateStr);
  return days > 0 && days <= thresholdDays;
}

export function getExpiryWindow(
  expiryDateStr: string
): 'expired' | '30_days' | '60_days' | '90_days' | 'safe' {
  const days = getDaysUntilExpiry(expiryDateStr);
  if (days <= 0) return 'expired';
  if (days <= 30) return '30_days';
  if (days <= 60) return '60_days';
  if (days <= 90) return '90_days';
  return 'safe';
}

export function getExpiryBadgeMeta(expiryDateStr: string): {
  window: 'expired' | '30_days' | '60_days' | '90_days' | 'safe';
  days: number;
  shortLabel: string;
  horizonLabel: string;
  badgeClass: string;
  textClass: string;
} {
  const days = getDaysUntilExpiry(expiryDateStr);
  const window = getExpiryWindow(expiryDateStr);

  if (window === 'expired') {
    return {
      window,
      days,
      shortLabel: days === 0 ? 'Expires Today' : `Expired ${Math.abs(days)}d ago`,
      horizonLabel: 'EXPIRED',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300',
      textClass: 'text-rose-600 font-bold',
    };
  }
  if (window === '30_days') {
    return {
      window,
      days,
      shortLabel: `${days}d left`,
      horizonLabel: '≤ 30 Days',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200',
      textClass: 'text-rose-600 font-bold',
    };
  }
  if (window === '60_days') {
    return {
      window,
      days,
      shortLabel: `${days}d left`,
      horizonLabel: '≤ 60 Days',
      badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
      textClass: 'text-amber-600 font-semibold',
    };
  }
  if (window === '90_days') {
    return {
      window,
      days,
      shortLabel: `${days}d left`,
      horizonLabel: '≤ 90 Days',
      badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200',
      textClass: 'text-sky-700 font-semibold',
    };
  }
  return {
    window,
    days,
    shortLabel: `${days}d`,
    horizonLabel: 'Safe (>90d)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    textClass: 'text-slate-600',
  };
}

/**
 * Returns all stock batch entries for a medicine (using med.stockBatches if defined,
 * or falling back to a single synthesized entry from primary batchNumber & expiryDate).
 */
export function getMedicineStockBatches(med: MedicineItem): MedicineStockBatchEntry[] {
  if (Array.isArray(med.stockBatches) && med.stockBatches.length > 0) {
    return [...med.stockBatches].sort((a, b) => {
      const daysA = a.expiryDate ? getDaysUntilExpiry(a.expiryDate) : 9999;
      const daysB = b.expiryDate ? getDaysUntilExpiry(b.expiryDate) : 9999;
      return daysA - daysB;
    });
  }
  return [
    {
      id: `batch_default_${med.id}`,
      batchNumber: med.batchNumber || 'B-101',
      expiryDate: med.expiryDate || '',
      stockPacks: med.currentStockPacks || 0,
      stockLoose: med.currentStockLoose || 0,
    },
  ];
}

/**
 * Returns the FEFO (First-Expired, First-Out) active non-expired batch entry with stock,
 * or the earliest batch overall if all are out of stock or expired.
 */
export function getEarliestActiveBatch(med: MedicineItem): MedicineStockBatchEntry {
  const batches = getMedicineStockBatches(med);
  const inStockNonExpired = batches.filter(
    (b) =>
      (b.stockPacks > 0 || (b.stockLoose || 0) > 0) &&
      (!b.expiryDate || !isExpired(b.expiryDate))
  );
  if (inStockNonExpired.length > 0) return inStockNonExpired[0];

  const inStockAny = batches.filter((b) => b.stockPacks > 0 || (b.stockLoose || 0) > 0);
  if (inStockAny.length > 0) return inStockAny[0];

  return batches[0];
}

export interface BatchExpiryWarning {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  stockPacks: number;
  stockLoose: number;
  daysRemaining: number;
  window: 'expired' | '30_days' | '60_days' | '90_days' | 'safe';
  shortLabel: string;
  horizonLabel: string;
  badgeClass: string;
}

/**
 * Returns all active stock batches of a medicine that are near expiry (≤ thresholdDays) or expired.
 */
export function getNearExpiryBatches(
  med: MedicineItem,
  thresholdDays = 90
): BatchExpiryWarning[] {
  const batches = getMedicineStockBatches(med);
  const warnings: BatchExpiryWarning[] = [];

  for (const b of batches) {
    if (!b.expiryDate) continue;
    const hasStock = b.stockPacks > 0 || (b.stockLoose || 0) > 0 || batches.length === 1;
    if (!hasStock) continue;

    const days = getDaysUntilExpiry(b.expiryDate);
    if (days <= thresholdDays) {
      const meta = getExpiryBadgeMeta(b.expiryDate);
      warnings.push({
        batchId: b.id,
        batchNumber: b.batchNumber || med.batchNumber || 'Unlabeled',
        expiryDate: b.expiryDate,
        stockPacks: b.stockPacks,
        stockLoose: b.stockLoose || 0,
        daysRemaining: days,
        window: meta.window,
        shortLabel: meta.shortLabel,
        horizonLabel: meta.horizonLabel,
        badgeClass: meta.badgeClass,
      });
    }
  }

  return warnings.sort((a, b) => a.daysRemaining - b.daysRemaining);
}


