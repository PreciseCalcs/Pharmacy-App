import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Download,
  FileText,
  Printer,
  Search,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  X,
  PackageCheck,
  CreditCard,
  TrendingUp,
  Sparkles,
  Pill,
  ShoppingBag,
  Heart,
  Baby,
  Receipt,
  Award,
} from 'lucide-react';
import { MedicineItem, SaleTransaction } from '../types/pharmacy';
import { formatDateTime, isToday } from '../utils/dates';
import { formatPKR } from '../utils/pharmacyHelpers';
import { buildProductSalesTrackRecord } from '../utils/productVelocity';
import { generateSalesReportPDF } from '../services/pdfGenerator';
import {
  exportSalesToExcel,
  exportProductTrackRecordToExcel,
} from '../services/excelExporter';
import { soundService } from '../services/soundAlerts';
import { SalesHeatmap } from './SalesHeatmap';

interface ReportsViewProps {
  sales: SaleTransaction[];
  medicines: MedicineItem[];
  onSelectTransaction: (txn: SaleTransaction) => void;
  onRefundSale: (transactionId: string, reason?: string) => Promise<SaleTransaction>;
  canViewProfits: boolean;
  canProcessRefund: boolean;
  initialReportSection?: 'invoices' | 'products' | null;
  onReportSectionConsumed?: () => void;
}

