import { MedicineItem, ProductDepartment, SaleTransaction } from '../types/pharmacy';

export interface ProductSalesTrackRecord {
  medicineId: string;
  name: string;
  genericName: string;
  category: string;
  department: ProductDepartment;
  departmentLabel: string;
  dosageForm: string;
  strength: string;
  invoiceCount: number; // Number of distinct sales receipts containing this product
  packsSold: number;
  looseUnitsSold: number;
  totalUnitsSold: number; // Sum of raw line quantities
  totalPiecesDispensed: number; // Standardized in individual pieces
  totalRevenue: number;
  totalProfit: number;
  revenueSharePercent: number;
  profitMarginPercent: number;
  lastSoldAt: string;
  currentStockPacks: number;
  currentStockLoose: number;
  minThresholdPacks: number;
  isLowStock: boolean;
  velocityTier: 'fast_mover' | 'steady' | 'occasional' | 'no_sales';
}

export function resolveDepartment(
  med?: MedicineItem,
  fallbackCategory?: string
): { department: ProductDepartment; label: string } {
  const dept = med?.department;
  const cat = med?.category || fallbackCategory || '';

  if (
    dept === 'personal_care' ||
    cat === 'Personal Care & Sexual Wellness' ||
    cat === 'Feminine Hygiene & Care' ||
    cat === 'Personal Hygiene & Grooming'
  ) {
    return { department: 'personal_care', label: 'Personal Care & Wellness' };
  }
  if (dept === 'mother_baby' || cat === 'Baby & Mother Care') {
    return { department: 'mother_baby', label: 'Mother & Baby' };
  }
  if (dept === 'general_store' || cat === 'General Store & FMCG') {
    return { department: 'general_store', label: 'General Store & FMCG' };
  }
  if (dept === 'surgical' || cat === 'Medical Devices & Surgical') {
    return { department: 'surgical', label: 'Devices & Surgical' };
  }
  return { department: 'pharmacy', label: 'Medicine' };
}

/**
 * Aggregates 100% real completed sales transactions into a comprehensive
 * Product & Medicine Sales Track Record (Velocity & Frequency Leaderboard).
 */
