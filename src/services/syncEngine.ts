import { pb, checkPocketBaseHealth } from '../lib/pocketbase';
import { 
  MedicineItem, 
  SaleTransaction, 
  SaleItem, 
  ConnectionStatus,
  StockAlert,
  PharmacyDetails,
  DEFAULT_PHARMACY_DETAILS,
  PharmacyCounter,
  DEFAULT_COUNTERS,
  CustomerKhata,
  KhataEntry,
  INITIAL_KHATA_CUSTOMERS,
  UserAccount,
  ExpenseRecord,
  MonthlyAuditSnapshot,
  ShortBookEntry
} from '../types/pharmacy';
import { INITIAL_ZAHID_MEDICINES } from '../data/initialMedicines';
import { getDaysUntilExpiry, getTotalPiecesInStock, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';
import { staffAuth } from './staffAuth';

export interface PharmacyBackupSnapshot {
  schemaVersion: string;
  application: string;
  exportedAt: string;
  pharmacyDetails: PharmacyDetails;
  counters: PharmacyCounter[];
  activeCounter: string;
  medicines: MedicineItem[];
  sales: SaleTransaction[];
  khataCustomers: CustomerKhata[];
  staffAccounts: UserAccount[];
  expenses?: ExpenseRecord[];
  auditSnapshots?: MonthlyAuditSnapshot[];
  shortBook?: ShortBookEntry[];
}

const INVENTORY_STORAGE_KEY = 'zahid_med_inventory_v2';
const SALES_STORAGE_KEY = 'zahid_med_sales_v2';
const OUTBOX_STORAGE_KEY = 'zahid_med_outbox_v1';
const SETTINGS_STORAGE_KEY = 'zahid_pharmacy_settings_v1';
const COUNTERS_STORAGE_KEY = 'zahid_counters_v1';
const ACTIVE_COUNTER_KEY = 'zahid_active_counter_v1';
const KHATA_STORAGE_KEY = 'zahid_khata_customers_v1';
const EXPENSES_STORAGE_KEY = 'zahid_pharmacy_expenses_v1';
const AUDIT_SNAPSHOTS_KEY = 'zahid_monthly_audits_v1';
const SHORT_BOOK_STORAGE_KEY = 'zahid_short_book_v1';

export class PharmacySyncEngine {
  private medicines: MedicineItem[] = [];
  private sales: SaleTransaction[] = [];
  private outbox: Array<{ id: string; action: string; payload: unknown; createdAt: string }> = [];
  private pharmacyDetails: PharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
  private counters: PharmacyCounter[] = [...DEFAULT_COUNTERS];
  private activeCounter: string = 'Main Counter';
  private khataCustomers: CustomerKhata[] = [...INITIAL_KHATA_CUSTOMERS];
  private expenses: ExpenseRecord[] = [];
  private auditSnapshots: MonthlyAuditSnapshot[] = [];
  private shortBook: ShortBookEntry[] = [];
  private subscribers: Array<() => void> = [];

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    try {
      // 1. Load Inventory
      const savedMeds = localStorage.getItem(INVENTORY_STORAGE_KEY);
      if (savedMeds) {
        const parsed = JSON.parse(savedMeds) as MedicineItem[];
        // Merge in any newly added catalog items (e.g. personal care, condoms, general store) if not already present
        const existingIds = new Set(parsed.map((m) => m.id));
        const missingNewItems = INITIAL_ZAHID_MEDICINES.filter((m) => !existingIds.has(m.id));
        this.medicines = missingNewItems.length > 0 ? [...parsed, ...missingNewItems] : parsed;

        // Ensure sample items demonstrate 30, 60, and 90-day near-expiry windows
        const expiryMigratedKey = 'zahid_expiry_30_60_90_v1';
        if (!localStorage.getItem(expiryMigratedKey)) {
          const seedMap = new Map(INITIAL_ZAHID_MEDICINES.map((m) => [m.id, m.expiryDate]));
          const targetDemoIds = new Set([
            'med_augmentin_625',
            'med_flagyl_400',
            'med_novidat_500',
            'med_arinac_forte',
            'gen_nestle_cerelac_wheat',
            'med_gravinate_50',
          ]);
          this.medicines = this.medicines.map((m) => {
            if (targetDemoIds.has(m.id) && seedMap.has(m.id)) {
              return { ...m, expiryDate: seedMap.get(m.id)! };
            }
            return m;
          });
          localStorage.setItem(expiryMigratedKey, 'true');
        }

        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(this.medicines));
      } else {
        this.medicines = [...INITIAL_ZAHID_MEDICINES];
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(this.medicines));
        localStorage.setItem('zahid_expiry_30_60_90_v1', 'true');
      }

      // 2. Load Sales
      const savedSales = localStorage.getItem(SALES_STORAGE_KEY);
      if (savedSales) {
        this.sales = JSON.parse(savedSales);
      } else {
        this.sales = [];
      }

      // 3. Load Outbox
      const savedOutbox = localStorage.getItem(OUTBOX_STORAGE_KEY);
      if (savedOutbox) {
        this.outbox = JSON.parse(savedOutbox);
      } else {
        this.outbox = [];
      }

      // 4. Load Settings
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        this.pharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS, ...JSON.parse(savedSettings) };
      } else {
        this.pharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.pharmacyDetails));
      }

      // 5. Load Counters
      const savedCounters = localStorage.getItem(COUNTERS_STORAGE_KEY);
      if (savedCounters) {
        this.counters = JSON.parse(savedCounters);
      } else {
        this.counters = [...DEFAULT_COUNTERS];
        localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(this.counters));
      }

      const savedActiveCounter = localStorage.getItem(ACTIVE_COUNTER_KEY);
      if (savedActiveCounter) {
        this.activeCounter = savedActiveCounter;
      } else {
        this.activeCounter = this.counters[0]?.name || 'Main Counter';
      }

      // 6. Load Khata Customers
      const savedKhata = localStorage.getItem(KHATA_STORAGE_KEY);
      if (savedKhata) {
        this.khataCustomers = JSON.parse(savedKhata);
      } else {
        this.khataCustomers = [...INITIAL_KHATA_CUSTOMERS];
        localStorage.setItem(KHATA_STORAGE_KEY, JSON.stringify(this.khataCustomers));
      }

      // 7. Load Expenses & Monthly Audit Snapshots
      const savedExpenses = localStorage.getItem(EXPENSES_STORAGE_KEY);
      this.expenses = savedExpenses ? JSON.parse(savedExpenses) : [];

      const savedAudits = localStorage.getItem(AUDIT_SNAPSHOTS_KEY);
      this.auditSnapshots = savedAudits ? JSON.parse(savedAudits) : [];

      // 8. Load Counter Short Book (Want List)
      const savedShortBook = localStorage.getItem(SHORT_BOOK_STORAGE_KEY);
      this.shortBook = savedShortBook ? JSON.parse(savedShortBook) : [];
    } catch (e) {
      console.warn('Failed to initialize local pharmacy store, falling back to defaults', e);
      this.medicines = [...INITIAL_ZAHID_MEDICINES];
      this.sales = [];
      this.outbox = [];
      this.pharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
      this.counters = [...DEFAULT_COUNTERS];
      this.activeCounter = 'Main Counter';
      this.khataCustomers = [...INITIAL_KHATA_CUSTOMERS];
      this.expenses = [];
      this.auditSnapshots = [];
      this.shortBook = [];
    }
  }

  public subscribe(callback: () => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  private notify(): void {
    this.subscribers.forEach((s) => {
      try {
        s();
      } catch (err) {
        console.error('Subscriber notification error:', err);
      }
    });
  }

  // --- Pharmacy Settings ---
  public getPharmacyDetails(): PharmacyDetails {
    return { ...this.pharmacyDetails };
  }

  public async updatePharmacyDetails(updates: Partial<PharmacyDetails>): Promise<PharmacyDetails> {
    this.pharmacyDetails = {
      ...this.pharmacyDetails,
      ...updates,
    };
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.pharmacyDetails));
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
    this.enqueueOutbox('UPDATE_SETTINGS', this.pharmacyDetails);
    this.notify();

    try {
      await this.syncSettingsRecord(this.pharmacyDetails);
    } catch {}

    return this.pharmacyDetails;
  }

  // --- Counters ---
  public getCounters(): PharmacyCounter[] {
    return [...this.counters];
  }

  public getActiveCounter(): string {
    return this.activeCounter;
  }

  public setActiveCounter(name: string): void {
    this.activeCounter = name;
    try {
      localStorage.setItem(ACTIVE_COUNTER_KEY, name);
    } catch {}
    this.notify();
  }

  public addCounter(counter: Omit<PharmacyCounter, 'id'>): PharmacyCounter {
    const newCounter: PharmacyCounter = {
      ...counter,
      id: `cnt_${Date.now()}`,
    };
    this.counters.push(newCounter);
    try {
      localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(this.counters));
    } catch {}
    this.notify();
    return newCounter;
  }

  public deleteCounter(id: string): boolean {
    if (this.counters.length <= 1) return false;
    this.counters = this.counters.filter((c) => c.id !== id);
    if (!this.counters.some((c) => c.name === this.activeCounter)) {
      this.activeCounter = this.counters[0].name;
      try {
        localStorage.setItem(ACTIVE_COUNTER_KEY, this.activeCounter);
      } catch {}
    }
    try {
      localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(this.counters));
    } catch {}
    this.notify();
    return true;
  }

  // --- Credit Khata Management ---
  public getKhataCustomers(): CustomerKhata[] {
    return [...this.khataCustomers];
  }

  public getKhataCustomer(id: string): CustomerKhata | undefined {
    return this.khataCustomers.find((c) => c.id === id);
  }

  public getTotalOutstandingKhata(): number {
    return this.khataCustomers.reduce((sum, c) => sum + (c.balanceDue > 0 ? c.balanceDue : 0), 0);
  }

  public getKhataAccountsWithBalanceCount(): number {
    return this.khataCustomers.filter((c) => c.balanceDue > 0).length;
  }

  public async addKhataCustomer(data: { name: string; phone: string; address?: string; initialBalance?: number }): Promise<CustomerKhata> {
    const id = `kht_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const initBal = Number(data.initialBalance || 0);

    const history: KhataEntry[] = [];
    if (initBal > 0) {
      history.push({
        id: `ent_init_${Date.now()}`,
        type: 'sale',
        description: 'Opening balance due',
        amount: initBal,
        date: new Date().toISOString(),
      });
    }

    const newCustomer: CustomerKhata = {
      id,
      name: data.name.trim(),
      phone: data.phone.trim(),
      address: data.address?.trim() || '',
      balanceDue: initBal,
      history,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.khataCustomers.unshift(newCustomer);
    this.saveKhata();
    this.enqueueOutbox('ADD_KHATA_CUSTOMER', newCustomer);
    this.notify();

    try {
      await this.upsertPbRecord('customers_khata', newCustomer.id, newCustomer);
    } catch {}

    return newCustomer;
  }

  public async recordKhataPayment(
    customerId: string,
    amount: number,
    paymentMethod: string = 'Cash',
    note?: string
  ): Promise<CustomerKhata> {
    const customer = this.khataCustomers.find((c) => c.id === customerId);
    if (!customer) throw new Error('Customer account not found');

    const paymentAmount = Math.max(0, Number(amount));
    customer.balanceDue = Math.max(0, customer.balanceDue - paymentAmount);
    customer.updatedAt = new Date().toISOString();

    const entry: KhataEntry = {
      id: `ent_pay_${Date.now()}`,
      type: 'payment',
      description: `Payment · ${paymentMethod}${note ? ` · ${note}` : ''}`,
      amount: paymentAmount,
      paymentMethod,
      date: new Date().toISOString(),
      note,
    };

    customer.history.unshift(entry);
    this.saveKhata();
    this.enqueueOutbox('RECORD_KHATA_PAYMENT', {
      customerId,
      customer: { ...customer },
    });
    this.notify();

    try {
      await this.upsertPbRecord('customers_khata', customerId, customer);
    } catch {}

    return customer;
  }

  public async recordKhataCreditSale(
    customerId: string,
    invoiceNumber: string,
    amount: number,
    note?: string
  ): Promise<CustomerKhata> {
    const customer = this.khataCustomers.find((c) => c.id === customerId);
    if (!customer) throw new Error('Customer account not found');

    const saleAmount = Math.max(0, Number(amount));
    customer.balanceDue += saleAmount;
    customer.updatedAt = new Date().toISOString();

    const entry: KhataEntry = {
      id: `ent_sale_${Date.now()}`,
      type: 'sale',
      invoiceNumber,
      description: `Credit sale · ${invoiceNumber}${note ? ` · ${note}` : ''}`,
      amount: saleAmount,
      paymentMethod: 'Credit',
      date: new Date().toISOString(),
      note,
    };

    customer.history.unshift(entry);
    this.saveKhata();
    this.enqueueOutbox('RECORD_KHATA_SALE', {
      customerId,
      customer: { ...customer },
    });
    this.notify();

    try {
      await this.upsertPbRecord('customers_khata', customerId, customer);
    } catch {}

    return customer;
  }

  public async deleteKhataCustomer(customerId: string): Promise<boolean> {
    this.khataCustomers = this.khataCustomers.filter((c) => c.id !== customerId);
    this.saveKhata();
    this.enqueueOutbox('DELETE_KHATA_CUSTOMER', { customerId });
    this.notify();

    try {
      await pb.collection('customers_khata').delete(this.toPbId(customerId));
    } catch {}

    return true;
  }

  private saveKhata(): void {
    try {
      localStorage.setItem(KHATA_STORAGE_KEY, JSON.stringify(this.khataCustomers));
    } catch (e) {
      console.error('Failed to save khata to localStorage', e);
    }
  }

  // --- Inventory & Sales ---
  public getMedicines(): MedicineItem[] {
    return [...this.medicines];
  }

  public getSales(): SaleTransaction[] {
    return [...this.sales];
  }

  public getOutboxCount(): number {
    return this.outbox.length;
  }

  public getAlerts(): StockAlert[] {
    const alerts: StockAlert[] = [];

    this.medicines.forEach((m) => {
      const days = getDaysUntilExpiry(m.expiryDate);
      const totalPieces = getTotalPiecesInStock(m);
      const atRiskValue = Math.round(
        m.currentStockPacks * (m.unitCostPrice || 0) +
          (m.currentStockLoose || 0) * (m.looseCostPrice || 0)
      );

      if (isExpired(m.expiryDate)) {
        alerts.push({
          id: `alert_exp_${m.id}`,
          medicineId: m.id,
          name: m.name,
          batchNumber: m.batchNumber,
          expiryDate: m.expiryDate,
          expiryWindow: 'expired',
          shelfLocation: m.shelfLocation,
          atRiskValue,
          type: 'expired',
          urgency: 'high',
          message: `${m.name} (Batch ${m.batchNumber}) EXPIRED on ${m.expiryDate}. Quarantine & remove from shelf immediately!`,
          daysRemaining: days,
          currentStock: m.currentStockPacks,
          threshold: m.minThresholdPacks,
        });
      } else if (isExpiringSoon(m.expiryDate, 90)) {
        const expiryWindow =
          days <= 30 ? '30_days' : days <= 60 ? '60_days' : '90_days';
        const urgency =
          days <= 30 ? 'high' : days <= 60 ? 'medium' : 'low';
        const windowLabel =
          days <= 30
            ? '30-Day Critical Window'
            : days <= 60
            ? '60-Day Warning Window'
            : '90-Day Watch Window';
        const actionAdvice =
          days <= 30
            ? 'Return to distributor or dispense immediately to prevent waste.'
            : days <= 60
            ? 'Prioritize FEFO counter dispensing first.'
            : 'Monitor batch turnover closely.';

        alerts.push({
          id: `alert_exps_${m.id}`,
          medicineId: m.id,
          name: m.name,
          batchNumber: m.batchNumber,
          expiryDate: m.expiryDate,
          expiryWindow,
          shelfLocation: m.shelfLocation,
          atRiskValue,
          type: 'expiring_soon',
          urgency,
          message: `[${windowLabel}] ${m.name} expires in ${days} days (${m.expiryDate}). ${actionAdvice}`,
          daysRemaining: days,
          currentStock: m.currentStockPacks,
          threshold: m.minThresholdPacks,
        });
      }

      if (totalPieces === 0) {
        alerts.push({
          id: `alert_oos_${m.id}`,
          medicineId: m.id,
          name: m.name,
          batchNumber: m.batchNumber,
          expiryDate: m.expiryDate,
          shelfLocation: m.shelfLocation,
          type: 'out_of_stock',
          urgency: 'high',
          message: `${m.name} is completely OUT OF STOCK. Reorder required.`,
          currentStock: 0,
          threshold: m.minThresholdPacks,
        });
      } else if (m.currentStockPacks <= m.minThresholdPacks) {
        alerts.push({
          id: `alert_low_${m.id}`,
          medicineId: m.id,
          name: m.name,
          batchNumber: m.batchNumber,
          expiryDate: m.expiryDate,
          shelfLocation: m.shelfLocation,
          type: 'low_stock',
          urgency: 'medium',
          message: `${m.name} has only ${m.currentStockPacks} packs left (Threshold: ${m.minThresholdPacks}).`,
          currentStock: m.currentStockPacks,
          threshold: m.minThresholdPacks,
        });
      }
    });

    return alerts.sort((a, b) => {
      const urgencyRank = { high: 3, medium: 2, low: 1 };
      if (urgencyRank[b.urgency] !== urgencyRank[a.urgency]) {
        return urgencyRank[b.urgency] - urgencyRank[a.urgency];
      }
      return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
    });
  }

  public async addMedicine(item: Omit<MedicineItem, 'id' | 'created' | 'updated'>): Promise<MedicineItem> {
    const newItem: MedicineItem = {
      ...item,
      id: `med_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    this.medicines.unshift(newItem);
    this.saveMedicines();
    this.enqueueOutbox('ADD_MEDICINE', newItem);
    this.notify();

    try {
      await this.upsertPbRecord('medicines', newItem.id, newItem);
    } catch {}

    return newItem;
  }

  public async updateMedicine(id: string, updates: Partial<MedicineItem>): Promise<MedicineItem> {
    const idx = this.medicines.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error('Medicine not found in catalog');

    const current = this.medicines[idx];
    const nextPacks = updates.currentStockPacks ?? current.currentStockPacks;
    const nextThreshold = updates.minThresholdPacks ?? current.minThresholdPacks ?? 5;

    // Automatically clear 'ordered' status once stock is replenished above threshold
    const autoResetReorder =
      updates.reorderStatus === undefined &&
      nextPacks > nextThreshold &&
      current.reorderStatus === 'ordered';

    const finalUpdates: Partial<MedicineItem> = {
      ...updates,
      ...(autoResetReorder ? { reorderStatus: 'needed', orderedAt: undefined } : {}),
    };

    const updated: MedicineItem = {
      ...current,
      ...finalUpdates,
      updated: new Date().toISOString(),
    };

    this.medicines[idx] = updated;
    this.saveMedicines();
    this.enqueueOutbox('UPDATE_MEDICINE', { id, updates: finalUpdates, fullItem: updated });
    this.notify();

    try {
      await this.upsertPbRecord('medicines', id, updated);
    } catch {}

    return updated;
  }

  public async deleteMedicine(id: string): Promise<boolean> {
    this.medicines = this.medicines.filter((m) => m.id !== id);
    this.saveMedicines();
    this.enqueueOutbox('DELETE_MEDICINE', { id });
    this.notify();

    try {
      await pb.collection('medicines').delete(this.toPbId(id));
    } catch {}

    return true;
  }

  // Generate sequential collision-safe invoice numbers (e.g., ZMS-20261109-1043)
  private generateInvoiceNumber(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}`;

    let maxSeq = 1000 + this.sales.length;
    this.sales.forEach((s) => {
      const match = s.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq && num < 999999) {
          maxSeq = num;
        }
      }
    });

    return `ZMS-${datePart}-${maxSeq + 1}`;
  }

  // Bulk Upsert for Excel Inventory Import (Matches by ID, SKU, or Barcode)
  public async bulkUpsertMedicines(
    items: Partial<MedicineItem>[]
  ): Promise<{ added: number; updated: number }> {
    let added = 0;
    let updated = 0;
    const nowIso = new Date().toISOString();

    for (const raw of items) {
      if (!raw.name || !raw.name.trim()) continue;

      const cleanSku = (raw.sku || '').trim().toLowerCase();
      const cleanBarcode = (raw.barcode || '').trim().toLowerCase();

      const existingIdx = this.medicines.findIndex(
        (m) =>
          (raw.id && m.id === raw.id) ||
          (cleanSku && m.sku.trim().toLowerCase() === cleanSku) ||
          (cleanBarcode && m.barcode.trim().toLowerCase() === cleanBarcode)
      );

      if (existingIdx > -1) {
        const current = this.medicines[existingIdx];
        const merged: MedicineItem = {
          ...current,
          ...raw,
          id: current.id,
          updated: nowIso,
        };
        this.medicines[existingIdx] = merged;
        this.enqueueOutbox('UPDATE_MEDICINE', { id: current.id, updates: raw, fullItem: merged });
        updated++;
      } else {
        const units = Number(raw.unitsPerPack) > 0 ? Number(raw.unitsPerPack) : 1;
        const unitCost = Math.max(0, Number(raw.unitCostPrice) || 0);
        const unitRetail = Math.max(0, Number(raw.unitRetailPrice) || 0);
        const newItem: MedicineItem = {
          id: `med_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${added}`,
          name: raw.name.trim(),
          genericName: (raw.genericName || 'Generic').trim(),
          barcode: (raw.barcode || `BC-${Date.now()}-${added}`).trim(),
          sku: (raw.sku || `SKU-${Date.now()}-${added}`).trim(),
          category: raw.category || 'General / Other',
          department: raw.department || 'pharmacy',
          dosageForm: raw.dosageForm || 'Tablet',
          strength: (raw.strength || '').trim(),
          unitsPerPack: units,
          unitCostPrice: unitCost,
          unitRetailPrice: unitRetail,
          looseCostPrice: Number(raw.looseCostPrice) || Number((unitCost / units).toFixed(2)),
          looseRetailPrice: Number(raw.looseRetailPrice) || Number((unitRetail / units).toFixed(2)),
          currentStockPacks: Math.max(0, Number(raw.currentStockPacks) || 0),
          currentStockLoose: Math.max(0, Number(raw.currentStockLoose) || 0),
          minThresholdPacks: Math.max(0, Number(raw.minThresholdPacks) || 5),
          batchNumber: (raw.batchNumber || 'B-NEW').trim(),
          expiryDate: (raw.expiryDate || '2027-12-31').trim(),
          shelfLocation: (raw.shelfLocation || 'Main Shelf').trim(),
          manufacturer: (raw.manufacturer || 'Local').trim(),
          requiresPrescription: Boolean(raw.requiresPrescription),
          supplier: raw.supplier,
          notes: raw.notes,
          imageUrl: raw.imageUrl,
          created: nowIso,
          updated: nowIso,
        };
        this.medicines.unshift(newItem);
        this.enqueueOutbox('ADD_MEDICINE', newItem);
        added++;
      }
    }

    this.saveMedicines();
    this.notify();
    return { added, updated };
  }

  // Dispense Register / Process Sale Transaction with strict stock & expiry checks
  public async processSale(transactionData: {
    items: SaleItem[];
    customerName: string;
    customerPhone?: string;
    customerId?: string;
    counterName?: string;
    staffName: string;
    staffRole: any;
    paymentMethod: any;
    discountPercent: number;
    receivedAmount: number;
    notes?: string;
  }): Promise<SaleTransaction> {
    const {
      items,
      customerName,
      customerPhone,
      customerId,
      counterName,
      staffName,
      staffRole,
      paymentMethod,
      discountPercent,
      receivedAmount,
      notes,
    } = transactionData;

    if (!items || items.length === 0) {
      throw new Error('Cannot process an empty sale.');
    }

    // 0. Pre-validate expiry and total available pieces per medicine across all cart lines
    const requiredPiecesByMed = new Map<string, number>();
    for (const item of items) {
      const med = this.medicines.find((m) => m.id === item.medicineId);
      if (!med) {
        throw new Error(`Item "${item.medicineName}" no longer exists in inventory.`);
      }
      if (isExpired(med.expiryDate)) {
        throw new Error(
          `Cannot dispense "${med.name}" (Batch ${med.batchNumber}) because it expired on ${med.expiryDate}.`
        );
      }
      const unitsPerPack = med.unitsPerPack > 0 ? med.unitsPerPack : 1;
      const piecesToDeduct = item.unitType === 'pack' ? item.quantity * unitsPerPack : item.quantity;
      requiredPiecesByMed.set(
        med.id,
        (requiredPiecesByMed.get(med.id) || 0) + piecesToDeduct
      );
    }

    for (const [medId, requestedPieces] of requiredPiecesByMed.entries()) {
      const med = this.medicines.find((m) => m.id === medId)!;
      const availablePieces = getTotalPiecesInStock(med);
      if (requestedPieces > availablePieces) {
        throw new Error(
          `Insufficient stock for "${med.name}". Requested ${requestedPieces} total units, but only ${availablePieces} available.`
        );
      }
    }

    const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    const discountAmount = Math.round((subtotal * (discountPercent || 0)) / 100);
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const totalProfit = Number(
      (items.reduce((sum, item) => sum + item.profit, 0) - discountAmount).toFixed(2)
    );
    const finalReceived = receivedAmount > 0 ? receivedAmount : totalAmount;
    const changeAmount = Math.max(0, finalReceived - totalAmount);

    const invoiceNumber = this.generateInvoiceNumber();

    const newTransaction: SaleTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      invoiceNumber,
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPhone: customerPhone?.trim() || undefined,
      customerId,
      counterName: counterName || this.activeCounter,
      staffName,
      staffRole,
      paymentMethod,
      items,
      subtotal,
      discountPercent: discountPercent || 0,
      discountAmount,
      totalAmount,
      totalProfit,
      receivedAmount: finalReceived,
      changeAmount,
      status: 'completed',
      notes,
      createdAt: new Date().toISOString(),
    };

    // 1. Accurately decrement inventory stock (handles pack-breaking without phantom loose units)
    items.forEach((item) => {
      const med = this.medicines.find((m) => m.id === item.medicineId);
      if (!med) return;

      const unitsPerPack = med.unitsPerPack > 0 ? med.unitsPerPack : 1;

      if (item.unitType === 'pack') {
        if (med.currentStockPacks >= item.quantity) {
          med.currentStockPacks -= item.quantity;
        } else {
          // If loose pieces make up the remaining pack quantity
          const totalAfter = Math.max(0, getTotalPiecesInStock(med) - item.quantity * unitsPerPack);
          med.currentStockPacks = Math.floor(totalAfter / unitsPerPack);
          med.currentStockLoose = totalAfter % unitsPerPack;
        }
      } else {
        let currentLoose = med.currentStockLoose || 0;
        if (currentLoose >= item.quantity) {
          med.currentStockLoose = currentLoose - item.quantity;
        } else {
          const deficitLoose = item.quantity - currentLoose;
          const packsToBreak = Math.min(
            med.currentStockPacks,
            Math.ceil(deficitLoose / unitsPerPack)
          );
          med.currentStockPacks = Math.max(0, med.currentStockPacks - packsToBreak);
          currentLoose += packsToBreak * unitsPerPack;
          med.currentStockLoose = Math.max(0, currentLoose - item.quantity);
        }
      }
      med.updated = new Date().toISOString();
    });

    // 2. If Payment Method is 'Credit', link to customer's Khata
    if (paymentMethod === 'Credit') {
      let targetCustomer: CustomerKhata | undefined;
      if (customerId) {
        targetCustomer = this.khataCustomers.find((c) => c.id === customerId);
      } else if (customerPhone) {
        targetCustomer = this.khataCustomers.find(
          (c) => c.phone.replace(/\s+/g, '') === customerPhone.replace(/\s+/g, '')
        );
      } else if (customerName && customerName !== 'Walk-in Customer') {
        targetCustomer = this.khataCustomers.find(
          (c) => c.name.toLowerCase() === customerName.toLowerCase()
        );
      }

      if (targetCustomer) {
        targetCustomer.balanceDue += totalAmount;
        targetCustomer.updatedAt = new Date().toISOString();
        targetCustomer.history.unshift({
          id: `ent_sale_${Date.now()}`,
          type: 'sale',
          invoiceNumber,
          description: `Credit sale · ${invoiceNumber}`,
          amount: totalAmount,
          paymentMethod: 'Credit',
          date: new Date().toISOString(),
          note: notes,
        });
        this.saveKhata();
        this.enqueueOutbox('RECORD_KHATA_SALE', {
          customerId: targetCustomer.id,
          customer: { ...targetCustomer },
        });
      } else if (customerName && customerName !== 'Walk-in Customer') {
        const newKhata: CustomerKhata = {
          id: `kht_${Date.now()}`,
          name: customerName.trim(),
          phone: customerPhone?.trim() || '',
          balanceDue: totalAmount,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          history: [
            {
              id: `ent_sale_${Date.now()}`,
              type: 'sale',
              invoiceNumber,
              description: `Credit sale · ${invoiceNumber}`,
              amount: totalAmount,
              paymentMethod: 'Credit',
              date: new Date().toISOString(),
            },
          ],
        };
        this.khataCustomers.unshift(newKhata);
        this.saveKhata();
        this.enqueueOutbox('ADD_KHATA_CUSTOMER', newKhata);
      }
    }

    // 3. Save locally
    this.sales.unshift(newTransaction);
    this.saveMedicines();
    this.saveSales();
    this.enqueueOutbox('PROCESS_SALE', newTransaction);
    this.notify();

    // 4. Push to PocketBase live collection if available
    try {
      await this.upsertPbRecord('sales', newTransaction.id, newTransaction);
      for (const item of items) {
        const med = this.medicines.find((m) => m.id === item.medicineId);
        if (med) {
          await this.upsertPbRecord('medicines', med.id, med);
        }
      }
      if (paymentMethod === 'Credit') {
        const syncedCustomer = this.khataCustomers.find(
          (c) =>
            (customerId && c.id === customerId) ||
            c.name.toLowerCase() === customerName.trim().toLowerCase()
        );
        if (syncedCustomer) {
          await this.upsertPbRecord('customers_khata', syncedCustomer.id, syncedCustomer);
        }
      }
    } catch (err) {
      console.warn('PocketBase sync deferred to outbox queue:', err);
    }

    return newTransaction;
  }

  public async linkBarcode(medicineId: string, newBarcode: string): Promise<MedicineItem> {
    return this.updateMedicine(medicineId, { barcode: newBarcode.trim() });
  }

  /**
   * Processes a sale return / refund:
   * 1. Marks the sale transaction as 'refunded' with staff name, reason, and timestamp.
   * 2. Restores returned pack and loose quantities back into inventory (consolidating loose pieces into packs if applicable).
   * 3. If the sale was paid via 'Credit', reduces the customer's Khata balanceDue and logs a 'refund' history entry.
   */
  public async refundSale(
    transactionId: string,
    staffName: string,
    reason?: string
  ): Promise<SaleTransaction> {
    const txnIndex = this.sales.findIndex((s) => s.id === transactionId);
    if (txnIndex === -1) {
      throw new Error('Sale transaction not found.');
    }

    const txn = this.sales[txnIndex];
    if (txn.status === 'refunded') {
      throw new Error(`Invoice ${txn.invoiceNumber} has already been refunded.`);
    }

    const nowIso = new Date().toISOString();
    const cleanReason = reason?.trim() || 'Customer return';

    // 1. Restore inventory stock for each returned item
    for (const item of txn.items) {
      const med = this.medicines.find((m) => m.id === item.medicineId);
      if (!med) continue;

      const unitsPerPack =
        med.unitsPerPack > 0 ? med.unitsPerPack : item.unitsPerPack > 0 ? item.unitsPerPack : 1;

      if (item.unitType === 'pack') {
        med.currentStockPacks += item.quantity;
      } else {
        const totalLoose = (med.currentStockLoose || 0) + item.quantity;
        if (unitsPerPack > 1 && totalLoose >= unitsPerPack) {
          const wholePacksRestored = Math.floor(totalLoose / unitsPerPack);
          med.currentStockPacks += wholePacksRestored;
          med.currentStockLoose = totalLoose % unitsPerPack;
        } else if (unitsPerPack <= 1) {
          med.currentStockPacks += item.quantity;
          med.currentStockLoose = 0;
        } else {
          med.currentStockLoose = totalLoose;
        }
      }

      // Reset reorder status if restored stock now exceeds safety threshold
      if (
        med.currentStockPacks > (med.minThresholdPacks || 5) &&
        med.reorderStatus === 'ordered'
      ) {
        med.reorderStatus = 'needed';
        med.orderedAt = undefined;
      }

      med.updated = nowIso;
      this.enqueueOutbox('UPDATE_MEDICINE', {
        id: med.id,
        updates: {
          currentStockPacks: med.currentStockPacks,
          currentStockLoose: med.currentStockLoose,
          reorderStatus: med.reorderStatus,
          orderedAt: med.orderedAt,
        },
        fullItem: { ...med },
      });
    }

    // 2. If Credit sale, adjust customer's Khata balance and record a refund entry
    let updatedCustomer: CustomerKhata | undefined;
    if (txn.paymentMethod === 'Credit') {
      if (txn.customerId) {
        updatedCustomer = this.khataCustomers.find((c) => c.id === txn.customerId);
      }
      if (!updatedCustomer && txn.customerPhone) {
        updatedCustomer = this.khataCustomers.find(
          (c) =>
            c.phone.replace(/\s+/g, '') === txn.customerPhone!.replace(/\s+/g, '')
        );
      }
      if (!updatedCustomer && txn.customerName) {
        updatedCustomer = this.khataCustomers.find(
          (c) => c.name.toLowerCase() === txn.customerName.trim().toLowerCase()
        );
      }

      if (updatedCustomer) {
        updatedCustomer.balanceDue = Math.max(0, updatedCustomer.balanceDue - txn.totalAmount);
        updatedCustomer.updatedAt = nowIso;
        updatedCustomer.history.unshift({
          id: `ent_ref_${Date.now()}`,
          type: 'refund',
          invoiceNumber: txn.invoiceNumber,
          description: `Sale Refund · ${txn.invoiceNumber} (${cleanReason})`,
          amount: txn.totalAmount,
          paymentMethod: 'Credit Refund',
          date: nowIso,
          note: cleanReason,
        });
        this.saveKhata();
        this.enqueueOutbox('RECORD_KHATA_PAYMENT', {
          customerId: updatedCustomer.id,
          customer: { ...updatedCustomer },
        });
      }
    }

    // 3. Mark transaction as refunded
    const refundedTxn: SaleTransaction = {
      ...txn,
      status: 'refunded',
      refundedAt: nowIso,
      refundedBy: staffName,
      refundReason: cleanReason,
    };

    this.sales[txnIndex] = refundedTxn;
    this.saveMedicines();
    this.saveSales();
    this.enqueueOutbox('REFUND_SALE', refundedTxn);
    this.notify();

    // 4. Attempt immediate PocketBase sync
    try {
      await this.upsertPbRecord('sales', refundedTxn.id, refundedTxn);
      for (const item of refundedTxn.items) {
        const med = this.medicines.find((m) => m.id === item.medicineId);
        if (med) {
          await this.upsertPbRecord('medicines', med.id, med);
        }
      }
      if (updatedCustomer) {
        await this.upsertPbRecord('customers_khata', updatedCustomer.id, updatedCustomer);
      }
    } catch {}

    return refundedTxn;
  }

  /**
   * Normalizes any local string ID into a deterministic 15-character lowercase alphanumeric ID
   * required by PocketBase's primary key constraint (`[a-z0-9]{15}`).
   */
  private toPbId(rawId: string): string {
    const clean = (rawId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.length === 15) return clean;
    if (clean.length > 15) {
      // Combine prefix and suffix so timestamps + random suffixes stay unique
      return clean.slice(0, 7) + clean.slice(-8);
    }
    // Pad deterministically to 15 chars
    const padSource = 'zms0123456789pb';
    return (clean + padSource).slice(0, 15);
  }

  /**
   * Upserts a record into a PocketBase collection using deterministic 15-char IDs
   */
  private async upsertPbRecord(
    collectionName: string,
    rawId: string,
    data: Record<string, any>
  ): Promise<void> {
    const pbId = this.toPbId(rawId);
    const { id: _ignoredId, created: _c, updated: _u, ...rest } = data;
    try {
      await pb.collection(collectionName).update(pbId, rest);
    } catch {
      await pb.collection(collectionName).create({
        id: pbId,
        ...rest,
      });
    }
  }

  /**
   * Upserts the singleton pharmacy_settings record in PocketBase
   */
  private async syncSettingsRecord(details: PharmacyDetails): Promise<void> {
    const settingsId = this.toPbId('zms_settings_singleton');
    await this.upsertPbRecord('pharmacy_settings', settingsId, details as Record<string, any>);
  }

  // Full Outbox sync when PocketBase is reachable
  public async syncWithPocketBase(): Promise<{ synced: number; failed: number }> {
    const health = await checkPocketBaseHealth();
    if (!health.isPocketBaseLive) {
      return { synced: 0, failed: this.outbox.length };
    }

    let synced = 0;
    let failed = 0;
    const remainingOutbox = [];

    for (const item of this.outbox) {
      try {
        switch (item.action) {
          case 'PROCESS_SALE':
          case 'REFUND_SALE': {
            const sale = item.payload as SaleTransaction;
            await this.upsertPbRecord('sales', sale.id, sale as Record<string, any>);
            // Also ensure updated stock levels for sold/returned items are synced to PocketBase
            if (Array.isArray(sale.items)) {
              for (const soldItem of sale.items) {
                const currentMed = this.medicines.find((m) => m.id === soldItem.medicineId);
                if (currentMed) {
                  await this.upsertPbRecord('medicines', currentMed.id, currentMed);
                }
              }
            }
            break;
          }
          case 'ADD_MEDICINE': {
            const med = item.payload as MedicineItem;
            await this.upsertPbRecord('medicines', med.id, med as Record<string, any>);
            break;
          }
          case 'UPDATE_MEDICINE': {
            const { id, updates, fullItem } = item.payload as {
              id: string;
              updates: Partial<MedicineItem>;
              fullItem?: MedicineItem;
            };
            const targetMed = fullItem || this.medicines.find((m) => m.id === id);
            if (targetMed) {
              await this.upsertPbRecord('medicines', id, targetMed as Record<string, any>);
            } else {
              await pb.collection('medicines').update(this.toPbId(id), updates);
            }
            break;
          }
          case 'DELETE_MEDICINE': {
            const { id } = item.payload as { id: string };
            try {
              await pb.collection('medicines').delete(this.toPbId(id));
            } catch {}
            break;
          }
          case 'ADD_KHATA_CUSTOMER': {
            const customer = item.payload as CustomerKhata;
            await this.upsertPbRecord(
              'customers_khata',
              customer.id,
              customer as Record<string, any>
            );
            break;
          }
          case 'RECORD_KHATA_PAYMENT':
          case 'RECORD_KHATA_SALE': {
            const { customerId, customer } = item.payload as {
              customerId: string;
              customer?: CustomerKhata;
            };
            const targetCustomer =
              customer || this.khataCustomers.find((c) => c.id === customerId);
            if (targetCustomer) {
              await this.upsertPbRecord(
                'customers_khata',
                customerId,
                targetCustomer as Record<string, any>
              );
            }
            break;
          }
          case 'DELETE_KHATA_CUSTOMER': {
            const { customerId } = item.payload as { customerId: string };
            try {
              await pb.collection('customers_khata').delete(this.toPbId(customerId));
            } catch {}
            break;
          }
          case 'UPDATE_SETTINGS': {
            const details = item.payload as PharmacyDetails;
            await this.syncSettingsRecord(details);
            break;
          }
          default:
            break;
        }
        synced++;
      } catch (err) {
        console.warn(`Outbox item push failed (${item.action}):`, err);
        failed++;
        remainingOutbox.push(item);
      }
    }

    this.outbox = remainingOutbox;
    this.saveOutbox();
    this.notify();

    return { synced, failed };
  }

  // --- Monthly Financial Audit & Expense Ledger ---
  public getExpenses(monthKey?: string): ExpenseRecord[] {
    if (!monthKey) return [...this.expenses];
    return this.expenses.filter((e) => e.monthKey === monthKey);
  }

  public async addExpense(data: {
    date: string;
    frequency: 'daily' | 'monthly';
    category: string;
    title: string;
    amount: number;
    paidBy: string;
    paymentMethod: 'Cash' | 'EasyPaisa' | 'JazzCash' | 'Bank Transfer';
    note?: string;
  }): Promise<ExpenseRecord> {
    const cleanDate = data.date || new Date().toISOString().slice(0, 10);
    const monthKey = cleanDate.slice(0, 7); // 'YYYY-MM'
    const newExpense: ExpenseRecord = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      monthKey,
      date: cleanDate,
      frequency: data.frequency,
      category: data.category,
      title: data.title.trim() || data.category,
      amount: Math.max(0, Number(data.amount) || 0),
      paidBy: data.paidBy,
      paymentMethod: data.paymentMethod,
      note: data.note?.trim(),
      createdAt: new Date().toISOString(),
    };

    this.expenses.unshift(newExpense);
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(this.expenses));
    } catch {}
    this.enqueueOutbox('ADD_EXPENSE', newExpense);
    this.notify();

    try {
      await pb.collection('pharmacy_expenses').create(newExpense);
    } catch {}

    return newExpense;
  }

  public async deleteExpense(id: string): Promise<boolean> {
    this.expenses = this.expenses.filter((e) => e.id !== id);
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(this.expenses));
    } catch {}
    this.enqueueOutbox('DELETE_EXPENSE', { id });
    this.notify();

    try {
      await pb.collection('pharmacy_expenses').delete(id);
    } catch {}
    return true;
  }

  /**
   * Calculates live Monthly Audit metrics for any YYYY-MM month by combining
   * Sales Gross Profit from Reports + Daily Expenses + Monthly Fixed Expenses
   */
  public calculateMonthlyAudit(monthKey: string): MonthlyAuditSnapshot {
    const [yearStr, monthStr] = monthKey.split('-');
    const dateObj = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // 1. Filter sales belonging to this YYYY-MM
    const monthSales = this.sales.filter((s) => {
      if (s.status === 'refunded') return false;
      return s.createdAt.slice(0, 7) === monthKey;
    });

    const totalSalesCount = monthSales.length;
    const grossRevenue = Number(
      monthSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0).toFixed(2)
    );
    const grossSalesProfit = Number(
      monthSales.reduce((sum, s) => sum + (s.totalProfit || 0), 0).toFixed(2)
    );
    const totalDiscountsGiven = Number(
      monthSales.reduce((sum, s) => sum + (s.discountAmount || 0), 0).toFixed(2)
    );

    // 2. Filter daily and monthly expenses for this YYYY-MM
    const monthExpenses = this.expenses.filter((e) => e.monthKey === monthKey);
    const dailyExpensesTotal = Number(
      monthExpenses
        .filter((e) => e.frequency === 'daily')
        .reduce((sum, e) => sum + e.amount, 0)
        .toFixed(2)
    );
    const monthlyExpensesTotal = Number(
      monthExpenses
        .filter((e) => e.frequency === 'monthly')
        .reduce((sum, e) => sum + e.amount, 0)
        .toFixed(2)
    );

    const totalExpenses = Number((dailyExpensesTotal + monthlyExpensesTotal).toFixed(2));
    const netTakeHomeProfit = Number((grossSalesProfit - totalExpenses).toFixed(2));
    const profitMarginPercent =
      grossRevenue > 0 ? Number(((netTakeHomeProfit / grossRevenue) * 100).toFixed(1)) : 0;

    const existingSaved = this.auditSnapshots.find((a) => a.monthKey === monthKey);

    return {
      monthKey,
      monthLabel,
      totalSalesCount,
      grossRevenue,
      grossSalesProfit,
      totalDiscountsGiven,
      dailyExpensesTotal,
      monthlyExpensesTotal,
      totalExpenses,
      netTakeHomeProfit,
      profitMarginPercent,
      isClosed: existingSaved?.isClosed || false,
      closedAt: existingSaved?.closedAt,
      notes: existingSaved?.notes,
    };
  }

  /**
   * Stores / Archives the monthly profit calculation into the permanent Monthly Ledger
   */
  public saveMonthlyAuditSnapshot(
    monthKey: string,
    notes?: string,
    markClosed = false
  ): MonthlyAuditSnapshot {
    const computed = this.calculateMonthlyAudit(monthKey);
    const snapshot: MonthlyAuditSnapshot = {
      ...computed,
      isClosed: markClosed ? true : computed.isClosed,
      closedAt: markClosed ? new Date().toISOString() : computed.closedAt,
      notes: notes !== undefined ? notes : computed.notes,
    };

    const idx = this.auditSnapshots.findIndex((a) => a.monthKey === monthKey);
    if (idx > -1) {
      this.auditSnapshots[idx] = snapshot;
    } else {
      this.auditSnapshots.unshift(snapshot);
    }

    this.auditSnapshots.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    try {
      localStorage.setItem(AUDIT_SNAPSHOTS_KEY, JSON.stringify(this.auditSnapshots));
    } catch {}
    this.enqueueOutbox('SAVE_MONTHLY_AUDIT', snapshot);
    this.notify();
    return snapshot;
  }

  public getAllMonthlyAudits(): MonthlyAuditSnapshot[] {
    // Collect all unique YYYY-MM keys from sales, expenses, Saved Snapshots, and current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthKeys = new Set<string>([currentMonth]);

    this.sales.forEach((s) => {
      if (s.createdAt && s.createdAt.length >= 7) monthKeys.add(s.createdAt.slice(0, 7));
    });
    this.expenses.forEach((e) => {
      if (e.monthKey) monthKeys.add(e.monthKey);
    });
    this.auditSnapshots.forEach((a) => {
      if (a.monthKey) monthKeys.add(a.monthKey);
    });

    return Array.from(monthKeys)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => this.calculateMonthlyAudit(key));
  }

  // --- Counter Short Book / Demand Register (Want List) ---
  public getShortBook(): ShortBookEntry[] {
    return [...this.shortBook];
  }

  public addToShortBook(data: {
    itemName: string;
    strengthOrPack?: string;
    supplierName?: string;
    requestedPacks?: number;
    priority?: 'normal' | 'urgent';
    linkedMedicineId?: string;
    addedBy: string;
    counterName?: string;
    customerNote?: string;
  }): { entry: ShortBookEntry; incrementedExisting: boolean } {
    const cleanName = data.itemName.trim();
    if (!cleanName) {
      throw new Error('Medicine or product name is required for Short Book.');
    }

    const nowIso = new Date().toISOString();
    const normalizedTarget = cleanName.toLowerCase();

    // Check if an un-ordered / pending entry for this same medicine already exists
    const existingIdx = this.shortBook.findIndex(
      (item) =>
        item.status === 'pending' &&
        ((data.linkedMedicineId && item.linkedMedicineId === data.linkedMedicineId) ||
          item.itemName.trim().toLowerCase() === normalizedTarget)
    );

    if (existingIdx > -1) {
      const current = this.shortBook[existingIdx];
      const updated: ShortBookEntry = {
        ...current,
        requestCount: (current.requestCount || 1) + 1,
        requestedPacks: current.requestedPacks + Math.max(1, Number(data.requestedPacks) || 2),
        priority:
          data.priority === 'urgent' || (current.requestCount || 1) + 1 >= 3
            ? 'urgent'
            : current.priority,
        supplierName: data.supplierName?.trim() || current.supplierName,
        customerNote: data.customerNote?.trim() || current.customerNote,
        updatedAt: nowIso,
      };
      // Move updated item to top of Short Book
      this.shortBook.splice(existingIdx, 1);
      this.shortBook.unshift(updated);
      this.saveShortBook();
      this.notify();
      return { entry: updated, incrementedExisting: true };
    }

    const newEntry: ShortBookEntry = {
      id: `sb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      itemName: cleanName,
      strengthOrPack: data.strengthOrPack?.trim() || undefined,
      supplierName: data.supplierName?.trim() || undefined,
      requestedPacks: Math.max(1, Number(data.requestedPacks) || 5),
      requestCount: 1,
      priority: data.priority || 'normal',
      status: 'pending',
      linkedMedicineId: data.linkedMedicineId,
      addedBy: data.addedBy || 'Counter Staff',
      counterName: data.counterName || this.activeCounter,
      customerNote: data.customerNote?.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.shortBook.unshift(newEntry);
    this.saveShortBook();
    this.notify();
    return { entry: newEntry, incrementedExisting: false };
  }

  public updateShortBookEntry(
    id: string,
    updates: Partial<ShortBookEntry>
  ): ShortBookEntry | null {
    const idx = this.shortBook.findIndex((item) => item.id === id);
    if (idx === -1) return null;

    const current = this.shortBook[idx];
    const updated: ShortBookEntry = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.shortBook[idx] = updated;
    this.saveShortBook();
    this.notify();
    return updated;
  }

  public deleteShortBookEntry(id: string): boolean {
    const prevLen = this.shortBook.length;
    this.shortBook = this.shortBook.filter((item) => item.id !== id);
    if (this.shortBook.length !== prevLen) {
      this.saveShortBook();
      this.notify();
      return true;
    }
    return false;
  }

  public clearOrderedShortBookEntries(): number {
    const before = this.shortBook.length;
    this.shortBook = this.shortBook.filter((item) => item.status !== 'ordered');
    const removed = before - this.shortBook.length;
    if (removed > 0) {
      this.saveShortBook();
      this.notify();
    }
    return removed;
  }

  private saveShortBook(): void {
    try {
      localStorage.setItem(SHORT_BOOK_STORAGE_KEY, JSON.stringify(this.shortBook));
    } catch (e) {
      console.error('Failed to write short book to localStorage', e);
    }
  }

  public createBackupSnapshot(): PharmacyBackupSnapshot {
    return {
      schemaVersion: '2.0',
      application: 'Zahid Medicine Store POS & Inventory System',
      exportedAt: new Date().toISOString(),
      pharmacyDetails: { ...this.pharmacyDetails },
      counters: this.counters.map((c) => ({ ...c })),
      activeCounter: this.activeCounter,
      medicines: this.medicines.map((m) => ({ ...m })),
      sales: this.sales.map((s) => ({
        ...s,
        items: Array.isArray(s.items) ? s.items.map((i) => ({ ...i })) : [],
      })),
      khataCustomers: this.khataCustomers.map((k) => ({
        ...k,
        history: Array.isArray(k.history) ? k.history.map((t: KhataEntry) => ({ ...t })) : [],
      })),
      staffAccounts: staffAuth.getStaffList().map((u) => ({ ...u })),
      expenses: this.expenses.map((e) => ({ ...e })),
      auditSnapshots: this.auditSnapshots.map((a) => ({ ...a })),
      shortBook: this.shortBook.map((sb) => ({ ...sb })),
    };
  }

  public restoreFromBackup(rawInput: string | Record<string, unknown>): {
    medicinesCount: number;
    salesCount: number;
    khataCount: number;
    staffCount: number;
    countersCount: number;
    exportedAt?: string;
  } {
    const parsed: Record<string, unknown> =
      typeof rawInput === 'string' ? (JSON.parse(rawInput) as Record<string, unknown>) : rawInput;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid backup file: Root JSON must be an object.');
    }

    const hasRecognizedKeys =
      Array.isArray(parsed.medicines) ||
      Array.isArray(parsed.sales) ||
      Array.isArray(parsed.khataCustomers) ||
      (parsed.pharmacyDetails && typeof parsed.pharmacyDetails === 'object');

    if (!hasRecognizedKeys) {
      throw new Error(
        'Unrecognized backup format: Missing medicines, sales, khataCustomers, or pharmacyDetails.'
      );
    }

    // 1. Restore Medicines
    if (Array.isArray(parsed.medicines)) {
      this.medicines = (parsed.medicines as MedicineItem[])
        .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
        .map((m) => {
          const unitsPerPack = Math.max(1, Number(m.unitsPerPack) || 1);
          const currentStockPacks = Math.max(0, Number(m.currentStockPacks) || 0);
          const currentStockLoose = Math.max(0, Number(m.currentStockLoose) || 0);
          const minThresholdPacks = Math.max(1, Number(m.minThresholdPacks) || 5);
          const isStillLow = currentStockPacks <= minThresholdPacks;
          return {
            ...m,
            unitsPerPack,
            currentStockPacks,
            currentStockLoose,
            minThresholdPacks,
            reorderStatus:
              isStillLow && m.reorderStatus === 'ordered' ? 'ordered' : 'needed',
            orderedAt:
              isStillLow && m.reorderStatus === 'ordered' ? m.orderedAt : undefined,
          };
        });
      this.saveMedicines();
    }

    // 2. Restore Sales
    if (Array.isArray(parsed.sales)) {
      this.sales = (parsed.sales as SaleTransaction[]).filter(
        (s) => s && typeof s.id === 'string' && typeof s.invoiceNumber === 'string'
      );
      this.saveSales();
    }

    // 3. Restore Khata Customers
    if (Array.isArray(parsed.khataCustomers)) {
      this.khataCustomers = (parsed.khataCustomers as CustomerKhata[])
        .filter((k) => k && typeof k.id === 'string' && typeof k.name === 'string')
        .map((k) => ({
          ...k,
          balanceDue: Math.max(0, Number(k.balanceDue) || 0),
          history: Array.isArray(k.history) ? k.history : [],
        }));
      this.saveKhata();
    }

    // 4. Restore Pharmacy Details
    if (parsed.pharmacyDetails && typeof parsed.pharmacyDetails === 'object') {
      this.pharmacyDetails = {
        ...DEFAULT_PHARMACY_DETAILS,
        ...(parsed.pharmacyDetails as Partial<PharmacyDetails>),
      };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.pharmacyDetails));
      } catch {}
    }

    // 5. Restore Counters & Active Counter
    if (Array.isArray(parsed.counters) && parsed.counters.length > 0) {
      this.counters = (parsed.counters as PharmacyCounter[]).filter(
        (c) => c && typeof c.id === 'string' && typeof c.name === 'string'
      );
      if (this.counters.length === 0) {
        this.counters = [...DEFAULT_COUNTERS];
      }
      try {
        localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(this.counters));
      } catch {}
    }

    if (typeof parsed.activeCounter === 'string' && parsed.activeCounter.trim()) {
      const counterExists = this.counters.some((c) => c.name === parsed.activeCounter);
      this.activeCounter = counterExists ? parsed.activeCounter : this.counters[0].name;
      try {
        localStorage.setItem(ACTIVE_COUNTER_KEY, this.activeCounter);
      } catch {}
    }

    // 6. Restore Staff Accounts if included
    let staffCount = staffAuth.getStaffList().length;
    if (Array.isArray(parsed.staffAccounts) && parsed.staffAccounts.length > 0) {
      staffCount = staffAuth.restoreStaffList(parsed.staffAccounts as UserAccount[]);
    }

    // 7. Restore Expenses & Monthly Audits if included
    if (Array.isArray(parsed.expenses)) {
      this.expenses = (parsed.expenses as ExpenseRecord[]).filter(
        (e) => e && typeof e.id === 'string' && typeof e.monthKey === 'string'
      );
      try {
        localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(this.expenses));
      } catch {}
    }

    if (Array.isArray(parsed.auditSnapshots)) {
      this.auditSnapshots = (parsed.auditSnapshots as MonthlyAuditSnapshot[]).filter(
        (a) => a && typeof a.monthKey === 'string'
      );
      try {
        localStorage.setItem(AUDIT_SNAPSHOTS_KEY, JSON.stringify(this.auditSnapshots));
      } catch {}
    }

    if (Array.isArray(parsed.shortBook)) {
      this.shortBook = (parsed.shortBook as ShortBookEntry[]).filter(
        (sb) => sb && typeof sb.id === 'string' && typeof sb.itemName === 'string'
      );
      this.saveShortBook();
    }

    // Clear stale outbox and notify all views
    this.outbox = [];
    this.saveOutbox();
    this.notify();

    return {
      medicinesCount: this.medicines.length,
      salesCount: this.sales.length,
      khataCount: this.khataCustomers.length,
      staffCount,
      countersCount: this.counters.length,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
    };
  }

  public resetToDefaults(): void {
    this.medicines = [...INITIAL_ZAHID_MEDICINES];
    this.sales = [];
    this.outbox = [];
    this.pharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
    this.counters = [...DEFAULT_COUNTERS];
    this.activeCounter = 'Main Counter';
    this.khataCustomers = [...INITIAL_KHATA_CUSTOMERS];
    this.expenses = [];
    this.auditSnapshots = [];
    this.shortBook = [];
    this.saveMedicines();
    this.saveSales();
    this.saveOutbox();
    this.saveKhata();
    this.saveShortBook();
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.pharmacyDetails));
      localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(this.counters));
      localStorage.setItem(ACTIVE_COUNTER_KEY, this.activeCounter);
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(this.expenses));
      localStorage.setItem(AUDIT_SNAPSHOTS_KEY, JSON.stringify(this.auditSnapshots));
    } catch {}
    this.notify();
  }

  private saveMedicines(): void {
    try {
      localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(this.medicines));
    } catch (e) {
      console.error('Failed to write medicines to localStorage', e);
    }
  }

  private saveSales(): void {
    try {
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(this.sales));
    } catch (e) {
      console.error('Failed to write sales to localStorage', e);
    }
  }

  private saveOutbox(): void {
    try {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(this.outbox));
    } catch (e) {
      console.error('Failed to write outbox to localStorage', e);
    }
  }

  private enqueueOutbox(action: string, payload: unknown): void {
    this.outbox.push({
      id: `out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action,
      payload,
      createdAt: new Date().toISOString(),
    });
    this.saveOutbox();
  }
}

export const syncEngine = new PharmacySyncEngine();
