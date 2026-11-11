import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  BarChart3, 
  Settings, 
  Lock, 
  Camera, 
  Bell, 
  ChevronDown, 
  Check, 
  Sparkles,
  Menu,
  X,
  ShieldCheck,
  Building2,
  HardDrive,
  Keyboard,
  HelpCircle,
  ShieldAlert,
  Wallet,
  Truck,
  Calculator,
  RefreshCw,
  Barcode
} from 'lucide-react';
import { 
  ConnectionStatus, 
  MedicineItem, 
  PharmacyDetails, 
  SaleTransaction, 
  UserAccount, 
  CustomerKhata,
  SupplierAccount,
  GallaClosingRecord
} from './types/pharmacy';
import { syncEngine } from './services/syncEngine';
import { staffAuth } from './services/staffAuth';
import { soundService } from './services/soundAlerts';
import { checkPocketBaseHealth } from './lib/pocketbase';
import { parseScannedCode } from './utils/codeParser';
import { getTotalPiecesInStock, isExpired } from './utils/pharmacyHelpers';
import { can, canOpenTab, defaultTabFor } from './utils/permissions';

// Views & Components
import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { GallaClosingView } from './components/GallaClosingView';
import { SpreadsheetView, InventoryStockFilter } from './components/SpreadsheetView';
import { BarcodeStudioView } from './components/BarcodeStudioView';
import { CriticalStockView } from './components/CriticalStockView';
import { CreditKhataView } from './components/CreditKhataView';
import { SupplierKhataView } from './components/SupplierKhataView';
import { ReportsView } from './components/ReportsView';
import { AuditView } from './components/AuditView';
import { SettingsView } from './components/SettingsView';
import { LockScreen } from './components/LockScreen';
import { AuthModal } from './components/AuthModal';
import { MedicineModal } from './components/MedicineModal';
import { InvoiceModal } from './components/InvoiceModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { PrintLabelModal } from './components/PrintLabelModal';
import { LinkCodeModal } from './components/LinkCodeModal';
import { NotificationDropdown } from './components/NotificationDropdown';
import { PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  // Navigation & Auth
  const [currentUser, setCurrentUser] = useState<UserAccount>(staffAuth.getCurrentUser());
  const [isLocked, setIsLocked] = useState<boolean>(staffAuth.isLocked());
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Settings & Counters
  const [pharmacyDetails, setPharmacyDetails] = useState<PharmacyDetails>(syncEngine.getPharmacyDetails());
  const [counters, setCounters] = useState(syncEngine.getCounters());
  const [activeCounter, setActiveCounter] = useState(syncEngine.getActiveCounter());
  const [isCounterDropdownOpen, setIsCounterDropdownOpen] = useState(false);

  // Core Data
  const [medicines, setMedicines] = useState<MedicineItem[]>(syncEngine.getMedicines());
  const [sales, setSales] = useState<SaleTransaction[]>(syncEngine.getSales());
  const [khataCustomers, setKhataCustomers] = useState<CustomerKhata[]>(syncEngine.getKhataCustomers());
  const [supplierAccounts, setSupplierAccounts] = useState<SupplierAccount[]>(syncEngine.getSupplierAccounts());
  const [gallaClosings, setGallaClosings] = useState<GallaClosingRecord[]>(syncEngine.getGallaClosings());
  const [alerts, setAlerts] = useState(syncEngine.getAlerts());
  const [externalInventoryFilter, setExternalInventoryFilter] = useState<InventoryStockFilter | null>(null);
  const [initialReportSection, setInitialReportSection] = useState<'invoices' | 'products' | null>(null);

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMedicineModalOpen, setIsMedicineModalOpen] = useState(false);
  const [selectedMedicineForEdit, setSelectedMedicineForEdit] = useState<MedicineItem | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SaleTransaction | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isPrintLabelOpen, setIsPrintLabelOpen] = useState(false);
  const [medicineForLabel, setMedicineForLabel] = useState<MedicineItem | null>(null);
  const [initialBarcodeMedicine, setInitialBarcodeMedicine] = useState<MedicineItem | null>(null);
  const [isLinkCodeModalOpen, setIsLinkCodeModalOpen] = useState(false);
  const [unrecognizedCode, setUnrecognizedCode] = useState('');
  const [outOfStockScannedMed, setOutOfStockScannedMed] = useState<MedicineItem | null>(null);
  const [pendingScannedCodeForModal, setPendingScannedCodeForModal] = useState<string>('');
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Hardware Scanner buffer
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const burstStartTimeRef = useRef<number>(0);
  const burstKeyCountRef = useRef<number>(0);
  const scannerAutoFlushTimerRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const [scanToast, setScanToast] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);
  const [externalScannedItem, setExternalScannedItem] = useState<{
    medicine: MedicineItem;
    scanId: number;
  } | null>(null);
  const [externalScannedReceipt, setExternalScannedReceipt] = useState<{
    transaction: SaleTransaction;
    scanId: number;
  } | null>(null);

  // PocketBase Connection & Auto-Reconnect / Outbox Sync Progress
  const RECONNECT_INTERVAL_SECONDS = 15;
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(RECONNECT_INTERVAL_SECONDS);
  const reconnectCountdownRef = useRef<number>(RECONNECT_INTERVAL_SECONDS);
  const [isReconnectingSync, setIsReconnectingSync] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: true,
    isPocketBaseLive: false,
    origin: typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8090',
    lastChecked: 'Checking...',
    pendingSyncCount: 0,
  });

  const handleExternalScanConsumed = useCallback(() => {
    setExternalScannedItem(null);
  }, []);

  const handleExternalReceiptScanConsumed = useCallback(() => {
    setExternalScannedReceipt(null);
  }, []);

  const handleExternalFilterConsumed = useCallback(() => {
    setExternalInventoryFilter(null);
  }, []);

  const handleInitialMedicineConsumed = useCallback(() => {
    setInitialBarcodeMedicine(null);
  }, []);

  const handleReportSectionConsumed = useCallback(() => {
    setInitialReportSection(null);
  }, []);

  const refreshHealth = useCallback(async (isAutoRetry = false) => {
    if (isAutoRetry) {
      setIsReconnectingSync(true);
    }
    const health = await checkPocketBaseHealth();
    if (health.isPocketBaseLive && syncEngine.getOutboxCount() > 0) {
      await syncEngine.syncWithPocketBase();
    }
    setConnectionStatus({
      isConnected: health.isConnected,
      isPocketBaseLive: health.isPocketBaseLive,
      origin: health.origin,
      lastChecked: health.lastChecked,
      pendingSyncCount: syncEngine.getOutboxCount(),
    });
    if (isAutoRetry) {
      setTimeout(() => {
        setIsReconnectingSync(false);
        reconnectCountdownRef.current = RECONNECT_INTERVAL_SECONDS;
        setReconnectCountdown(RECONNECT_INTERVAL_SECONDS);
      }, 700);
    }
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'warn') => {
    setScanToast({ message, type });
    setTimeout(() => {
      setScanToast(null);
    }, 3000);
  }, []);

  const handleNavigateTab = useCallback(
    (tab: string, shortcutLabel?: string) => {
      // Allow 'settings' tab click because SettingsView has a dedicated Owner PIN challenge screen,
      // but enforce role permissions strictly on all other tabs (e.g. 'reports' blocked for Cashier).
      if (tab !== 'settings' && !canOpenTab(currentUser.role, tab)) {
        soundService.errorTone();
        showToast(`Access denied: ${currentUser.role} role cannot open ${tab}`, 'warn');
        return;
      }
      setActiveTab(tab);
      setIsMobileMenuOpen(false);
      soundService.click();
      if (shortcutLabel) {
        showToast(shortcutLabel, 'success');
      }
    },
    [currentUser.role, showToast]
  );

  // SyncEngine Subscription & 1-Second Reconnect/Sync Countdown Ticker
  useEffect(() => {
    refreshHealth(false);
    const unsub = syncEngine.subscribe(() => {
      setMedicines(syncEngine.getMedicines());
      setSales(syncEngine.getSales());
      setKhataCustomers(syncEngine.getKhataCustomers());
      setSupplierAccounts(syncEngine.getSupplierAccounts());
      setGallaClosings(syncEngine.getGallaClosings());
      setAlerts(syncEngine.getAlerts());
      setPharmacyDetails(syncEngine.getPharmacyDetails());
      setCounters(syncEngine.getCounters());
      setActiveCounter(syncEngine.getActiveCounter());
      setConnectionStatus((prev) => ({
        ...prev,
        pendingSyncCount: syncEngine.getOutboxCount(),
      }));
    });

    const countdownTimer = setInterval(() => {
      if (reconnectCountdownRef.current <= 1) {
        reconnectCountdownRef.current = RECONNECT_INTERVAL_SECONDS;
        setReconnectCountdown(RECONNECT_INTERVAL_SECONDS);
        refreshHealth(true);
      } else {
        reconnectCountdownRef.current -= 1;
        setReconnectCountdown(reconnectCountdownRef.current);
      }
    }, 1000);

    return () => {
      unsub();
      clearInterval(countdownTimer);
    };
  }, [refreshHealth]);

  const handleScannedCode = useCallback(
    (rawCode: string) => {
      const cleanedRaw = (rawCode || '')
        .replace(/^[\x00-\x20]+/, '')
        .replace(/[\x00-\x20]+$/, '');
      if (!cleanedRaw) {
        console.warn('[Scanner] handleScannedCode ignored empty rawCode');
        return;
      }

      const now = Date.now();
      // 450ms debounce to prevent double-dispensing from camera or rapid gun bounce
      if (now - lastScanTimeRef.current < 450) {
        console.log('[Scanner] Debounced duplicate scan within 450ms:', {
          rawCode: cleanedRaw,
          elapsedMs: now - lastScanTimeRef.current,
        });
        return;
      }
      lastScanTimeRef.current = now;

      const parsed = parseScannedCode(cleanedRaw, medicines, sales);
      console.log('[Scanner] handleScannedCode processed input:', {
        rawCode: cleanedRaw,
        parsed,
        matchedMedicine: parsed.matchedMedicine
          ? {
              id: parsed.matchedMedicine.id,
              name: parsed.matchedMedicine.name,
              barcode: parsed.matchedMedicine.barcode,
              stockPieces: getTotalPiecesInStock(parsed.matchedMedicine),
              expiryDate: parsed.matchedMedicine.expiryDate,
            }
          : null,
        matchedSale: parsed.matchedSale
          ? {
              id: parsed.matchedSale.id,
              invoiceNumber: parsed.matchedSale.invoiceNumber,
            }
          : null,
        isGS1DataMatrix: Boolean(parsed.isGS1DataMatrix),
      });

      // Always switch to the POS tab when a barcode is scanned from any view (Overview, Khata, Reports, etc.)
      setActiveTab('pos');
      setIsMobileMenuOpen(false);

      if (parsed.matchedSale) {
        console.log(
          '[Scanner] Routing to POS for Receipt Return:',
          parsed.matchedSale.invoiceNumber
        );
        soundService.scanSuccess();
        showToast(
          `Receipt Scanned: Invoice #${parsed.matchedSale.invoiceNumber} loaded for Return/Refund`,
          'success'
        );
        setExternalScannedReceipt({
          transaction: parsed.matchedSale,
          scanId: now,
        });
      } else if (parsed.matchedMedicine) {
        const med = parsed.matchedMedicine;
        if (getTotalPiecesInStock(med) > 0 && !isExpired(med.expiryDate)) {
          console.log(
            '[Scanner] In-stock item matched -> Navigating to POS & adding to cart:',
            med.name
          );
          soundService.scanSuccess();
          showToast(
            `Added to POS: ${med.name} (${med.strength})`,
            'success'
          );
          setExternalScannedItem({
            medicine: med,
            scanId: now,
          });
        } else {
          // Matched item is out of stock (0 packs) -> switch to POS and show options to Add to Short Book or Restock & Dispense
          console.log(
            '[Scanner] Out-of-stock / expired item matched -> Navigating to POS & opening LinkCodeModal:',
            med.name
          );
          soundService.scanWarning();
          setUnrecognizedCode(cleanedRaw);
          setOutOfStockScannedMed(med);
          setIsLinkCodeModalOpen(true);
        }
      } else {
        // Item is not listed in catalog -> switch to POS and show options to List in Stock, Add to Short Book, or Link
        console.log(
          '[Scanner] Unlisted barcode scanned -> Navigating to POS & opening LinkCodeModal (List or Add to Short Book):',
          cleanedRaw
        );
        soundService.scanWarning();
        setUnrecognizedCode(cleanedRaw);
        setOutOfStockScannedMed(null);
        setIsLinkCodeModalOpen(true);
      }
    },
    [medicines, sales, showToast]
  );

  // Global Keyboard Shortcuts & Hardware Scanner Listener
  useEffect(() => {
    const clearScannerBuffer = () => {
      barcodeBufferRef.current = '';
      burstKeyCountRef.current = 0;
      burstStartTimeRef.current = 0;
      if (scannerAutoFlushTimerRef.current !== null) {
        window.clearTimeout(scannerAutoFlushTimerRef.current);
        scannerAutoFlushTimerRef.current = null;
      }
    };

    const stripLeakedScannerTextFromInput = (
      el: HTMLElement | null,
      scannedText: string
    ) => {
      if (
        !el ||
        !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      // Do not touch non-text inputs like checkboxes, radios, range, file
      if (
        el instanceof HTMLInputElement &&
        !['text', 'search', 'tel', 'url', 'number', ''].includes(el.type)
      ) {
        return;
      }
      try {
        const currentVal = el.value || '';
        const printableScan = scannedText.replace(/[\x00-\x1f]+/g, '');
        let nextVal = currentVal;
        if (printableScan && currentVal.endsWith(printableScan)) {
          nextVal = currentVal.slice(0, currentVal.length - printableScan.length);
        } else if (
          printableScan &&
          currentVal.trim() === printableScan.trim()
        ) {
          nextVal = '';
        } else {
          // If the entire input was just populated by the rapid burst
          nextVal = '';
        }

        const prototype =
          el instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
          prototype,
          'value'
        )?.set;
        if (nativeValueSetter) {
          nativeValueSetter.call(el, nextVal);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.value = nextVal;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (err) {
        console.warn('[Scanner Buffer] Could not strip leaked input text:', err);
      }
    };

    const isKnownBarcodePattern = (code: string) => {
      const clean = code.replace(/^[\x00-\x20]+/, '').replace(/[\x00-\x20]+$/, '');
      if (clean.length < 4) return false;
      return (
        /^01\d{14}/.test(clean) ||
        /^\(01\)\d{14}/.test(clean) ||
        /^\][A-Za-z]\d/.test(clean) ||
        /^\d{6,14}$/.test(clean) ||
        /^ZMS-\d+/i.test(clean) ||
        /^MED-[A-Z0-9-]+$/i.test(clean) ||
        (clean.startsWith('{') && clean.endsWith('}'))
      );
    };

    const isLikelyBarcodeString = (code: string, avgMsPerKey: number) => {
      const clean = code.replace(/^[\x00-\x20]+/, '').replace(/[\x00-\x20]+$/, '');
      if (clean.length < 4) return false;
      if (isKnownBarcodePattern(clean)) {
        return true;
      }
      // Rapid hardware scanner burst (<= 110ms average per character across >= 5 chars)
      return clean.length >= 5 && avgMsPerKey <= 110;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
      );

      const hasCtrlOrCmd = e.ctrlKey || e.metaKey;

      // 1. Primary Global Navigation & Action Shortcuts (Ctrl+Key or Cmd+Key)
      if (hasCtrlOrCmd && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'p') {
          e.preventDefault();
          setActiveTab('pos');
          setIsMobileMenuOpen(false);
          soundService.click();
          showToast('⚡ Point of Sale (Ctrl+P)', 'success');
          return;
        }
        if (key === 'i') {
          e.preventDefault();
          setActiveTab('inventory');
          setIsMobileMenuOpen(false);
          soundService.click();
          showToast('⚡ Medicine & Product Stock (Ctrl+I)', 'success');
          return;
        }
        if (key === 'b') {
          e.preventDefault();
          setActiveTab('barcodes');
          setIsMobileMenuOpen(false);
          soundService.click();
          showToast('⚡ Barcode Generator & Label Studio (Ctrl+B)', 'success');
          return;
        }
        if (key === 's') {
          e.preventDefault();
          handleNavigateTab('settings', '⚡ Pharmacy Settings (Ctrl+S)');
          return;
        }
        if (key === 'o') {
          e.preventDefault();
          setActiveTab('overview');
          setIsMobileMenuOpen(false);
          soundService.click();
          showToast('⚡ Overview Dashboard (Ctrl+O)', 'success');
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          setActiveTab('khata');
          setIsMobileMenuOpen(false);
          soundService.click();
          showToast('⚡ Credit Khata Accounts (Ctrl+K)', 'success');
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          handleNavigateTab('suppliers', '⚡ Supplier & GRN Ledger (Ctrl+D)');
          return;
        }
        if (key === 'g') {
          e.preventDefault();
          handleNavigateTab('galla', '⚡ Daily Galla Closing & Shift Reconciliation (Ctrl+G)');
          return;
        }
        if (key === 'r') {
          e.preventDefault();
          handleNavigateTab('reports', '⚡ Sales & Financial Reports (Ctrl+R)');
          return;
        }
        if (key === 'n') {
          e.preventDefault();
          if (!can(currentUser.role, 'canEditInventory')) {
            soundService.errorTone();
            showToast('Access denied: Only Owner or Pharmacist can register products', 'warn');
            return;
          }
          setSelectedMedicineForEdit(null);
          setIsMedicineModalOpen(true);
          soundService.click();
          showToast('⚡ Register Product Item (Ctrl+N)', 'success');
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          handleLock();
          showToast('🔒 Register Counter Locked (Ctrl+L)', 'warn');
          return;
        }
        if (key === '/') {
          e.preventDefault();
          setIsShortcutsModalOpen(true);
          soundService.click();
          return;
        }
      }

      // 2. Alt+ Key Alternatives (for users who prefer Alt navigation)
      if (e.altKey && !hasCtrlOrCmd) {
        const key = e.key.toLowerCase();
        if (key === 'p') { e.preventDefault(); setActiveTab('pos'); soundService.click(); showToast('⚡ Point of Sale (Alt+P)', 'success'); return; }
        if (key === 'i') { e.preventDefault(); setActiveTab('inventory'); soundService.click(); showToast('⚡ Stock (Alt+I)', 'success'); return; }
        if (key === 's') {
          e.preventDefault();
          handleNavigateTab('settings', '⚡ Pharmacy Settings (Ctrl+S)');
          return;
        }
        if (key === 'o') { e.preventDefault(); setActiveTab('overview'); soundService.click(); showToast('⚡ Overview (Alt+O)', 'success'); return; }
        if (key === 'k') { e.preventDefault(); setActiveTab('khata'); soundService.click(); showToast('⚡ Khata (Alt+K)', 'success'); return; }
        if (key === 'r') {
          e.preventDefault();
          handleNavigateTab('reports', '⚡ Sales & Financial Reports (Ctrl+R)');
          return;
        }
        if (key === 'n') {
          e.preventDefault();
          if (!can(currentUser.role, 'canEditInventory')) {
            soundService.errorTone();
            showToast('Access denied: Only Owner or Pharmacist can register products', 'warn');
            return;
          }
          setSelectedMedicineForEdit(null);
          setIsMedicineModalOpen(true);
          soundService.click();
          showToast('⚡ Register Product Item (Ctrl+N)', 'success');
          return;
        }
        if (key === 'l') { e.preventDefault(); handleLock(); return; }
      }

      // 3. F-keys and Help
      if (e.key === 'F4') {
        e.preventDefault();
        setIsScannerModalOpen(true);
        soundService.click();
        return;
      }
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsShortcutsModalOpen(true);
        soundService.click();
        return;
      }
      if (e.key === 'Escape') {
        clearScannerBuffer();
        setIsShortcutsModalOpen(false);
        setIsMedicineModalOpen(false);
        setIsScannerModalOpen(false);
        setIsInvoiceModalOpen(false);
        setIsLinkCodeModalOpen(false);
        setIsAuthModalOpen(false);
        setIsCounterDropdownOpen(false);
        return;
      }

      // 4. Hardware Barcode Gun Buffer (Works across ALL pages, even when search/form inputs are focused)
      // Do not hijack scans if MedicineModal or LinkCodeModal is actively open, or if the focused input opts into local scanning
      const isLocalScannerField =
        target?.getAttribute?.('data-scanner-local') === 'true';
      if (isMedicineModalOpen || isLinkCodeModalOpen || isLocalScannerField) {
        clearScannerBuffer();
        return;
      }

      // Ignore pure modifier keys so Shift keydowns before uppercase letters ('Flutiaze', 'NS', 'Rs.')
      // never reset or corrupt lastKeyTimeRef or barcodeBufferRef
      if (
        e.key === 'Shift' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.key === 'Meta' ||
        e.key === 'CapsLock' ||
        e.key === 'NumLock' ||
        e.key === 'ScrollLock' ||
        e.key === 'Dead'
      ) {
        return;
      }

      const now = Date.now();
      const timeDiff = lastKeyTimeRef.current > 0 ? now - lastKeyTimeRef.current : 9999;
      lastKeyTimeRef.current = now;

      // Support Group Separator (ASCII 29 / FNC1) emitted by 2D GS1 DataMatrix guns
      if (e.key === 'GroupSeparator' || e.keyCode === 29) {
        if (timeDiff <= 600 && barcodeBufferRef.current.length > 0) {
          barcodeBufferRef.current += '\x1d';
        }
        return;
      }

      if (e.key === 'Enter' || e.key === 'NumpadEnter' || e.key === 'Tab') {
        if (scannerAutoFlushTimerRef.current !== null) {
          window.clearTimeout(scannerAutoFlushTimerRef.current);
          scannerAutoFlushTimerRef.current = null;
        }

        let candidateCode = barcodeBufferRef.current.trim();
        const totalKeys = burstKeyCountRef.current;
        const burstDuration =
          burstStartTimeRef.current > 0 ? now - burstStartTimeRef.current : 0;
        const avgMsPerKey =
          totalKeys > 1 ? burstDuration / (totalKeys - 1) : timeDiff;

        clearScannerBuffer();

        // If an input on another tab (e.g., Khata, Reports, Overview, Inventory) was focused
        // and received a full barcode string directly in its value, also allow fallback to target.value
        const inputVal =
          isInput &&
          (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement)
            ? (target.value || '').trim()
            : '';

        if (
          inputVal.length > candidateCode.length &&
          isKnownBarcodePattern(inputVal)
        ) {
          candidateCode = inputVal;
        }

        // Check if this Enter/Tab terminates a valid hardware barcode scan
        const isRapidGunScan =
          candidateCode.length >= 4 &&
          timeDiff < (isInput ? 800 : 1500) &&
          (!isInput || isLikelyBarcodeString(candidateCode, avgMsPerKey));

        if (isRapidGunScan) {
          console.log('[Scanner Buffer] Flushing hardware barcode scan on key:', {
            triggerKey: e.key,
            candidateCode,
            charCount: candidateCode.length,
            burstDurationMs: Math.round(burstDuration),
            avgMsPerKey: Math.round(avgMsPerKey),
            wasInputFocused: isInput,
            fromTab: activeTab,
          });
          e.preventDefault();
          e.stopPropagation();
          if (isInput) {
            stripLeakedScannerTextFromInput(target, candidateCode);
          }
          handleScannedCode(candidateCode);
        }
      } else if (e.key.length === 1 && !hasCtrlOrCmd && !e.altKey) {
        // Allow a wider inter-character gap (1200ms when no input is focused, 450ms when an input is focused)
        // so wireless/Bluetooth guns or multi-packet 2D GS1 DataMatrix scans are never truncated mid-stream
        const maxGapMs = isInput ? 450 : 1200;
        if (timeDiff > maxGapMs) {
          barcodeBufferRef.current = e.key;
          burstStartTimeRef.current = now;
          burstKeyCountRef.current = 1;
        } else {
          barcodeBufferRef.current += e.key;
          burstKeyCountRef.current += 1;
        }

        // Auto-flush fallback for hardware scanners configured WITHOUT an Enter/Tab suffix
        if (scannerAutoFlushTimerRef.current !== null) {
          window.clearTimeout(scannerAutoFlushTimerRef.current);
          scannerAutoFlushTimerRef.current = null;
        }

        const currentBuffer = barcodeBufferRef.current;
        const currentCount = burstKeyCountRef.current;
        const currentDuration =
          burstStartTimeRef.current > 0 ? now - burstStartTimeRef.current : 0;
        const currentAvgMs =
          currentCount > 1 ? currentDuration / (currentCount - 1) : 999;

        const shouldAutoFlush = isInput
          ? currentBuffer.length >= 6 &&
            currentAvgMs <= 90 &&
            isLikelyBarcodeString(currentBuffer, currentAvgMs)
          : currentBuffer.length >= 4 &&
            (currentAvgMs <= 120 || isKnownBarcodePattern(currentBuffer));

        if (shouldAutoFlush) {
          const activeTarget = target;
          const wasFocusedInput = isInput;
          scannerAutoFlushTimerRef.current = window.setTimeout(() => {
            const finalCode = barcodeBufferRef.current.trim();
            clearScannerBuffer();
            if (finalCode.length >= 4) {
              console.log(
                '[Scanner Buffer] Auto-flushing suffixless hardware scanner burst:',
                {
                  finalCode,
                  charCount: finalCode.length,
                  avgMsPerKey: Math.round(currentAvgMs),
                  wasInputFocused: wasFocusedInput,
                  fromTab: activeTab,
                }
              );
              if (wasFocusedInput) {
                stripLeakedScannerTextFromInput(activeTarget, finalCode);
              }
              handleScannedCode(finalCode);
            }
          }, 240);
        }
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
      );
      const isLocalScannerField =
        target?.getAttribute?.('data-scanner-local') === 'true';
      if (isMedicineModalOpen || isLinkCodeModalOpen || isLocalScannerField) {
        return;
      }

      const pasted = (e.clipboardData?.getData('text') || '').trim();
      if (!pasted) return;

      // If user pastes a barcode while on any non-POS tab (or with no input focused), route directly to POS
      if ((!isInput && pasted.length >= 4) || (activeTab !== 'pos' && isKnownBarcodePattern(pasted))) {
        console.log('[Scanner Buffer] Intercepted barcode paste on tab:', {
          fromTab: activeTab,
          pasted,
          wasInputFocused: isInput,
        });
        e.preventDefault();
        e.stopPropagation();
        clearScannerBuffer();
        handleScannedCode(pasted);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('paste', handlePaste, true);
      if (scannerAutoFlushTimerRef.current !== null) {
        window.clearTimeout(scannerAutoFlushTimerRef.current);
        scannerAutoFlushTimerRef.current = null;
      }
    };
  }, [
    activeTab,
    medicines,
    handleScannedCode,
    handleNavigateTab,
    currentUser.role,
    showToast,
    isMedicineModalOpen,
    isLinkCodeModalOpen,
  ]);


  // Switch counter
  const handleSelectCounter = (name: string) => {
    syncEngine.setActiveCounter(name);
    setActiveCounter(name);
    setIsCounterDropdownOpen(false);
    soundService.click();
  };

  // Lock register
  const handleLock = () => {
    soundService.click();
    staffAuth.setLock(true);
    setIsLocked(true);
  };

  const handleUnlock = (user: UserAccount) => {
    setCurrentUser(user);
    setIsLocked(false);
  };

  const handleUserChanged = (user: UserAccount) => {
    setCurrentUser(user);
    if (!canOpenTab(user.role, activeTab)) {
      setActiveTab(defaultTabFor(user.role));
    }
  };

  const khataActiveCount = syncEngine.getKhataAccountsWithBalanceCount();
  const suppliersPayableCount = syncEngine.getSuppliersWithPayableCount();
  const criticalStockCount = useMemo(() => {
    return medicines.filter((m) => m.currentStockPacks <= (m.minThresholdPacks || 5)).length;
  }, [medicines]);

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'overview':
        return 'Overview';
      case 'pos':
        return 'Point of sale';
      case 'galla':
        return 'Daily Galla closing';
      case 'inventory':
        return 'Medicine stock';
      case 'barcodes':
        return 'Barcode generator';
      case 'critical_stock':
        return 'Critical Stock Alerts';
      case 'khata':
        return 'Credit khata';
      case 'suppliers':
        return 'Supplier & GRN';
      case 'reports':
        return 'Sales reports';
      case 'audit':
        return 'Monthly profit & expense audit';
      case 'settings':
        return 'Pharmacy settings';
      default:
        return 'Overview';
    }
  };

  // Get user role initials
  const userInitials = currentUser.role === 'owner' ? 'OW' : currentUser.role === 'pharmacist' ? 'PH' : 'CS';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex font-sans selection:bg-emerald-600 selection:text-white">
      {/* Lock Screen Overlay */}
      {isLocked && <LockScreen onUnlock={handleUnlock} />}

      {/* Floating Hardware Barcode Scan Toast */}
      {scanToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-150">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{scanToast.message}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* LEFT SIDEBAR: Compact, zero-scrollbar layout for 768p laptops   */}
      {/* ============================================================== */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#072418] text-slate-100 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-3.5 space-y-3.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 1. Brand Workspace Lockup */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              {pharmacyDetails.logoUrl ? (
                <img src={pharmacyDetails.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl p-0.5" />
              ) : (
                <div className="p-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-400">
                    <rect x="3" y="7" width="18" height="10" rx="5" transform="rotate(-45 12 12)" />
                    <line x1="8" y1="8" x2="16" y2="16" />
                  </svg>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="font-bold text-sm text-white truncate leading-tight">
                {pharmacyDetails.name}
              </h1>
              <span className="text-[9px] uppercase font-semibold tracking-wider text-emerald-400/80 block">
                Pharmacy Workspace
              </span>
            </div>
          </div>

          {/* 2. Active Counter Selector (Dropdown) */}
          <div className="relative">
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-1">
              Active Counter
            </span>
            <button
              onClick={() => setIsCounterDropdownOpen(!isCounterDropdownOpen)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d3424] hover:bg-[#12422e] border border-emerald-900/60 flex items-center justify-between text-xs font-semibold text-white transition cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="truncate">{activeCounter}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
            </button>

            {/* Counter Menu */}
            {isCounterDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#0b2d1f] border border-emerald-800/80 rounded-xl shadow-xl z-50 overflow-hidden py-1 text-xs">
                {counters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCounter(c.name)}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition ${
                      activeCounter === c.name
                        ? 'bg-emerald-800/40 text-emerald-300 font-bold'
                        : 'text-slate-300 hover:bg-emerald-900/40'
                    }`}
                  >
                    <span>{c.name}</span>
                    {activeCounter === c.name && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Navigation Sections */}
          <div className="space-y-3">
            {/* WORKSPACE */}
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-1">
                Workspace
              </span>
              <div className="space-y-0.5 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab('overview');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'overview'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Overview (Ctrl+O)"
                >
                  <div className="flex items-center gap-2.5">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Overview</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^O
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('pos');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'pos'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Point of sale (Ctrl+P)"
                >
                  <div className="flex items-center gap-2.5">
                    <ShoppingCart className="w-4 h-4" />
                    <span>Point of sale</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^P
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    handleNavigateTab('galla');
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'galla'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Daily Galla (Cash Drawer) Closing & Shift Reconciliation (Ctrl+G)"
                >
                  <div className="flex items-center gap-2.5">
                    <Calculator className="w-4 h-4 text-emerald-400" />
                    <span>Daily Galla closing</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^G
                  </kbd>
                </button>
              </div>
            </div>

            {/* MANAGE */}
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-1">
                Manage
              </span>
              <div className="space-y-0.5 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab('inventory');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'inventory'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Medicine stock (Ctrl+I)"
                >
                  <div className="flex items-center gap-2.5">
                    <Package className="w-4 h-4" />
                    <span>Medicine stock</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^I
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('barcodes');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'barcodes'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Barcode Generator & Label Studio (Ctrl+B)"
                >
                  <div className="flex items-center gap-2.5">
                    <Barcode className="w-4 h-4 text-emerald-400" />
                    <span>Barcode generator</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^B
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    handleNavigateTab('critical_stock');
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'critical_stock'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Critical stock alerts & reorder list"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Critical stock</span>
                  </div>
                  {criticalStockCount > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono tabular-nums">
                      {criticalStockCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveTab('khata');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'khata'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Credit khata (Ctrl+K)"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4" />
                    <span>Credit khata</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {khataActiveCount > 0 && (
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center font-mono tabular-nums">
                        {khataActiveCount}
                      </span>
                    )}
                    <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                      ^K
                    </kbd>
                  </div>
                </button>

                {(currentUser.role === 'owner' || currentUser.role === 'pharmacist') && (
                  <button
                    onClick={() => {
                      handleNavigateTab('suppliers');
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                      activeTab === 'suppliers'
                        ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                        : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                    }`}
                    title="Supplier / Distributor Khata & GRN Invoices (Ctrl+D)"
                  >
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-emerald-400" />
                      <span>Supplier &amp; GRN</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {suppliersPayableCount > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center font-mono tabular-nums">
                          {suppliersPayableCount}
                        </span>
                      )}
                      <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                        ^D
                      </kbd>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setActiveTab('reports');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'reports'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Sales reports (Ctrl+R)"
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="w-4 h-4" />
                    <span>Sales reports</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^R
                  </kbd>
                </button>

                {currentUser.role === 'owner' && (
                  <button
                    onClick={() => handleNavigateTab('audit', '⚡ Monthly Profit & Expense Audit')}
                    className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                      activeTab === 'audit'
                        ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                        : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                    }`}
                    title="Monthly Profit & Expense Audit (Owner Only)"
                  >
                    <div className="flex items-center gap-2.5">
                      <Wallet className="w-4 h-4 text-emerald-400" />
                      <span>Profit &amp; expense audit</span>
                    </div>
                    <span className="text-[10px] opacity-75">Owner</span>
                  </button>
                )}
              </div>
            </div>

            {/* STORE */}
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-1">
                Store
              </span>
              <div className="space-y-0.5 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                    activeTab === 'settings'
                      ? 'bg-[#e2f5ec] text-[#06261a] font-bold shadow-2xs'
                      : 'text-emerald-100/90 hover:bg-[#0c3927] hover:text-white'
                  }`}
                  title="Pharmacy settings (Ctrl+S)"
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="w-4 h-4" />
                    <span>Pharmacy settings</span>
                  </div>
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.2 rounded border border-current">
                    ^S
                  </kbd>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Bottom Profile & PocketBase Pill */}
        <div className="p-3 border-t border-emerald-900/60 bg-[#062016]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px] flex items-center justify-center border border-emerald-500/30">
                {userInitials}
              </div>
              <span className="text-xs font-bold text-white capitalize">
                {currentUser.role} view
              </span>
            </div>

            <button
              onClick={handleLock}
              className="p-1 rounded-lg text-emerald-400/80 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
              title="Lock Counter Register"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => {
              refreshHealth(true);
              setActiveTab('settings');
            }}
            className="w-full py-1.5 px-2.5 rounded-xl bg-[#0c3927] hover:bg-[#114932] border border-emerald-900/80 text-[10px] text-emerald-200/90 flex flex-col gap-1 transition cursor-pointer"
            title={
              connectionStatus.isPocketBaseLive
                ? 'PocketBase connected and synced'
                : `Auto-reconnecting to PocketBase in ${reconnectCountdown}s (${connectionStatus.pendingSyncCount} offline transactions queued)`
            }
          >
            <div className="w-full flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {isReconnectingSync ? (
                  <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      connectionStatus.isPocketBaseLive ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                    }`}
                  />
                )}
                <span className="truncate font-semibold">
                  {connectionStatus.isPocketBaseLive
                    ? 'PocketBase Live'
                    : isReconnectingSync
                    ? connectionStatus.pendingSyncCount > 0
                      ? `Syncing ${connectionStatus.pendingSyncCount} offline...`
                      : 'Reconnecting...'
                    : 'PocketBase not connected'}
                </span>
              </div>

              {(!connectionStatus.isPocketBaseLive || connectionStatus.pendingSyncCount > 0) && (
                <span className="font-mono tabular-nums text-[9px] font-bold text-amber-300/95 shrink-0">
                  {isReconnectingSync ? 'Sync' : `${reconnectCountdown}s`}
                </span>
              )}
            </div>

            {(!connectionStatus.isPocketBaseLive || connectionStatus.pendingSyncCount > 0) && (
              <div className="w-full space-y-1">
                <div className="w-full h-1 rounded-full bg-[#051810] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-linear ${
                      isReconnectingSync
                        ? 'w-full bg-emerald-400 animate-pulse'
                        : [
                            'w-full',
                            'w-[93%]',
                            'w-[87%]',
                            'w-[80%]',
                            'w-[73%]',
                            'w-[67%]',
                            'w-[60%]',
                            'w-[53%]',
                            'w-[47%]',
                            'w-[40%]',
                            'w-[33%]',
                            'w-[27%]',
                            'w-[20%]',
                            'w-[14%]',
                            'w-[8%]',
                            'w-[6%]',
                          ][Math.max(0, Math.min(15, reconnectCountdown))] + ' bg-amber-400/90'
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-emerald-300/75 font-mono tabular-nums">
                  <span>
                    {connectionStatus.pendingSyncCount > 0
                      ? `${connectionStatus.pendingSyncCount} pending sync`
                      : 'Offline queue ready'}
                  </span>
                  <span>
                    {isReconnectingSync ? 'Attempting sync...' : `Retry in ${reconnectCountdown}s`}
                  </span>
                </div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Backdrop for mobile sidebar */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* ============================================================== */}
      {/* MAIN VIEWPORT CANVAS (Offset by 256px on desktop)             */}
      {/* ============================================================== */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Sleek Single-Row Top Header Bar */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200/80">
          <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
            {/* Left: Mobile hamburger & Active View Heading with Date */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-1.5 rounded-xl border border-slate-200 text-slate-700 md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                  {getPageTitle(activeTab)}
                </h1>
                <span className="hidden sm:inline text-slate-300">&middot;</span>
                <p className="text-[11px] text-slate-500 font-sans">
                  {new Date().toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {/* Right: Counter Badge, Status Pill, Scanner, Alerts, Shortcuts, Settings, Avatar */}
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-900">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>{activeCounter}</span>
              </div>

              <button
                onClick={() => setIsScannerModalOpen(true)}
                className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                title="Camera Barcode Scanner (F4)"
              >
                <Camera className="w-4 h-4 text-emerald-800" />
              </button>

              <NotificationDropdown
                alerts={alerts}
                onSelectAlert={(alert) => {
                  if (alert.type === 'expired') {
                    setExternalInventoryFilter('expired');
                    setActiveTab('inventory');
                  } else if (alert.type === 'expiring_soon') {
                    if (alert.expiryWindow === '30_days') {
                      setExternalInventoryFilter('exp_30');
                    } else if (alert.expiryWindow === '60_days') {
                      setExternalInventoryFilter('exp_60');
                    } else if (alert.expiryWindow === '90_days') {
                      setExternalInventoryFilter('exp_90');
                    } else {
                      setExternalInventoryFilter('expiring');
                    }
                    setActiveTab('inventory');
                  } else {
                    setActiveTab('critical_stock');
                  }
                }}
              />

              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>{connectionStatus.isPocketBaseLive ? 'PocketBase synced' : 'Local preview'}</span>
              </div>

              {/* Global Keyboard Shortcuts Help */}
              <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
                title="Global Keyboard Shortcuts (Ctrl+/ or ?)"
              >
                <Keyboard className="w-4 h-4 text-emerald-800" />
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
                title="Open Settings (Ctrl+S)"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* User Avatar Circle */}
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center hover:scale-105 transition cursor-pointer"
                title="Switch Staff or Change PIN"
              >
                {userInitials}
              </button>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 px-4 sm:px-6 py-4 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <DashboardView
              medicines={medicines}
              sales={sales}
              pharmacyDetails={pharmacyDetails}
              onNavigateTab={setActiveTab}
              onOpenMedicineModal={(med) => {
                setSelectedMedicineForEdit(med || null);
                setIsMedicineModalOpen(true);
              }}
              onOpenProductTrackRecord={() => {
                setInitialReportSection('products');
                handleNavigateTab('reports', '⚡ Frequently Sold Products & Medicines Track Record');
              }}
            />
          )}

          {activeTab === 'pos' && (
            <PosView
              medicines={medicines}
              currentUser={currentUser}
              onProcessSale={syncEngine.processSale.bind(syncEngine)}
              onOpenScanner={() => setIsScannerModalOpen(true)}
              onSaleCompleted={(txn) => {
                setSelectedInvoice(txn);
                setIsInvoiceModalOpen(true);
              }}
              externalScannedItem={externalScannedItem}
              onExternalScanConsumed={handleExternalScanConsumed}
              externalScannedReceipt={externalScannedReceipt}
              onExternalReceiptScanConsumed={handleExternalReceiptScanConsumed}
              onUnrecognizedBarcode={(code) => {
                const parsed = parseScannedCode(code, medicines, sales);
                soundService.scanWarning();
                setUnrecognizedCode(code);
                setOutOfStockScannedMed(parsed.matchedMedicine || null);
                setIsLinkCodeModalOpen(true);
              }}
            />
          )}

          {activeTab === 'galla' && (
            <GallaClosingView
              counters={counters}
              activeCounter={activeCounter}
              currentUser={currentUser}
              gallaClosings={gallaClosings}
              onGallaUpdated={() => {
                setGallaClosings(syncEngine.getGallaClosings());
              }}
            />
          )}

          {activeTab === 'inventory' && (
            <SpreadsheetView
              medicines={medicines}
              onUpdateMedicine={syncEngine.updateMedicine.bind(syncEngine)}
              onDeleteMedicine={syncEngine.deleteMedicine.bind(syncEngine)}
              onOpenMedicineModal={(med) => {
                setSelectedMedicineForEdit(med || null);
                setPendingScannedCodeForModal('');
                setIsMedicineModalOpen(true);
              }}
              onOpenScanner={() => setIsScannerModalOpen(true)}
              onOpenPrintLabel={(med) => {
                setMedicineForLabel(med);
                setIsPrintLabelOpen(true);
              }}
              onOpenBarcodeStudio={(med) => {
                if (med) setInitialBarcodeMedicine(med);
                setActiveTab('barcodes');
                soundService.click();
              }}
              onScanBarcode={handleScannedCode}
              canEdit={currentUser.role === 'owner' || currentUser.role === 'pharmacist'}
              externalStockFilter={externalInventoryFilter}
              onExternalFilterConsumed={handleExternalFilterConsumed}
            />
          )}

          {activeTab === 'barcodes' && (
            <BarcodeStudioView
              medicines={medicines}
              pharmacyDetails={pharmacyDetails}
              canEdit={currentUser.role === 'owner' || currentUser.role === 'pharmacist'}
              initialSelectedMedicine={initialBarcodeMedicine}
              onInitialMedicineConsumed={handleInitialMedicineConsumed}
              onUpdateMedicine={async (id, updates) => {
                const updated = await syncEngine.updateMedicine(id, updates);
                setMedicines(syncEngine.getMedicines());
                return updated;
              }}
              onAddMedicine={async (item) => {
                const added = await syncEngine.addMedicine(item);
                setMedicines(syncEngine.getMedicines());
                return added;
              }}
            />
          )}

          {activeTab === 'critical_stock' && (
            <CriticalStockView
              medicines={medicines}
              onUpdateMedicine={syncEngine.updateMedicine.bind(syncEngine)}
              onOpenMedicineModal={(med) => {
                setSelectedMedicineForEdit(med || null);
                setIsMedicineModalOpen(true);
              }}
              canEdit={currentUser.role === 'owner' || currentUser.role === 'pharmacist'}
            />
          )}

          {activeTab === 'khata' && (
            <CreditKhataView
              customers={khataCustomers}
              sales={sales}
              onCustomerUpdated={() => {
                setKhataCustomers(syncEngine.getKhataCustomers());
              }}
              onSelectInvoice={(txn) => {
                setSelectedInvoice(txn);
                setIsInvoiceModalOpen(true);
              }}
            />
          )}

          {activeTab === 'suppliers' && (
            <SupplierKhataView
              suppliers={supplierAccounts}
              medicines={medicines}
              canEdit={currentUser.role === 'owner' || currentUser.role === 'pharmacist'}
              onSupplierUpdated={() => {
                setSupplierAccounts(syncEngine.getSupplierAccounts());
                setMedicines(syncEngine.getMedicines());
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              sales={sales}
              medicines={medicines}
              onSelectTransaction={(txn) => {
                setSelectedInvoice(txn);
                setIsInvoiceModalOpen(true);
              }}
              onRefundSale={(txnId, reason) =>
                syncEngine.refundSale(txnId, currentUser.name, reason)
              }
              canViewProfits={currentUser.role === 'owner'}
              canProcessRefund={
                currentUser.role === 'owner' || currentUser.role === 'pharmacist'
              }
              initialReportSection={initialReportSection}
              onReportSectionConsumed={handleReportSectionConsumed}
            />
          )}

          {activeTab === 'audit' && currentUser.role === 'owner' && (
            <AuditView currentUser={currentUser} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              onSettingsSaved={(updated) => {
                setPharmacyDetails(updated);
              }}
              onStaffListUpdated={() => {
                setCurrentUser(staffAuth.getCurrentUser());
              }}
            />
          )}
        </main>

        {/* Bottom subtle copyright / licence note matching Screenshot 1 */}
        <footer className="py-4 text-center text-[11px] text-slate-400 border-t border-slate-200 mt-auto bg-white/50">
          <span>{pharmacyDetails.name} · Licence {pharmacyDetails.drugLicenceNumber} · Pharmacy workspace preview</span>
        </footer>
      </div>

      {/* Modals & Dialogs */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onUserChanged={handleUserChanged}
      />

      <MedicineModal
        isOpen={isMedicineModalOpen}
        onClose={() => {
          setIsMedicineModalOpen(false);
          setPendingScannedCodeForModal('');
        }}
        medicine={selectedMedicineForEdit}
        initialScannedCode={pendingScannedCodeForModal}
        onSave={async (data) => {
          if (selectedMedicineForEdit) {
            const updated = await syncEngine.updateMedicine(selectedMedicineForEdit.id, data);
            if (pendingScannedCodeForModal && getTotalPiecesInStock(updated) > 0) {
              setExternalScannedItem({ medicine: updated, scanId: Date.now() });
              setActiveTab('pos');
              showToast(`Updated & added to POS: ${updated.name}`, 'success');
            }
          } else {
            const created = await syncEngine.addMedicine(data as any);
            if (pendingScannedCodeForModal && getTotalPiecesInStock(created) > 0) {
              setExternalScannedItem({ medicine: created, scanId: Date.now() });
              setActiveTab('pos');
              showToast(`Listed & added to POS: ${created.name}`, 'success');
            }
          }
          setPendingScannedCodeForModal('');
        }}
      />

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transaction={selectedInvoice}
        pharmacyDetails={pharmacyDetails}
        currentStaffName={currentUser.name}
        onTransactionUpdated={(updated) => {
          setSelectedInvoice(updated);
          setSales(syncEngine.getSales());
          setMedicines(syncEngine.getMedicines());
        }}
      />

      <BarcodeScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        onScan={handleScannedCode}
      />

      <PrintLabelModal
        isOpen={isPrintLabelOpen}
        onClose={() => setIsPrintLabelOpen(false)}
        medicine={medicineForLabel}
        onOpenInBarcodeStudio={(med) => {
          setInitialBarcodeMedicine(med);
          setActiveTab('barcodes');
        }}
        onMedicineUpdated={() => {
          setMedicines(syncEngine.getMedicines());
        }}
      />

      <LinkCodeModal
        isOpen={isLinkCodeModalOpen}
        onClose={() => {
          setIsLinkCodeModalOpen(false);
          setOutOfStockScannedMed(null);
        }}
        scannedCode={unrecognizedCode}
        medicines={medicines}
        currentUserName={currentUser.name}
        activeCounter={activeCounter}
        outOfStockMedicine={outOfStockScannedMed}
        onLinked={(m) => {
          showToast(`Saved ${m.name} in Medicine Stock!`, 'success');
        }}
        onOpenListMedicineModal={(rawCode, existingMed) => {
          setSelectedMedicineForEdit(existingMed || null);
          setPendingScannedCodeForModal(rawCode);
          setIsMedicineModalOpen(true);
        }}
        onAddedToShortBook={(itemName, packs) => {
          showToast(`Added "${itemName}" (+${packs} packs) to Counter Short Book!`, 'success');
        }}
        onQuickListedAndDispense={(m) => {
          setExternalScannedItem({
            medicine: m,
            scanId: Date.now(),
          });
          setActiveTab('pos');
          showToast(`Listed & added to POS Cart: ${m.name} (${m.strength})`, 'success');
        }}
      />

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      {isShortcutsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-[#072418] to-[#0c3927] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-300">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">
                    Pharmacist Shift Keyboard Shortcuts
                  </h3>
                  <p className="text-xs text-emerald-200/80">
                    High-speed hotkeys to navigate tabs and speed up counter dispensing.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
              {/* Category 1: Navigation Hotkeys */}
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 text-emerald-800 flex items-center gap-2">
                  <span>⚡ Instant View Navigation</span>
                  <span className="text-[10px] text-slate-400 font-normal normal-case">(Works anywhere across the app)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { keys: ['Ctrl', 'P'], alt: 'Alt + P', desc: 'Point of Sale (POS Register)', tab: 'pos' },
                    { keys: ['Ctrl', 'I'], alt: 'Alt + I', desc: 'Medicine Stock & Inventory', tab: 'inventory' },
                    { keys: ['Ctrl', 'B'], alt: 'Alt + B', desc: 'Barcode Generator & Label Studio', tab: 'barcodes' },
                    { keys: ['Ctrl', 'S'], alt: 'Alt + S', desc: 'Pharmacy Settings (Owner)', tab: 'settings' },
                    { keys: ['Ctrl', 'O'], alt: 'Alt + O', desc: 'Overview Dashboard', tab: 'overview' },
                    { keys: ['Ctrl', 'K'], alt: 'Alt + K', desc: 'Credit Khata Customer Ledger', tab: 'khata' },
                    { keys: ['Ctrl', 'R'], alt: 'Alt + R', desc: 'Sales Audit & Reports', tab: 'reports' },
                  ].map((s) => (
                    <button
                      key={s.desc}
                      type="button"
                      onClick={() => {
                        setActiveTab(s.tab);
                        setIsShortcutsModalOpen(false);
                        soundService.click();
                      }}
                      className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition flex items-center justify-between group shadow-2xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-emerald-800 transition">
                          {s.desc}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Or {s.alt}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-2 py-1 rounded-lg border border-slate-300 bg-slate-100 text-slate-800 font-mono text-[11px] font-bold shadow-xs group-hover:bg-white group-hover:border-emerald-300"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category 2: Counter & Action Hotkeys */}
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 text-emerald-800">
                  🎯 Counter & Register Actions
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'F2', desc: 'Focus Search / Barcode Gun in POS', badge: 'POS Screen' },
                    { key: 'F4', desc: 'Open Camera Barcode Scanner', badge: 'Global' },
                    { key: 'Ctrl + N', desc: 'Register New Product / Medicine', badge: 'Global' },
                    { key: 'Ctrl + L', desc: 'Quick Lock Register Screen', badge: 'Security' },
                    { key: 'Esc', desc: 'Close Active Modal / Clear Search', badge: 'General' },
                    { key: '?', desc: 'Open this Keyboard Shortcuts Guide', badge: 'Help' },
                  ].map((s) => (
                    <div
                      key={s.desc}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{s.desc}</div>
                        <span className="text-[10px] text-emerald-700 font-semibold">{s.badge}</span>
                      </div>
                      <kbd className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-800 font-mono text-[11px] font-bold shadow-xs">
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pro-Tip Box */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold">Pharmacist Tip:</span> You can use <kbd className="font-mono font-bold bg-white px-1 rounded border border-emerald-300">Ctrl</kbd> or <kbd className="font-mono font-bold bg-white px-1 rounded border border-emerald-300">Alt</kbd> keys interchangeably. Barcode scanning guns function simultaneously without requiring any manual hotkey clicks.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#072418] hover:bg-[#0c3927] text-white font-bold text-xs shadow-md shadow-emerald-950/20 transition"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
