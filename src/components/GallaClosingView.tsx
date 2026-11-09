import React, { useState, useMemo, useEffect } from 'react';
import {
  Calculator,
  Coins,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Plus,
  Printer,
  History,
  ArrowRight,
  Wallet,
  Receipt,
  Users,
  MinusCircle,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  Building2,
} from 'lucide-react';
import {
  GallaClosingRecord,
  GallaDenominationCount,
  PharmacyCounter,
  ShiftSlot,
  UserAccount,
  DailyExpenseCategory,
} from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { formatPKR } from '../utils/pharmacyHelpers';
import { formatDateTime } from '../utils/dates';
import { soundService } from '../services/soundAlerts';
import { generateGallaClosingPDF } from '../services/pdfGenerator';

interface GallaClosingViewProps {
  counters: PharmacyCounter[];
  activeCounter: string;
  currentUser: UserAccount;
  gallaClosings: GallaClosingRecord[];
  onGallaUpdated: () => void;
}

const DAILY_EXPENSE_CATEGORIES: DailyExpenseCategory[] = [
  'Shop Guests & Refreshments (Tea/Water)',
  'Generator Fuel / Petrol',
  'Packaging / Shoppers & Thermal Rolls',
  'Freight / Loading & Rickshaw',
  'Store Cleaning & Maintenance',
  'Misc Daily Counter Expense',
];

const EMPTY_DENOMINATIONS: GallaDenominationCount = {
  n5000: 0,
  n1000: 0,
  n500: 0,
  n100: 0,
  n50: 0,
  n20: 0,
  n10: 0,
  coins: 0,
};

