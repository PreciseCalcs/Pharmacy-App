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
  Boxes,
  Printer,
  Phone
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
import { buildProductSalesTrackRecord } from '../utils/productVelocity';
import { isToday } from '../utils/dates';
import { syncEngine } from '../services/syncEngine';
import { generatePurchaseOrderPDF } from '../services/pdfGenerator';
import { soundService } from '../services/soundAlerts';
import {
  DateRangePicker,
  DashboardDateRangeState,
  filterSalesByDateRange,
  getDateRangeMetadata,
  toLocalDateKey,
} from './DateRangePicker';

interface DashboardViewProps {
  medicines: MedicineItem[];
  sales: SaleTransaction[];
  pharmacyDetails: PharmacyDetails;
  onNavigateTab: (tab: string) => void;
  onOpenMedicineModal: (med?: MedicineItem) => void;
  onOpenProductTrackRecord?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  medicines,
  sales,
  pharmacyDetails,
  onNavigateTab,
  onOpenMedicineModal,
  onOpenProductTrackRecord,
}) => {
  const activeCounter = syncEngine.getActiveCounter();

  // Date Range Filter state for Overview sales & profit metrics
  const [dateRange, setDateRange] = useState<DashboardDateRangeState>({
    preset: 'today',
    customStart: '',
    customEnd: '',
  });

  const rangeMeta = useMemo(() => getDateRangeMetadata(dateRange), [dateRange]);

  // Metrics calculation (exclude refunded sales from active revenue)
  const completedSales = useMemo(
    () => sales.filter((s) => s.status !== 'refunded'),
    [sales]
  );

  const periodSales = useMemo(
    () => filterSalesByDateRange(completedSales, dateRange),
    [completedSales, dateRange]
  );

  const periodAllStatusSales = useMemo(
    () => filterSalesByDateRange(sales, dateRange),
    [sales, dateRange]
  );

  const periodRevenue = useMemo(
    () => periodSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0),
    [periodSales]
  );

  const periodProfit = useMemo(
    () =>
      periodSales.reduce((acc, s) => {
        if (typeof s.totalProfit === 'number' && !isNaN(s.totalProfit)) {
          return acc + s.totalProfit;
        }
        const itemProfit = (s.items || []).reduce(
          (sum, it) =>
            sum +
            (it.profit ??
              ((it.pricePerUnit || 0) - (it.costPerUnit || 0)) * (it.quantity || 0)),
          0
        );
        return acc + Math.max(0, itemProfit - (s.discountAmount || 0));
      }, 0),
    [periodSales]
  );

  const periodProfitMargin = useMemo(
    () => (periodRevenue > 0 ? Math.round((periodProfit / periodRevenue) * 1000) / 10 : 0),
    [periodProfit, periodRevenue]
  );

  const periodCashRevenue = useMemo(
    () =>
      periodSales
        .filter((s) => s.paymentMethod === 'Cash')
        .reduce((acc, s) => acc + (s.totalAmount || 0), 0),
    [periodSales]
  );

  const periodCreditRevenue = useMemo(
    () =>
      periodSales
        .filter((s) => s.paymentMethod === 'Credit')
        .reduce((acc, s) => acc + (s.totalAmount || 0), 0),
    [periodSales]
  );

  const periodDigitalRevenue = useMemo(
    () =>
      periodSales
        .filter(
          (s) =>
            s.paymentMethod === 'Card' ||
            s.paymentMethod === 'EasyPaisa' ||
            s.paymentMethod === 'JazzCash'
        )
        .reduce((acc, s) => acc + (s.totalAmount || 0), 0),
    [periodSales]
  );

  const periodUnitsDispensed = useMemo(
    () =>
      periodSales.reduce(
        (acc, s) => acc + (s.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0),
        0
      ),
    [periodSales]
  );

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

  // Dynamic sales revenue & profit trend calculation adapting to the selected date range
  const trendChartData = useMemo(() => {
    const days: {
      dateKey: string;
      label: string;
      fullDate: string;
      revenue: number;
      profit: number;
      orders: number;
    }[] = [];

    const now = new Date();
    const numDays =
      dateRange.preset === 'this_month'
        ? Math.max(7, now.getDate())
        : dateRange.preset === 'custom'
        ? Math.min(60, Math.max(7, rangeMeta.dayCount))
        : dateRange.preset === 'all_time'
        ? 14
        : 7;

    const endAnchor =
      dateRange.preset === 'custom' && rangeMeta.endDate ? rangeMeta.endDate : now;

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(endAnchor);
      d.setDate(d.getDate() - i);
      const dateStr = toLocalDateKey(d);
      const dayName =
        numDays > 10
          ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
          : d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayMonth = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

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
      const realProfit = daySales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);

      days.push({
        dateKey: dateStr,
        label:
          toLocalDateKey(now) === dateStr && numDays <= 10 ? 'Today' : dayName,
        fullDate: dayMonth,
        revenue: realRevenue,
        profit: Math.round(realProfit),
        orders: daySales.length,
      });
    }

    return days;
  }, [completedSales, dateRange, rangeMeta]);

  const totalTrendRevenue = useMemo(() => {
    return trendChartData.reduce((acc, d) => acc + d.revenue, 0);
  }, [trendChartData]);

  const totalTrendProfit = useMemo(() => {
    return trendChartData.reduce((acc, d) => acc + d.profit, 0);
  }, [trendChartData]);

  const avgDailyRevenue = Math.round(
    totalTrendRevenue / Math.max(1, trendChartData.length)
  );

  const peakDay = useMemo(() => {
    return trendChartData.reduce(
      (max, d) => (d.revenue > max.revenue ? d : max),
      trendChartData[0]
    );
  }, [trendChartData]);

  // Frequently sold medicines & store products track record filtered by selected period (fallback to all sales if period has 0 sales)
  const [topSellerFilter, setTopSellerFilter] = useState<'all' | 'pharmacy' | 'general'>('all');

  const fullTrackRecord = useMemo(
    () =>
      buildProductSalesTrackRecord(
        periodSales.length > 0 ? periodSales : completedSales,
        medicines,
        false
      ),
    [periodSales, completedSales, medicines]
  );

  const filteredTopSellers = useMemo(() => {
    return fullTrackRecord
      .filter((item) => {
        if (topSellerFilter === 'pharmacy') return item.department === 'pharmacy';
        if (topSellerFilter === 'general') return item.department !== 'pharmacy';
        return true;
      })
      .slice(0, 6);
  }, [fullTrackRecord, topSellerFilter]);

  const maxTopSellerUnits = useMemo(
    () => Math.max(1, ...filteredTopSellers.map((i) => i.totalUnitsSold)),
    [filteredTopSellers]
  );

  const recentTransactions = periodAllStatusSales.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Store Identity Hero Banner (Matching Screenshot 260 + Open Khata & New sale buttons) */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#004d3d] text-white p-5 sm:p-6 shadow-md border border-[#006652]">
        {/* Subtle Decorative Medical Blister Pack & Pill Silhouette Background Motif */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-6 top-0 bottom-0 w-72 opacity-10 hidden lg:flex items-center justify-end"
        >
          <div className="w-44 h-full border-x-4 border-white/40 flex flex-col justify-between py-3 px-4">
            <div className="grid grid-cols-3 gap-3">
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
              <span className="w-6 h-6 rounded-full bg-white/70" />
            </div>
            <div className="w-24 h-10 rounded-t-2xl bg-white/60 mx-auto" />
          </div>
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Left: Store Logo Emblem + Pharmacy Identity Details */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 min-w-0">
            {/* White Rounded Logo Card */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white shadow-md flex items-center justify-center shrink-0 p-2">
              {pharmacyDetails.logoUrl ? (
                <img
                  src={pharmacyDetails.logoUrl}
                  alt={pharmacyDetails.name}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <svg viewBox="0 0 80 80" className="w-14 h-14">
                  <path
                    d="M22 20 A26 26 0 0 1 56 18"
                    fill="none"
                    stroke="#0d3b66"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M58 60 A26 26 0 0 1 22 60"
                    fill="none"
                    stroke="#0d3b66"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M58 22 A24 24 0 0 1 64 52"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <rect x="35" y="13" width="8" height="3" rx="1" fill="#10b981" />
                  <rect x="37.5" y="10.5" width="3" height="8" rx="1" fill="#10b981" />
                  <text
                    x="17"
                    y="49"
                    fill="#0d3b66"
                    fontFamily="sans-serif"
                    fontWeight="900"
                    fontSize="24"
                  >
                    Z
                  </text>
                  <text
                    x="36"
                    y="49"
                    fill="#10b981"
                    fontFamily="sans-serif"
                    fontWeight="900"
                    fontSize="24"
                  >
                    M
                  </text>
                </svg>
              )}
            </div>

            {/* Identity Badges, Store Name & System Subtitle */}
            <div className="space-y-2 min-w-0">
              {/* Top Row: Address, Drug Licence #, NTN #, Phone */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-3 py-1 rounded-full bg-[#007a5e] text-white font-bold tracking-wide shadow-2xs">
                  {pharmacyDetails.address}
                  {pharmacyDetails.city ? `, ${pharmacyDetails.city.split(',')[0]}` : ''}
                </span>

                <span className="px-3 py-1 rounded-full bg-[#153e75] text-white font-bold font-mono tabular-nums shadow-2xs">
                  Licence #: {pharmacyDetails.drugLicenceNumber}
                </span>

                {pharmacyDetails.ntnNumber && (
                  <span className="px-2.5 py-1 rounded-full bg-[#07382c] border border-emerald-400/30 text-emerald-100 font-bold font-mono tabular-nums">
                    NTN: {pharmacyDetails.ntnNumber}
                  </span>
                )}

                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-emerald-200 font-mono font-bold tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{pharmacyDetails.phone}</span>
                </span>
              </div>

              {/* Store Title */}
              <h1 className="text-2xl sm:text-3xl font-serif font-black tracking-wide text-white uppercase leading-tight">
                {pharmacyDetails.name || 'ZAHID MEDICAL STORE'}
              </h1>

              {/* Store Subtitle */}
              <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl leading-relaxed">
                Official Pharmacy Inventory, Batch Expiration Tracker, Daily POS Sales &amp; DRAP Compliance Management System.
              </p>
            </div>
          </div>

          {/* Right: Action Buttons ("Open Khata" & "New sale") */}
          <div className="flex flex-wrap items-center gap-3 shrink-0 self-start lg:self-center">
            <button
              onClick={() => onNavigateTab('khata')}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-[#06261a] font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition cursor-pointer whitespace-nowrap"
            >
              <Users className="w-4 h-4 text-[#007a5e] shrink-0" />
              <span>Open Khata</span>
            </button>

            <button
              onClick={() => onNavigateTab('pos')}
              className="px-5 py-2.5 rounded-xl bg-[#00b67a] hover:bg-[#00c988] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md transition cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="w-4 h-4 text-slate-950 shrink-0" />
              <span>New sale</span>
            </button>
          </div>
        </div>
      </div>

      {/* Counter Greeting & Date Range Filter Bar ("Good day at the counter.") */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Good day at the counter.
          </h2>
          <p className="text-xs text-slate-500">
            Showing metrics for <span className="font-bold text-emerald-800">{rangeMeta.label}</span> &bull; sales, net profit, stock pressure, and customer accounts.
          </p>
        </div>

        {/* Date Range Picker Component */}
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Period Financial Breakdown Strip (Total Revenue, Net Profit, Cash vs Credit/Digital) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
              Total Revenue ({rangeMeta.label})
            </span>
            <DollarSign className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-1">
            Rs {periodRevenue.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-800/80 font-medium">
            {periodSales.length} {periodSales.length === 1 ? 'invoice' : 'invoices'} &bull; {periodUnitsDispensed} units sold
          </span>
        </div>

        <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900">
              Net Profit ({rangeMeta.label})
            </span>
            <TrendingUp className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-950 font-mono mt-1">
            Rs {Math.round(periodProfit).toLocaleString()}
          </div>
          <span className="text-[11px] text-teal-800 font-semibold">
            {periodProfitMargin}% gross margin on sales
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Cash Counter Sales
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900">
              Galla Cash
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-1">
            Rs {periodCashRevenue.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500">
            Digital / Wallets: Rs {periodDigitalRevenue.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Credit Sales ({rangeMeta.label})
            </span>
            <CreditCard className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-1">
            Rs {periodCreditRevenue.toLocaleString()}
          </div>
          <span className="text-[11px] text-amber-800/90">
            Total Khata due: Rs {totalKhataBalance.toLocaleString()}
          </span>
        </div>
      </div>

      {/* 4 Primary KPI Cards in 2x2 Grid (Matching Screenshot 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Filtered Period Sales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">
              {rangeMeta.possessiveLabel} sales
            </span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight mt-1">
              Rs {periodRevenue.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {periodSales.length} {periodSales.length === 1 ? 'recorded sale' : 'recorded sales'} &bull; Profit: Rs {Math.round(periodProfit).toLocaleString()}
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

      {/* Sales Revenue & Profit Performance Line Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Sales Revenue &amp; Profit Trend
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                  {dateRange.preset === 'this_month'
                    ? 'This Month'
                    : dateRange.preset === 'custom'
                    ? rangeMeta.label
                    : '7-Day Window'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualizing daily counter sales revenue and net profit across the selected timeframe.
              </p>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block font-medium">Window Revenue</span>
              <span className="font-bold text-slate-900 font-mono text-xs sm:text-sm">
                Rs {totalTrendRevenue.toLocaleString()}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="text-[10px] text-emerald-800 block font-semibold">Window Profit</span>
              <span className="font-bold text-emerald-900 font-mono text-xs sm:text-sm">
                Rs {totalTrendProfit.toLocaleString()}
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
              data={trendChartData}
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
                          Revenue: Rs {Number(data.revenue).toLocaleString()}
                        </div>
                        <div className="text-xs font-bold text-teal-300 font-mono mt-0.5">
                          Net Profit: Rs {Number(data.profit).toLocaleString()}
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
                name="Revenue"
                stroke="#083322"
                strokeWidth={3}
                dot={{ r: 4.5, fill: '#083322', stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 7, fill: '#10b981', stroke: '#083322', strokeWidth: 2.5 }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="Net Profit"
                stroke="#0d9488"
                strokeWidth={2.5}
                strokeDasharray="5 3"
                dot={{ r: 3.5, fill: '#0d9488', stroke: '#ffffff', strokeWidth: 1.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION: Recent Sales Activity (Filtered by Period) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Recent sales activity ({rangeMeta.label})
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-[10px] font-mono tabular-nums font-bold">
                Showing {recentTransactions.length} of {periodAllStatusSales.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Counter receipts recorded during {rangeMeta.label.toLowerCase()}.
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('reports')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <span>All sales</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <th className="py-2.5 px-3">INVOICE</th>
                <th className="py-2.5 px-3">CUSTOMER</th>
                <th className="py-2.5 px-3 hidden sm:table-cell">ITEMS</th>
                <th className="py-2.5 px-3">COUNTER</th>
                <th className="py-2.5 px-3">PAYMENT</th>
                <th className="py-2.5 px-3 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans text-xs">
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    No sales recorded yet. Complete a transaction at the Point of Sale to see receipts here.
                  </td>
                </tr>
              ) : (
                recentTransactions.map((txn) => {
                  const isRefunded = txn.status === 'refunded';
                  return (
                    <tr key={txn.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-mono tabular-nums font-bold text-slate-900">
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
                      <td className="py-3 px-3 text-slate-500 hidden sm:table-cell font-mono tabular-nums">
                        {txn.items.length} {txn.items.length === 1 ? 'item' : 'items'}
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
                        className={`py-3 px-3 text-right font-mono tabular-nums font-bold ${
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
              type="button"
              onClick={() => {
                soundService.click();
                generatePurchaseOrderPDF(
                  filteredCriticalStock,
                  stockAlertFilter === 'all' ? undefined : stockAlertFilter
                );
              }}
              disabled={filteredCriticalStock.length === 0}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Generate printable A4 Supplier Purchase Order (Demand List) PDF for low-stock items"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Demand List PDF</span>
            </button>

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

      {/* SECTION: Frequently Sold Medicines & Store Products Widget */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">
                  Frequently Sold Medicines &amp; Store Products
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                  {fullTrackRecord.length} active sellers
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Fast-moving medicines, personal care, baby items, and FMCG ranked by counter sale frequency.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Department Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              {[
                { id: 'all', label: 'All Items' },
                { id: 'pharmacy', label: 'Medicines' },
                { id: 'general', label: 'Store & Personal Care' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundService.click();
                    setTopSellerFilter(tab.id as 'all' | 'pharmacy' | 'general');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    topSellerFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                soundService.click();
                if (onOpenProductTrackRecord) {
                  onOpenProductTrackRecord();
                } else {
                  onNavigateTab('reports');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>Complete Track Record</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {filteredTopSellers.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <ShoppingBag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">
              No sales recorded in this category yet.
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Dispense medicines or general store products at the POS counter to build your live sales velocity track record.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {filteredTopSellers.map((item, idx) => {
              const barPct = Math.max(
                10,
                Math.min(100, Math.round((item.totalUnitsSold / maxTopSellerUnits) * 100))
              );

              return (
                <div
                  key={item.medicineId || idx}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white transition flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg font-mono font-black text-xs flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-800'
                            : idx === 2
                            ? 'bg-orange-100 text-orange-900'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        #{idx + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 truncate">{item.name}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              item.department === 'pharmacy'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-sky-50 text-sky-800 border border-sky-200'
                            }`}
                          >
                            {item.departmentLabel}
                          </span>
                          {item.velocityTier === 'fast_mover' && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                              Fast Mover
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                          {item.genericName} {item.strength ? `• ${item.strength}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-slate-900">
                        {formatPKR(item.totalRevenue)}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold">
                        {item.invoiceCount} {item.invoiceCount === 1 ? 'receipt' : 'receipts'}
                      </div>
                    </div>
                  </div>

                  {/* Velocity Progress Bar & Breakdown */}
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>
                        Sold:{' '}
                        <strong className="text-slate-800">
                          {item.packsSold > 0 ? `${item.packsSold} packs` : ''}
                          {item.packsSold > 0 && item.looseUnitsSold > 0 ? ' + ' : ''}
                          {item.looseUnitsSold > 0 ? `${item.looseUnitsSold} loose` : ''}
                          {item.packsSold === 0 && item.looseUnitsSold === 0
                            ? `${item.totalUnitsSold} units`
                            : ''}
                        </strong>
                      </span>
                      <span
                        className={
                          item.isLowStock ? 'text-rose-600 font-bold' : 'text-slate-500'
                        }
                      >
                        Stock: {item.currentStockPacks} packs
                        {item.isLowStock ? ' (Low!)' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
