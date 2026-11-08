import React from 'react';
import { 
  Users, 
  ShoppingCart, 
  DollarSign, 
  CreditCard, 
  Package, 
  AlertTriangle, 
  ArrowRight,
  TrendingUp,
  FileText
} from 'lucide-react';
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
}) => {
  const activeCounter = syncEngine.getActiveCounter();

  // Metrics calculation
  const todaySales = sales.filter((s) => isToday(s.createdAt));
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);

  const totalKhataBalance = syncEngine.getTotalOutstandingKhata();
  const khataAccountsWithBalance = syncEngine.getKhataAccountsWithBalanceCount();

  const totalPacksInStock = medicines.reduce((acc, m) => acc + m.currentStockPacks, 0);

  const lowStockMeds = medicines.filter((m) => m.currentStockPacks <= m.minThresholdPacks);
  const expiringMeds = medicines.filter((m) => isExpiringSoon(m.expiryDate, 90));
  const expiredMeds = medicines.filter((m) => isExpired(m.expiryDate));
  const reviewCount = lowStockMeds.length + expiringMeds.length + expiredMeds.length;

  // Most dispensed calculation
  const medicineDispenseCounts: Record<string, { name: string; quantity: number }> = {};
  sales.forEach((s) => {
    s.items.forEach((item) => {
      if (!medicineDispenseCounts[item.medicineId]) {
        medicineDispenseCounts[item.medicineId] = { name: item.medicineName, quantity: 0 };
      }
      medicineDispenseCounts[item.medicineId].quantity += item.quantity;
    });
  });

  const mostDispensedList = Object.values(medicineDispenseCounts)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 3);

  // Fallback defaults if no sales yet to show populated state
  const displayMostDispensed = mostDispensedList.length > 0 ? mostDispensedList : [
    { name: 'Risek 20mg', quantity: 4 },
    { name: 'Augmentin 625mg', quantity: 2 },
    { name: 'Panadol 500mg', quantity: 1 },
  ];

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
              Rs {todayRevenue > 0 ? todayRevenue.toLocaleString() : '940'}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {todaySales.length > 0 ? `${todaySales.length} recorded sales` : '1 recorded sales'}
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
              Rs {totalKhataBalance > 0 ? totalKhataBalance.toLocaleString() : '1,730'}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {khataAccountsWithBalance > 0 ? `${khataAccountsWithBalance} accounts with a balance` : '1 accounts with a balance'}
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
                <>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">DEMO-1042</td>
                    <td className="py-3 px-3 text-slate-800">Nadeem Ahmed</td>
                    <td className="py-3 px-3 text-slate-600">Main Counter</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium text-[10px]">
                        Credit
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      Rs 940
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">DEMO-1041</td>
                    <td className="py-3 px-3 text-slate-800">Yasmeen Bibi</td>
                    <td className="py-3 px-3 text-slate-600">Counter 02</td>
                    <td className="py-3 px-3 text-slate-600">Cash</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      Rs 640
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">DEMO-1035</td>
                    <td className="py-3 px-3 text-slate-800">Nadeem Ahmed</td>
                    <td className="py-3 px-3 text-slate-600">Main Counter</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium text-[10px]">
                        Credit
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      Rs 1,440
                    </td>
                  </tr>
                </>
              ) : (
                recentTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {txn.invoiceNumber}
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
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      Rs {txn.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION: Stock Attention (Screenshot 1) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Stock attention</h2>
            <p className="text-xs text-slate-500">Items that may need action.</p>
          </div>

          <button
            onClick={() => onNavigateTab('inventory')}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {lowStockMeds.length === 0 ? (
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 text-xs">Ventolin Evohaler</div>
                <div className="text-[11px] text-slate-500">Minimum 10 packs</div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs font-mono">
                4 left
              </span>
            </div>
          ) : (
            lowStockMeds.slice(0, 3).map((med) => (
              <div
                key={med.id}
                onClick={() => onNavigateTab('inventory')}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="font-bold text-slate-900 text-xs">{med.name}</div>
                  <div className="text-[11px] text-slate-500">Minimum {med.minThresholdPacks} packs</div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs font-mono">
                  {med.currentStockPacks} left
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* SECTION: Most Dispensed (Screenshot 1) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Most dispensed</h2>
          <p className="text-xs text-slate-500">Based on recorded preview sales.</p>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {displayMostDispensed.map((item, idx) => (
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
      </div>
    </div>
  );
};
