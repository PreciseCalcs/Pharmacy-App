import React, { useState, useRef } from 'react';
import { 
  Building2, 
  User, 
  Users, 
  MapPin, 
  Phone, 
  FileText, 
  Save, 
  Upload, 
  Plus, 
  Trash2, 
  Check, 
  Server, 
  CheckCircle2, 
  AlertCircle,
  Shield,
  KeyRound,
  Edit2,
  Download,
  DatabaseBackup,
  RotateCcw,
  FileJson,
  FileSpreadsheet
} from 'lucide-react';
import { PharmacyCounter, PharmacyDetails, UserAccount, UserRole } from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { staffAuth } from '../services/staffAuth';
import { soundService } from '../services/soundAlerts';
import { checkPocketBaseHealth } from '../lib/pocketbase';

interface SettingsViewProps {
  currentUser: UserAccount;
  onSettingsSaved: (details: PharmacyDetails) => void;
  onStaffListUpdated: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  onSettingsSaved,
  onStaffListUpdated,
}) => {
  const [details, setDetails] = useState<PharmacyDetails>(syncEngine.getPharmacyDetails());
  const [counters, setCounters] = useState<PharmacyCounter[]>(syncEngine.getCounters());
  const [activeCounter, setActiveCounter] = useState<string>(syncEngine.getActiveCounter());
  const [staffList, setStaffList] = useState<UserAccount[]>(staffAuth.getStaffList());

  // Owner Access Verification State
  const [isOwnerUnlocked, setIsOwnerUnlocked] = useState(currentUser.role === 'owner');
  const [verifyPin, setVerifyPin] = useState('');
  const [verifyError, setVerifyError] = useState('');

  // Add counter state
  const [newCounterName, setNewCounterName] = useState('');
  const [newCounterNote, setNewCounterNote] = useState('');
  const [showAddCounter, setShowAddCounter] = useState(false);

  // Add user state
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [userError, setUserError] = useState('');

  // Editing existing user
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('cashier');
  const [editPin, setEditPin] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // PocketBase connection test state
  const [pbAddress, setPbAddress] = useState(details.pocketBaseUrl || 'http://127.0.0.1:8090');
  const [isTestingPb, setIsTestingPb] = useState(false);
  const [pbTestResult, setPbTestResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

  // Logo file input
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const khataCsvInputRef = useRef<HTMLInputElement>(null);
  const [khataImportMode, setKhataImportMode] = useState<'merge' | 'replace'>('merge');
  const [khataSyncNotice, setKhataSyncNotice] = useState<{
    type: 'success' | 'error';
    title: string;
    detail: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Disaster Recovery Backup & Restore state
  const [backupNotice, setBackupNotice] = useState<{
    type: 'success' | 'error';
    title: string;
    detail: string;
  } | null>(null);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false);
  const [dbStats, setDbStats] = useState(() => ({
    medicines: syncEngine.getMedicines().length,
    sales: syncEngine.getSales().length,
    khata: syncEngine.getKhataCustomers().length,
    khataBalance: syncEngine.getTotalOutstandingKhata(),
    staff: staffAuth.getStaffList().length,
  }));

  const refreshDbStats = () => {
    setDbStats({
      medicines: syncEngine.getMedicines().length,
      sales: syncEngine.getSales().length,
      khata: syncEngine.getKhataCustomers().length,
      khataBalance: syncEngine.getTotalOutstandingKhata(),
      staff: staffAuth.getStaffList().length,
    });
  };

  // Owner PIN check if not logged in as owner
  const handleVerifyOwner = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError('');
    const user = staffAuth.verifyPin(verifyPin);
    if (user && user.role === 'owner') {
      soundService.cashRegister();
      setIsOwnerUnlocked(true);
    } else {
      soundService.errorTone();
      setVerifyError('Invalid Owner security PIN.');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      soundService.errorTone();
      setBackupNotice({
        type: 'error',
        title: 'Logo file is too large',
        detail: 'Please choose an image file smaller than 2 MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      const base64 = uploadEvent.target?.result as string;
      const nextDetails = { ...details, logoUrl: base64 };
      setDetails(nextDetails);
      const updated = await syncEngine.updatePharmacyDetails(nextDetails);
      onSettingsSaved(updated);
      soundService.cashRegister();
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    const nextDetails = { ...details, logoUrl: undefined };
    setDetails(nextDetails);
    const updated = await syncEngine.updatePharmacyDetails(nextDetails);
    onSettingsSaved(updated);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    soundService.click();
  };

  const handleAddCounter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCounterName.trim()) return;
    const added = syncEngine.addCounter({
      name: newCounterName.trim(),
      locationNote: newCounterNote.trim() || 'Dispense counter',
    });
    setCounters(syncEngine.getCounters());
    setNewCounterName('');
    setNewCounterNote('');
    setShowAddCounter(false);
    soundService.click();
  };

  const handleDeleteCounter = (id: string) => {
    if (counters.length <= 1) {
      alert('At least one counter must remain registered');
      return;
    }
    syncEngine.deleteCounter(id);
    setCounters(syncEngine.getCounters());
    setActiveCounter(syncEngine.getActiveCounter());
    soundService.click();
  };

  const handleSelectCounter = (name: string) => {
    syncEngine.setActiveCounter(name);
    setActiveCounter(name);
    soundService.click();
  };

  // Staff User Management
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');

    if (!newUserName.trim()) {
      setUserError('Name is required');
      return;
    }
    if (!/^\d{4,6}$/.test(newUserPin)) {
      setUserError('PIN must be 4 to 6 numeric digits');
      return;
    }

    const res = staffAuth.addStaff({
      name: newUserName.trim(),
      role: newUserRole,
      pin: newUserPin,
      phone: newUserPhone.trim() || undefined,
      email: newUserEmail.trim() || undefined,
      isActive: true,
    });

    if (res.success) {
      soundService.cashRegister();
      setStaffList(staffAuth.getStaffList());
      setNewUserName('');
      setNewUserPin('');
      setNewUserPhone('');
      setNewUserEmail('');
      setShowAddUser(false);
      onStaffListUpdated();
    } else {
      soundService.errorTone();
      setUserError(res.message || 'Failed to add user');
    }
  };

  const handleStartEditUser = (u: UserAccount) => {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditRole(u.role);
    setEditPin(''); // Keep blank so hashed PIN is never exposed; only updates if new PIN is typed
    setEditPhone(u.phone || '');
  };

  const handleSaveEditUser = (userId: string) => {
    const res = staffAuth.editUserAccount(userId, {
      name: editName,
      role: editRole,
      pin: editPin,
      phone: editPhone,
    });

    if (res.success) {
      soundService.click();
      setStaffList(staffAuth.getStaffList());
      setEditingUserId(null);
      onStaffListUpdated();
    } else {
      soundService.errorTone();
      alert(res.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this staff account?')) {
      const res = staffAuth.deleteStaff(userId);
      if (res.success) {
        soundService.click();
        setStaffList(staffAuth.getStaffList());
        onStaffListUpdated();
      } else {
        soundService.errorTone();
        alert(res.message || 'Cannot delete user');
      }
    }
  };

  const handleTestPb = async () => {
    setIsTestingPb(true);
    setPbTestResult(null);
    try {
      const health = await checkPocketBaseHealth();
      if (health.isPocketBaseLive) {
        setPbTestResult({
          status: 'success',
          message: `Connected successfully to PocketBase at ${health.origin}!`,
        });
      } else {
        setPbTestResult({
          status: 'error',
          message: 'Could not reach PocketBase at this origin. Using local offline storage.',
        });
      }
    } catch {
      setPbTestResult({
        status: 'error',
        message: 'Connection timed out. Ensure PocketBase server is running.',
      });
    } finally {
      setIsTestingPb(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const updated = await syncEngine.updatePharmacyDetails({
        ...details,
        pocketBaseUrl: pbAddress,
      });
      soundService.cashRegister();
      onSettingsSaved(updated);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3000);
    } catch (e) {
      soundService.errorTone();
      alert('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // One-Click JSON Backup Export
  const handleExportBackup = () => {
    try {
      const snapshot = syncEngine.createBackupSnapshot();
      const jsonString = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const dateStamp = new Date().toISOString().slice(0, 10);
      const safeStoreSlug = (details.name || 'Zahid_Medical_Store')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const filename = `${safeStoreSlug}_Backup_${dateStamp}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      soundService.cashRegister();
      refreshDbStats();
      setBackupNotice({
        type: 'success',
        title: `Full backup downloaded (${filename})`,
        detail: `Exported ${snapshot.medicines.length} medicines, ${snapshot.sales.length} sales receipts, ${snapshot.khataCustomers.length} Khata accounts, and ${snapshot.staffAccounts.length} staff profiles.`,
      });
    } catch (err) {
      soundService.errorTone();
      setBackupNotice({
        type: 'error',
        title: 'Backup export failed',
        detail: err instanceof Error ? err.message : 'Could not serialize local pharmacy database.',
      });
    }
  };

  // One-Click JSON Backup Restore
  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const rawText = String(loadEvent.target?.result || '');
        const result = syncEngine.restoreFromBackup(rawText);

        const restoredDetails = syncEngine.getPharmacyDetails();
        setDetails(restoredDetails);
        setPbAddress(restoredDetails.pocketBaseUrl || 'http://127.0.0.1:8090');
        setCounters(syncEngine.getCounters());
        setActiveCounter(syncEngine.getActiveCounter());
        setStaffList(staffAuth.getStaffList());
        refreshDbStats();

        onSettingsSaved(restoredDetails);
        onStaffListUpdated();
        soundService.cashRegister();

        const exportedLabel = result.exportedAt
          ? ` (snapshot from ${new Date(result.exportedAt).toLocaleString('en-PK')})`
          : '';
        setBackupNotice({
          type: 'success',
          title: `Database restored successfully${exportedLabel}`,
          detail: `Restored ${result.medicinesCount} medicines, ${result.salesCount} sales receipts, ${result.khataCount} Khata accounts, ${result.countersCount} counters, and ${result.staffCount} staff profiles.`,
        });
      } catch (err) {
        soundService.errorTone();
        setBackupNotice({
          type: 'error',
          title: 'Failed to restore backup file',
          detail:
            err instanceof Error
              ? err.message
              : 'The selected file is not a valid Zahid Medicine Store JSON backup.',
        });
      } finally {
        if (backupFileInputRef.current) {
          backupFileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleFactoryReset = () => {
    syncEngine.resetToDefaults();
    const freshDetails = syncEngine.getPharmacyDetails();
    setDetails(freshDetails);
    setPbAddress(freshDetails.pocketBaseUrl || 'http://127.0.0.1:8090');
    setCounters(syncEngine.getCounters());
    setActiveCounter(syncEngine.getActiveCounter());
    setStaffList(staffAuth.getStaffList());
    setConfirmResetDefaults(false);
    refreshDbStats();
    onSettingsSaved(freshDetails);
    soundService.click();
    setBackupNotice({
      type: 'success',
      title: 'Reset to default pharmacy catalog completed',
      detail: `Restored ${syncEngine.getMedicines().length} default medicines and cleared local transaction history.`,
    });
  };

  const handleExportKhataCSVFromSettings = () => {
    try {
      const { content, fileName, customersCount, totalBalanceDue } =
        syncEngine.exportKhataSpreadsheetCSV();
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      soundService.cashRegister();
      refreshDbStats();
      setKhataSyncNotice({
        type: 'success',
        title: `Credit Khata CSV exported (${fileName})`,
        detail: `Exported ${customersCount} customer accounts and transaction histories (Total balance due: Rs. ${totalBalanceDue.toLocaleString()}).`,
      });
    } catch (err) {
      soundService.errorTone();
      setKhataSyncNotice({
        type: 'error',
        title: 'Khata CSV export failed',
        detail: err instanceof Error ? err.message : 'Could not export Credit Khata CSV.',
      });
    }
  };

  const handleImportKhataCSVFromSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rawText = String(ev.target?.result || '');
        const preview = syncEngine.parseKhataImportPreview(rawText, file.name);
        const res = await syncEngine.applyKhataImport(preview.customers, khataImportMode);
        refreshDbStats();
        soundService.cashRegister();
        setKhataSyncNotice({
          type: 'success',
          title:
            khataImportMode === 'merge'
              ? `Credit Khata records synced from ${file.name}`
              : `Credit Khata database restored from ${file.name}`,
          detail:
            khataImportMode === 'merge'
              ? `Added ${res.addedCount} new customers and updated ${res.updatedCount} existing accounts. Total Khata customers: ${res.totalCustomers} (Rs. ${res.totalBalanceDue.toLocaleString()} due).`
              : `Restored ${res.totalCustomers} customer accounts (Rs. ${res.totalBalanceDue.toLocaleString()} total balance due).`,
        });
      } catch (err) {
        soundService.errorTone();
        setKhataSyncNotice({
          type: 'error',
          title: 'Failed to import Credit Khata CSV',
          detail:
            err instanceof Error
              ? err.message
              : 'Please upload a valid Credit Khata .CSV or .JSON backup file.',
        });
      } finally {
        if (khataCsvInputRef.current) {
          khataCsvInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

 // If locked, render Owner PIN challenge
  if (!isOwnerUnlocked) {
    return (
      <div className="max-w-md mx-auto my-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Owner Access Required</h2>
          <p className="text-xs text-slate-500 mt-1">
            Pharmacy identity, staff accounts, licence details, and settings can only be managed by the Chief Pharmacist / Store Owner.
          </p>
        </div>
        {verifyError && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{verifyError}</span>
          </div>
        )}
        <form onSubmit={handleVerifyOwner} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Enter Owner Security PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={verifyPin}
              onChange={(e) => setVerifyPin(e.target.value)}
              placeholder="••••"
              className="w-full text-center text-lg font-mono tracking-widest px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs shadow-sm transition"
          >
            Verify & Open Settings
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-emerald-800 tracking-wide uppercase">
          Owner workspace
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
          Pharmacy settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage the business details printed on pharmacy documents, owner contact details, staff accounts, and counter names.
        </p>
      </div>

      {/* SECTION 1: Pharmacy Identity (Screenshot 3) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
              {details.logoUrl ? (
                <img src={details.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-2xl" />
              ) : (
                <Building2 className="w-6 h-6 text-emerald-700" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Pharmacy identity</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Name, licence, NTN and contact details are used on receipts and reports.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>{details.logoUrl ? 'Change logo' : 'Choose logo'}</span>
                </button>
                {details.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset default emblem</span>
                  </button>
                )}
                <span className="text-[11px] text-slate-400">
                  Automatically updates the Overview banner, sidebar, and thermal receipts (Max 2 MB).
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Identity Form Fields (2x3 Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Pharmacy name</label>
            <input
              type="text"
              value={details.name}
              onChange={(e) => setDetails({ ...details, name: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Drug licence number</label>
            <input
              type="text"
              value={details.drugLicenceNumber}
              onChange={(e) => setDetails({ ...details, drugLicenceNumber: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">NTN (National Tax Number)</label>
            <input
              type="text"
              placeholder="National Tax Number"
              value={details.ntnNumber || ''}
              onChange={(e) => setDetails({ ...details, ntnNumber: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Pharmacy phone</label>
            <input
              type="text"
              value={details.phone}
              onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Address</label>
            <input
              type="text"
              value={details.address}
              onChange={(e) => setDetails({ ...details, address: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">City / region</label>
            <input
              type="text"
              value={details.city}
              onChange={(e) => setDetails({ ...details, city: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Owner Profile (Screenshot 3) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-start gap-3.5 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Owner profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Contact details for the person responsible for this pharmacy.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Owner name</label>
            <input
              type="text"
              placeholder="Full name"
              value={details.ownerName || ''}
              onChange={(e) => setDetails({ ...details, ownerName: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Role / title</label>
            <input
              type="text"
              placeholder="e.g. Owner / Pharmacist"
              value={details.ownerTitle || ''}
              onChange={(e) => setDetails({ ...details, ownerTitle: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Owner phone</label>
            <input
              type="text"
              placeholder="Phone / WhatsApp"
              value={details.ownerPhone || ''}
              onChange={(e) => setDetails({ ...details, ownerPhone: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Owner email</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={details.ownerEmail || ''}
              onChange={(e) => setDetails({ ...details, ownerEmail: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: Staff & User Accounts Management (Requested by User) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Staff accounts & RBAC</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Add new staff, assign predefined roles, update passwords/PINs, or delete old accounts.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddUser(!showAddUser)}
            className="px-3 py-1.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddUser ? 'Cancel' : 'Add new user'}</span>
          </button>
        </div>

        {/* Add User Drawer */}
        {showAddUser && (
          <form onSubmit={handleAddUser} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 text-xs sm:text-sm">Create Staff User Profile</h4>

            {userError && (
              <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {userError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">User Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asad Ali"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role (Predefined)</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                >
                  <option value="owner">Owner (Full Admin Access)</option>
                  <option value="pharmacist">Pharmacist (Clinical & Reports)</option>
                  <option value="cashier">Cashier (POS Counter Only)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">PIN / Password (4-6 digits)</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  placeholder="&bull;&bull;&bull;&bull;"
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono tracking-widest"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone (Optional)</label>
                <input
                  type="text"
                  placeholder="0300-1234567"
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddUser(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#083322] hover:bg-[#0c432d] text-white font-semibold"
              >
                Save User
              </button>
            </div>
          </form>
        )}

        {/* Existing Users Table */}
        <div className="space-y-2.5">
          {staffList.map((u) => {
            const isEditing = editingUserId === u.id;

            if (isEditing) {
              return (
                <div key={u.id} className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/30 text-xs space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Name</span>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Role</span>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as UserRole)}
                        className="w-full px-2 py-1 rounded border border-slate-300 bg-white"
                      >
                        <option value="owner">Owner</option>
                        <option value="pharmacist">Pharmacist</option>
                        <option value="cashier">Cashier</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">New PIN / Password</span>
                      <input
                        type="password"
                        maxLength={6}
                        value={editPin}
                        onChange={(e) => setEditPin(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-mono tracking-widest"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Phone</span>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingUserId(null)}
                      className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEditUser(u.id)}
                      className="px-3 py-1 rounded bg-[#083322] text-white font-bold"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={u.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-800 font-bold flex items-center justify-center shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{u.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                        u.role === 'owner' ? 'bg-emerald-100 text-emerald-800' : u.role === 'pharmacist' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                      PIN: &bull;&bull;&bull;&bull; {u.phone && `· Phone: ${u.phone}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleStartEditUser(u)}
                    className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 transition"
                    title="Edit Name, Role, or PIN"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {staffList.length > 1 && (
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-1.5 rounded-lg border border-slate-300 hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition"
                      title="Delete Old User Account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Counters (Screenshot 3) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Counters <span className="font-mono text-xs text-slate-500 font-normal ml-0.5">{counters.length}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Each sale is recorded against the counter selected in the top bar.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddCounter(!showAddCounter)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>Add counter</span>
          </button>
        </div>

        {/* Add Counter Form */}
        {showAddCounter && (
          <form onSubmit={handleAddCounter} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center gap-2 text-xs">
            <input
              type="text"
              required
              placeholder="Counter name (e.g. Counter 04)"
              value={newCounterName}
              onChange={(e) => setNewCounterName(e.target.value)}
              className="flex-1 w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
            />
            <input
              type="text"
              placeholder="Location / note"
              value={newCounterNote}
              onChange={(e) => setNewCounterNote(e.target.value)}
              className="flex-1 w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
            />
            <button
              type="submit"
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold shrink-0"
            >
              Add
            </button>
          </form>
        )}

        {/* Counters List (Screenshot 3) */}
        <div className="space-y-3">
          {counters.map((c) => {
            const isCurrent = activeCounter === c.name;

            return (
              <div
                key={c.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Counter name</span>
                    <input
                      type="text"
                      readOnly
                      value={c.name}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-slate-800 font-semibold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Location / note</span>
                    <input
                      type="text"
                      readOnly
                      value={c.locationNote}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-slate-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center mt-2 sm:mt-5">
                  {isCurrent ? (
                    <span className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Current</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSelectCounter(c.name)}
                      className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition"
                    >
                      Use counter
                    </button>
                  )}

                  {counters.length > 1 && (
                    <button
                      onClick={() => handleDeleteCounter(c.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete counter"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 5: PocketBase Connection (Screenshot 3) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-start gap-3.5 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">PocketBase connection</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Use an address that this device can reach. A hosted preview cannot reach your computer's "localhost".
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              PocketBase server address
            </label>
            <input
              type="text"
              value={pbAddress}
              onChange={(e) => setPbAddress(e.target.value)}
              placeholder="http://192.168.1.20:8090"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTestPb}
              disabled={isTestingPb}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span>{isTestingPb ? 'Testing...' : 'Test connection'}</span>
            </button>

            {pbTestResult ? (
              <span className={`text-xs flex items-center gap-1.5 ${
                pbTestResult.status === 'success' ? 'text-emerald-700 font-semibold' : 'text-amber-700'
              }`}>
                {pbTestResult.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>{pbTestResult.message}</span>
              </span>
            ) : (
              <span className="text-slate-500 text-xs">
                Not connected · preview data only
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed pt-2">
            This preview currently saves its sample data and edits only in this browser. Shared logins, database synchronization, and logo storage require the matching PocketBase collections, authentication, and access rules on your server.
          </p>
        </div>
      </div>

      {/* SECTION 5B: Credit Khata Settings — Export / Import Data (CSV) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Credit Khata settings &middot; Export / Import Data
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Export your current customer database and transaction history to a <code className="font-mono text-slate-700">.csv</code> spreadsheet for manual backup, or upload a CSV file to restore and sync Khata records.
              </p>
            </div>
          </div>

          <div className="bg-amber-50/90 border border-amber-200 rounded-xl px-3.5 py-2 text-right shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Active Khata Ledger
            </div>
            <div className="text-sm font-black text-amber-950 font-mono tabular-nums">
              {dbStats.khata} Accounts &middot; Rs. {dbStats.khataBalance.toLocaleString()} Due
            </div>
          </div>
        </div>

        {/* Sub-section: Export / Import Data Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Export Customer Database & Transaction History */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-900">
                Export Customer Database &amp; Transaction History (.CSV)
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Downloads a spreadsheet containing all customer names, phone numbers, addresses, net balances due, and full itemized order &amp; payment history.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportKhataCSVFromSettings}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>Export Khata Database to CSV (.csv)</span>
            </button>
          </div>

          {/* Import / Upload CSV to Restore or Sync Khata */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-slate-900">
                  Upload / Import CSV to Restore or Sync
                </div>
                <div className="inline-flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setKhataImportMode('merge')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      khataImportMode === 'merge'
                        ? 'bg-white text-emerald-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Smart Sync
                  </button>
                  <button
                    type="button"
                    onClick={() => setKhataImportMode('replace')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      khataImportMode === 'replace'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Full Restore
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {khataImportMode === 'merge'
                  ? 'Smart Sync merges uploaded CSV customer records and transaction history with existing accounts without deleting current data.'
                  : 'Full Restore replaces the current Credit Khata list completely with the uploaded CSV backup file.'}
              </p>
            </div>

            <div>
              <input
                ref={khataCsvInputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                onChange={handleImportKhataCSVFromSettings}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => khataCsvInputRef.current?.click()}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Upload &amp; Import Khata CSV (.csv)</span>
              </button>
            </div>
          </div>
        </div>

        {khataSyncNotice && (
          <div
            className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
              khataSyncNotice.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {khataSyncNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{khataSyncNotice.title}</div>
                <div className="text-[11px] opacity-90 mt-0.5">{khataSyncNotice.detail}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setKhataSyncNotice(null)}
              className="text-[11px] font-semibold underline opacity-75 hover:opacity-100 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* SECTION 6: Disaster Recovery — One-Click JSON Backup & Restore */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Disaster recovery · One-click JSON backup &amp; restore
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider">
                  Offline Safe
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Export your entire local pharmacy database (inventory, sales, refunds, Khata ledger, counters &amp; staff PINs) into a single portable <code className="font-mono text-slate-700">.json</code> file for daily safe-keeping or moving to a new computer.
              </p>
            </div>
          </div>
        </div>

        {/* Live Local Database Snapshot Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Medicines &amp; Stock
            </div>
            <div className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
              {dbStats.medicines}
            </div>
            <div className="text-[11px] text-slate-400">Active catalog items</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Sales &amp; Refunds
            </div>
            <div className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
              {dbStats.sales}
            </div>
            <div className="text-[11px] text-slate-400">Recorded invoices</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Customer Khata
            </div>
            <div className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
              {dbStats.khata}
            </div>
            <div className="text-[11px] text-slate-400">Credit ledger accounts</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Staff &amp; Counters
            </div>
            <div className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
              {dbStats.staff} / {counters.length}
            </div>
            <div className="text-[11px] text-slate-400">Users &amp; POS terminals</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="px-4 py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Download Full JSON Backup</span>
            </button>

            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => backupFileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs shadow-2xs transition flex items-center gap-2 cursor-pointer"
            >
              <FileJson className="w-4 h-4 text-emerald-700" />
              <span>Restore from Backup (.json)</span>
            </button>
          </div>

          {!confirmResetDefaults ? (
            <button
              type="button"
              onClick={() => setConfirmResetDefaults(true)}
              className="px-3 py-2 rounded-xl text-slate-500 hover:text-rose-700 hover:bg-rose-50 font-semibold text-xs transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to demo defaults</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-semibold text-rose-800">
                Overwrite current data with demo defaults?
              </span>
              <button
                type="button"
                onClick={handleFactoryReset}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmResetDefaults(false)}
                className="px-2 py-1 rounded-lg text-slate-600 hover:bg-rose-100 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Status Banner */}
        {backupNotice && (
          <div
            className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
              backupNotice.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {backupNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{backupNotice.title}</div>
                <div className="text-[11px] opacity-90 mt-0.5">{backupNotice.detail}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBackupNotice(null)}
              className="text-[11px] font-semibold underline opacity-75 hover:opacity-100 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Bottom Sticky Save Bar (Screenshot 3) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{saveSuccessNotice ? 'Settings saved successfully!' : 'Settings saved on this device'}</span>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs shadow-md shadow-emerald-950/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Save settings'}</span>
        </button>
      </div>
    </div>
  );
};
