import { DosageForm, MedicineItem } from '../types/pharmacy';

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

