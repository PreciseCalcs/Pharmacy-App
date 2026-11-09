import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  CheckCircle2,
  CreditCard,
  Calendar,
  Phone,
  Building2,
  FileText,
  Printer,
  Gift,
  PackagePlus,
  Wallet,
  Trash2,
  X,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  MedicineItem,
  SupplierAccount,
  SupplierPaymentMethod,
} from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';
import { formatPKR } from '../utils/pharmacyHelpers';
import { formatDateTime } from '../utils/dates';
import { generateSupplierStatementPDF } from '../services/pdfGenerator';

interface SupplierKhataViewProps {
  suppliers: SupplierAccount[];
  medicines: MedicineItem[];
  canEdit: boolean;
  onSupplierUpdated?: () => void;
}

interface DraftGRNLine {
  id: string;
  medicineId: string;
  billedPacks: number;
  bonusPacks: number;
  invoiceTradeRatePerPack: number;
  tradeDiscountPercent: number;
  batchNumber: string;
  expiryDate: string;
  newRetailMRPPerPack: number;
}

export const SupplierKhataView: React.FC<SupplierKhataViewProps> = ({
  suppliers,
  medicines,
  canEdit,
  onSupplierUpdated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'payable' | 'settled'>('all');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id || ''
  );
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'new_grn' | 'pay_rep'>('ledger');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // New Distributor Modal State
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [newDistName, setNewDistName] = useState('');
  const [newBrands, setNewBrands] = useState('');
  const [newRepName, setNewRepName] = useState('');
  const [newRepPhone, setNewRepPhone] = useState('');
  const [newVisitDay, setNewVisitDay] = useState('Monday & Thursday');
  const [newAddress, setNewAddress] = useState('');
  const [newOpeningPayable, setNewOpeningPayable] = useState('');
  const [newSupplierError, setNewSupplierError] = useState('');

  // Partial Payment to Order Booker State
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<SupplierPaymentMethod>('Cash');
  const [payInvoiceRef, setPayInvoiceRef] = useState('');
  const [payRepName, setPayRepName] = useState('');
  const [payNote, setPayNote] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // New GRN (Purchase Invoice + Trade Bonus Scheme) State
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnRepName, setGrnRepName] = useState('');
  const [grnPaidNow, setGrnPaidNow] = useState('0');
  const [grnPayMethod, setGrnPayMethod] = useState<SupplierPaymentMethod>('Cash');
  const [grnNote, setGrnNote] = useState('');
  const [isSubmittingGRN, setIsSubmittingGRN] = useState(false);
  const [grnError, setGrnError] = useState('');

  const createInitialGRNLine = (med?: MedicineItem): DraftGRNLine => {
    const target = med || medicines[0];
    return {
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      medicineId: target?.id || '',
      billedPacks: 10,
      bonusPacks: 1, // Default 10+1 trade bonus scheme example
      invoiceTradeRatePerPack: target?.unitCostPrice || 200,
      tradeDiscountPercent: 0,
      batchNumber: target?.batchNumber || `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: target?.expiryDate || '2027-12-31',
      newRetailMRPPerPack: target?.unitRetailPrice || 260,
    };
  };

  const [grnLines, setGrnLines] = useState<DraftGRNLine[]>(() => [
    createInitialGRNLine(medicines[0]),
  ]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (balanceFilter === 'payable' && s.balancePayable <= 0) return false;
      if (balanceFilter === 'settled' && s.balancePayable > 0) return false;

      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        s.distributorName.toLowerCase().includes(q) ||
        s.orderBookerName.toLowerCase().includes(q) ||
        s.orderBookerPhone.includes(q) ||
        s.companyBrands.toLowerCase().includes(q) ||
        s.visitDay.toLowerCase().includes(q)
      );
    });
  }, [suppliers, balanceFilter, searchTerm]);

  const selectedSupplier =
    suppliers.find((s) => s.id === selectedSupplierId) || filteredSuppliers[0] || suppliers[0];

  // Global KPI Metrics
  const totalPayableToDistributors = syncEngine.getTotalSupplierPayable();
  const payableSuppliersCount = syncEngine.getSuppliersWithPayableCount();
  const totalBonusSaved = syncEngine.getTotalBonusSchemeSavings();
  const totalPurchasesVolume = useMemo(
    () => suppliers.reduce((sum, s) => sum + (s.totalPurchasedAmount || 0), 0),
    [suppliers]
  );

  // Live GRN Totals & Trade Bonus Calculations
  const grnCalculatedSummary = useMemo(() => {
    let totalBilledAmount = 0;
    let totalBilledPacks = 0;
    let totalBonusPacks = 0;
    let totalBonusSavingsPKR = 0;

    const lineSummaries = grnLines.map((line) => {
      const billed = Math.max(1, Number(line.billedPacks) || 1);
      const bonus = Math.max(0, Number(line.bonusPacks) || 0);
      const totalReceived = billed + bonus;
      const rate = Math.max(0, Number(line.invoiceTradeRatePerPack) || 0);
      const disc = Math.min(100, Math.max(0, Number(line.tradeDiscountPercent) || 0));

      const gross = billed * rate;
      const netLineTotal = Math.round(gross * (1 - disc / 100));
      const effectiveCostPerPack = Number((netLineTotal / totalReceived).toFixed(2));
      const costSavedPerPack = Math.max(0, Number((rate - effectiveCostPerPack).toFixed(2)));
      const lineBonusValue = Math.round(bonus * rate);

      totalBilledAmount += netLineTotal;
      totalBilledPacks += billed;
      totalBonusPacks += bonus;
      totalBonusSavingsPKR += lineBonusValue;

      return {
        ...line,
        totalReceived,
        netLineTotal,
        effectiveCostPerPack,
        costSavedPerPack,
        lineBonusValue,
      };
    });

    return {
      lineSummaries,
      totalBilledAmount,
      totalBilledPacks,
      totalBonusPacks,
      totalBonusSavingsPKR,
    };
  }, [grnLines]);

  const handleSelectMedicineForLine = (lineId: string, medicineId: string) => {
    const med = medicines.find((m) => m.id === medicineId);
    setGrnLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          medicineId,
          invoiceTradeRatePerPack: med?.unitCostPrice || line.invoiceTradeRatePerPack,
          batchNumber: med?.batchNumber || line.batchNumber,
          expiryDate: med?.expiryDate || line.expiryDate,
          newRetailMRPPerPack: med?.unitRetailPrice || line.newRetailMRPPerPack,
        };
      })
    );
  };

  const handleUpdateLineField = (
    lineId: string,
    field: keyof DraftGRNLine,
    value: string | number
  ) => {
    setGrnLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, [field]: value } : line))
    );
  };

  const handleApplyBonusPreset = (lineId: string, billed: number, bonus: number) => {
    soundService.click();
    setGrnLines((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, billedPacks: billed, bonusPacks: bonus } : line
      )
    );
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewSupplierError('');

    if (!newDistName.trim()) {
      setNewSupplierError('Distributor name is required.');
      return;
    }

    try {
      const created = await syncEngine.addSupplierAccount({
        distributorName: newDistName,
        companyBrands: newBrands,
        orderBookerName: newRepName,
        orderBookerPhone: newRepPhone,
        visitDay: newVisitDay,
        address: newAddress,
        openingBalancePayable: parseFloat(newOpeningPayable) || 0,
      });
      soundService.cashRegister();
      setSelectedSupplierId(created.id);
      setShowNewSupplierModal(false);
      setNewDistName('');
      setNewBrands('');
      setNewRepName('');
      setNewRepPhone('');
      setNewAddress('');
      setNewOpeningPayable('');
      onSupplierUpdated?.();
    } catch (err: any) {
      soundService.errorTone();
      setNewSupplierError(err?.message || 'Failed to add distributor.');
    }
  };

  const handleRecordGRNSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    setGrnError('');

    if (grnLines.length === 0) {
      setGrnError('Please add at least one product line.');
      return;
    }

    setIsSubmittingGRN(true);
    try {
      const paidNowNum = Math.max(0, parseFloat(grnPaidNow) || 0);
      await syncEngine.recordSupplierGRN({
        supplierId: selectedSupplier.id,
        supplierInvoiceNumber:
          grnInvoiceNo.trim() || `INV-${Date.now().toString().slice(-5)}`,
        orderBookerName: grnRepName.trim() || selectedSupplier.orderBookerName,
        items: grnLines,
        paidNowAmount: paidNowNum,
        paymentMethod: grnPayMethod,
        note: grnNote,
      });

      soundService.cashRegister();
      const totalRec =
        grnCalculatedSummary.totalBilledPacks + grnCalculatedSummary.totalBonusPacks;
      setBannerMessage(
        `GRN posted to ${selectedSupplier.distributorName}: +${totalRec} packs (${grnCalculatedSummary.totalBilledPacks} billed + ${grnCalculatedSummary.totalBonusPacks} free bonus) added to inventory & unit costs updated!`
      );
      setGrnInvoiceNo('');
      setGrnPaidNow('0');
      setGrnNote('');
      setGrnLines([createInitialGRNLine(medicines[0])]);
      setActiveSubTab('ledger');
      onSupplierUpdated?.();
      setTimeout(() => setBannerMessage(null), 6000);
    } catch (err: any) {
      soundService.errorTone();
      setGrnError(err?.message || 'Failed to record GRN invoice.');
    } finally {
      setIsSubmittingGRN(false);
    }
  };

  const handleRecordRepPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return;

    setIsSubmittingPayment(true);
    try {
      await syncEngine.recordSupplierPayment({
        supplierId: selectedSupplier.id,
        amount: amt,
        paymentMethod: payMethod,
        supplierInvoiceNumber: payInvoiceRef,
        orderBookerName: payRepName || selectedSupplier.orderBookerName,
        note: payNote,
      });
      soundService.cashRegister();
      setBannerMessage(
        `Recorded ${formatPKR(amt)} payment (${payMethod}) to ${
          payRepName || selectedSupplier.orderBookerName
        } (${selectedSupplier.distributorName}).`
      );
      setPayAmount('');
      setPayInvoiceRef('');
      setPayNote('');
      setActiveSubTab('ledger');
      onSupplierUpdated?.();
      setTimeout(() => setBannerMessage(null), 6000);
    } catch (err: any) {
      soundService.errorTone();
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-emerald-800 tracking-wide uppercase">
            Distributor &amp; Medical Rep Accounts
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            Supplier Khata &amp; GRN Invoice Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Record Goods Received Notes (GRNs), 10+1 Trade Bonus Schemes (auto-lowering unit cost), credit bills, and order booker payments.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                soundService.click();
                setActiveSubTab('new_grn');
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-950/20 transition cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>+ Record GRN Invoice</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundService.click();
                setShowNewSupplierModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Distributor</span>
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Banner */}
      {bannerMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-rose-200 bg-rose-50/20 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 block">
              Total Payable to Distributors
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono mt-1">
              {formatPKR(totalPayableToDistributors)}
            </div>
            <span className="text-[11px] text-rose-700 font-medium mt-0.5 block">
              {payableSuppliersCount}{' '}
              {payableSuppliersCount === 1
                ? 'distributor with due balance'
                : 'distributors with due balances'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Stock Purchased (GRNs)
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono mt-1">
              {formatPKR(totalPurchasesVolume)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Across {suppliers.length} registered distributors
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/25 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
              Trade Bonus Scheme Savings
            </span>
            <div className="text-2xl font-black text-emerald-800 font-mono mt-1">
              {formatPKR(totalBonusSaved)}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-0.5 block">
              Free packs (10+1 / 12+2 schemes)
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Active Medical Rep Accounts
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono mt-1">
              {suppliers.length}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Order booker visit schedules tracked
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout: Distributor List (4 Cols) & Selected Distributor Workspace (8 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Distributor & Order Booker Directory (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Distributors &amp; Reps{' '}
                  <span className="font-mono text-xs text-slate-400">
                    ({filteredSuppliers.length})
                  </span>
                </h3>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search distributor, rep name, company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 text-[11px]">
              {[
                { id: 'all', label: 'All' },
                { id: 'payable', label: 'Payable Due' },
                { id: 'settled', label: 'Settled' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setBalanceFilter(f.id as any)}
                  className={`flex-1 py-1 px-2 rounded-lg font-semibold transition cursor-pointer ${
                    balanceFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Distributor List */}
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {filteredSuppliers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No distributor accounts match your filter.
              </div>
            ) : (
              filteredSuppliers.map((sup) => {
                const isSelected = selectedSupplier?.id === sup.id;
                const hasPayable = sup.balancePayable > 0;

                return (
                  <div
                    key={sup.id}
                    onClick={() => {
                      setSelectedSupplierId(sup.id);
                      soundService.click();
                    }}
                    className={`p-3.5 cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-50/70 border-l-4 border-l-emerald-700'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                          {sup.distributorName}
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                          👤 {sup.orderBookerName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {sup.companyBrands}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono font-black text-xs sm:text-sm ${
                            hasPayable ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatPKR(sup.balancePayable)}
                        </div>
                        <span
                          className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                            hasPayable
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {hasPayable ? 'Payable Due' : 'Cleared'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 font-mono">
                      <span>📅 {sup.visitDay}</span>
                      {sup.totalBonusValueSaved > 0 && (
                        <span className="text-emerald-700 font-semibold">
                          🎁 Bonus Saved: Rs {sup.totalBonusValueSaved.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Distributor Details, GRN Builder & Order Booker Payment (8 Cols) */}
        {selectedSupplier ? (
          <div className="lg:col-span-8 space-y-4">
            {/* Distributor Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                      {selectedSupplier.distributorName}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                      Visit: {selectedSupplier.visitDay}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedSupplier.companyBrands}
                    {selectedSupplier.address ? ` • ${selectedSupplier.address}` : ''}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-700">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                      {selectedSupplier.orderBookerName}
                    </span>
                    {selectedSupplier.orderBookerPhone && (
                      <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {selectedSupplier.orderBookerPhone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      soundService.click();
                      generateSupplierStatementPDF(selectedSupplier);
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    title="Print Supplier Khata & GRN Statement PDF"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print Statement PDF</span>
                  </button>
                </div>
              </div>

              {/* Financial Summary Bar for Selected Distributor */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Total Billed (GRNs)
                  </span>
                  <span className="font-mono font-black text-slate-900 text-sm">
                    {formatPKR(selectedSupplier.totalPurchasedAmount)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Total Paid to Rep
                  </span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {formatPKR(selectedSupplier.totalPaidAmount)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                    Bonus Scheme Saved
                  </span>
                  <span className="font-mono font-black text-emerald-800 text-sm">
                    {formatPKR(selectedSupplier.totalBonusValueSaved || 0)}
                  </span>
                </div>

                <div
                  className={`p-2.5 rounded-xl border ${
                    selectedSupplier.balancePayable > 0
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-emerald-50/70 border-emerald-200'
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold uppercase block ${
                      selectedSupplier.balancePayable > 0
                        ? 'text-rose-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    Balance Payable Due
                  </span>
                  <span
                    className={`font-mono font-black text-sm ${
                      selectedSupplier.balancePayable > 0
                        ? 'text-rose-700'
                        : 'text-emerald-800'
                    }`}
                  >
                    {formatPKR(selectedSupplier.balancePayable)}
                  </span>
                </div>
              </div>

              {/* Action Sub-Tabs */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => {
                    soundService.click();
                    setActiveSubTab('ledger');
                  }}
                  className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'ledger'
                      ? 'bg-[#083322] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>GRN Invoices &amp; Payment Ledger ({selectedSupplier.ledger.length})</span>
                </button>

                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        soundService.click();
                        setActiveSubTab('new_grn');
                      }}
                      className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        activeSubTab === 'new_grn'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>+ Record GRN &amp; Bonus Scheme</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        soundService.click();
                        setPayRepName(selectedSupplier.orderBookerName);
                        setActiveSubTab('pay_rep');
                      }}
                      className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        activeSubTab === 'pay_rep'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Pay Order Booker</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ============================================================== */}
            {/* SUB-TAB 1: GRN INVOICES & PAYMENT LEDGER                       */}
            {/* ============================================================== */}
            {activeSubTab === 'ledger' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Purchase Invoices (GRNs), Trade Bonus Schemes &amp; Rep Payments
                    </h3>
                    <p className="text-xs text-slate-500">
                      Complete audit trail of stock received, free bonus packs, effective unit costs, and payments.
                    </p>
                  </div>
                </div>

                {selectedSupplier.ledger.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    No GRN invoices or payments recorded for this distributor yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedSupplier.ledger.map((entry) => {
                      const isGRN = entry.type === 'grn_invoice';
                      const unpaidOnInvoice = Math.max(
                        0,
                        entry.totalBilledAmount - entry.paidAmount
                      );

                      return (
                        <div
                          key={entry.id}
                          className={`p-4 rounded-2xl border text-xs space-y-3 ${
                            isGRN
                              ? 'bg-white border-slate-200'
                              : 'bg-emerald-50/40 border-emerald-200'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                  isGRN
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isGRN ? (
                                  <ArrowDownLeft className="w-4 h-4" />
                                ) : (
                                  <ArrowUpRight className="w-4 h-4" />
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                    {entry.description}
                                  </span>
                                  {entry.grnNumber && (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                                      {entry.grnNumber}
                                    </span>
                                  )}
                                  {(entry.totalBonusPacks ?? 0) > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1">
                                      <Gift className="w-3 h-3" />
                                      <span>
                                        +{entry.totalBonusPacks} Free Bonus Packs (Saved{' '}
                                        {formatPKR(entry.totalBonusSavingsValue || 0)})
                                      </span>
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                                  <span>{formatDateTime(entry.date)}</span>
                                  {entry.orderBookerName && (
                                    <span>&bull; Rep: {entry.orderBookerName}</span>
                                  )}
                                  {entry.note && <span>&bull; {entry.note}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono shrink-0">
                              {isGRN ? (
                                <>
                                  <div className="font-black text-slate-900 text-sm">
                                    Bill: {formatPKR(entry.totalBilledAmount)}
                                  </div>
                                  <div className="text-[10px]">
                                    <span className="text-emerald-700 font-bold">
                                      Paid: {formatPKR(entry.paidAmount)}
                                    </span>
                                    {unpaidOnInvoice > 0 && (
                                      <span className="text-rose-600 font-bold ml-2">
                                        Credit: {formatPKR(unpaidOnInvoice)}
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-black text-emerald-700 text-sm">
                                    Paid {formatPKR(entry.paidAmount)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-sans">
                                    via {entry.paymentMethod || 'Cash'}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* GRN Line Items Table showing Billed + Bonus Scheme & Effective Unit Cost */}
                          {isGRN && entry.items && entry.items.length > 0 && (
                            <div className="overflow-x-auto pt-2 border-t border-slate-100">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                                    <th className="py-1.5 px-2.5">Medicine / Item</th>
                                    <th className="py-1.5 px-2.5">Batch &amp; Exp</th>
                                    <th className="py-1.5 px-2.5">Billed + Bonus Scheme</th>
                                    <th className="py-1.5 px-2.5">Invoice TP</th>
                                    <th className="py-1.5 px-2.5 text-emerald-800">
                                      Effective Unit Cost
                                    </th>
                                    <th className="py-1.5 px-2.5 text-right">Net Line Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono">
                                  {entry.items.map((item, i) => (
                                    <tr key={i}>
                                      <td className="py-2 px-2.5 font-sans font-bold text-slate-900">
                                        {item.medicineName}{' '}
                                        {item.strength ? `(${item.strength})` : ''}
                                      </td>
                                      <td className="py-2 px-2.5 text-slate-500">
                                        {item.batchNumber} &bull; {item.expiryDate}
                                      </td>
                                      <td className="py-2 px-2.5">
                                        <span className="font-bold text-slate-900">
                                          {item.billedPacks} pk
                                        </span>
                                        {item.bonusPacks > 0 && (
                                          <span className="ml-1.5 px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-sans font-bold text-[10px]">
                                            +{item.bonusPacks} Free = {item.totalPacksReceived} pk
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 text-slate-600">
                                        Rs {item.invoiceTradeRatePerPack}
                                      </td>
                                      <td className="py-2 px-2.5 font-bold text-emerald-700">
                                        Rs {item.effectiveCostPerPack}/pk
                                      </td>
                                      <td className="py-2 px-2.5 text-right font-bold text-slate-900">
                                        Rs {item.lineNetTotal.toLocaleString()}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-TAB 2: RECORD PURCHASE INVOICE (GRN + TRADE BONUS SCHEME)  */}
            {/* ============================================================== */}
            {activeSubTab === 'new_grn' && canEdit && (
              <form
                onSubmit={handleRecordGRNSubmit}
                className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-2xs space-y-4 text-xs"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <PackagePlus className="w-4 h-4 text-emerald-700" />
                      <span>
                        Record Purchase Invoice (GRN) from {selectedSupplier.distributorName}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Enter billed packs and free bonus packs (e.g. 10+1). Shelf stock and effective unit cost update automatically.
                    </p>
                  </div>
                </div>

                {grnError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{grnError}</span>
                  </div>
                )}

                {/* Invoice Header Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Distributor Bill / Invoice # <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MPD-88912"
                      value={grnInvoiceNo}
                      onChange={(e) => setGrnInvoiceNo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Supplied By (Order Booker / Rep)
                    </label>
                    <input
                      type="text"
                      placeholder={selectedSupplier.orderBookerName}
                      value={grnRepName}
                      onChange={(e) => setGrnRepName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      GRN Note / Scheme Remark
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10+1 winter trade scheme"
                      value={grnNote}
                      onChange={(e) => setGrnNote(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* GRN Line Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                      Received Products &amp; Trade Bonus Schemes ({grnLines.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        soundService.click();
                        setGrnLines((prev) => [...prev, createInitialGRNLine(medicines[0])]);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Product Line</span>
                    </button>
                  </div>

                  {grnCalculatedSummary.lineSummaries.map((line, index) => (
                    <div
                      key={line.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-700 text-xs">
                          Line #{index + 1}
                        </span>

                        {/* 1-Click Trade Bonus Scheme Presets */}
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-slate-400 mr-1">
                            Trade Scheme Preset:
                          </span>
                          {[
                            { label: '10 + 1 Free', billed: 10, bonus: 1 },
                            { label: '12 + 2 Free', billed: 12, bonus: 2 },
                            { label: '20 + 3 Free', billed: 20, bonus: 3 },
                            { label: 'No Bonus', billed: 10, bonus: 0 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() =>
                                handleApplyBonusPreset(line.id, preset.billed, preset.bonus)
                              }
                              className="px-2 py-0.5 rounded bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold transition cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}

                          {grnLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setGrnLines((prev) => prev.filter((l) => l.id !== line.id))
                              }
                              className="p-1 rounded text-slate-400 hover:text-rose-600 ml-1"
                              title="Remove line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Medicine / Store Product
                          </label>
                          <select
                            value={line.medicineId}
                            onChange={(e) =>
                              handleSelectMedicineForLine(line.id, e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900 text-xs"
                          >
                            {medicines.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.strength}) — Stock: {m.currentStockPacks} pk
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Billed Packs
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={line.billedPacks}
                            onChange={(e) =>
                              handleUpdateLineField(
                                line.id,
                                'billedPacks',
                                Math.max(1, parseInt(e.target.value) || 1)
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-emerald-800 mb-1">
                            + Bonus Free Packs
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={line.bonusPacks}
                            onChange={(e) =>
                              handleUpdateLineField(
                                line.id,
                                'bonusPacks',
                                Math.max(0, parseInt(e.target.value) || 0)
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-400 bg-emerald-50/60 font-mono font-bold text-emerald-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Trade Rate / Pack (Rs.)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={line.invoiceTradeRatePerPack}
                            onChange={(e) =>
                              handleUpdateLineField(
                                line.id,
                                'invoiceTradeRatePerPack',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Retail MRP / Pack (Rs.)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={line.newRetailMRPPerPack}
                            onChange={(e) =>
                              handleUpdateLineField(
                                line.id,
                                'newRetailMRPPerPack',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Batch Number
                          </label>
                          <input
                            type="text"
                            value={line.batchNumber}
                            onChange={(e) =>
                              handleUpdateLineField(line.id, 'batchNumber', e.target.value)
                            }
                            className="w-full px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-mono text-[11px]"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            New Expiry Date
                          </label>
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) =>
                              handleUpdateLineField(line.id, 'expiryDate', e.target.value)
                            }
                            className="w-full px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-mono text-[11px]"
                          />
                        </div>

                        {/* Live Effective Unit Cost Breakdown Pill */}
                        <div className="col-span-2 p-2 rounded-xl bg-emerald-950 text-white flex items-center justify-between px-3">
                          <div>
                            <div className="text-[10px] text-emerald-300 font-semibold">
                              Stock Added: +{line.totalReceived} Packs ({line.billedPacks}+
                              {line.bonusPacks} Free)
                            </div>
                            <div className="font-mono text-xs font-bold">
                              Effective Cost: Rs {line.effectiveCostPerPack}/pk
                              {line.costSavedPerPack > 0 && (
                                <span className="text-amber-300 ml-1.5">
                                  (-Rs {line.costSavedPerPack}/pk saved)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-[10px] text-emerald-300 block">Line Bill</span>
                            <span className="font-black text-sm">
                              Rs {line.netLineTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* GRN Payment & Credit Summary Footer */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Net Invoice Payable
                      </span>
                      <span className="text-xl font-black text-slate-900 font-mono">
                        {formatPKR(grnCalculatedSummary.totalBilledAmount)}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold block">
                        +{grnCalculatedSummary.totalBonusPacks} Free Bonus Packs (
                        {formatPKR(grnCalculatedSummary.totalBonusSavingsPKR)} saved)
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Paid Now to Order Booker (Rs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={grnCalculatedSummary.totalBilledAmount}
                        value={grnPaidNow}
                        onChange={(e) => setGrnPaidNow(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-mono font-bold"
                      />
                      <div className="flex items-center gap-1 mt-1">
                        {[
                          { label: '100% Credit (Rs 0)', val: 0 },
                          {
                            label: '50% Part Pay',
                            val: Math.round(grnCalculatedSummary.totalBilledAmount * 0.5),
                          },
                          {
                            label: '100% Full Pay',
                            val: grnCalculatedSummary.totalBilledAmount,
                          },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => setGrnPaidNow(String(btn.val))}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-200/80 hover:bg-slate-300 text-slate-700 font-semibold cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Payment Mode
                      </label>
                      <select
                        value={grnPayMethod}
                        onChange={(e) =>
                          setGrnPayMethod(e.target.value as SupplierPaymentMethod)
                        }
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold"
                      >
                        <option value="Cash">Cash</option>
                        <option value="EasyPaisa">EasyPaisa</option>
                        <option value="JazzCash">JazzCash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                      <div className="text-[11px] font-mono text-rose-700 font-bold mt-1.5">
                        Credit Added to Khata:{' '}
                        {formatPKR(
                          Math.max(
                            0,
                            grnCalculatedSummary.totalBilledAmount -
                              (parseFloat(grnPaidNow) || 0)
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('ledger')}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingGRN}
                      className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/20 cursor-pointer"
                    >
                      <PackagePlus className="w-4 h-4" />
                      <span>
                        {isSubmittingGRN
                          ? 'Posting GRN...'
                          : 'Post GRN & Update Inventory Stock'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ============================================================== */}
            {/* SUB-TAB 3: PAY ORDER BOOKER / PARTIAL PAYMENT                  */}
            {/* ============================================================== */}
            {activeSubTab === 'pay_rep' && canEdit && (
              <form
                onSubmit={handleRecordRepPayment}
                className="bg-white rounded-2xl border border-amber-200 p-5 shadow-2xs space-y-4 text-xs"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-amber-600" />
                      <span>
                        Record Partial / Full Payment to {selectedSupplier.distributorName}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Log cash, EasyPaisa, JazzCash, or bank payments handed to the order booker during their collection visit.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Payment Amount (Rs.) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="Enter amount paid to order booker"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    {selectedSupplier.balancePayable > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-slate-400">Quick fill:</span>
                        {[
                          {
                            label: '25%',
                            val: Math.round(selectedSupplier.balancePayable * 0.25),
                          },
                          {
                            label: '50%',
                            val: Math.round(selectedSupplier.balancePayable * 0.5),
                          },
                          {
                            label: `Full (${formatPKR(selectedSupplier.balancePayable)})`,
                            val: selectedSupplier.balancePayable,
                          },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setPayAmount(String(p.val))}
                            className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold cursor-pointer"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) =>
                        setPayMethod(e.target.value as SupplierPaymentMethod)
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                    >
                      <option value="Cash">Cash (Handed to Order Booker)</option>
                      <option value="EasyPaisa">EasyPaisa Transfer</option>
                      <option value="JazzCash">JazzCash Transfer</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Crossed Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Received By (Order Booker / Medical Rep)
                    </label>
                    <input
                      type="text"
                      value={payRepName}
                      onChange={(e) => setPayRepName(e.target.value)}
                      placeholder={selectedSupplier.orderBookerName}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Against Invoice # / Receipt Ref (Optional)
                    </label>
                    <input
                      type="text"
                      value={payInvoiceRef}
                      onChange={(e) => setPayInvoiceRef(e.target.value)}
                      placeholder="e.g. MPD-88410"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      Payment Note
                    </label>
                    <input
                      type="text"
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="e.g. Partial settlement on Thursday counter visit"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('ledger')}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {isSubmittingPayment
                        ? 'Recording...'
                        : 'Confirm Payment to Order Booker'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </div>

      {/* Modal: Register New Distributor / Medical Rep Account */}
      {showNewSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-700" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Register New Distributor / Medical Rep Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSupplierModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-5 space-y-3 text-xs">
              {newSupplierError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{newSupplierError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Distributor / Agency Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Abbott Jalalpur Agency / Sami Multan Branch"
                  value={newDistName}
                  onChange={(e) => setNewDistName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Supplied Companies &amp; Brands
                </label>
                <input
                  type="text"
                  placeholder="e.g. Abbott, Searle, Reckitt, P&G"
                  value={newBrands}
                  onChange={(e) => setNewBrands(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Order Booker / Rep Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bilal Hussain"
                    value={newRepName}
                    onChange={(e) => setNewRepName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Order Booker Phone
                  </label>
                  <input
                    type="text"
                    placeholder="0300 1234567"
                    value={newRepPhone}
                    onChange={(e) => setNewRepPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Order Booker Visit Day(s)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tuesday & Friday"
                    value={newVisitDay}
                    onChange={(e) => setNewVisitDay(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Opening Payable (Rs.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={newOpeningPayable}
                    onChange={(e) => setNewOpeningPayable(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Depot / Office Address
                </label>
                <input
                  type="text"
                  placeholder="Nishtar Road Pharma Market, Multan"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewSupplierModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold"
                >
                  Save Distributor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
