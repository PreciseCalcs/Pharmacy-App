import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Plus,
  Trash2,
  Lock,
  CheckCircle2,
  Coffee,
  Building2,
  FileText,
  BookmarkCheck,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  DailyExpenseCategory,
  ExpenseFrequency,
  MonthlyExpenseCategory,
  UserAccount,
} from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { formatPKR } from '../utils/pharmacyHelpers';
import { formatDate } from '../utils/dates';
import { soundService } from '../services/soundAlerts';

interface AuditViewProps {
  currentUser: UserAccount;
}

const DAILY_CATEGORIES: DailyExpenseCategory[] = [
  'Shop Guests & Refreshments (Tea/Water)',
  'Generator Fuel / Petrol',
  'Packaging / Shoppers & Thermal Rolls',
  'Freight / Loading & Rickshaw',
  'Store Cleaning & Maintenance',
  'Misc Daily Counter Expense',
];

const MONTHLY_CATEGORIES: MonthlyExpenseCategory[] = [
  'Shop Rent',
  'Electricity Bill (MEPCO)',
  'Staff Salaries & Wages',
  'Internet / Software / Phone Bill',
  'Drug Licence / Tax & Legal',
  'Misc Monthly Fixed Cost',
];

export const AuditView: React.FC<AuditViewProps> = ({ currentUser }) => {
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  // Expense Form State
  const [frequency, setFrequency] = useState<ExpenseFrequency>('daily');
  const [category, setCategory] = useState<string>(DAILY_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<
    'Cash' | 'EasyPaisa' | 'JazzCash' | 'Bank Transfer'
  >('Cash');
  const [note, setNote] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  // Pull live monthly calculations & history from syncEngine
  const allMonthlyAudits = useMemo(() => syncEngine.getAllMonthlyAudits(), [refreshTick]);
  const activeAudit = useMemo(
    () => syncEngine.calculateMonthlyAudit(selectedMonth),
    [selectedMonth, refreshTick]
  );
  const monthExpenses = useMemo(
    () => syncEngine.getExpenses(selectedMonth),
    [selectedMonth, refreshTick]
  );

  const dailyExpensesList = monthExpenses.filter((e) => e.frequency === 'daily');
  const monthlyExpensesList = monthExpenses.filter((e) => e.frequency === 'monthly');

  const handleFrequencySwitch = (nextFreq: ExpenseFrequency) => {
    setFrequency(nextFreq);
    setCategory(nextFreq === 'daily' ? DAILY_CATEGORIES[0] : MONTHLY_CATEGORIES[0]);
    soundService.click();
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return;

    await syncEngine.addExpense({
      date: expenseDate,
      frequency,
      category,
      title: title.trim() || category,
      amount: numAmount,
      paidBy: currentUser.name,
      paymentMethod,
      note,
    });

    soundService.cashRegister();
    setTitle('');
    setAmount('');
    setNote('');
    setSelectedMonth(expenseDate.slice(0, 7));
    setRefreshTick((t) => t + 1);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Remove this expense entry from the monthly audit?')) return;
    await syncEngine.deleteExpense(id);
    soundService.click();
    setRefreshTick((t) => t + 1);
  };

  const handleSaveMonthlyRecord = (closeMonth: boolean = false) => {
    syncEngine.saveMonthlyAuditSnapshot(
      selectedMonth,
      `Audited by ${currentUser.name}`,
      closeMonth
    );
    soundService.cashRegister();
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Month Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-1.5">
            <Wallet className="w-3.5 h-3.5" /> Owner Profit &amp; Expense Audit
          </span>
          <h2 className="text-lg font-extrabold text-slate-900">
            Monthly Net Profit &amp; Expense Ledger
          </h2>
          <p className="text-xs text-slate-500">
            Automatically pulls gross profit from POS sales and deducts daily shop expenses &amp; monthly bills.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => handleSaveMonthlyRecord(false)}
            className="px-3.5 py-2 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
          >
            <BookmarkCheck className="w-4 h-4" /> Store Month Audit
          </button>
        </div>
      </div>

      {/* 4 Primary Monthly P&L Equation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Gross Profit from Sales Reports */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Gross Profit (From Sales)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1.5">
            {formatPKR(activeAudit.grossSalesProfit)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            From {activeAudit.totalSalesCount} sales (Rev: {formatPKR(activeAudit.grossRevenue)})
          </p>
        </div>

        {/* 2. Daily Counter Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Daily Counter Expenses</span>
            <Coffee className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-amber-700 mt-1.5">
            - {formatPKR(activeAudit.dailyExpensesTotal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {dailyExpensesList.length} daily entries (Guests, tea, fuel, etc.)
          </p>
        </div>

        {/* 3. Monthly Fixed Bills */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Monthly Bills &amp; Rent</span>
            <Building2 className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-extrabold text-rose-700 mt-1.5">
            - {formatPKR(activeAudit.monthlyExpensesTotal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {monthlyExpensesList.length} fixed bills (Rent, MEPCO, salaries)
          </p>
        </div>

        {/* 4. Net Take-Home Profit */}
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            activeAudit.netTakeHomeProfit >= 0
              ? 'bg-emerald-950 text-white border-emerald-800'
              : 'bg-rose-950 text-white border-rose-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-200">
            <span>Net Monthly Profit ({activeAudit.monthLabel})</span>
            {activeAudit.netTakeHomeProfit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <p className="text-2xl font-black mt-1.5">
            {formatPKR(activeAudit.netTakeHomeProfit)}
          </p>
          <p className="text-[11px] text-emerald-300/90 mt-1">
            Total Expenses: {formatPKR(activeAudit.totalExpenses)} • Net Margin:{' '}
            {activeAudit.profitMarginPercent}%
          </p>
        </div>
      </div>

      {/* Main Split: Left = Add Expense Form (5 cols), Right = Expense Breakdown (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: End-of-Day / Monthly Expense Entry Form */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" /> Record Store Expense
          </h3>

          {/* Frequency Toggle: Daily vs Monthly */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => handleFrequencySwitch('daily')}
              className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                frequency === 'daily'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Coffee className="w-3.5 h-3.5 text-amber-600" /> Daily Expense
            </button>
            <button
              type="button"
              onClick={() => handleFrequencySwitch('monthly')}
              className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                frequency === 'monthly'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-rose-600" /> Monthly Bill / Rent
            </button>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Expense Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
              >
                {(frequency === 'daily' ? DAILY_CATEGORIES : MONTHLY_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 250"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Detail</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    frequency === 'daily' ? 'e.g. Tea for medical rep' : 'e.g. Nov Shop Rent'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Paid Via</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Cash">Cash (Counter Drawer)</option>
                  <option value="EasyPaisa">EasyPaisa</option>
                  <option value="JazzCash">JazzCash</option>
                  <option value="Bank Transfer">Bank / Raast</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add to {activeAudit.monthLabel} Audit
            </button>
          </form>
        </div>

        {/* Right: Active Month Expenses List (Daily + Monthly) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                {activeAudit.monthLabel} — Recorded Expenses ({monthExpenses.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Daily: {formatPKR(activeAudit.dailyExpensesTotal)} • Monthly Fixed:{' '}
                {formatPKR(activeAudit.monthlyExpensesTotal)}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 font-bold text-xs border border-rose-200">
              Total: {formatPKR(activeAudit.totalExpenses)}
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {monthExpenses.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No daily or monthly expenses recorded for {activeAudit.monthLabel} yet.
              </div>
            ) : (
              monthExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 rounded-lg transition text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        exp.frequency === 'daily'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {exp.frequency}
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">{exp.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {exp.category} • {formatDate(exp.date)} • {exp.paymentMethod}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-rose-700">
                      - {formatPKR(exp.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      title="Delete expense"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Month-by-Month Stored Profit Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Month-by-Month Profit &amp; Expense Archive
            </h3>
            <p className="text-xs text-slate-500">
              Historical monthly comparison of gross sales profit, daily/monthly expenses, and net earnings.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-4">Sales Count</th>
                <th className="py-3 px-4">Gross Revenue</th>
                <th className="py-3 px-4 text-emerald-700">Sales Gross Profit</th>
                <th className="py-3 px-4 text-amber-700">Daily Expenses</th>
                <th className="py-3 px-4 text-rose-700">Monthly Bills</th>
                <th className="py-3 px-4 font-extrabold text-slate-900">Net Monthly Profit</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allMonthlyAudits.map((row) => (
                <tr
                  key={row.monthKey}
                  onClick={() => setSelectedMonth(row.monthKey)}
                  className={`cursor-pointer transition ${
                    row.monthKey === selectedMonth ? 'bg-emerald-50/50 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-3 px-4 font-bold text-slate-900">{row.monthLabel}</td>
                  <td className="py-3 px-4">{row.totalSalesCount} orders</td>
                  <td className="py-3 px-4 font-mono">{formatPKR(row.grossRevenue)}</td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                    +{formatPKR(row.grossSalesProfit)}
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-700">
                    -{formatPKR(row.dailyExpensesTotal)}
                  </td>
                  <td className="py-3 px-4 font-mono text-rose-700">
                    -{formatPKR(row.monthlyExpensesTotal)}
                  </td>
                  <td
                    className={`py-3 px-4 font-mono font-extrabold ${
                      row.netTakeHomeProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'
                    }`}
                  >
                    {formatPKR(row.netTakeHomeProfit)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMonth(row.monthKey);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-white text-slate-700 font-semibold"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
