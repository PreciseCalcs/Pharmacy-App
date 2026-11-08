import { pb, checkPocketBaseHealth } from '../lib/pocketbase';
import { 
  MedicineItem, 
  SaleTransaction, 
  SaleItem, 
  ConnectionStatus,
  StockAlert
} from '../types/pharmacy';
import { INITIAL_ZAHID_MEDICINES } from '../data/initialMedicines';
import { getDaysUntilExpiry, getTotalPiecesInStock, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';

const INVENTORY_STORAGE_KEY = 'zahid_med_inventory_v2';
const SALES_STORAGE_KEY = 'zahid_med_sales_v2';
const OUTBOX_STORAGE_KEY = 'zahid_med_outbox_v1';

export class PharmacySyncEngine {
  private medicines: MedicineItem[] = [];
  private sales: SaleTransaction[] = [];
  private outbox: Array<{ id: string; action: string; payload: unknown; createdAt: string }> = [];
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
        this.medicines = JSON.parse(savedMeds);
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
    } catch (e) {
      console.warn('Failed to initialize local pharmacy store, falling back to defaults', e);
      this.medicines = [...INITIAL_ZAHID_MEDICINES];
      this.sales = [];
      this.outbox = [];
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

  public getMedicines(): MedicineItem[] {
    return [...this.medicines];
  }

  public getSales(): SaleTransaction[] {
    return [...this.sales];
  }

  public getOutboxCount(): number {
    return this.outbox.length;
  }

  // Stock Alerts computation
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

  // Add new medicine
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

    // Try live PocketBase push
    try {
      await pb.collection('medicines').create(newItem);
    } catch {}

    return newItem;
  }

  // Update existing medicine
  public async updateMedicine(id: string, updates: Partial<MedicineItem>): Promise<MedicineItem> {
    const idx = this.medicines.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error('Medicine not found in catalog');

    const updated: MedicineItem = {
      ...this.medicines[idx],
      ...updates,
      updated: new Date().toISOString(),
    };

    this.medicines[idx] = updated;
    this.saveMedicines();
    this.enqueueOutbox('UPDATE_MEDICINE', { id, updates });
    this.notify();

    // Try live PocketBase push
    try {
      await pb.collection('medicines').update(id, updates);
    } catch {}

    return updated;
  }

  // Delete medicine
  public async deleteMedicine(id: string): Promise<boolean> {
    this.medicines = this.medicines.filter((m) => m.id !== id);
    this.saveMedicines();
    this.enqueueOutbox('DELETE_MEDICINE', { id });
    this.notify();

    try {
      await pb.collection('medicines').delete(id);
    } catch {}

    return true;
  }

  // Dispense Register / Process Sale Transaction
  public async processSale(transactionData: {
    items: SaleItem[];
    customerName: string;
    customerPhone?: string;
    staffName: string;
    staffRole: any;
    paymentMethod: any;
    discountPercent: number;
    receivedAmount: number;
    notes?: string;
  }): Promise<SaleTransaction> {
    const { items, customerName, customerPhone, staffName, staffRole, paymentMethod, discountPercent, receivedAmount, notes } = transactionData;

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const discountAmount = Math.round((subtotal * (discountPercent || 0)) / 100);
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const totalProfit = items.reduce((sum, item) => sum + item.profit, 0) - discountAmount;
    const finalReceived = receivedAmount > 0 ? receivedAmount : totalAmount;
    const changeAmount = Math.max(0, finalReceived - totalAmount);

    const invoiceNumber = `ZMS-${new Date().getFullYear()}-${String(this.sales.length + 1).padStart(5, '0')}`;

    const newTransaction: SaleTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      invoiceNumber,
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPhone: customerPhone?.trim() || undefined,
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

    // 1. Decrement inventory stock accurately (packs vs loose pieces)
    items.forEach((item) => {
      const med = this.medicines.find((m) => m.id === item.medicineId);
      if (!med) return;

      if (item.unitType === 'pack') {
        med.currentStockPacks = Math.max(0, med.currentStockPacks - item.quantity);
      } else {
        // Loose unit dispense
        let remainingLoose = (med.currentStockLoose || 0) - item.quantity;
        if (remainingLoose < 0) {
          // Break packs into loose pieces as needed
          const unitsPerPack = med.unitsPerPack > 0 ? med.unitsPerPack : 1;
          const packsNeeded = Math.ceil(Math.abs(remainingLoose) / unitsPerPack);
          med.currentStockPacks = Math.max(0, med.currentStockPacks - packsNeeded);
          remainingLoose += packsNeeded * unitsPerPack;
        }
        med.currentStockLoose = Math.max(0, remainingLoose);
      }
      med.updated = new Date().toISOString();
    });

    // 2. Save locally
    this.sales.unshift(newTransaction);
    this.saveMedicines();
    this.saveSales();
    this.enqueueOutbox('PROCESS_SALE', newTransaction);
    this.notify();

    // 3. Push to PocketBase live collection if available
    try {
      await pb.collection('sales').create(newTransaction);
      // Update medicines in PocketBase
      for (const item of items) {
        const med = this.medicines.find((m) => m.id === item.medicineId);
        if (med) {
          await pb.collection('medicines').update(med.id, {
            currentStockPacks: med.currentStockPacks,
            currentStockLoose: med.currentStockLoose,
          });
        }
      }
    } catch (err) {
      console.warn('PocketBase sync deferred to outbox queue:', err);
    }

    return newTransaction;
  }

  // Link unrecognized barcode to existing medicine
  public async linkBarcode(medicineId: string, newBarcode: string): Promise<MedicineItem> {
    return this.updateMedicine(medicineId, { barcode: newBarcode.trim() });
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
        if (item.action === 'PROCESS_SALE') {
          await pb.collection('sales').create(item.payload as Record<string, any>);
        } else if (item.action === 'ADD_MEDICINE') {
          await pb.collection('medicines').create(item.payload as Record<string, any>);
        } else if (item.action === 'UPDATE_MEDICINE') {
          const { id, updates } = item.payload as any;
          await pb.collection('medicines').update(id, updates);
        } else if (item.action === 'DELETE_MEDICINE') {
          const { id } = item.payload as any;
          await pb.collection('medicines').delete(id);
        }
        synced++;
      } catch (err) {
        console.warn('Outbox item push failed:', err);
        failed++;
        remainingOutbox.push(item);
      }
    }

    this.outbox = remainingOutbox;
    this.saveOutbox();
    this.notify();

    return { synced, failed };
  }

  // Reset to initial seed catalog
  public resetToDefaults(): void {
    this.medicines = [...INITIAL_ZAHID_MEDICINES];
    this.sales = [];
    this.outbox = [];
    this.saveMedicines();
    this.saveSales();
    this.saveOutbox();
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
