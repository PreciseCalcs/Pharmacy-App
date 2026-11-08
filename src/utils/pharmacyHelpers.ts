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
  const now = new Date();
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
