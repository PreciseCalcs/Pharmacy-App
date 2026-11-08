import React, { useState } from 'react';
import { 
  ReceiptText, 
  History, 
  Download, 
  Eye, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { TransactionRecord, StockAdjustmentRecord } from '../types/pharmacy';
import { offlineStore } from '../lib/pocketbase';

interface TransactionsViewProps {
  transactions: TransactionRecord[];
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ transactions }) => {
  const [activeSubTab, setActiveSubTab] = useState<'sales' | 'adjustments'>('sales');
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  const adjustments: StockAdjustmentRecord[] = offlineStore.getAdjustments();

  const exportSalesCsv = () => {
    const headers = ['Transaction Number', 'Date', 'Customer', 'Pharmacist', 'Payment Method', 'Items Count', 'Total ($)'];
    const rows = transactions.map(t => [
      t.transaction_number,
      new Date(t.created).toLocaleString(),
      `"${t.customer_name}"`,
      `"${t.pharmacist_name}"`,
      t.payment_method,
      t.items.reduce((acc: number, i: any) => acc + i.quantity, 0),
      t.total_amount.toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `pharmacy_sales_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ReceiptText className="w-6 h-6 text-emerald-600" />
              Pharmacy Transactions & Stock Movement Audit
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Complete traceable records of customer dispensing receipts and stock level modifications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportSalesCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export Sales CSV</span>
            </button>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-3 mt-6 border-b border-slate-200">
          <button
            onClick={() => setActiveSubTab('sales')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeSubTab === 'sales'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ReceiptText className="w-4 h-4" />
            <span>Sales & Dispensing Receipts ({transactions.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('adjustments')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeSubTab === 'adjustments'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Stock Adjustments Audit Log ({adjustments.length})</span>
          </button>
        </div>
      </div>

      {/* Content depending on sub-tab */}
      {activeSubTab === 'sales' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Customer & Pharmacist</th>
                  <th className="py-3 px-4">Items Dispensed</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <ReceiptText className="w-12 h-12 mx-auto text-slate-300 mb-2 stroke-1" />
                      <p className="font-medium text-slate-600">No transactions recorded yet</p>
                      <p className="text-xs text-slate-400 mt-1">Dispense items from the POS Register to populate records</p>
                    </td>
                  </tr>
                ) : (
                  transactions.map(txn => (
                    <tr key={txn.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                        {txn.transaction_number}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {new Date(txn.created).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 text-xs">{txn.customer_name}</div>
                        <div className="text-[11px] text-slate-400">Dispensed by: {txn.pharmacist_name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {txn.items.reduce((acc: number, i: any) => acc + i.quantity, 0)} units ({txn.items.length} meds)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">
                        {txn.payment_method}
                      </td>
                      <td className="py-3 px-4 font-bold font-mono text-emerald-700">
                        ${txn.total_amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedTxn(txn)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition"
                          title="View Receipt Breakdown"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Medicine & Batch</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Stock Delta</th>
                  <th className="py-3 px-4">New Balance</th>
                  <th className="py-3 px-4">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <History className="w-12 h-12 mx-auto text-slate-300 mb-2 stroke-1" />
                      <p className="font-medium text-slate-600">No stock adjustments logged yet</p>
                    </td>
                  </tr>
                ) : (
                  adjustments.map(adj => (
                    <tr key={adj.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {new Date(adj.created).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 text-xs">{adj.medicine_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">Batch: {adj.batch_number}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          adj.reason === 'Sale' 
                            ? 'bg-blue-50 text-blue-700' 
                            : adj.reason === 'Restock' 
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {adj.reason}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-xs">
                        {adj.change_amount > 0 ? (
                          <span className="text-emerald-600 flex items-center gap-0.5">
                            <ArrowUpRight className="w-3.5 h-3.5" /> +{adj.change_amount}
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-0.5">
                            <ArrowDownRight className="w-3.5 h-3.5" /> {adj.change_amount}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-800 text-xs font-semibold">
                        {adj.new_stock} units
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {adj.pharmacist_name}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Transaction Detail Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <ReceiptText className="w-5 h-5 text-emerald-600" />
                Receipt #{selectedTxn.transaction_number}
              </h3>
              <button onClick={() => setSelectedTxn(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">
                &times;
              </button>
            </div>

            <div className="py-3 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-medium text-slate-800">{new Date(selectedTxn.created).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-medium text-slate-800">{selectedTxn.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Pharmacist:</span>
                <span className="font-medium text-slate-800">{selectedTxn.pharmacist_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment:</span>
                <span className="font-medium text-slate-800">{selectedTxn.payment_method}</span>
              </div>
            </div>

            <div className="border-t border-b border-slate-100 py-3 space-y-2 max-h-48 overflow-y-auto">
              {selectedTxn.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{item.medicine_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {item.quantity} &times; ${item.unit_price.toFixed(2)} (Batch: {item.batch_number})
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-slate-800">${item.subtotal.toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div className="pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">${selectedTxn.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax:</span>
                <span className="font-mono">${selectedTxn.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1.5 border-t border-slate-100">
                <span>Total:</span>
                <span className="font-mono text-emerald-700">${selectedTxn.total_amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => setSelectedTxn(null)}
                className="w-full py-2 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