const PRESET_REFUND_REASONS = [
  'Customer return (Unopened / Safe storage)',
  'Doctor changed prescription',
  'Wrong item or strength dispensed',
  'Billing / Payment method correction',
  'Damaged or defective packaging',
];

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  medicines,
  onSelectTransaction,
  onRefundSale,
  canViewProfits,
  canProcessRefund,
  initialReportSection,
  onReportSectionConsumed,
}) => {
  const [reportSection, setReportSection] = useState<'invoices' | 'products'>('invoices');
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');
  const [searchInvoice, setSearchInvoice] = useState('');

  // Product & Medicine Track Record Filters
  const [productDeptFilter, setProductDeptFilter] = useState<string>('all');
  const [productSortBy, setProductSortBy] = useState<
    'frequency' | 'units' | 'revenue' | 'profit'
  >('frequency');
  const [includeUnsoldCatalog, setIncludeUnsoldCatalog] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>('');

  useEffect(() => {
    if (initialReportSection) {
      setReportSection(initialReportSection);
      onReportSectionConsumed?.();
    }
  }, [initialReportSection, onReportSectionConsumed]);

  // Refund Modal State
  const [refundTarget, setRefundTarget] = useState<SaleTransaction | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REFUND_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [isRefunding, setIsRefunding] = useState<boolean>(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccessBanner, setRefundSuccessBanner] = useState<string | null>(null);

  const filteredSales = useMemo(() => {
    return sales.filter((txn) => {
      // Specific calendar day selected from Sales Heatmap
      if (selectedHeatmapDate) {
        const d = new Date(txn.createdAt);
        if (isNaN(d.getTime())) return false;
        const localKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;
        if (localKey !== selectedHeatmapDate) return false;
      } else {
        // Preset Date filter
        if (dateFilter === 'today' && !isToday(txn.createdAt)) return false;
        if (dateFilter === '7days') {
          const d = new Date(txn.createdAt);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (d < sevenDaysAgo) return false;
        }
        if (dateFilter === 'month') {
          const d = new Date(txn.createdAt);
          const now = new Date();
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        }
      }

      // Payment method filter
      if (paymentFilter !== 'All' && txn.paymentMethod !== paymentFilter) return false;

      // Status filter
      if (statusFilter === 'completed' && txn.status === 'refunded') return false;
      if (statusFilter === 'refunded' && txn.status !== 'refunded') return false;

      // Search invoice / customer
      if (searchInvoice.trim()) {
        const q = searchInvoice.toLowerCase().trim();
        const matches =
          txn.invoiceNumber.toLowerCase().includes(q) ||
          txn.customerName.toLowerCase().includes(q) ||
          (txn.customerPhone && txn.customerPhone.includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [sales, dateFilter, selectedHeatmapDate, paymentFilter, statusFilter, searchInvoice]);

  // Aggregated totals (calculated from active/completed sales so refunded invoices don't inflate revenue)
  const completedSales = useMemo(
    () => filteredSales.filter((s) => s.status !== 'refunded'),
    [filteredSales]
  );
  const refundedSales = useMemo(
    () => filteredSales.filter((s) => s.status === 'refunded'),
    [filteredSales]
  );

  const totalRevenue = completedSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalProfit = completedSales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
  const totalDiscount = completedSales.reduce((sum, s) => sum + s.discountAmount, 0);
  const totalItemsSold = completedSales.reduce(
    (sum, s) => sum + s.items.reduce((acc, i) => acc + i.quantity, 0),
    0
  );
  const totalRefundedAmount = refundedSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

  // Complete Frequently Sold Products & Medicines Track Record
  const productTrackRecords = useMemo(() => {
    const base = buildProductSalesTrackRecord(
      completedSales,
      medicines,
      includeUnsoldCatalog
    );

    const filtered = base.filter((item) => {
      if (productDeptFilter !== 'all' && item.department !== productDeptFilter) {
        return false;
      }
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        const match =
          item.name.toLowerCase().includes(q) ||
          item.genericName.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.departmentLabel.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (productSortBy === 'units') {
        if (b.totalUnitsSold !== a.totalUnitsSold) return b.totalUnitsSold - a.totalUnitsSold;
        return b.invoiceCount - a.invoiceCount;
      }
      if (productSortBy === 'revenue') {
        if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
        return b.invoiceCount - a.invoiceCount;
      }
      if (productSortBy === 'profit') {
        if (b.totalProfit !== a.totalProfit) return b.totalProfit - a.totalProfit;
        return b.totalRevenue - a.totalRevenue;
      }
      // Default: 'frequency' (number of receipts)
      if (b.invoiceCount !== a.invoiceCount) return b.invoiceCount - a.invoiceCount;
      if (b.totalUnitsSold !== a.totalUnitsSold) return b.totalUnitsSold - a.totalUnitsSold;
      return b.totalRevenue - a.totalRevenue;
    });
  }, [
    completedSales,
    medicines,
    includeUnsoldCatalog,
    productDeptFilter,
    productSearch,
    productSortBy,
  ]);

  // All sold items in period (for summary stats regardless of search/dept filter)
  const allPeriodSoldProducts = useMemo(
    () => buildProductSalesTrackRecord(completedSales, medicines, false),
    [completedSales, medicines]
  );

  const topFrequentItem = allPeriodSoldProducts[0] || null;
  const topRevenueItem = useMemo(() => {
    if (allPeriodSoldProducts.length === 0) return null;
    return [...allPeriodSoldProducts].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
  }, [allPeriodSoldProducts]);

  const medicinesSoldCount = useMemo(
    () => allPeriodSoldProducts.filter((p) => p.department === 'pharmacy').length,
    [allPeriodSoldProducts]
  );
  const generalProductsSoldCount = useMemo(
    () => allPeriodSoldProducts.filter((p) => p.department !== 'pharmacy').length,
    [allPeriodSoldProducts]
  );
  const fastMoversLowStockCount = useMemo(
    () =>
      allPeriodSoldProducts.filter(
        (p) => (p.velocityTier === 'fast_mover' || p.velocityTier === 'steady') && p.isLowStock
      ).length,
    [allPeriodSoldProducts]
  );

  const maxTrackInvoices = useMemo(
    () => Math.max(1, ...productTrackRecords.map((p) => p.invoiceCount)),
    [productTrackRecords]
  );

  const handleOpenRefundModal = (txn: SaleTransaction) => {
    setRefundError(null);
    setSelectedReason(PRESET_REFUND_REASONS[0]);
    setCustomReason('');
    setRefundTarget(txn);
    soundService.click();
  };

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;

    setIsRefunding(true);
    setRefundError(null);
    try {
      const finalReason = customReason.trim()
        ? `${selectedReason} — ${customReason.trim()}`
        : selectedReason;

      const updatedTxn = await onRefundSale(refundTarget.id, finalReason);
      soundService.cashRegister();
      setRefundSuccessBanner(
        `Invoice ${updatedTxn.invoiceNumber} refunded (${formatPKR(
          updatedTxn.totalAmount
        )}). Returned stock restored to inventory${
          updatedTxn.paymentMethod === 'Credit'
            ? ` and ${updatedTxn.customerName}'s Khata balance adjusted.`
            : '.'
        }`
      );
      setRefundTarget(null);
      setTimeout(() => setRefundSuccessBanner(null), 6000);
    } catch (err: any) {
      soundService.errorTone();
      setRefundError(err?.message || 'Failed to process sale refund.');
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner and Export Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-700" />
            <span>Sales &amp; Product Velocity Audit Register</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time financial performance, frequently sold medicines &amp; store products track record, and sale returns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportProductTrackRecordToExcel(productTrackRecords, canViewProfits)}
            className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Download Frequently Sold Products & Medicines Track Record (.xlsx)"
          >
            <TrendingUp className="w-4 h-4 text-emerald-700" />
            <span>Export Product Track Record</span>
          </button>

          <button
            onClick={() => exportSalesToExcel(filteredSales)}
            className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Download Excel spreadsheet of sales register"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export Invoices Excel</span>
          </button>

          <button
            onClick={() => generateSalesReportPDF(filteredSales, 'Pharmacy Sales & Revenue Audit')}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition cursor-pointer"
            title="Download printable PDF audit report"
          >
            <FileText className="w-4 h-4" />
            <span>Download Audit PDF</span>
          </button>
        </div>
      </div>

      {/* Refund Success Banner */}
      {refundSuccessBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{refundSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setRefundSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Metric Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Net Period Revenue
          </span>
          <span className="text-xl font-black text-slate-900 tracking-tight">
            {formatPKR(totalRevenue)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {completedSales.length} Active Sales
          </span>
        </div>

        {canViewProfits && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Estimated Net Profit
            </span>
            <span className="text-xl font-black text-teal-700 tracking-tight">
              {formatPKR(totalProfit)}
            </span>
            <span className="text-[10px] text-teal-600 font-semibold block mt-0.5">
              Avg Margin: {avgMargin}%
            </span>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Total Units Dispensed
          </span>
          <span className="text-xl font-black text-slate-900 tracking-tight">
            {totalItemsSold}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {allPeriodSoldProducts.length} distinct products sold
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Discounts Granted
          </span>
          <span className="text-xl font-black text-amber-700 tracking-tight">
            {formatPKR(totalDiscount)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Customer goodwill savings
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block mb-1">
            Returns / Refunds
          </span>
          <span className="text-xl font-black text-rose-800 tracking-tight">
            {formatPKR(totalRefundedAmount)}
          </span>
          <span className="text-[10px] text-rose-600 font-medium block mt-0.5">
            {refundedSales.length}{' '}
            {refundedSales.length === 1 ? 'Refunded Invoice' : 'Refunded Invoices'}
          </span>
        </div>
      </div>

      {/* Daily Sales Revenue Calendar Heatmap */}
      <SalesHeatmap
        sales={sales}
        canViewProfits={canViewProfits}
        selectedDateKey={selectedHeatmapDate}
        onSelectDateKey={setSelectedHeatmapDate}
      />

      {/* Primary Section Switcher: Invoices Register vs. Frequently Sold Products & Medicines Track Record */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              soundService.click();
              setReportSection('invoices');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              reportSection === 'invoices'
                ? 'bg-[#083322] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Sales Invoices &amp; Refunds</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                reportSection === 'invoices'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {filteredSales.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundService.click();
              setReportSection('products');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              reportSection === 'products'
                ? 'bg-[#083322] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Award className="w-4 h-4 text-amber-400" />
            <span>Frequently Sold Products &amp; Medicines Track Record</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                reportSection === 'products'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {allPeriodSoldProducts.length}
            </span>
          </button>
        </div>

        {/* Period Date Filter (Shared across both tabs) */}
        <div className="flex items-center gap-1 overflow-x-auto px-1">
          {[
            { id: 'today', label: 'Today' },
            { id: '7days', label: 'Last 7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All History' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedHeatmapDate(null);
                setDateFilter(item.id as any);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                !selectedHeatmapDate && dateFilter === item.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW 1: FREQUENTLY SOLD PRODUCTS & MEDICINES COMPLETE TRACK RECORD     */}
      {/* ===================================================================== */}
      {reportSection === 'products' && (
        <div className="space-y-4">
          {/* Product Velocity Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                #1 Most Frequent Seller
              </span>
              {topFrequentItem ? (
                <>
                  <div className="font-bold text-slate-900 text-sm truncate">
                    {topFrequentItem.name}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono font-bold mt-0.5">
                    Sold in {topFrequentItem.invoiceCount}{' '}
                    {topFrequentItem.invoiceCount === 1 ? 'receipt' : 'receipts'} &bull;{' '}
                    {topFrequentItem.totalUnitsSold} units
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">No sales in selected period</div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                #1 Top Revenue Generator
              </span>
              {topRevenueItem ? (
                <>
                  <div className="font-bold text-slate-900 text-sm truncate">
                    {topRevenueItem.name}
                  </div>
                  <div className="text-[11px] text-slate-700 font-mono font-bold mt-0.5">
                    {formatPKR(topRevenueItem.totalRevenue)} ({topRevenueItem.revenueSharePercent}% of sales)
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">No revenue in selected period</div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Medicines vs Store Products
              </span>
              <div className="font-black text-slate-900 text-base font-mono">
                {medicinesSoldCount} Meds &bull; {generalProductsSoldCount} Store Items
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Includes condoms, baby care, hygiene &amp; FMCG
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                Fast-Movers Low on Stock
              </span>
              <div className="font-black text-amber-900 text-base font-mono">
                {fastMoversLowStockCount}{' '}
                {fastMoversLowStockCount === 1 ? 'Product' : 'Products'}
              </div>
              <span className="text-[10px] text-amber-700 block mt-0.5">
                High-demand items at or below safety threshold
              </span>
            </div>
          </div>

          {/* Department Filter & Sort Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Department Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All Products & Medicines', icon: Sparkles },
                  { id: 'pharmacy', label: 'Clinical Medicines', icon: Pill },
                  { id: 'personal_care', label: 'Personal Care & Condoms', icon: Heart },
                  { id: 'mother_baby', label: 'Mother & Baby', icon: Baby },
                  { id: 'general_store', label: 'General Store & FMCG', icon: ShoppingBag },
                  { id: 'surgical', label: 'Devices & Surgical', icon: PackageCheck },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      soundService.click();
                      setProductDeptFilter(id);
                    }}
                    className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                      productDeptFilter === id
                        ? 'bg-[#083322] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Include Unsold Catalog Toggle */}
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  checked={includeUnsoldCatalog}
                  onChange={(e) => setIncludeUnsoldCatalog(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Include Unsold Catalog Items (0 Sales)</span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              {/* Search Box */}
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search medicine brand, generic formula, condoms, diapers, soap, surgical..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Ranking Sort Selector */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                  Rank By:
                </span>
                <select
                  value={productSortBy}
                  onChange={(e) => setProductSortBy(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 text-xs"
                >
                  <option value="frequency">Most Frequent (Receipt Count)</option>
                  <option value="units">Total Units Dispensed</option>
                  <option value="revenue">Highest Revenue (Rs.)</option>
                  {canViewProfits && <option value="profit">Highest Net Profit (Rs.)</option>}
                </select>
              </div>
            </div>
          </div>

          {/* Complete Product & Medicine Sales Track Record Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                    <th className="py-3 px-3 w-14">Rank</th>
                    <th className="py-3 px-3">Product / Medicine &amp; Formula</th>
                    <th className="py-3 px-3">Department &amp; Category</th>
                    <th className="py-3 px-3">Sale Frequency</th>
                    <th className="py-3 px-3">Packs &amp; Loose Sold</th>
                    <th className="py-3 px-3">Total Revenue</th>
                    {canViewProfits && <th className="py-3 px-3 text-teal-800">Net Profit</th>}
                    <th className="py-3 px-3">Shelf Stock</th>
                    <th className="py-3 px-3">Last Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                  {productTrackRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                        <div className="max-w-md mx-auto space-y-2">
                          <p className="font-bold text-slate-700 text-sm">
                            No product sales recorded for this filter/period yet.
                          </p>
                          <p className="text-xs text-slate-400">
                            Complete sales at the Point of Sale or check{' '}
                            <strong>"Include Unsold Catalog Items"</strong> above to inspect your full medicine &amp; general store catalog.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    productTrackRecords.map((item, idx) => {
                      const freqBarWidth = Math.max(
                        6,
                        Math.min(100, Math.round((item.invoiceCount / maxTrackInvoices) * 100))
                      );

                      return (
                        <tr
                          key={item.medicineId || idx}
                          className="hover:bg-slate-50/80 transition"
                        >
                          {/* Rank */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs ${
                                idx === 0 && item.invoiceCount > 0
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : idx === 1 && item.invoiceCount > 0
                                  ? 'bg-slate-200 text-slate-800'
                                  : idx === 2 && item.invoiceCount > 0
                                  ? 'bg-orange-100 text-orange-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                          </td>

                          {/* Product / Medicine & Formula */}
                          <td className="py-3 px-3 font-sans">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs">
                                {item.name}
                              </span>
                              {item.velocityTier === 'fast_mover' && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-extrabold text-[9px] uppercase">
                                  Fast Mover
                                </span>
                              )}
                              {item.velocityTier === 'steady' && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px] uppercase">
                                  Steady
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {item.genericName}{' '}
                              {item.strength ? `• ${item.strength}` : ''} ({item.dosageForm})
                            </div>
                          </td>

                          {/* Department & Category */}
                          <td className="py-3 px-3 font-sans">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                                item.department === 'pharmacy'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : item.department === 'personal_care'
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : item.department === 'mother_baby'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-sky-50 text-sky-800 border border-sky-200'
                              }`}
                            >
                              {item.departmentLabel}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]">
                              {item.category}
                            </div>
                          </td>

                          {/* Sale Frequency (Receipts Count + Visual Bar) */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">
                              {item.invoiceCount}{' '}
                              <span className="font-sans font-normal text-slate-500">
                                {item.invoiceCount === 1 ? 'receipt' : 'receipts'}
                              </span>
                            </div>
                            <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{
                                  width: `${item.invoiceCount > 0 ? freqBarWidth : 0}%`,
                                }}
                              />
                            </div>
                          </td>

                          {/* Packs & Loose Sold */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">
                              {item.packsSold > 0 ? `${item.packsSold} packs` : ''}
                              {item.packsSold > 0 && item.looseUnitsSold > 0 ? ' + ' : ''}
                              {item.looseUnitsSold > 0 ? `${item.looseUnitsSold} loose` : ''}
                              {item.packsSold === 0 && item.looseUnitsSold === 0 ? '0 sold' : ''}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {item.totalPiecesDispensed} total pcs
                            </div>
                          </td>

                          {/* Total Revenue */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">
                              {formatPKR(item.totalRevenue)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {item.revenueSharePercent}% of store sales
                            </div>
                          </td>

                          {/* Net Profit (Owner Only) */}
                          {canViewProfits && (
                            <td className="py-3 px-3">
                              <div className="font-bold text-teal-700">
                                {formatPKR(item.totalProfit)}
                              </div>
                              <div className="text-[10px] text-teal-600">
                                Margin: {item.profitMarginPercent}%
                              </div>
                            </td>
                          )}

                          {/* Current Shelf Stock */}
                          <td className="py-3 px-3">
                            <span
                              className={`font-bold ${
                                item.isLowStock ? 'text-rose-600' : 'text-slate-800'
                              }`}
                            >
                              {item.currentStockPacks} packs
                            </span>
                            {item.currentStockLoose > 0 && (
                              <span className="text-[10px] text-slate-400 block">
                                +{item.currentStockLoose} loose
                              </span>
                            )}
                            {item.isLowStock && (
                              <span className="inline-block mt-0.5 text-[9px] font-sans font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                                Low Stock
                              </span>
                            )}
                          </td>

                          {/* Last Sold Timestamp */}
                          <td className="py-3 px-3 font-sans text-slate-500">
                            {item.lastSoldAt ? formatDateTime(item.lastSoldAt) : 'Not sold yet'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: SALES INVOICE & RECEIPT AUDIT REGISTER                        */}
      {/* ===================================================================== */}
      {reportSection === 'invoices' && (
        <>
          {/* Compact Fast-Moving Track Record Preview Bar inside Invoices Tab */}
          {allPeriodSoldProducts.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-950 to-[#0c3927] text-white p-4 rounded-2xl shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs sm:text-sm font-bold">
                    Top Selling Medicines &amp; Store Products (Selected Period)
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {allPeriodSoldProducts.slice(0, 4).map((p, i) => (
                    <span
                      key={p.medicineId || i}
                      className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono flex items-center gap-1.5"
                    >
                      <strong className="text-amber-300">#{i + 1}</strong>
                      <span className="font-sans font-semibold text-white">{p.name}</span>
                      <span className="text-emerald-300">
                        ({p.invoiceCount} bills &bull; {formatPKR(p.totalRevenue)})
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  soundService.click();
                  setReportSection('products');
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs whitespace-nowrap transition cursor-pointer self-start lg:self-center"
              >
                Open Full Product Track Record ({allPeriodSoldProducts.length}) &rarr;
              </button>
            </div>
          )}

          {/* Filter Toolbar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
            {/* Status Presets */}
            <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
              <div className="flex items-center gap-1">
                {[
                  { id: 'all', label: 'All Status' },
                  { id: 'completed', label: 'Active' },
                  { id: 'refunded', label: `Refunded (${refundedSales.length})` },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
                      statusFilter === st.id
                        ? st.id === 'refunded'
                          ? 'bg-rose-600 text-white'
                          : 'bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Filter & Search */}
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                <option value="All">All Payment Methods</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="EasyPaisa">EasyPaisa</option>
                <option value="JazzCash">JazzCash</option>
                <option value="Credit">Credit</option>
              </select>

              <div className="relative flex-1 lg:w-52">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice # or customer..."
                  value={searchInvoice}
                  onChange={(e) => setSearchInvoice(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Transaction History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                    <th className="py-3 px-3">Invoice #</th>
                    <th className="py-3 px-3">Date &amp; Time</th>
                    <th className="py-3 px-3">Customer / Patient</th>
                    <th className="py-3 px-3">Payment</th>
                    <th className="py-3 px-3">Items Dispensed</th>
                    <th className="py-3 px-3">Subtotal</th>
                    <th className="py-3 px-3">Discount</th>
                    <th className="py-3 px-3 font-bold text-slate-900">Net Total</th>
                    {canViewProfits && <th className="py-3 px-3 text-teal-800">Profit</th>}
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                        No sales recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((txn) => {
                      const isRefunded = txn.status === 'refunded';
                      return (
                        <tr
                          key={txn.id}
                          className={`transition ${
                            isRefunded
                              ? 'bg-rose-50/30 hover:bg-rose-50/50 text-slate-500'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={isRefunded ? 'line-through text-slate-500' : ''}>
                                {txn.invoiceNumber}
                              </span>
                              {isRefunded && (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-sans font-bold text-[10px] uppercase tracking-wider"
                                  title={
                                    txn.refundReason
                                      ? `Refunded by ${txn.refundedBy || 'Staff'}: ${txn.refundReason}`
                                      : 'Refunded'
                                  }
                                >
                                  Refunded
                                </span>
                              )}
                            </div>
                            {isRefunded && txn.refundReason && (
                              <div className="text-[10px] font-sans font-normal text-rose-600 truncate max-w-[180px]">
                                {txn.refundReason}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-sans">
                            {formatDateTime(txn.createdAt)}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-semibold text-slate-800">{txn.customerName}</div>
                            {txn.customerPhone && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {txn.customerPhone}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded font-medium text-[10px] ${
                                txn.paymentMethod === 'Credit'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {txn.paymentMethod}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-700">
                            {txn.items.length} {txn.items.length === 1 ? 'item' : 'items'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">Rs. {txn.subtotal}</td>
                          <td className="py-2.5 px-3 text-emerald-700">
                            {txn.discountAmount > 0 ? `-Rs. ${txn.discountAmount}` : '-'}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-bold ${
                              isRefunded ? 'text-rose-700 line-through' : 'text-slate-900'
                            }`}
                          >
                            Rs. {txn.totalAmount}
                          </td>
                          {canViewProfits && (
                            <td
                              className={`py-2.5 px-3 font-semibold ${
                                isRefunded ? 'text-slate-400 line-through' : 'text-teal-700'
                              }`}
                            >
                              Rs. {txn.totalProfit || 0}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-right font-sans">
                            <div className="flex items-center justify-end gap-1.5">
                              {canProcessRefund && !isRefunded && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRefundModal(txn)}
                                  className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition"
                                  title="Process Return / Refund and restore stock to inventory"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Refund</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onSelectTransaction(txn)}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 transition"
                                title="View & Re-print Thermal Receipt"
                              >
                                <Printer className="w-3.5 h-3.5 text-slate-500" />
                                <span>Receipt</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sale Return & Refund Confirmation Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base">
                    Process Sale Return &amp; Refund
                  </h3>
                  <p className="text-xs text-rose-100 font-mono">
                    Invoice #{refundTarget.invoiceNumber} &bull; {refundTarget.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRefund} className="p-5 space-y-4 text-xs">
              {refundError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{refundError}</span>
                </div>
              )}

              {/* Summary Strip */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Refund Amount
                  </span>
                  <span className="text-lg font-black text-rose-700 font-mono">
                    Rs {refundTarget.totalAmount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Original Payment
                  </span>
                  <span className="text-sm font-bold text-slate-800 block mt-0.5">
                    {refundTarget.paymentMethod}
                  </span>
                </div>
              </div>

              {/* Khata Credit Adjustment Notice */}
              {refundTarget.paymentMethod === 'Credit' && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                  <CreditCard className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Credit Khata Balance Adjustment</div>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Refunding this credit invoice will automatically deduct{' '}
                      <strong className="font-mono">
                        Rs {refundTarget.totalAmount.toLocaleString()}
                      </strong>{' '}
                      from <strong>{refundTarget.customerName}</strong>'s outstanding Khata balance.
                    </p>
                  </div>
                </div>
              )}

              {/* Items to Restore to Stock */}
              <div>
                <div className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span>Items to Restore to Inventory ({refundTarget.items.length})</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 px-3">
                  {refundTarget.items.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900">{item.medicineName}</span>
                        <span className="text-[11px] text-slate-500 block font-mono">
                          Batch: {item.batchNumber || 'N/A'}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                          +{item.quantity} {item.unitType === 'pack' ? 'packs' : 'loose units'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Rs {item.subtotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason Selection */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-700">Return / Refund Reason</label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {PRESET_REFUND_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Additional note (optional)..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRefunding}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/25 disabled:opacity-50 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isRefunding ? 'Processing Return...' : 'Confirm Refund & Restore Stock'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
