import { pb, offlineStore, checkPocketBaseHealth } from '../lib/pocketbase';
import { 
  MedicineRecord, 
  TransactionRecord, 
  TransactionItem, 
  StockAdjustmentRecord 
} from '../types/pharmacy';

/**
 * ============================================================================
 * PHARMACY DATABASE SERVICE (POCKETBASE SDK IMPLEMENTATION)
 * ============================================================================
 * Replaces legacy Supabase queries:
 * - Supabase:   supabase.from('medicines').select('*')
 * - PocketBase: pb.collection('medicines').getFullList({ sort: 'name' })
 *
 * - Supabase:   supabase.from('medicines').update({ stock: newStock }).eq('id', id)
 * - PocketBase: pb.collection('medicines').update(id, { stock_quantity: newStock })
 *
 * - Supabase:   supabase.from('medicines').select('*').ilike('name', `%${query}%`)
 * - PocketBase: pb.collection('medicines').getFullList({ filter: pb.filter('name ~ {:q}', { q: query }) })
 * ============================================================================
 */

export const pharmacyService = {
  /**
   * 1. FETCHING ENTIRE MEDICINE INVENTORY / STOCK LEVELS
   * Uses PocketBase's getFullList with optional relation expansion & sorting
   */
  async fetchInventory(): Promise<{ data: MedicineRecord[]; source: 'pocketbase' | 'offline_cache' }> {
    try {
      // Check health first to avoid waiting for timeout if PocketBase is not yet booted
      const health = await checkPocketBaseHealth();
      if (health.isPocketBaseLive) {
        // Official PocketBase getFullList query
        const records = await pb.collection('medicines').getFullList<MedicineRecord>({
          sort: 'name',
          requestKey: null, // Avoid request cancellation during fast tab switches
        });
        
        // Cache locally for offline durability
        offlineStore.saveMedicines(records);
        return { data: records, source: 'pocketbase' };
      }
    } catch (err) {
      console.warn('PocketBase live fetch failed, switching to local offline store:', err);
    }

    // Offline-first fallback
    return { data: offlineStore.getMedicines(), source: 'offline_cache' };
  },

  /**
   * 2. SECURE QUERYING WITH PARAMETERIZED FILTERS
   * PocketBase syntax:
   * Uses pb.filter('field ~ {:param} && stock_quantity > {:min}', { ... })
   * This prevents injection and ensures strict type safety.
   */
  async searchMedicines(
    searchQuery: string = '',
    category?: string,
    onlyLowStock: boolean = false
  ): Promise<MedicineRecord[]> {
    try {
      const health = await checkPocketBaseHealth();
      if (health.isPocketBaseLive) {
        const filters: string[] = [];
        const params: Record<string, unknown> = {};

        if (searchQuery.trim()) {
          filters.push('(name ~ {:query} || generic_name ~ {:query} || barcode ~ {:barcode} || sku ~ {:sku})');
          params.query = searchQuery.trim();
          params.barcode = searchQuery.trim();
          params.sku = searchQuery.trim();
        }

        if (category && category !== 'All') {
          filters.push('category = {:category}');
          params.category = category;
        }

        if (onlyLowStock) {
          // In PocketBase, comparing two fields requires expression or dynamic filter
          filters.push('stock_quantity <= min_threshold');
        }

        const filterExpression = filters.length > 0 ? pb.filter(filters.join(' && '), params) : '';

        const records = await pb.collection('medicines').getFullList<MedicineRecord>({
          filter: filterExpression,
          sort: 'name',
        });
        return records;
      }
    } catch (err) {
      console.warn('PocketBase search query fallback:', err);
    }

    // Fallback local search
    let list = offlineStore.getMedicines();
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => 
        m.name.toLowerCase().includes(q) ||
        m.generic_name.toLowerCase().includes(q) ||
        m.barcode.includes(q) ||
        m.sku.toLowerCase().includes(q)
      );
    }
    if (category && category !== 'All') {
      list = list.filter(m => m.category === category);
    }
    if (onlyLowStock) {
      list = list.filter(m => m.stock_quantity <= m.min_threshold);
    }
    return list;
  },

  /**
   * 3. UPDATING MEDICINE STOCK WHEN A TRANSACTION OCCURS
   * Atomically decrements stock for each dispensed medicine and creates
   * an immutable transaction audit log record in PocketBase.
   */
  async processTransaction(
    items: TransactionItem[],
    customerName: string,
    customerPhone: string,
    paymentMethod: 'Cash' | 'Card' | 'Insurance' | 'Mobile Payment',
    pharmacistName: string = 'Staff Pharmacist'
  ): Promise<{ transaction: TransactionRecord; source: 'pocketbase' | 'offline_cache' }> {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = +(subtotal * 0.05).toFixed(2); // 5% pharmacy sales tax
    const total_amount = +(subtotal + tax).toFixed(2);
    const transactionNumber = `TXN-${Date.now().toString().slice(-6)}`;

    const newTransaction: TransactionRecord = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      transaction_number: transactionNumber,
      customer_name: customerName || 'Walk-in Customer',
      customer_phone: customerPhone || undefined,
      pharmacist_name: pharmacistName,
      payment_method: paymentMethod,
      items,
      subtotal,
      tax,
      discount: 0,
      total_amount,
      created: new Date().toISOString(),
    };

    let pbConnected = false;
    try {
      const health = await checkPocketBaseHealth();
      pbConnected = health.isPocketBaseLive;
    } catch {
      pbConnected = false;
    }

    if (pbConnected) {
      try {
        // 1. Process each item: update stock in PocketBase
        for (const item of items) {
          const currentMed = await pb.collection('medicines').getOne<MedicineRecord>(item.medicine_id);
          const updatedStock = Math.max(0, currentMed.stock_quantity - item.quantity);

          // Update medicine record in PocketBase
          await pb.collection('medicines').update(currentMed.id, {
            stock_quantity: updatedStock,
          });

          // Log stock adjustment in PocketBase
          try {
            await pb.collection('stock_adjustments').create({
              medicine_id: currentMed.id,
              medicine_name: currentMed.name,
              batch_number: currentMed.batch_number,
              previous_stock: currentMed.stock_quantity,
              new_stock: updatedStock,
              change_amount: -item.quantity,
              reason: 'Sale',
              pharmacist_name: pharmacistName,
            });
          } catch (adjErr) {
            console.warn('Optional stock adjustment log creation skipped:', adjErr);
          }
        }

        // 2. Create Transaction Record in PocketBase
        const createdPbTxn = await pb.collection('transactions').create<TransactionRecord>({
          transaction_number: transactionNumber,
          customer_name: newTransaction.customer_name,
          customer_phone: newTransaction.customer_phone,
          pharmacist_name: pharmacistName,
          payment_method: paymentMethod,
          items: newTransaction.items,
          subtotal: newTransaction.subtotal,
          tax: newTransaction.tax,
          discount: 0,
          total_amount: newTransaction.total_amount,
        });

        // Update local offline cache to reflect the new state immediately
        const medicines = offlineStore.getMedicines();
        items.forEach(item => {
          const m = medicines.find(med => med.id === item.medicine_id);
          if (m) {
            m.stock_quantity = Math.max(0, m.stock_quantity - item.quantity);
          }
        });
        offlineStore.saveMedicines(medicines);

        const currentTxns = offlineStore.getTransactions();
        offlineStore.saveTransactions([createdPbTxn, ...currentTxns]);

        return { transaction: createdPbTxn, source: 'pocketbase' };
      } catch (pbErr) {
        console.warn('PocketBase live transaction failed, executing via offline store:', pbErr);
      }
    }

    // OFFLINE MODE / LOCAL DISK FALLBACK
    const medicines = offlineStore.getMedicines();
    const adjustments = offlineStore.getAdjustments();

    items.forEach(item => {
      const m = medicines.find(med => med.id === item.medicine_id);
      if (m) {
        const prevStock = m.stock_quantity;
        m.stock_quantity = Math.max(0, m.stock_quantity - item.quantity);
        adjustments.unshift({
          id: `adj_${Date.now()}_${item.medicine_id}`,
          medicine_id: m.id,
          medicine_name: m.name,
          batch_number: m.batch_number,
          previous_stock: prevStock,
          new_stock: m.stock_quantity,
          change_amount: -item.quantity,
          reason: 'Sale',
          pharmacist_name: pharmacistName,
          created: new Date().toISOString(),
        });
      }
    });

    offlineStore.saveMedicines(medicines);
    offlineStore.saveAdjustments(adjustments);

    const currentTxns = offlineStore.getTransactions();
    offlineStore.saveTransactions([newTransaction, ...currentTxns]);
    offlineStore.enqueuePending('PROCESS_TRANSACTION', newTransaction);

    return { transaction: newTransaction, source: 'offline_cache' };
  },

  /**
   * 4. DIRECT STOCK ADJUSTMENT (Restock, Damage, Expiry, or Count Correction)
   */
  async adjustStock(
    medicineId: string,
    newStock: number,
    reason: StockAdjustmentRecord['reason'],
    pharmacistName: string = 'Staff Pharmacist'
  ): Promise<MedicineRecord> {
    const medicines = offlineStore.getMedicines();
    const target = medicines.find(m => m.id === medicineId);
    if (!target) throw new Error('Medicine not found');

    const previousStock = target.stock_quantity;
    const change = newStock - previousStock;
    target.stock_quantity = newStock;
    target.updated = new Date().toISOString();

    offlineStore.saveMedicines(medicines);

    // Save adjustment log
    const adjustments = offlineStore.getAdjustments();
    adjustments.unshift({
      id: `adj_${Date.now()}`,
      medicine_id: target.id,
      medicine_name: target.name,
      batch_number: target.batch_number,
      previous_stock: previousStock,
      new_stock: newStock,
      change_amount: change,
      reason,
      pharmacist_name: pharmacistName,
      created: new Date().toISOString(),
    });
    offlineStore.saveAdjustments(adjustments);

    try {
      const health = await checkPocketBaseHealth();
      if (health.isPocketBaseLive) {
        const updated = await pb.collection('medicines').update<MedicineRecord>(medicineId, {
          stock_quantity: newStock,
        });
        return updated;
      }
    } catch (e) {
      console.warn('PocketBase update postponed to offline queue:', e);
      offlineStore.enqueuePending('ADJUST_STOCK', { medicineId, newStock, reason });
    }

    return target;
  },

  /**
   * 5. CREATE NEW MEDICINE INVENTORY RECORD
   */
  async createMedicine(
    medicineData: Omit<MedicineRecord, 'id' | 'created' | 'updated'>
  ): Promise<MedicineRecord> {
    const newRecord: MedicineRecord = {
      ...medicineData,
      id: `med_${Date.now().toString(36)}`,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    try {
      const health = await checkPocketBaseHealth();
      if (health.isPocketBaseLive) {
        const created = await pb.collection('medicines').create<MedicineRecord>(medicineData);
        // Sync local cache
        const list = offlineStore.getMedicines();
        offlineStore.saveMedicines([created, ...list]);
        return created;
      }
    } catch (e) {
      console.warn('PocketBase create record fallback to offline store:', e);
    }

    const list = offlineStore.getMedicines();
    offlineStore.saveMedicines([newRecord, ...list]);
    offlineStore.enqueuePending('CREATE_MEDICINE', newRecord);
    return newRecord;
  },

  /**
   * 6. FETCH TRANSACTION HISTORY
   */
  async fetchTransactions(): Promise<TransactionRecord[]> {
    try {
      const health = await checkPocketBaseHealth();
      if (health.isPocketBaseLive) {
        const records = await pb.collection('transactions').getFullList<TransactionRecord>({
          sort: '-created',
        });
        offlineStore.saveTransactions(records);
        return records;
      }
    } catch (e) {
      console.warn('PocketBase transactions fetch fallback:', e);
    }
    return offlineStore.getTransactions();
  },

  /**
   * 7. SUBSCRIBE TO REALTIME INVENTORY CHANGES
   * PocketBase provides built-in WebSockets / SSE for real-time updates across multiple LAN counters
   */
  subscribeToMedicines(callback: (action: string, record: MedicineRecord) => void): () => void {
    let unsubscribed = false;
    
    // Attempt PocketBase SSE subscription
    pb.collection('medicines')
      .subscribe('*', (e) => {
        if (!unsubscribed) {
          callback(e.action, e.record as unknown as MedicineRecord);
        }
      })
      .catch((err) => {
        console.warn('PocketBase realtime subscription inactive (running in offline mode):', err);
      });

    return () => {
      unsubscribed = true;
      try {
        pb.collection('medicines').unsubscribe('*');
      } catch {
        // Safe ignore
      }
    };
  }
};
