import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  FileText, 
  Printer, 
  Filter, 
  DollarSign, 
  TrendingUp, 
  Receipt,
  Search,
  CheckCircle2
} from 'lucide-react';
import { PaymentMethod, SaleTransaction } from '../types/pharmacy';
import { formatDateTime, formatDate, isToday } from '../utils/dates';
import { formatPKR } from '../utils/pharmacyHelpers';
import { generateSalesReportPDF } from '../services/pdfGenerator';
import { exportSalesToExcel } from '../services/excelExporter';

interface ReportsViewProps {
  sales: SaleTransaction[];
  onSelectTransaction: (txn: SaleTransaction) => void;
  canViewProfits: boolean;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  onSelectTransaction,
  canViewProfits,
}) => {
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [searchInvoice, setSearchInvoice] = useState('');

  const filteredSales = useMemo(() => {
    return sales.filter((txn) => {
      // Date filter
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

      // Payment method filter
      if (paymentFilter !== 'All' && txn.paymentMethod !== paymentFilter) return false;

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
  }, [sales, dateFilter, paymentFilter, searchInvoice]);

  // Aggregated totals
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalProfit = filteredSales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
  const totalDiscount = filteredSales.reduce((sum, s) => sum + s.discountAmount, 0);
  const totalItemsSold = filteredSales.reduce((sum, s) => sum + s.items.reduce((acc, i) => acc + i.quantity, 0), 0);
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

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
            Real-time financial performance, profit margin tracking, and official PDF audit reports.
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
            onClick={() => generateSalesReportPDF(filteredSales, 'Zahid Medical Store - Sales Audit')}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
            title="Download printable PDF audit report"
          >
            <FileText className="w-4 h-4" />
            <span>Download Audit PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Period Revenue
          </span>
          <span className="text-xl font-black text-slate-900 tracking-tight">
            {formatPKR(totalRevenue)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {filteredSales.length} Transactions
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
            Packs & Loose Tablets
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
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Date Presets */}
        <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'today', label: 'Today' },
            { id: '7days', label: 'Last 7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All History' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setDateFilter(item.id as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition ${
                dateFilter === item.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Payment Filter & Search */}
        <div className="flex items-center gap-2 w-full md:w-auto">
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

          <div className="relative flex-1 md:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoice #..."
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
                filteredSales.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {txn.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      {formatDateTime(txn.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <div className="font-semibold text-slate-800">{txn.customerName}</div>
                      {txn.customerPhone && (
                        <div className="text-[10px] text-slate-400 font-mono">{txn.customerPhone}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                        {txn.paymentMethod}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      {txn.items.length} medicines
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      Rs. {txn.subtotal}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-700">
                      {txn.discountAmount > 0 ? `-Rs. ${txn.discountAmount}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      Rs. {txn.totalAmount}
                    </td>
                    {canViewProfits && (
                      <td className="py-2.5 px-3 text-teal-700 font-semibold">
                        Rs. {txn.totalProfit || 0}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-right font-sans">
                      <button
                        onClick={() => onSelectTransaction(txn)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 ml-auto"
                        title="View & Re-print Thermal Receipt"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
