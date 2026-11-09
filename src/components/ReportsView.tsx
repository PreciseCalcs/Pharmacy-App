import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { SaleTransaction } from '../types/pharmacy';
import { formatDateTime, isToday } from '../utils/dates';
import { formatPKR } from '../utils/pharmacyHelpers';
import { generateSalesReportPDF } from '../services/pdfGenerator';
import { exportSalesToExcel } from '../services/excelExporter';
import { soundService } from '../services/soundAlerts';
import { SalesHeatmap } from './SalesHeatmap';

interface ReportsViewProps {
  sales: SaleTransaction[];
  onSelectTransaction: (txn: SaleTransaction) => void;
  onRefundSale: (transactionId: string, reason?: string) => Promise<SaleTransaction>;
  canViewProfits: boolean;
  canProcessRefund: boolean;
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
  onSelectTransaction,
  onRefundSale,
  canViewProfits,
  canProcessRefund,
}) => {
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');
  const [searchInvoice, setSearchInvoice] = useState('');

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
            <span>Sales & Revenue Audit Register</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time financial performance, sale returns & stock restoration, and official PDF audit reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportSalesToExcel(filteredSales)}
            className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
            title="Download Excel spreadsheet of sales register"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => generateSalesReportPDF(filteredSales, 'Pharmacy Sales & Revenue Audit')}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
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
            Packs & Loose Units
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
            {refundedSales.length} {refundedSales.length === 1 ? 'Refunded Invoice' : 'Refunded Invoices'}
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

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
        {/* Date & Status Presets */}
        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All History' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedHeatmapDate(null);
                  setDateFilter(item.id as any);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition ${
                  !selectedHeatmapDate && dateFilter === item.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline-block text-slate-300">|</span>

          <div className="flex items-center gap-1">
            {[
              { id: 'all', label: 'All Status' },
              { id: 'completed', label: 'Active' },
              { id: 'refunded', label: `Refunded (${refundedSales.length})` },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap transition ${
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
                <th className="py-3 px-3">Date & Time</th>
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
                    Process Sale Return & Refund
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