export const GallaClosingView: React.FC<GallaClosingViewProps> = ({
  counters,
  activeCounter,
  currentUser,
  gallaClosings,
  onGallaUpdated,
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [selectedCounter, setSelectedCounter] = useState<string>(activeCounter || 'Main Counter');
  const [shiftSlot, setShiftSlot] = useState<ShiftSlot>('Evening / Night Closing');

  // Opening Float editor
  const [openingFloatInput, setOpeningFloatInput] = useState<number>(() =>
    syncEngine.getOpeningFloat(activeCounter || 'Main Counter')
  );
  const [isEditingFloat, setIsEditingFloat] = useState(false);

  // Denomination Counter vs Direct Cash Input
  const [useNoteCounter, setUseNoteCounter] = useState<boolean>(true);
  const [denominations, setDenominations] = useState<GallaDenominationCount>({
    ...EMPTY_DENOMINATIONS,
  });
  const [actualCashCounted, setActualCashCounted] = useState<number>(0);
  const [cashHandedToOwner, setCashHandedToOwner] = useState<number>(0);
  const [closingFloatKept, setClosingFloatKept] = useState<number>(0);
  const [shiftNote, setShiftNote] = useState<string>('');

  // Quick Drawer Cash Expense Modal
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<string>(DAILY_EXPENSE_CATEGORIES[0]);
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseNote, setExpenseNote] = useState<string>('');

  // History Filters
  const [historyCounterFilter, setHistoryCounterFilter] = useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    'all' | 'balanced' | 'shortage' | 'surplus'
  >('all');
  const [expandedClosingId, setExpandedClosingId] = useState<string | null>(null);

  // Feedback Toast
  const [feedbackBanner, setFeedbackBanner] = useState<{
    message: string;
    type: 'success' | 'warn';
  } | null>(null);

  const showBanner = (message: string, type: 'success' | 'warn' = 'success') => {
    setFeedbackBanner({ message, type });
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  // Sync opening float when counter changes
  useEffect(() => {
    const floatVal = syncEngine.getOpeningFloat(selectedCounter);
    setOpeningFloatInput(floatVal);
  }, [selectedCounter]);

  // Live Galla calculation for selected date & counter
  const liveGalla = useMemo(() => {
    const base = syncEngine.calculateLiveGalla(selectedDate, selectedCounter);
    const effectiveFloat = Math.max(0, Number(openingFloatInput) || 0);
    const expectedPhysicalCash =
      effectiveFloat + base.cashPosSales + base.cashKhataRecoveries - base.dailyCashExpenses;
    return {
      ...base,
      openingFloat: effectiveFloat,
      expectedPhysicalCash,
    };
  }, [selectedDate, selectedCounter, openingFloatInput, gallaClosings]);

  // Per-counter live snapshot cards for the selected date
  const perCounterSummaries = useMemo(() => {
    return counters.map((c) => {
      const calc = syncEngine.calculateLiveGalla(selectedDate, c.name);
      const closedToday = gallaClosings.find(
        (g) => g.date === selectedDate && g.counterName === c.name
      );
      return {
        counter: c,
        calc,
        closedToday,
      };
    });
  }, [counters, selectedDate, gallaClosings, openingFloatInput]);

  // Calculate total from denominations when note counter is active
  const denominationSum = useMemo(() => {
    return (
      (denominations.n5000 || 0) * 5000 +
      (denominations.n1000 || 0) * 1000 +
      (denominations.n500 || 0) * 500 +
      (denominations.n100 || 0) * 100 +
      (denominations.n50 || 0) * 50 +
      (denominations.n20 || 0) * 20 +
      (denominations.n10 || 0) * 10 +
      (denominations.coins || 0)
    );
  }, [denominations]);

  useEffect(() => {
    if (useNoteCounter && denominationSum > 0) {
      setActualCashCounted(denominationSum);
      const defaultRetained = Math.min(denominationSum, liveGalla.openingFloat || 5000);
      setClosingFloatKept(defaultRetained);
      setCashHandedToOwner(Math.max(0, denominationSum - defaultRetained));
    }
  }, [denominationSum, useNoteCounter, liveGalla.openingFloat]);

  const handleDirectCashChange = (val: number) => {
    const clean = Math.max(0, Math.round(val || 0));
    setActualCashCounted(clean);
    const defaultRetained = Math.min(clean, liveGalla.openingFloat || 5000);
    setClosingFloatKept(defaultRetained);
    setCashHandedToOwner(Math.max(0, clean - defaultRetained));
  };

  const handleMatchExpectedClick = () => {
    soundService.click();
    setUseNoteCounter(false);
    const exp = Math.max(0, liveGalla.expectedPhysicalCash);
    setActualCashCounted(exp);
    const defaultRetained = Math.min(exp, liveGalla.openingFloat || 5000);
    setClosingFloatKept(defaultRetained);
    setCashHandedToOwner(Math.max(0, exp - defaultRetained));
  };

  const handleSaveOpeningFloat = () => {
    if (selectedCounter === 'ALL') return;
    syncEngine.setOpeningFloat(selectedCounter, openingFloatInput);
    setIsEditingFloat(false);
    soundService.cashRegister();
    onGallaUpdated();
    showBanner(
      `Updated Opening Drawer Float for ${selectedCounter} to ${formatPKR(openingFloatInput)}`
    );
  };

  const handleAddDrawerExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expenseAmount);
    if (!amt || amt <= 0) {
      soundService.errorTone();
      showBanner('Please enter a valid cash expense amount.', 'warn');
      return;
    }

    const targetCounter = selectedCounter === 'ALL' ? activeCounter : selectedCounter;
    await syncEngine.addExpense({
      date: selectedDate,
      frequency: 'daily',
      category: expenseCategory,
      title: expenseTitle.trim() || expenseCategory,
      amount: amt,
      paidBy: currentUser.name,
      counterName: targetCounter,
      paymentMethod: 'Cash',
      note: expenseNote.trim() || `Paid from ${targetCounter} Galla`,
    });

    soundService.cashRegister();
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseNote('');
    setIsExpenseModalOpen(false);
    onGallaUpdated();
    showBanner(`Deducted ${formatPKR(amt)} cash expense from ${targetCounter} Galla.`);
  };

  const varianceAmount = actualCashCounted - liveGalla.expectedPhysicalCash;
  const varianceStatus =
    varianceAmount === 0 ? 'balanced' : varianceAmount < 0 ? 'shortage' : 'surplus';

  const handleRecordShiftClosing = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCounter === 'ALL') {
      soundService.errorTone();
      showBanner(
        'Please select a specific counter (e.g. Main Counter or Counter 02) to log a Galla closing.',
        'warn'
      );
      return;
    }

    const hasNoteCount = Object.values(denominations).some((v) => v > 0);
    const record = syncEngine.recordGallaClosing({
      date: selectedDate,
      counterName: selectedCounter,
      shiftSlot,
      closedByStaff: currentUser.name,
      closedByRole: currentUser.role,
      openingFloat: liveGalla.openingFloat,
      actualCashCounted,
      cashHandedToOwner,
      closingFloatKeptInDrawer: closingFloatKept,
      denominations: useNoteCounter && hasNoteCount ? { ...denominations } : undefined,
      note: shiftNote,
    });

    soundService.cashRegister();
    setShiftNote('');
    setDenominations({ ...EMPTY_DENOMINATIONS });
    onGallaUpdated();
    showBanner(
      `Galla Closing ${record.closingNumber} logged for ${record.counterName} (${
        record.varianceStatus === 'balanced'
          ? 'Exact Match'
          : record.varianceStatus === 'shortage'
          ? `Shortage ${formatPKR(Math.abs(record.varianceAmount))}`
          : `Surplus +${formatPKR(record.varianceAmount)}`
      })`
    );
  };

  const filteredClosings = useMemo(() => {
    return gallaClosings.filter((g) => {
      if (historyCounterFilter !== 'ALL' && g.counterName !== historyCounterFilter) {
        return false;
      }
      if (historyStatusFilter !== 'all' && g.varianceStatus !== historyStatusFilter) {
        return false;
      }
      return true;
    });
  }, [gallaClosings, historyCounterFilter, historyStatusFilter]);

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold shadow-sm ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-[11px] underline opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header & Counter / Date Controls */}
      <div className="bg-gradient-to-r from-[#072418] via-[#0b3322] to-[#0f402b] rounded-3xl p-6 text-white shadow-lg border border-emerald-900/50">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
              <Calculator className="w-3.5 h-3.5" />
              <span>Daily Galla (Cash Drawer) Reconciliation</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              Night Galla Closing &amp; Shift Cash Verification
            </h2>
            <p className="text-xs text-emerald-100/80 max-w-2xl">
              Automatically reconciles physical cash per counter drawer:{' '}
              <span className="font-mono text-emerald-300 font-semibold">
                Expected Cash = Opening Float + Cash POS Sales + Cash Khata Recoveries − Daily Cash
                Expenses
              </span>
            </p>
          </div>

          {/* Date & Counter Pickers */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-white/10 border border-white/15 rounded-2xl px-3 py-2">
              <label className="block text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                Shift Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white text-xs font-bold focus:outline-none mt-0.5"
              />
            </div>

            <div className="bg-white/10 border border-white/15 rounded-2xl px-3 py-2">
              <label className="block text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                Counter Register (Galla)
              </label>
              <select
                value={selectedCounter}
                onChange={(e) => {
                  setSelectedCounter(e.target.value);
                  soundService.click();
                }}
                className="bg-transparent text-white text-xs font-bold focus:outline-none mt-0.5 pr-2"
              >
                {counters.map((c) => (
                  <option key={c.id} value={c.name} className="text-slate-900">
                    {c.name}
                  </option>
                ))}
                <option value="ALL" className="text-slate-900">
                  All Counters (Consolidated)
                </option>
              </select>
            </div>

            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="px-3.5 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-xs font-bold flex items-center gap-1.5 transition"
              title="Record petty cash taken out of the counter drawer today"
            >
              <MinusCircle className="w-4 h-4 text-rose-300" />
              <span>Log Galla Cash Expense</span>
            </button>
          </div>
        </div>

        {/* Per-Counter Quick Status Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-emerald-800/60">
          {perCounterSummaries.map(({ counter, calc, closedToday }) => {
            const isSelected = selectedCounter === counter.name;
            return (
              <button
                key={counter.id}
                onClick={() => {
                  setSelectedCounter(counter.name);
                  soundService.click();
                }}
                className={`text-left p-3.5 rounded-2xl border transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-white text-slate-900 border-white shadow-md'
                    : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-white border-emerald-800/70'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        closedToday ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-xs font-extrabold">{counter.name}</span>
                    {closedToday && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        Closed
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[11px] mt-1 ${
                      isSelected ? 'text-slate-500' : 'text-emerald-200/70'
                    }`}
                  >
                    Float {formatPKR(calc.openingFloat)} · Sales {formatPKR(calc.cashPosSales)}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-[10px] uppercase font-bold block ${
                      isSelected ? 'text-slate-400' : 'text-emerald-300/70'
                    }`}
                  >
                    Expected Cash
                  </span>
                  <span
                    className={`text-sm font-black font-mono ${
                      isSelected ? 'text-emerald-700' : 'text-white'
                    }`}
                  >
                    {formatPKR(calc.expectedPhysicalCash)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Formula Breakdown Cards: Expected Cash = Opening Float + Cash POS Sales + Cash Khata Recoveries - Daily Cash Expenses */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700" />
              <span>
                1. Expected Physical Cash Formula Breakdown ({liveGalla.counterName} ·{' '}
                {selectedDate})
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Only physical cash inflows and cash payouts affect the counter drawer balance. Digital
              wallets and credit bills are shown separately below.
            </p>
          </div>

          {selectedCounter !== 'ALL' && (
            <div className="flex items-center gap-2">
              {isEditingFloat ? (
                <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 pl-1">Float Rs.</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={openingFloatInput}
                    onChange={(e) => setOpeningFloatInput(Number(e.target.value))}
                    className="w-24 px-2 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900"
                  />
                  <button
                    onClick={handleSaveOpeningFloat}
                    className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingFloat(true)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition"
                >
                  Edit {selectedCounter} Opening Float
                </button>
              )}
            </div>
          )}
        </div>

        {/* 5-Column Equation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch">
          {/* (1) Opening Float */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Opening Float
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                START
              </span>
            </div>
            <div className="my-2">
              <div className="text-lg sm:text-xl font-black font-mono text-slate-900">
                {formatPKR(liveGalla.openingFloat)}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Morning change kept in {selectedCounter}
              </p>
            </div>
          </div>

          {/* (2) + Cash POS Sales */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                + Cash POS Sales
              </span>
              <Receipt className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="my-2">
              <div className="text-lg sm:text-xl font-black font-mono text-emerald-800">
                + {formatPKR(liveGalla.cashPosSales)}
              </div>
              <p className="text-[11px] text-emerald-700/80 mt-0.5">
                {liveGalla.cashPosInvoiceCount} cash sale invoice
                {liveGalla.cashPosInvoiceCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {/* (3) + Cash Khata Recoveries */}
          <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                + Cash Khata Recovery
              </span>
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            <div className="my-2">
              <div className="text-lg sm:text-xl font-black font-mono text-teal-800">
                + {formatPKR(liveGalla.cashKhataRecoveries)}
              </div>
              <p className="text-[11px] text-teal-700/80 mt-0.5">
                {liveGalla.cashKhataRecoveryCount} customer cash recovery
              </p>
            </div>
          </div>

          {/* (4) - Daily Cash Expenses */}
          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                − Daily Cash Expenses
              </span>
              <MinusCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="my-2">
              <div className="text-lg sm:text-xl font-black font-mono text-rose-700">
                − {formatPKR(liveGalla.dailyCashExpenses)}
              </div>
              <p className="text-[11px] text-rose-700/80 mt-0.5">
                {liveGalla.dailyCashExpenseCount} petty cash voucher
                {liveGalla.dailyCashExpenseCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {/* (5) = Expected Physical Cash */}
          <div className="p-4 rounded-2xl bg-[#072418] text-white border border-emerald-800 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                = Expected Cash
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                IN GALLA
              </span>
            </div>
            <div className="my-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-white">
                {formatPKR(liveGalla.expectedPhysicalCash)}
              </div>
              <p className="text-[11px] text-emerald-200/80 mt-0.5">
                Must match physical notes in drawer
              </p>
            </div>
          </div>
        </div>

        {/* Non-Drawer Reference Strip (Digital Wallets + Credit Sales) */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              <strong className="text-slate-800">Non-Drawer Digital Sales</strong> (EasyPaisa /
              JazzCash / Bank):{' '}
              <span className="font-mono font-bold text-slate-900">
                {formatPKR(liveGalla.digitalPosSales)}
              </span>
            </span>
            <span>
              <strong className="text-slate-800">Credit Khata Sales</strong> (Unpaid Bills):{' '}
              <span className="font-mono font-bold text-amber-700">
                {formatPKR(liveGalla.creditPosSales)}
              </span>
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Digital &amp; Credit sales do not enter the physical cash drawer
          </span>
        </div>
      </div>

      {/* Section 2: Cashier Physical Count & Night Reconciliation Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: PKR Note & Coin Denomination Counter */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-700" />
                <span>2. Physical PKR Note &amp; Coin Tray Counter</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Count each Pakistani Rupee note bundle in the Galla or type total cash directly
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleMatchExpectedClick}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition"
                title="Fill actual cash with exact expected amount"
              >
                Exact Match ({formatPKR(liveGalla.expectedPhysicalCash)})
              </button>
              <button
                type="button"
                onClick={() => {
                  setDenominations({ ...EMPTY_DENOMINATIONS });
                  setActualCashCounted(0);
                  soundService.click();
                }}
                className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                title="Clear note counter"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Denomination Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                { key: 'n5000', label: 'Rs. 5,000 Note', mult: 5000, badge: 'bg-purple-50 text-purple-900 border-purple-200' },
                { key: 'n1000', label: 'Rs. 1,000 Note', mult: 1000, badge: 'bg-blue-50 text-blue-900 border-blue-200' },
                { key: 'n500', label: 'Rs. 500 Note', mult: 500, badge: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
                { key: 'n100', label: 'Rs. 100 Note', mult: 100, badge: 'bg-rose-50 text-rose-900 border-rose-200' },
                { key: 'n50', label: 'Rs. 50 Note', mult: 50, badge: 'bg-amber-50 text-amber-900 border-amber-200' },
                { key: 'n20', label: 'Rs. 20 Note', mult: 20, badge: 'bg-orange-50 text-orange-900 border-orange-200' },
                { key: 'n10', label: 'Rs. 10 Note', mult: 10, badge: 'bg-teal-50 text-teal-900 border-teal-200' },
              ] as const
            ).map((note) => {
              const count = denominations[note.key] || 0;
              const subtotal = count * note.mult;
              return (
                <div
                  key={note.key}
                  className="p-3 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg border ${note.badge}`}
                    >
                      {note.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-bold">×</span>
                    <input
                      type="number"
                      min={0}
                      value={count || ''}
                      placeholder="0"
                      onChange={(e) => {
                        setUseNoteCounter(true);
                        const val = Math.max(0, parseInt(e.target.value || '0', 10));
                        setDenominations((prev) => ({
                          ...prev,
                          [note.key]: isNaN(val) ? 0 : val,
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div className="text-right text-[11px] font-mono font-bold text-slate-600">
                    = {formatPKR(subtotal)}
                  </div>
                </div>
              );
            })}

            {/* Coins Box */}
            <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-lg border bg-slate-200 text-slate-800 border-slate-300 flex items-center gap-1">
                  <Coins className="w-3 h-3" /> Loose Coins (PKR)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-bold">Rs</span>
                <input
                  type="number"
                  min={0}
                  value={denominations.coins || ''}
                  placeholder="0"
                  onChange={(e) => {
                    setUseNoteCounter(true);
                    const val = Math.max(0, parseInt(e.target.value || '0', 10));
                    setDenominations((prev) => ({
                      ...prev,
                      coins: isNaN(val) ? 0 : val,
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div className="text-right text-[11px] font-mono font-bold text-slate-600">
                = {formatPKR(denominations.coins || 0)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-950 text-white flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-200">
              Note Tray Total (Auto-fills Actual Cash Counted):
            </span>
            <span className="text-base font-black font-mono text-emerald-300">
              {formatPKR(denominationSum)}
            </span>
          </div>
        </div>

        {/* Right 5 Cols: Reconciliation Submission & Shortage/Surplus Judge */}
        <form
          onSubmit={handleRecordShiftClosing}
          className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>3. Submit Counter Galla Reconciliation</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Logs shortage or surplus for <strong>{selectedCounter}</strong> and updates next
                shift float
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Shift Window
                </label>
                <select
                  value={shiftSlot}
                  onChange={(e) => setShiftSlot(e.target.value as ShiftSlot)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                >
                  <option value="Evening / Night Closing">Evening / Night Closing</option>
                  <option value="Morning Shift">Morning Shift</option>
                  <option value="Full Day Shift">Full Day Shift</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Actual Physical Cash (PKR)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={actualCashCounted || ''}
                  placeholder="Enter counted cash..."
                  onChange={(e) => {
                    setUseNoteCounter(false);
                    handleDirectCashChange(Number(e.target.value));
                  }}
                  className="w-full px-3 py-2 rounded-xl border-2 border-emerald-600 text-sm font-black font-mono text-slate-900 bg-emerald-50/40 focus:outline-none"
                />
              </div>
            </div>

            {/* Live Variance (Shortage / Surplus / Balanced) Card */}
            <div
              className={`p-4 rounded-2xl border-2 transition ${
                varianceStatus === 'balanced'
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : varianceStatus === 'shortage'
                  ? 'bg-rose-50/90 border-rose-300 text-rose-950'
                  : 'bg-amber-50/90 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {varianceStatus === 'balanced' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : varianceStatus === 'shortage' ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  ) : (
                    <TrendingUp className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider block">
                      {varianceStatus === 'balanced'
                        ? 'Galla Balanced · Exact Match'
                        : varianceStatus === 'shortage'
                        ? 'Cash Shortage Detected'
                        : 'Cash Surplus (Excess Cash)'}
                    </span>
                    <span className="text-[11px] opacity-80">
                      Actual {formatPKR(actualCashCounted)} vs Expected{' '}
                      {formatPKR(liveGalla.expectedPhysicalCash)}
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono font-black text-base">
                  {varianceAmount === 0
                    ? 'Rs. 0'
                    : varianceAmount > 0
                    ? `+ ${formatPKR(varianceAmount)}`
                    : `- ${formatPKR(Math.abs(varianceAmount))}`}
                </div>
              </div>
            </div>

            {/* Night Handover to Owner vs Next Morning Opening Float */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Cash Handed to Owner (Safe Drop)
                </label>
                <input
                  type="number"
                  min={0}
                  value={cashHandedToOwner || ''}
                  placeholder="0"
                  onChange={(e) => {
                    const handed = Math.max(0, Number(e.target.value) || 0);
                    setCashHandedToOwner(handed);
                    setClosingFloatKept(Math.max(0, actualCashCounted - handed));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Keep in Galla (Next Shift Float)
                </label>
                <input
                  type="number"
                  min={0}
                  value={closingFloatKept || ''}
                  placeholder="0"
                  onChange={(e) => {
                    const kept = Math.max(0, Number(e.target.value) || 0);
                    setClosingFloatKept(kept);
                    setCashHandedToOwner(Math.max(0, actualCashCounted - kept));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Cashier / Reconciliation Note (Optional)
              </label>
              <input
                type="text"
                value={shiftNote}
                onChange={(e) => setShiftNote(e.target.value)}
                placeholder="e.g., Handed cash to Dr. Zahid Hussain, or reason for shortage/surplus..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-2xl bg-[#072418] hover:bg-[#0d3523] text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Lock &amp; Record {selectedCounter} Galla Closing</span>
          </button>
        </form>
      </div>

      {/* Section 3: Permanent Per-Counter Galla Closing & Shift Reconciliation Ledger */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-700" />
              <span>Counter Galla Closing &amp; Shortage/Surplus Audit Log</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical shift reconciliations across Main Counter, Counter 02, and Counter 3
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={historyCounterFilter}
              onChange={(e) => setHistoryCounterFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50"
            >
              <option value="ALL">All Counters</option>
              {counters.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
              {(
                [
                  { id: 'all', label: 'All Shifts' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'shortage', label: 'Shortage' },
                  { id: 'surplus', label: 'Surplus' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setHistoryStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    historyStatusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-50/70">
                <th className="py-3 px-3">Slip &amp; Date</th>
                <th className="py-3 px-3">Counter &amp; Staff</th>
                <th className="py-3 px-3 text-right">Opening Float</th>
                <th className="py-3 px-3 text-right">+ Cash Sales &amp; Khata</th>
                <th className="py-3 px-3 text-right">− Cash Exp</th>
                <th className="py-3 px-3 text-right">Expected Cash</th>
                <th className="py-3 px-3 text-right">Actual Counted</th>
                <th className="py-3 px-3 text-center">Shortage / Surplus</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredClosings.map((rec) => {
                const isExpanded = expandedClosingId === rec.id;
                return (
                  <React.Fragment key={rec.id}>
                    <tr className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-3">
                        <div className="font-mono font-bold text-slate-900">
                          {rec.closingNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {rec.date} · {rec.shiftSlot}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-[11px]">
                          <Building2 className="w-3 h-3 text-emerald-700" />
                          {rec.counterName}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {rec.closedByStaff}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-700">
                        {formatPKR(rec.openingFloat)}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono text-emerald-700 font-bold">
                        + {formatPKR(rec.cashPosSales + rec.cashKhataRecoveries)}
                        <div className="text-[10px] font-sans font-normal text-slate-400">
                          POS {formatPKR(rec.cashPosSales)} · Khata{' '}
                          {formatPKR(rec.cashKhataRecoveries)}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono text-rose-600 font-semibold">
                        − {formatPKR(rec.dailyCashExpenses)}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono font-extrabold text-slate-900">
                        {formatPKR(rec.expectedPhysicalCash)}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono font-black text-slate-900">
                        {formatPKR(rec.actualCashCounted)}
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        {rec.varianceStatus === 'balanced' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Balanced (Rs. 0)
                          </span>
                        ) : rec.varianceStatus === 'shortage' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Short {formatPKR(Math.abs(rec.varianceAmount))}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px]">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Surplus +{formatPKR(rec.varianceAmount)}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              soundService.click();
                              generateGallaClosingPDF(rec);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                            title="Print Official Galla Reconciliation Z-Slip PDF"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setExpandedClosingId(isExpanded ? null : rec.id)
                            }
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                            title="Inspect denomination breakdown & handover details"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {currentUser.role === 'owner' && (
                            <button
                              onClick={() => {
                                syncEngine.deleteGallaClosing(rec.id);
                                onGallaUpdated();
                                showBanner(`Deleted Galla slip ${rec.closingNumber}`, 'warn');
                              }}
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              title="Delete closing record (Owner only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={9} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                Cash Handover &amp; Next Float
                              </span>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Handed to Owner (Safe Drop):</span>
                                <span className="font-mono font-bold text-emerald-800">
                                  {formatPKR(rec.cashHandedToOwner)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Retained in Drawer:</span>
                                <span className="font-mono font-bold text-slate-900">
                                  {formatPKR(rec.closingFloatKeptInDrawer)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 pt-1">
                                Closed at {formatDateTime(rec.closedAt)}
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                Denomination Breakdown
                              </span>
                              {rec.denominations ? (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
                                  <span>5000 × {rec.denominations.n5000}</span>
                                  <span>1000 × {rec.denominations.n1000}</span>
                                  <span>500 × {rec.denominations.n500}</span>
                                  <span>100 × {rec.denominations.n100}</span>
                                  <span>50 × {rec.denominations.n50}</span>
                                  <span>20 × {rec.denominations.n20}</span>
                                  <span>10 × {rec.denominations.n10}</span>
                                  <span>Coins: {formatPKR(rec.denominations.coins)}</span>
                                </div>
                              ) : (
                                <p className="text-slate-500 text-[11px]">
                                  Direct lump-sum cash count entered
                                </p>
                              )}
                            </div>

                            <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                Cashier Note &amp; Non-Drawer Totals
                              </span>
                              <p className="text-slate-700 font-medium">
                                {rec.note || 'No additional shift remarks.'}
                              </p>
                              <p className="text-[11px] text-slate-500 pt-1">
                                Digital Wallets: {formatPKR(rec.digitalSalesReference || 0)} ·
                                Credit Sales: {formatPKR(rec.creditSalesReference || 0)}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Daily Cash Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 bg-[#072418] text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm">
                  Log Daily Cash Expense from Galla
                </h3>
                <p className="text-[11px] text-emerald-200/80">
                  Deducts physical cash from {selectedCounter === 'ALL' ? activeCounter : selectedCounter}
                </p>
              </div>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-xs text-emerald-200 hover:text-white"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleAddDrawerExpense} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Expense Category
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
                >
                  {DAILY_EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Cash Paid Out of Drawer (PKR)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="e.g., 250"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold font-mono text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Description / Voucher Note
                </label>
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="e.g., Tea & biscuits for medical reps, generator petrol..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  Deduct from Galla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
