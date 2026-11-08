import PocketBase from 'pocketbase';
import { MedicineRecord, TransactionRecord, StockAdjustmentRecord } from '../types/pharmacy';
import { INITIAL_MEDICINES } from '../data/initialMedicines';

/**
 * ============================================================================
 * CORE POCKETBASE CLIENT INITIALIZATION
 * ============================================================================
 * CRITICAL ARCHITECTURE DECISION:
 * We initialize PocketBase without passing any URL string to the constructor:
 *
 *   export const pb = new PocketBase();
 *
 * Why this is mandatory for our local offline-first pharmacy architecture:
 * 1. ZERO HARDCODED URLS: When compiled into static assets and placed inside
 *    PocketBase's 'pb_public' directory, the frontend and PocketBase API share
 *    the exact same domain and port.
 * 2. LOCAL OFFLINE LAN ACCESS: If accessing via http://localhost:8090, the SDK
 *    automatically hits http://localhost:8090/api/...
 * 3. PHARMACY WI-FI (LAN): If cash registers/tablets connect to the host PC via
 *    http://192.168.1.150:8090, the SDK automatically hits that local IP.
 * 4. REMOTE / TUNNEL ACCESS: If tunneled via Cloudflare Tunnel or Tailscale
 *    (e.g., https://pharmacy-store.internal), the SDK routes to that tunnel host
 *    without requiring rebuilds or environment variable changes.
 * 5. NO CORS ISSUES: Because frontend and API share the exact origin, browsers
 *    do not trigger CORS preflight restrictions.
 * ============================================================================
 */
export const pb = new PocketBase();

// Optional: Enable auto-cancellation of duplicate requests if desired,
// or disable if rapid sequential POS barcode scanning is needed.
pb.autoCancellation(false);

/**
 * Local offline cache keys
 */
const OFFLINE_MEDICINES_KEY = 'pharmacy_offline_medicines_v1';
const OFFLINE_TRANSACTIONS_KEY = 'pharmacy_offline_transactions_v1';
const OFFLINE_ADJUSTMENTS_KEY = 'pharmacy_offline_adjustments_v1';
const OFFLINE_PENDING_QUEUE_KEY = 'pharmacy_offline_sync_queue_v1';

export interface ConnectionStatus {
  isConnected: boolean;
  isPocketBaseLive: boolean;
  origin: string;
  lastChecked: string;
  errorMessage?: string;
}

/**
 * Health check to verify whether a live PocketBase server is responding at the current origin
 */
export async function checkPocketBaseHealth(): Promise<ConnectionStatus> {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8090';
  try {
    const health = await pb.health.check();
    return {
      isConnected: true,
      isPocketBaseLive: health.code === 200,
      origin: currentOrigin,
      lastChecked: new Date().toLocaleTimeString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cannot reach PocketBase backend';
    return {
      isConnected: false,
      isPocketBaseLive: false,
      origin: currentOrigin,
      lastChecked: new Date().toLocaleTimeString(),
      errorMessage: message,
    };
  }
}

/**
 * Offline-first Local Storage helpers
 * Ensures the pharmacy remains 100% operational even during network disruption
 */
export const offlineStore = {
  getMedicines(): MedicineRecord[] {
    try {
      const saved = localStorage.getItem(OFFLINE_MEDICINES_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load medicines from localStorage', e);
    }
    // Seed default dataset if empty
    this.saveMedicines(INITIAL_MEDICINES);
    return INITIAL_MEDICINES;
  },

  saveMedicines(medicines: MedicineRecord[]): void {
    try {
      localStorage.setItem(OFFLINE_MEDICINES_KEY, JSON.stringify(medicines));
    } catch (e) {
      console.error('Failed to save medicines to localStorage', e);
    }
  },

  getTransactions(): TransactionRecord[] {
    try {
      const saved = localStorage.getItem(OFFLINE_TRANSACTIONS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load transactions from localStorage', e);
    }
    return [];
  },

  saveTransactions(transactions: TransactionRecord[]): void {
    try {
      localStorage.setItem(OFFLINE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save transactions to localStorage', e);
    }
  },

  getAdjustments(): StockAdjustmentRecord[] {
    try {
      const saved = localStorage.getItem(OFFLINE_ADJUSTMENTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load stock adjustments', e);
    }
    return [];
  },

  saveAdjustments(adjustments: StockAdjustmentRecord[]): void {
    try {
      localStorage.setItem(OFFLINE_ADJUSTMENTS_KEY, JSON.stringify(adjustments));
    } catch (e) {
      console.error('Failed to save stock adjustments to localStorage', e);
    }
  },

  getPendingQueue(): Array<{ action: string; payload: unknown; timestamp: string }> {
    try {
      const saved = localStorage.getItem(OFFLINE_PENDING_QUEUE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load pending queue', e);
    }
    return [];
  },

  enqueuePending(action: string, payload: unknown): void {
    const queue = this.getPendingQueue();
    queue.push({ action, payload, timestamp: new Date().toISOString() });
    localStorage.setItem(OFFLINE_PENDING_QUEUE_KEY, JSON.stringify(queue));
  },

  clearPendingQueue(): void {
    localStorage.removeItem(OFFLINE_PENDING_QUEUE_KEY);
  },

  resetToDefault(): void {
    localStorage.setItem(OFFLINE_MEDICINES_KEY, JSON.stringify(INITIAL_MEDICINES));
  }
};
