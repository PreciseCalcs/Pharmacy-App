import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  FileSpreadsheet, 
  BarChart3, 
  Lock, 
  User, 
  Users, 
  Camera, 
  Bell, 
  ShieldCheck, 
  Sparkles,
  Check
} from 'lucide-react';
import { 
  ConnectionStatus, 
  MedicineItem, 
  SaleTransaction, 
  UserAccount, 
  ZAHID_PHARMACY_DETAILS 
} from './types/pharmacy';
import { syncEngine } from './services/syncEngine';
import { staffAuth } from './services/staffAuth';
import { soundService } from './services/soundAlerts';
import { checkPocketBaseHealth } from './lib/pocketbase';
import { parseScannedCode } from './utils/codeParser';
import { can, canOpenTab, defaultTabFor, ROLE_INFO } from './utils/permissions';

// Components
import { ZahidLogo } from './components/ZahidLogo';
import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { ReportsView } from './components/ReportsView';
import { LockScreen } from './components/LockScreen';
import { AuthModal } from './components/AuthModal';
import { UserManagementModal } from './components/UserManagementModal';
import { MedicineModal } from './components/MedicineModal';
import { InvoiceModal } from './components/InvoiceModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { PrintLabelModal } from './components/PrintLabelModal';
import { LinkCodeModal } from './components/LinkCodeModal';
import { NotificationDropdown } from './components/NotificationDropdown';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  // Navigation & Authentication
  const [currentUser, setCurrentUser] = useState<UserAccount>(staffAuth.getCurrentUser());
  const [isLocked, setIsLocked] = useState<boolean>(staffAuth.isLocked());
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Core Data
  const [medicines, setMedicines] = useState<MedicineItem[]>(syncEngine.getMedicines());
  const [sales, setSales] = useState<SaleTransaction[]>(syncEngine.getSales());
  const [alerts, setAlerts] = useState(syncEngine.getAlerts());

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);
  const [isMedicineModalOpen, setIsMedicineModalOpen] = useState(false);
  const [selectedMedicineForEdit, setSelectedMedicineForEdit] = useState<MedicineItem | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SaleTransaction | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isPrintLabelOpen, setIsPrintLabelOpen] = useState(false);
  const [medicineForLabel, setMedicineForLabel] = useState<MedicineItem | null>(null);
  const [isLinkCodeModalOpen, setIsLinkCodeModalOpen] = useState(false);
  const [unrecognizedCode, setUnrecognizedCode] = useState('');

  // Hardware Scanner buffer
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const [scanToast, setScanToast] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);

  // PocketBase connection state
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

  // Subscribe to syncEngine updates
  useEffect(() => {
    refreshHealth();
    const unsub = syncEngine.subscribe(() => {
      setMedicines(syncEngine.getMedicines());
      setSales(syncEngine.getSales());
      setAlerts(syncEngine.getAlerts());
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

  // Global Hardware USB Barcode Scanner Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing inside an active modal text/input field (unless it's Enter)
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Barcode scanners type rapidly (< 60ms between keystrokes)
      if (e.key === 'Enter') {
        const candidateCode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        if (candidateCode.length >= 4) {
          handleScannedCode(candidateCode);
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 120 && !isInput) {
          // Reset buffer if delay too long (manual typing)
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [medicines]);

  // Core handler for codes scanned via hardware gun or camera
  const handleScannedCode = (rawCode: string) => {
    const parsed = parseScannedCode(rawCode, medicines);

    if (parsed.matchedMedicine) {
      soundService.scanSuccess();
      showToast(`Scanned: ${parsed.matchedMedicine.name} (${parsed.matchedMedicine.strength})`, 'success');
      // If currently on POS tab, user can dispense directly
      setActiveTab('pos');
    } else {
      soundService.scanWarning();
      setUnrecognizedCode(parsed.barcode || rawCode);
      setIsLinkCodeModalOpen(true);
    }
  };

  const showToast = (message: string, type: 'success' | 'warn') => {
    setScanToast({ message, type });
    setTimeout(() => {
      setScanToast(null);
    }, 3000);
  };

  // Lock and User management
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

  // Medicine CRUD
  const handleOpenMedicineModal = (med?: MedicineItem) => {
    setSelectedMedicineForEdit(med || null);
    setIsMedicineModalOpen(true);
  };

  const handleSaveMedicine = async (data: Partial<MedicineItem>) => {
    if (selectedMedicineForEdit) {
      await syncEngine.updateMedicine(selectedMedicineForEdit.id, data);
    } else {
      await syncEngine.addMedicine(data as any);
    }
  };

  const handleDeleteMedicine = async (id: string) => {
    return syncEngine.deleteMedicine(id);
  };

  // Transaction checkout
  const handleProcessSale = async (saleData: any) => {
    return syncEngine.processSale(saleData);
  };

  const handleSaleCompleted = (txn: SaleTransaction) => {
    setSelectedInvoice(txn);
    setIsInvoiceModalOpen(true);
  };

  const handleOpenPrintLabel = (med: MedicineItem) => {
    setMedicineForLabel(med);
    setIsPrintLabelOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Lock Screen Overlay */}
      {isLocked && <LockScreen onUnlock={handleUnlock} />}

      {/* Hardware Barcode Scan Floating Toast Notification */}
      {scanToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-150">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{scanToast.message}</span>
        </div>
      )}

      {/* Main App Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Store Emblem & Branding */}
            <div className="flex items-center gap-6">
              <ZahidLogo size="md" />

              {/* Navigation Tabs */}
              <nav className="hidden md:flex items-center gap-1 text-xs font-semibold">
                {canOpenTab(currentUser.role, 'dashboard') && (
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-3 py-2 rounded-xl flex items-center gap-1.5 transition ${
                      activeTab === 'dashboard'
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                    <span>Dashboard</span>
                  </button>
                )}

                {canOpenTab(currentUser.role, 'pos') && (
                  <button
                    onClick={() => setActiveTab('pos')}
                    className={`px-3 py-2 rounded-xl flex items-center gap-1.5 transition ${
                      activeTab === 'pos'
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4 text-emerald-600" />
                    <span>POS Dispense</span>
                  </button>
                )}

                {canOpenTab(currentUser.role, 'inventory') && (
                  <button
                    onClick={() => setActiveTab('inventory')}
                    className={`px-3 py-2 rounded-xl flex items-center gap-1.5 transition ${
                      activeTab === 'inventory'
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Stock Ledger</span>
                  </button>
                )}

                {canOpenTab(currentUser.role, 'reports') && (
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`px-3 py-2 rounded-xl flex items-center gap-1.5 transition ${
                      activeTab === 'reports'
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    <span>Sales Audit</span>
                  </button>
                )}
              </nav>
            </div>

            {/* Right Tools & Status Indicators */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Camera Scanner Trigger */}
              <button
                onClick={() => setIsScannerModalOpen(true)}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                title="Open Camera Barcode Scanner"
              >
                <Camera className="w-5 h-5 text-emerald-700" />
              </button>

              {/* Stock Alerts Dropdown */}
              <NotificationDropdown
                alerts={alerts}
                onSelectAlert={() => setActiveTab('inventory')}
              />

              {/* PocketBase Connection Pill */}
              <OfflineIndicator
                status={connectionStatus}
                onRefreshHealth={refreshHealth}
              />

              {/* PWA Install Button */}
              <PWAInstallButton className="hidden sm:flex" />

              {/* Staff Profile & Switcher */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition text-left"
                  title="Switch Staff Member or Change Security PIN"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-300">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div className="hidden lg:block leading-none">
                    <div className="text-xs font-bold text-slate-900">{currentUser.name}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{currentUser.role}</div>
                  </div>
                </button>

                {/* Owner Staff Admin Link */}
                {currentUser.role === 'owner' && (
                  <button
                    onClick={() => setIsUserMgmtOpen(true)}
                    className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                    title="Manage Staff Accounts & RBAC"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}

                {/* Quick Lock Register Button */}
                <button
                  onClick={handleLock}
                  className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                  title="Lock Counter Register"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Tab Navigation Bar */}
          <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-100 text-xs font-semibold">
            {canOpenTab(currentUser.role, 'dashboard') && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-1 px-2.5 rounded-lg ${
                  activeTab === 'dashboard' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-600'
                }`}
              >
                Dashboard
              </button>
            )}
            {canOpenTab(currentUser.role, 'pos') && (
              <button
                onClick={() => setActiveTab('pos')}
                className={`py-1 px-2.5 rounded-lg ${
                  activeTab === 'pos' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-600'
                }`}
              >
                POS Register
              </button>
            )}
            {canOpenTab(currentUser.role, 'inventory') && (
              <button
                onClick={() => setActiveTab('inventory')}
                className={`py-1 px-2.5 rounded-lg ${
                  activeTab === 'inventory' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-600'
                }`}
              >
                Ledger
              </button>
            )}
            {canOpenTab(currentUser.role, 'reports') && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`py-1 px-2.5 rounded-lg ${
                  activeTab === 'reports' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-600'
                }`}
              >
                Audits
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Application Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            medicines={medicines}
            sales={sales}
            onNavigateTab={setActiveTab}
            onOpenMedicineModal={handleOpenMedicineModal}
          />
        )}

        {activeTab === 'pos' && (
          <PosView
            medicines={medicines}
            currentUser={currentUser}
            onProcessSale={handleProcessSale}
            onOpenScanner={() => setIsScannerModalOpen(true)}
            onSaleCompleted={handleSaleCompleted}
          />
        )}

        {activeTab === 'inventory' && (
          <SpreadsheetView
            medicines={medicines}
            onUpdateMedicine={syncEngine.updateMedicine.bind(syncEngine)}
            onDeleteMedicine={handleDeleteMedicine}
            onOpenMedicineModal={handleOpenMedicineModal}
            onOpenScanner={() => setIsScannerModalOpen(true)}
            onOpenPrintLabel={handleOpenPrintLabel}
            canEdit={can(currentUser.role, 'canEditInventory')}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            sales={sales}
            onSelectTransaction={(txn) => {
              setSelectedInvoice(txn);
              setIsInvoiceModalOpen(true);
            }}
            canViewProfits={can(currentUser.role, 'canViewProfits')}
          />
        )}
      </main>

      {/* Persistent Pharmacy System Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-slate-200 font-semibold">{ZAHID_PHARMACY_DETAILS.name}</span>
            <span>&bull;</span>
            <span>{ZAHID_PHARMACY_DETAILS.address}, {ZAHID_PHARMACY_DETAILS.city}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span>Licence: <strong className="text-slate-200">{ZAHID_PHARMACY_DETAILS.drugLicenceNumber}</strong></span>
            <span>Helpline: <strong className="text-slate-200">{ZAHID_PHARMACY_DETAILS.phone}</strong></span>
            <span>PocketBase: <strong className="text-emerald-400">pb_public [Zero-URL]</strong></span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onUserChanged={handleUserChanged}
      />

      <UserManagementModal
        isOpen={isUserMgmtOpen}
        onClose={() => setIsUserMgmtOpen(false)}
        onStaffUpdated={() => {
          setCurrentUser(staffAuth.getCurrentUser());
        }}
      />

      <MedicineModal
        isOpen={isMedicineModalOpen}
        onClose={() => setIsMedicineModalOpen(false)}
        medicine={selectedMedicineForEdit}
        onSave={handleSaveMedicine}
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
    </div>
  );
}