export function buildProductSalesTrackRecord(
  sales: SaleTransaction[],
  medicines: MedicineItem[],
  includeUnsoldCatalog = false
): ProductSalesTrackRecord[] {
  const completedSales = sales.filter((s) => s.status !== 'refunded');

  const medMap = new Map<string, MedicineItem>();
  medicines.forEach((m) => medMap.set(m.id, m));

  const totalStoreRevenue = completedSales.reduce(
    (sum, s) => sum + (s.totalAmount || 0),
    0
  );

  const recordMap = new Map<
    string,
    {
      medicineId: string;
      name: string;
      genericName: string;
      category: string;
      department: ProductDepartment;
      departmentLabel: string;
      dosageForm: string;
      strength: string;
      invoiceIds: Set<string>;
      packsSold: number;
      looseUnitsSold: number;
      totalUnitsSold: number;
      totalPiecesDispensed: number;
      totalRevenue: number;
      totalProfit: number;
      lastSoldAt: string;
    }
  >();

  completedSales.forEach((txn) => {
    const discountRatio =
      txn.subtotal > 0 ? Math.max(0, (txn.subtotal - (txn.discountAmount || 0)) / txn.subtotal) : 1;

    txn.items.forEach((item) => {
      const key = item.medicineId || item.medicineName.trim().toLowerCase();
      const catalogMed = medMap.get(item.medicineId);
      const { department, label: departmentLabel } = resolveDepartment(
        catalogMed,
        catalogMed?.category
      );
      const unitsPerPack =
        catalogMed?.unitsPerPack && catalogMed.unitsPerPack > 0
          ? catalogMed.unitsPerPack
          : item.unitsPerPack > 0
          ? item.unitsPerPack
          : 1;

      const existing = recordMap.get(key);
      const isPack = item.unitType === 'pack';
      const packsToAdd = isPack ? item.quantity : 0;
      const looseToAdd = isPack ? 0 : item.quantity;
      const piecesToAdd = isPack ? item.quantity * unitsPerPack : item.quantity;
      const netItemRevenue = Number((item.subtotal * discountRatio).toFixed(2));
      const netItemProfit = Number(
        (item.profit - item.subtotal * (1 - discountRatio)).toFixed(2)
      );

      if (existing) {
        existing.invoiceIds.add(txn.id);
        existing.packsSold += packsToAdd;
        existing.looseUnitsSold += looseToAdd;
        existing.totalUnitsSold += item.quantity;
        existing.totalPiecesDispensed += piecesToAdd;
        existing.totalRevenue = Number((existing.totalRevenue + netItemRevenue).toFixed(2));
        existing.totalProfit = Number((existing.totalProfit + netItemProfit).toFixed(2));
        if (txn.createdAt > existing.lastSoldAt) {
          existing.lastSoldAt = txn.createdAt;
        }
      } else {
        recordMap.set(key, {
          medicineId: item.medicineId,
          name: catalogMed?.name || item.medicineName,
          genericName: catalogMed?.genericName || item.genericName || 'General Item',
          category: catalogMed?.category || 'General / Other',
          department,
          departmentLabel,
          dosageForm: catalogMed?.dosageForm || item.dosageForm || 'Pack',
          strength: catalogMed?.strength || '',
          invoiceIds: new Set([txn.id]),
          packsSold: packsToAdd,
          looseUnitsSold: looseToAdd,
          totalUnitsSold: item.quantity,
          totalPiecesDispensed: piecesToAdd,
          totalRevenue: netItemRevenue,
          totalProfit: netItemProfit,
          lastSoldAt: txn.createdAt,
        });
      }
    });
  });

  if (includeUnsoldCatalog) {
    medicines.forEach((med) => {
      if (!recordMap.has(med.id)) {
        const { department, label: departmentLabel } = resolveDepartment(med, med.category);
        recordMap.set(med.id, {
          medicineId: med.id,
          name: med.name,
          genericName: med.genericName,
          category: med.category,
          department,
          departmentLabel,
          dosageForm: med.dosageForm,
          strength: med.strength,
          invoiceIds: new Set(),
          packsSold: 0,
          looseUnitsSold: 0,
          totalUnitsSold: 0,
          totalPiecesDispensed: 0,
          totalRevenue: 0,
          totalProfit: 0,
          lastSoldAt: '',
        });
      }
    });
  }

  const rawList = Array.from(recordMap.values());
  const maxInvoices = Math.max(1, ...rawList.map((r) => r.invoiceIds.size));
  const maxUnits = Math.max(1, ...rawList.map((r) => r.totalUnitsSold));

  return rawList
    .map((r) => {
      const catalogMed = medMap.get(r.medicineId);
      const currentStockPacks = catalogMed ? catalogMed.currentStockPacks : 0;
      const currentStockLoose = catalogMed ? catalogMed.currentStockLoose || 0 : 0;
      const minThresholdPacks = catalogMed ? catalogMed.minThresholdPacks || 5 : 5;
      const invoiceCount = r.invoiceIds.size;

      // Classify velocity tier based on receipt frequency or unit volume
      let velocityTier: 'fast_mover' | 'steady' | 'occasional' | 'no_sales' = 'occasional';
      if (invoiceCount === 0 && r.totalUnitsSold === 0) {
        velocityTier = 'no_sales';
      } else if (
        invoiceCount >= 3 ||
        (maxInvoices > 1 && invoiceCount >= maxInvoices * 0.6) ||
        r.totalUnitsSold >= Math.max(5, maxUnits * 0.6)
      ) {
        velocityTier = 'fast_mover';
      } else if (invoiceCount >= 2 || r.totalUnitsSold >= 3) {
        velocityTier = 'steady';
      }

      const revenueSharePercent =
        totalStoreRevenue > 0
          ? Number(((r.totalRevenue / totalStoreRevenue) * 100).toFixed(1))
          : 0;
      const profitMarginPercent =
        r.totalRevenue > 0
          ? Number(((r.totalProfit / r.totalRevenue) * 100).toFixed(1))
          : 0;

      return {
        medicineId: r.medicineId,
        name: r.name,
        genericName: r.genericName,
        category: r.category,
        department: r.department,
        departmentLabel: r.departmentLabel,
        dosageForm: r.dosageForm,
        strength: r.strength,
        invoiceCount,
        packsSold: r.packsSold,
        looseUnitsSold: r.looseUnitsSold,
        totalUnitsSold: r.totalUnitsSold,
        totalPiecesDispensed: r.totalPiecesDispensed,
        totalRevenue: Math.round(r.totalRevenue),
        totalProfit: Math.round(r.totalProfit),
        revenueSharePercent,
        profitMarginPercent,
        lastSoldAt: r.lastSoldAt,
        currentStockPacks,
        currentStockLoose,
        minThresholdPacks,
        isLowStock: catalogMed ? currentStockPacks <= minThresholdPacks : false,
        velocityTier,
      };
    })
    .sort((a, b) => {
      if (b.invoiceCount !== a.invoiceCount) return b.invoiceCount - a.invoiceCount;
      if (b.totalUnitsSold !== a.totalUnitsSold) return b.totalUnitsSold - a.totalUnitsSold;
      return b.totalRevenue - a.totalRevenue;
    });
}
