import React, { useMemo, useState } from 'react';
import { 
  Users, 
  ShoppingCart, 
  DollarSign, 
  CreditCard, 
  Package, 
  AlertTriangle, 
  AlertOctagon,
  ArrowRight,
  TrendingUp,
  FileText,
  Calendar,
  Sparkles,
  ShieldAlert,
  Edit3,
  ExternalLink,
  Heart,
  Baby,
  ShoppingBag,
  Pill,
  CheckCircle2,
  Boxes
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { MedicineItem, SaleTransaction, PharmacyDetails } from '../types/pharmacy';
import { formatPKR, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';
import { isToday } from '../utils/dates';
import { syncEngine } from '../services/syncEngine';

interface DashboardViewProps {
  medicines: MedicineItem[];
  sales: SaleTransaction[];
  pharmacyDetails: PharmacyDetails;
  onNavigateTab: (tab: string) => void;
  onOpenMedicineModal: (med?: MedicineItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  medicines,
  sales,
  pharmacyDetails,
  onNavigateTab,
  onOpenMedicineModal,
}) => {
  const activeCounter = syncEngine.getActiveCounter();

  // Metrics calculation (exclude refunded sales from active revenue)
  const completedSales = useMemo(
    () => sales.filter((s) => s.status !== 'refunded'),
    [sales]
  );
  const todaySales = completedSales.filter((s) => isToday(s.createdAt));
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);

  const totalKhataBalance = syncEngine.getTotalOutstandingKhata();
  const khataAccountsWithBalance = syncEngine.getKhataAccountsWithBalanceCount();

  const totalPacksInStock = medicines.reduce((acc, m) => acc + m.currentStockPacks, 0);

  const lowStockMeds = medicines.filter((m) => m.currentStockPacks <= m.minThresholdPacks);
  const expiringMeds = medicines.filter((m) => isExpiringSoon(m.expiryDate, 90));
  const expiredMeds = medicines.filter((m) => isExpired(m.expiryDate));
  const reviewCount = lowStockMeds.length + expiringMeds.length + expiredMeds.length;

  // Filter state for Critical Stock Alerts panel
  const [stockAlertFilter, setStockAlertFilter] = useState<'all' | 'out' | 'urgent' | 'pharmacy' | 'general'>('all');

  // Critical stock items calculation (medicines & store items below reorder threshold)
  const criticalStockList = useMemo(() => {
    return medicines
      .filter((m) => m.currentStockPacks <= (m.minThresholdPacks || 5))
      .map((m) => {
        const threshold = m.minThresholdPacks || 5;
        const current = m.currentStockPacks;
        const deficit = Math.max(0, threshold - current);
        const percentOfThreshold = Math.round((current / threshold) * 100);
        const isOutOfStock = current === 0;
        const reorderCost = deficit * (m.unitCostPrice || 0);

        return {
          ...m,
          threshold,
          current,
          deficit,
          percentOfThreshold,
          isOutOfStock,
          reorderCost,
        };
      })
      .sort((a, b) => {
        // Out of stock items first, then lowest percentage of threshold
        if (a.isOutOfStock && !b.isOutOfStock) return -1;
        if (!a.isOutOfStock && b.isOutOfStock) return 1;
        return a.percentOfThreshold - b.percentOfThreshold;
      });
  }, [medicines]);

  const outOfStockCount = useMemo(() => {
    return criticalStockList.filter((m) => m.isOutOfStock).length;
  }, [criticalStockList]);

  const totalDeficitPacks = useMemo(() => {
    return criticalStockList.reduce((acc, m) => acc + m.deficit, 0);
  }, [criticalStockList]);

  const totalReorderEstimatedCost = useMemo(() => {
    return criticalStockList.reduce((acc, m) => acc + m.reorderCost, 0);
  }, [criticalStockList]);

  const filteredCriticalStock = useMemo(() => {
    return criticalStockList.filter((m) => {
      if (stockAlertFilter === 'out') return m.isOutOfStock;
      if (stockAlertFilter === 'urgent') return m.percentOfThreshold <= 50;
      if (stockAlertFilter === 'pharmacy') {
        return m.department === 'pharmacy' || (!m.department && m.category !== 'Personal Care & Sexual Wellness' && m.category !== 'General Store & FMCG' && m.category !== 'Baby & Mother Care');
      }
      if (stockAlertFilter === 'general') {
        return m.department === 'general_store' || m.department === 'personal_care' || m.department === 'mother_baby' || m.category === 'Personal Care & Sexual Wellness' || m.category === 'General Store & FMCG' || m.category === 'Baby & Mother Care';
      }
      return true;
    });
  }, [criticalStockList, stockAlertFilter]);

  // 7-Day sales revenue trend calculation using 100% real sales data
  const last7DaysData = useMemo(() => {
    const days: {
      dateKey: string;
      label: string;
      fullDate: string;
      revenue: number;
      orders: number;
    }[] = [];

    const toLocalDateKey = (dateObj: Date) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = toLocalDateKey(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayMonth = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

      // Find real completed sales matching this local calendar day
      const daySales = completedSales.filter((s) => {
        try {
          const parsed = new Date(s.createdAt);
          if (isNaN(parsed.getTime())) return false;
          return toLocalDateKey(parsed) === dateStr;
        } catch {
          return false;
        }
      });

      const realRevenue = daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

      days.push({
        dateKey: dateStr,
        label: i === 0 ? 'Today' : dayName,
        fullDate: dayMonth,
        revenue: realRevenue,
        orders: daySales.length,
      });
    }

    return days;
  }, [completedSales]);

  const total7DayRevenue = useMemo(() => {
    return last7DaysData.reduce((acc, d) => acc + d.revenue, 0);
  }, [last7DaysData]);

  const avgDailyRevenue = Math.round(total7DayRevenue / 7);

  const peakDay = useMemo(() => {
    return last7DaysData.reduce((max, d) => (d.revenue > max.revenue ? d : max), last7DaysData[0]);
  }, [last7DaysData]);

  // Most dispensed calculation (100% real recorded completed sales)
  const medicineDispenseCounts: Record<string, { name: string; quantity: number }> = {};
  completedSales.forEach((s) => {
    s.items.forEach((item) => {
      if (!medicineDispenseCounts[item.medicineId]) {
        medicineDispenseCounts[item.medicineId] = { name: item.medicineName, quantity: 0 };
      }
      medicineDispenseCounts[item.medicineId].quantity += item.quantity;
    });
  });

  const mostDispensedList = Object.values(medicineDispenseCounts)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const recentTransactions = sales.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Welcome Header (Matching Screenshot 1) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-semibold text-emerald-800">{activeCounter}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Good day at the counter.
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            A clear view of today's sales, stock pressure, and customer accounts.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('khata')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition"
          >
            <Users className="w-4 h-4 text-slate-600" />
            <span>Open khata</span>
          </button>

          <button
            onClick={() => onNavigateTab('pos')}
            className="px-4 py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-emerald-950/20 transition"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>New sale</span>
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Cards in 2x2 Grid (Matching Screenshot 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Today's sales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Today's sales</span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight mt-1">
              Rs {todayRevenue.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {todaySales.length} {todaySales.length === 1 ? 'recorded sale' : 'recorded sales'}
            </span>
          </div>

          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Customer balance due */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Customer balance due</span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight mt-1">
              Rs {totalKhataBalance.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {khataAccountsWithBalance} {khataAccountsWithBalance === 1 ? 'account' : 'accounts'} with a balance
            </span>
          </div>

          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Medicine items */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Medicine items</span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight mt-1">
              {medicines.length}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {totalPacksInStock} packs in stock
            </span>
          </div>

          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Stock to review */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Stock to review</span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight mt-1">
              {reviewCount}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {lowStockMeds.length} low · {expiringMeds.length + expiredMeds.length} nearing expiry
            </span>
          </div>

          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 7-Day Sales Revenue Performance Line Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">7-Day Sales Revenue Trend</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                  Past 7 Days
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualizing daily counter sales revenue to track pharmacy turnover and peak shifts.
              </p>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block font-medium">7-Day Total</span>
              <span className="font-bold text-slate-900 font-mono text-xs sm:text-sm">
                Rs {total7DayRevenue.toLocaleString()}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block font-medium">Daily Avg</span>
              <span className="font-bold text-emerald-700 font-mono text-xs sm:text-sm">
                Rs {avgDailyRevenue.toLocaleString()}
              </span>
            </div>

            {peakDay && (
              <div className="hidden md:block px-3 py-1.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-[10px] text-amber-800 block font-semibold">Peak Day</span>
                <span className="font-bold text-amber-950 font-mono text-xs sm:text-sm">
                  {peakDay.label} (Rs {peakDay.revenue.toLocaleString()})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Recharts LineChart */}
        <div className="h-64 sm:h-72 w-full pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={last7DaysData}
              margin={{ top: 12, right: 18, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                dy={6}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(value) =>
                  value >= 1000
                    ? `Rs ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
                    : `Rs ${value}`
                }
                dx={-4}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs">
                        <div className="text-[11px] text-slate-300 font-semibold mb-1">
                          {data.fullDate} &bull; {data.label}
                        </div>
                        <div className="text-base font-black text-emerald-400 font-mono tracking-tight">
                          Rs {Number(data.revenue).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {data.orders} sales recorded
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#083322"
                strokeWidth={3}
                dot={{ r: 4.5, fill: '#083322', stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 7, fill: '#10b981', stroke: '#083322', strokeWidth: 2.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION: Recent Activity (Screenshot 1) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent activity</h2>
            <p className="text-xs text-slate-500">Latest receipts across this preview.</p>
          </div>

          <button
            onClick={() => onNavigateTab('reports')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <span>All sales</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <th className="py-2.5 px-3">INVOICE</th>
                <th className="py-2.5 px-3">CUSTOMER</th>
                <th className="py-2.5 px-3">COUNTER</th>
                <th className="py-2.5 px-3">PAYMENT</th>
                <th className="py-2.5 px-3 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans text-xs">
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                    No sales recorded yet. Complete a transaction at the Point of Sale to see receipts here.
                  </td>
                </tr>
              ) : (
                recentTransactions.map((txn) => {
                  const isRefunded = txn.status === 'refunded';
                  return (
                    <tr key={txn.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        <span>{txn.invoiceNumber}</span>
                        {isRefunded && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-sans font-bold text-[10px]">
                            Refunded
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-800 font-medium">
                        {txn.customerName}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {txn.counterName || activeCounter}
                      </td>
                      <td className="py-3 px-3">
                        {txn.paymentMethod === 'Credit' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium text-[10px]">
                            Credit
                          </span>
                        ) : (
                          <span className="text-slate-600">{txn.paymentMethod}</span>
                        )}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-bold ${
                          isRefunded ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        Rs {txn.totalAmount.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION: Critical Stock Alerts Panel */}
      <div className="bg-white rounded-2xl border border-rose-200 shadow-2xs overflow-hidden">
        {/* Panel Header */}
        <div className="p-5 bg-gradient-to-r from-rose-50/80 via-amber-50/30 to-white border-b border-rose-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs shadow-rose-600/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Critical Stock Alerts</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                  {criticalStockList.length} below reorder threshold
                </span>
                {outOfStockCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                    {outOfStockCount} Out of Stock
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Medicines and counter items currently below safety reorder levels requiring distributor replenishment.
              </p>
            </div>
          </div>

          {/* Reorder Summary Badges & Action */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-white border border-rose-200 shadow-2xs">
              <span className="text-[10px] text-slate-500 block font-medium">Total Deficit</span>
              <span className="font-bold text-rose-700 font-mono text-xs sm:text-sm">
                +{totalDeficitPacks} packs
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-500 block font-medium">Est. Order Cost</span>
              <span className="font-bold text-slate-900 font-mono text-xs sm:text-sm">
                Rs {totalReorderEstimatedCost.toLocaleString()}
              </span>
            </div>

            <button
              onClick={() => onNavigateTab('critical_stock')}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              title="Open dedicated Critical Stock & Reorder Export Workspace"
            >
              <span>Reorder Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-1.5 overflow-x-auto text-xs">
          {[
            { id: 'all', label: `All Alerts (${criticalStockList.length})` },
            { id: 'out', label: `Out of Stock (${outOfStockCount})` },
            { id: 'urgent', label: 'Severe (<50%)' },
            { id: 'pharmacy', label: 'Medicines' },
            { id: 'general', label: 'General & Hygiene' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setStockAlertFilter(id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                stockAlertFilter === id
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Critical Items Grid */}
        <div className="p-5">
          {filteredCriticalStock.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 stroke-1" />
              <p className="text-sm font-bold text-slate-800">No critical stock alerts in this category</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All inventory items are currently above their reorder thresholds.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredCriticalStock.map((med) => {
                const isOut = med.isOutOfStock;
                const percent = Math.min(100, Math.max(0, med.percentOfThreshold));
                const barColor = isOut ? 'bg-rose-600' : percent <= 35 ? 'bg-rose-500' : 'bg-amber-500';

                return (
                  <div
                    key={med.id}
                    className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                      isOut
                        ? 'bg-rose-50/40 border-rose-300'
                        : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-start gap-3">
                        {/* Thumbnail with Out/Low Badge */}
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center">
                          {med.imageUrl ? (
                            <img src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-slate-400">
                              {med.category === 'Personal Care & Sexual Wellness' || med.department === 'personal_care' ? (
                                <Heart className="w-5 h-5 text-rose-500" />
                              ) : med.category === 'Baby & Mother Care' ? (
                                <Baby className="w-5 h-5 text-amber-500" />
                              ) : med.category === 'General Store & FMCG' ? (
                                <ShoppingBag className="w-5 h-5 text-blue-500" />
                              ) : (
                                <Pill className="w-5 h-5 text-emerald-600" />
                              )}
                            </div>
                          )}

                          {isOut ? (
                            <span className="absolute bottom-0 inset-x-0 bg-rose-600 text-white text-[9px] font-black text-center uppercase tracking-tight py-0.2">
                              0 left
                            </span>
                          ) : (
                            <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-slate-950 text-[9px] font-black text-center uppercase tracking-tight py-0.2">
                              Low
                            </span>
                          )}
                        </div>

                        {/* Title & Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                              {med.name}
                            </h4>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              isOut ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900'
                            }`}>
                              +{med.deficit} reorder
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                            {med.genericName} &bull; {med.strength}
                          </div>

                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium truncate max-w-[120px]">
                              {med.category}
                            </span>
                            {med.shelfLocation && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                                📍 {med.shelfLocation}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stock Level vs Reorder Threshold Progress Bar */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600 font-medium">
                            Stock: <strong className={isOut ? 'text-rose-600' : 'text-slate-900'}>{med.currentStockPacks} packs</strong>
                            {med.currentStockLoose ? ` (${med.currentStockLoose} loose)` : ''}
                          </span>
                          <span className="text-slate-500 font-mono text-[10px]">
                            Threshold: <strong>{med.threshold} packs</strong>
                          </span>
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all duration-300`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs">
                      <span className="text-[10px] text-slate-500">
                        Est. Cost: <strong className="font-mono text-slate-800">Rs {med.reorderCost.toLocaleString()}</strong>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onOpenMedicineModal(med)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1 transition"
                          title="Restock or edit batch and supplier"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Restock / Edit</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION: Most Dispensed */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Most dispensed</h2>
          <p className="text-xs text-slate-500">Based on recorded counter sales.</p>
        </div>

        {mostDispensedList.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">
            No items dispensed yet. Top-selling items will appear here as sales are recorded.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {mostDispensedList.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-400 font-semibold text-[11px]">
                    0{idx + 1}
                  </span>
                  <span className="font-bold text-slate-900">{item.name}</span>
                </div>
                <span className="text-slate-500 font-sans">
                  {item.quantity} sold
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
