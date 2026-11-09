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
  INITIAL_KHATA_CUSTOMERS
} from '../types/pharmacy';
import { INITIAL_ZAHID_MEDICINES } from '../data/initialMedicines';
import { getDaysUntilExpiry, getTotalPiecesInStock, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';

const INVENTORY_STORAGE_KEY = 'zahid_med_inventory_v2';
const SALES_STORAGE_KEY = 'zahid_med_sales_v2';
const OUTBOX_STORAGE_KEY = 'zahid_med_outbox_v1';
const SETTINGS_STORAGE_KEY = 'zahid_pharmacy_settings_v1';
const COUNTERS_STORAGE_KEY = 'zahid_counters_v1';
const ACTIVE_COUNTER_KEY = 'zahid_active_counter_v1';
const KHATA_STORAGE_KEY = 'zahid_khata_customers_v1';

export class PharmacySyncEngine {
  private medicines: MedicineItem[] = [];
  private sales: SaleTransaction[] = [];
  private outbox: Array<{ id: string; action: string; payload: unknown; createdAt: string }> = [];
  private pharmacyDetails: PharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
  private counters: PharmacyCounter[] = [...DEFAULT_COUNTERS];
  private activeCounter: string = 'Main Counter';
  private khataCustomers: CustomerKhata[] = [...INITIAL_KHATA_CUSTOMERS];
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
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(this.medicines));
      } else {
        this.medicines = [...INITIAL_ZAHID_MEDICINES];
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(this.medicines));
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
    } catch (e) {
      console.warn('Failed to initialize local pharmacy store, falling back to defaults', e);
      this.medicines = [...INITIAL_ZAHID_MEDICINES];
      this.sales = [];
      this.outbox = [];
      this.pharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
      this.counters = [...DEFAULT_COUNTERS];
      this.activeCounter = 'Main Counter';
      this.khataCustomers = [...INITIAL_KHATA_CUSTOMERS];
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

      if (isExpired(m.expiryDate)) {
        alerts.push({
          id: `alert_exp_${m.id}`,
          medicineId: m.id,
          name: m.name,
          batchNumber: m.batchNumber,
          type: 'expired',
          urgency: 'high',
          message: `${m.name} (Batch ${m.batchNumber}) EXPIRED on ${m.expiryDate}. Quarantine immediately!`,
          daysRemaining: days,
          currentStock: m.currentStockPacks,
          threshold: m.minThresholdPacks,
        });
      } else if (isExpiringSoon(m.expiryDate, 90)) {
        alerts.push({
          id: `alert_exps_${m.id}`,
          medicineId: m.id,
          name: m.name,
          batchNumber: m.batchNumber,
          type: 'expiring_soon',
          urgency: days <= 30 ? 'high' : 'medium',
          message: `${m.name} expires in ${days} days (${m.expiryDate}). Prioritize dispensing.`,
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
      return urgencyRank[b.urgency] - urgencyRank[a.urgency];
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

  public resetToDefaults(): void {
    this.medicines = [...INITIAL_ZAHID_MEDICINES];
    this.sales = [];
    this.outbox = [];
    this.pharmacyDetails = { ...DEFAULT_PHARMACY_DETAILS };
    this.counters = [...DEFAULT_COUNTERS];
    this.activeCounter = 'Main Counter';
    this.khataCustomers = [...INITIAL_KHATA_CUSTOMERS];
    this.saveMedicines();
    this.saveSales();
    this.saveOutbox();
    this.saveKhata();
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.pharmacyDetails));
      localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(this.counters));
      localStorage.setItem(ACTIVE_COUNTER_KEY, this.activeCounter);
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
