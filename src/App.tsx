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
  ShieldAlert
} from 'lucide-react';
import { 
  ConnectionStatus, 
  MedicineItem, 
  PharmacyDetails, 
  SaleTransaction, 
  UserAccount, 
  CustomerKhata 
} from './types/pharmacy';
import { syncEngine } from './services/syncEngine';
import { staffAuth } from './services/staffAuth';
import { soundService } from './services/soundAlerts';
import { checkPocketBaseHealth } from './lib/pocketbase';
import { parseScannedCode } from './utils/codeParser';
import { can, canOpenTab, defaultTabFor } from './utils/permissions';

// Views & Components
import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { CriticalStockView } from './components/CriticalStockView';
import { CreditKhataView } from './components/CreditKhataView';
import { ReportsView } from './components/ReportsView';
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
  const [alerts, setAlerts] = useState(syncEngine.getAlerts());

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMedicineModalOpen, setIsMedicineModalOpen] = useState(false);
  const [selectedMedicineForEdit, setSelectedMedicineForEdit] = useState<MedicineItem | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SaleTransaction | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isPrintLabelOpen, setIsPrintLabelOpen] = useState(false);
  const [medicineForLabel, setMedicineForLabel] = useState<MedicineItem | null>(null);
  const [isLinkCodeModalOpen, setIsLinkCodeModalOpen] = useState(false);
  const [unrecognizedCode, setUnrecognizedCode] = useState('');
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Hardware Scanner buffer
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const [scanToast, setScanToast] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);

  // PocketBase Connection
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: true,
    isPocketBaseLive: false,
    origin: typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8090',
    lastChecked: 'Checking...',
    pendingSyncCount: 0,
  });

  const refreshHealth = useCallback(async () => {
    const health = await checkPocketBaseHealth();
    setConnectionStatus({
      isConnected: health.isConnected,
      isPocketBaseLive: health.isPocketBaseLive,
      origin: health.origin,
      lastChecked: health.lastChecked,
      pendingSyncCount: syncEngine.getOutboxCount(),
    });
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
  
  // SyncEngine Subscription
  useEffect(() => {
    refreshHealth();
    const unsub = syncEngine.subscribe(() => {
      setMedicines(syncEngine.getMedicines());
      setSales(syncEngine.getSales());
      setKhataCustomers(syncEngine.getKhataCustomers());
      setAlerts(syncEngine.getAlerts());
      setPharmacyDetails(syncEngine.getPharmacyDetails());
      setCounters(syncEngine.getCounters());
      setActiveCounter(syncEngine.getActiveCounter());
      refreshHealth();
    });

    const timer = setInterval(() => {
      refreshHealth();
    }, 15000);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [refreshHealth]);

  // Global Keyboard Shortcuts & Hardware Scanner Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

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
        setIsShortcutsModalOpen(false);
        setIsMedicineModalOpen(false);
        setIsScannerModalOpen(false);
        setIsInvoiceModalOpen(false);
        setIsLinkCodeModalOpen(false);
        setIsAuthModalOpen(false);
        setIsCounterDropdownOpen(false);
      }

      // 4. Hardware Barcode Gun Buffer
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const candidateCode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        if (candidateCode.length >= 4) {
          handleScannedCode(candidateCode);
        }
      } else if (e.key.length === 1 && !hasCtrlOrCmd && !e.altKey) {
        if (timeDiff > 120 && !isInput) {
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [medicines]);

  const handleScannedCode = (rawCode: string) => {
    const parsed = parseScannedCode(rawCode, medicines);
    if (parsed.matchedMedicine) {
      soundService.scanSuccess();
      showToast(`Scanned: ${parsed.matchedMedicine.name} (${parsed.matchedMedicine.strength})`, 'success');
      setActiveTab('pos');
    } else {
      soundService.scanWarning();
      setUnrecognizedCode(parsed.barcode || rawCode);
      setIsLinkCodeModalOpen(true);
    }
  };


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
  const criticalStockCount = useMemo(() => {
    return medicines.filter((m) => m.currentStockPacks <= (m.minThresholdPacks || 5)).length;
  }, [medicines]);

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'overview':
        return 'Overview';
      case 'pos':
        return 'Point of sale';
      case 'inventory':
        return 'Medicine stock';
      case 'critical_stock':
        return 'Critical Stock Alerts';
      case 'khata':
        return 'Credit khata';
      case 'reports':
        return 'Sales reports';
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
      {/* LEFT SIDEBAR: Matches Screenshot 1, 2, 3 Layout               */}
      {/* ============================================================== */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#072418] text-slate-100 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 space-y-6 overflow-y-auto">
          {/* 1. Brand Workspace Lockup */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              {pharmacyDetails.logoUrl ? (
                <img src={pharmacyDetails.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl p-0.5" />
              ) : (
                <div className="p-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5 text-emerald-400">
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
              <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400/80 block mt-0.5">
                Pharmacy Workspace
              </span>
            </div>
          </div>

          {/* 2. Active Counter Selector (Dropdown) */}
          <div className="relative">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-1.5">
              Active Counter
            </span>
            <button
              onClick={() => setIsCounterDropdownOpen(!isCounterDropdownOpen)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0d3424] hover:bg-[#12422e] border border-emerald-900/60 flex items-center justify-between text-xs font-semibold text-white transition"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="truncate">{activeCounter}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
            </button>

            {/* Counter Menu */}
            {isCounterDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#0b2d1f] border border-emerald-800/80 rounded-xl shadow-xl z-50 overflow-hidden py-1 text-xs">
                {counters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCounter(c.name)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between transition ${
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

            <div className="flex items-center gap-1.5 text-[10px] text-emerald-300/60 mt-1.5 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Local preview data</span>
            </div>
          </div>

          {/* 3. Navigation Sections */}
          <div className="space-y-5">
            {/* WORKSPACE */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-2">
                Workspace
              </span>
              <div className="space-y-1 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab('overview');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.5 rounded border border-current">
                    ^O
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('pos');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.5 rounded border border-current">
                    ^P
                  </kbd>
                </button>
              </div>
            </div>

            {/* MANAGE */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-2">
                Manage
              </span>
              <div className="space-y-1 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab('inventory');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.5 rounded border border-current">
                    ^I
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    handleNavigateTab('critical_stock');
                  }}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                    <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
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
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                        {khataActiveCount}
                      </span>
                    )}
                    <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.5 rounded border border-current">
                      ^K
                    </kbd>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('reports');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.5 rounded border border-current">
                    ^R
                  </kbd>
                </button>
              </div>
            </div>

            {/* STORE */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60 block mb-2">
                Store
              </span>
              <div className="space-y-1 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setIsMobileMenuOpen(false);
                    soundService.click();
                  }}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition ${
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
                  <kbd className="text-[9px] font-mono opacity-50 font-normal px-1 py-0.5 rounded border border-current">
                    ^S
                  </kbd>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Bottom Profile & PocketBase Pill (Screenshot 1, 2, 3) */}
        <div className="p-3.5 border-t border-emerald-900/60 bg-[#062016]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center justify-center border border-emerald-500/30">
                {userInitials}
              </div>
              <div>
                <span className="text-xs font-bold text-white block capitalize">
                  {currentUser.role} view
                </span>
              </div>
            </div>

            <button
              onClick={handleLock}
              className="p-1.5 rounded-lg text-emerald-400/80 hover:text-rose-400 hover:bg-rose-950/30 transition"
              title="Lock Counter Register"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setActiveTab('settings')}
            className="w-full py-1 px-2 rounded-lg bg-[#0c3927] hover:bg-[#114932] border border-emerald-900/80 text-[11px] text-emerald-200/90 flex items-center justify-center gap-1.5 transition"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus.isPocketBaseLive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>{connectionStatus.isPocketBaseLive ? 'PocketBase Live' : 'PocketBase not connected'}</span>
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
        {/* Top Header Bar (Matching Screenshot 1, 2, 3) */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200/80">
          <div className="px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
            {/* Left: Mobile hamburger & Active View Heading with Date */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-1.5 rounded-xl border border-slate-200 text-slate-700 md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                  {getPageTitle(activeTab)}
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-500 font-sans mt-0.5">
                  {new Date().toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {/* Right: Status Pill, Scanner, Alerts, Settings Shortcut, Avatar */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setIsScannerModalOpen(true)}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                title="Camera Barcode Scanner"
              >
                <Camera className="w-4 h-4 text-emerald-800" />
              </button>

              <NotificationDropdown
                alerts={alerts}
                onSelectAlert={() => setActiveTab('inventory')}
              />

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Preview · local only</span>
              </div>

              {/* Global Keyboard Shortcuts Help */}
              <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
                title="Global Keyboard Shortcuts (Ctrl+/ or ?)"
              >
                <Keyboard className="w-4 h-4 text-emerald-800" />
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
                title="Open Settings (Ctrl+S)"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* User Avatar Circle */}
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center hover:scale-105 transition"
                title="Switch Staff or Change PIN"
              >
                {userInitials}
              </button>
            </div>
          </div>

          {/* Sub-banner: "Sample information · saved in this browser only" (Screenshots 1, 2, 3) */}
          <div className="px-4 sm:px-8 py-2 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>Sample information · saved in this browser only</span>
            </div>
            <span className="font-semibold text-slate-700 hidden sm:inline">
              {activeCounter}
            </span>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
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
            />
          )}

          {activeTab === 'inventory' && (
            <SpreadsheetView
              medicines={medicines}
              onUpdateMedicine={syncEngine.updateMedicine.bind(syncEngine)}
              onDeleteMedicine={syncEngine.deleteMedicine.bind(syncEngine)}
              onOpenMedicineModal={(med) => {
                setSelectedMedicineForEdit(med || null);
                setIsMedicineModalOpen(true);
              }}
              onOpenScanner={() => setIsScannerModalOpen(true)}
              onOpenPrintLabel={(med) => {
                setMedicineForLabel(med);
                setIsPrintLabelOpen(true);
              }}
              canEdit={currentUser.role === 'owner' || currentUser.role === 'pharmacist'}
            />
          )}

          {activeTab === 'critical_stock' && (
            <CriticalStockView
              medicines={medicines}
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
              onCustomerUpdated={() => {
                setKhataCustomers(syncEngine.getKhataCustomers());
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              sales={sales}
              onSelectTransaction={(txn) => {
                setSelectedInvoice(txn);
                setIsInvoiceModalOpen(true);
              }}
              canViewProfits={currentUser.role === 'owner'}
            />
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
        onClose={() => setIsMedicineModalOpen(false)}
        medicine={selectedMedicineForEdit}
        onSave={async (data) => {
          if (selectedMedicineForEdit) {
            await syncEngine.updateMedicine(selectedMedicineForEdit.id, data);
          } else {
            await syncEngine.addMedicine(data as any);
          }
        }}
      />

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transaction={selectedInvoice}
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
      />

      <LinkCodeModal
        isOpen={isLinkCodeModalOpen}
        onClose={() => setIsLinkCodeModalOpen(false)}
        scannedCode={unrecognizedCode}
        medicines={medicines}
        onLinked={(m) => {
          showToast(`Linked barcode to ${m.name}!`, 'success');
          setActiveTab('pos');
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
