import React from 'react';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  ShoppingCart, 
  ArrowUpRight, 
  ShieldCheck, 
  Store,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { MedicineItem, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { formatPKR, getPieceRetailPrice, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';
import { isToday, formatDate } from '../utils/dates';

interface DashboardViewProps {
  medicines: MedicineItem[];
  sales: SaleTransaction[];
  onNavigateTab: (tab: any) => void;
  onOpenMedicineModal: (med?: MedicineItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  medicines,
  sales,
  onNavigateTab,
  onOpenMedicineModal,
}) => {
  // 1. Calculations for Today
  const todaySales = sales.filter((s) => isToday(s.createdAt));
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);
  const todayProfit = todaySales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);
  const todayMargin = todayRevenue > 0 ? ((todayProfit / todayRevenue) * 100).toFixed(1) : '0';

  // 2. Inventory Valuation
  const totalStockValue = medicines.reduce(
    (acc, m) => acc + (m.currentStockPacks * m.unitRetailPrice) + ((m.currentStockLoose || 0) * getPieceRetailPrice(m)),
    0
  );
  const totalCostValue = medicines.reduce(
    (acc, m) => acc + (m.currentStockPacks * m.unitCostPrice) + ((m.currentStockLoose || 0) * (m.unitCostPrice / (m.unitsPerPack || 1))),
    0
  );

  // 3. Stock Health Alerts
  const lowStockMeds = medicines.filter((m) => m.currentStockPacks <= m.minThresholdPacks);
  const expiringMeds = medicines.filter((m) => isExpiringSoon(m.expiryDate, 90));
  const expiredMeds = medicines.filter((m) => isExpired(m.expiryDate));

  // 4. 7-Day Sales Trend (Last 7 days)
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

    const dayTransactions = sales.filter((s) => s.createdAt.startsWith(dayStr));
    const dayRev = dayTransactions.reduce((acc, s) => acc + s.totalAmount, 0);
    const dayProf = dayTransactions.reduce((acc, s) => acc + (s.totalProfit || 0), 0);

    return {
      date: dayStr,
      label: dayName,
      revenue: dayRev,
      profit: dayProf,
    };
  });

  const maxRevenue = Math.max(...last7Days.map((d) => d.revenue), 1000);

  // 5. Top 5 Selling Medicines (Aggregate from all sales)
  const itemCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
  sales.forEach((s) => {
    s.items.forEach((item) => {
      if (!itemCounts[item.medicineId]) {
        itemCounts[item.medicineId] = { name: item.medicineName, quantity: 0, revenue: 0 };
      }
      itemCounts[item.medicineId].quantity += item.quantity;
      itemCounts[item.medicineId].revenue += item.subtotal;
    });
  });

  const topSelling = Object.values(itemCounts)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Multan Store Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-emerald-800/40">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
                Official Pharmacy Registry
              </span>
              <span className="text-xs text-slate-300 font-mono">
                Lic: {ZAHID_PHARMACY_DETAILS.drugLicenceNumber}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {ZAHID_PHARMACY_DETAILS.name}
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm mt-1 max-w-xl">
              {ZAHID_PHARMACY_DETAILS.address}, {ZAHID_PHARMACY_DETAILS.city} &bull; Helpline: {ZAHID_PHARMACY_DETAILS.phone}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigateTab('pos')}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition flex items-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Open POS Counter</span>
            </button>
            <button
              onClick={() => onOpenMedicineModal()}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm backdrop-blur-md border border-white/20 transition flex items-center gap-2"
            >
              <Package className="w-4 h-4" />
              <span>Add Stock Item</span>
            </button>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Sales */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Sales</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatPKR(todayRevenue)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>{todaySales.length} Orders dispensed</span>
              <span className="text-emerald-600 font-semibold">{todayMargin}% margin</span>
            </div>
          </div>
        </div>

        {/* Card 2: Today's Net Profit */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Profit</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-teal-700 tracking-tight">
              {formatPKR(todayProfit)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Estimated net margin after discounts
            </div>
          </div>
        </div>

        {/* Card 3: Total Stock Valuation */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatPKR(totalStockValue)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>{medicines.length} Medicines</span>
              <span className="font-mono text-slate-700">Cost: {formatPKR(totalCostValue)}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Inventory Alerts */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock & Expiry Alerts</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700 tracking-tight">
              {lowStockMeds.length + expiringMeds.length + expiredMeds.length}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span className="text-rose-600 font-semibold">{lowStockMeds.length} low</span>
              <span>&bull;</span>
              <span className="text-amber-600 font-semibold">{expiringMeds.length} expiring</span>
              {expiredMeds.length > 0 && (
                <>
                  <span>&bull;</span>
                  <span className="text-red-700 font-bold">{expiredMeds.length} expired</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Grid: 7-Day Bar Chart & Top Selling Medicines */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 7-Day Sales Volume Chart */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Weekly Dispensing Revenue & Profit</h3>
              <p className="text-xs text-slate-500">Sales volume across the last 7 calendar days</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-600"></span>
                <span>Revenue (PKR)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-teal-400"></span>
                <span>Profit</span>
              </div>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="h-64 flex items-end gap-3 sm:gap-6 pt-6 pb-2 px-2 border-b border-slate-200">
            {last7Days.map((day) => {
              const revPercent = Math.max(8, Math.round((day.revenue / maxRevenue) * 100));
              const profPercent = Math.max(4, Math.round((day.profit / maxRevenue) * 100));

              return (
                <div key={day.date} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="relative w-full flex items-end justify-center gap-1 h-full">
                    {/* Revenue Bar */}
                    <div
                      style={{ height: `${revPercent}%` }}
                      className="w-full max-w-[28px] rounded-t-md bg-emerald-600 hover:bg-emerald-500 transition-all duration-300 relative"
                    >
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded font-mono whitespace-nowrap z-20 transition">
                        Rs. {day.revenue.toLocaleString()}
                      </div>
                    </div>

                    {/* Profit Bar */}
                    <div
                      style={{ height: `${profPercent}%` }}
                      className="w-full max-w-[14px] rounded-t-md bg-teal-400/80 hover:bg-teal-300 transition-all duration-300"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 mt-2">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 Medicines Dispensed */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-base">Top Selling Medicines</h3>
            <button
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              View Full Report
            </button>
          </div>

          <div className="space-y-3">
            {topSelling.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Complete sales transactions to view top dispensed brands.
              </div>
            ) : (
              topSelling.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900 text-xs truncate max-w-[130px]">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.quantity} units sold
                      </div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-xs text-slate-900">
                    {formatPKR(item.revenue)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
