import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Download,
  FileSpreadsheet,
  Search,
  Edit3,
  CheckCircle2,
  Layers,
  Heart,
  Baby,
  ShoppingBag,
  Pill,
  Filter,
  CheckSquare,
  Square,
  Truck,
  RotateCcw,
  Printer,
  ClipboardList,
  Plus,
  Minus,
  Trash2,
  Flame,
} from 'lucide-react';
import { MedicineItem, ShortBookEntry } from '../types/pharmacy';
import { exportCriticalStockToExcel, exportCriticalStockToCSV } from '../services/excelExporter';
import { generatePurchaseOrderPDF, generateShortBookPDF } from '../services/pdfGenerator';
import { soundService } from '../services/soundAlerts';
import { syncEngine } from '../services/syncEngine';

interface CriticalStockViewProps {
  medicines: MedicineItem[];
  onUpdateMedicine: (id: string, updates: Partial<MedicineItem>) => Promise<MedicineItem>;
  onOpenMedicineModal: (med: MedicineItem) => void;
  canEdit: boolean;
}

export const CriticalStockView: React.FC<CriticalStockViewProps> = ({
  medicines,
  onUpdateMedicine,
  onOpenMedicineModal,
  canEdit,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'threshold' | 'short_book'>('threshold');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDepartment] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'out_of_stock' | 'severe'>('all');
  const [reorderStatusFilter, setReorderStatusFilter] = useState<'all' | 'needed' | 'ordered'>('all');
  const [groupByCategory, setGroupByCategory] = useState(false);

  // Counter Short Book (Want List) state
  const [shortBookItems, setShortBookItems] = useState<ShortBookEntry[]>(() =>
    syncEngine.getShortBook()
  );
  const [sbName, setSbName] = useState('');
  const [sbStrength, setSbStrength] = useState('');
  const [sbSupplier, setSbSupplier] = useState('');
  const [sbPacks, setSbPacks] = useState('5');
  const [sbUrgent, setSbUrgent] = useState(false);

  const refreshShortBook = () => {
    setShortBookItems(syncEngine.getShortBook());
  };

  const handleAddShortBookItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbName.trim()) return;
    syncEngine.addToShortBook({
      itemName: sbName.trim(),
      strengthOrPack: sbStrength.trim() || undefined,
      supplierName: sbSupplier.trim() || undefined,
      requestedPacks: Math.max(1, parseInt(sbPacks, 10) || 5),
      priority: sbUrgent ? 'urgent' : 'normal',
      addedBy: 'Counter Staff',
    });
    soundService.cashRegister();
    setSbName('');
    setSbStrength('');
    setSbSupplier('');
    setSbPacks('5');
    setSbUrgent(false);
    refreshShortBook();
  };

  // Filter medicines below their reorder threshold
  const criticalItems = useMemo(() => {
    return medicines
      .filter((m) => m.currentStockPacks <= (m.minThresholdPacks || 5))
      .map((m) => {
        const threshold = m.minThresholdPacks || 5;
        const current = m.currentStockPacks;
        const deficit = Math.max(0, threshold - current);
        const percentOfThreshold = Math.round((current / threshold) * 100);
        const isOutOfStock = current === 0;
        const reorderCost = deficit * (m.unitCostPrice || 0);
        const isOrdered = m.reorderStatus === 'ordered';

        return {
          ...m,
          threshold,
          current,
          deficit,
          percentOfThreshold,
          isOutOfStock,
          reorderCost,
          isOrdered,
        };
      })
      .sort((a, b) => {
        // Out of stock first, then lowest percentage of threshold
        if (a.isOutOfStock && !b.isOutOfStock) return -1;
        if (!a.isOutOfStock && b.isOutOfStock) return 1;
        return a.percentOfThreshold - b.percentOfThreshold;
      });
  }, [medicines]);

  // Unique categories among critical items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    criticalItems.forEach((m) => {
      if (m.category) cats.add(m.category);
    });
    return ['All', ...Array.from(cats).sort()];
  }, [criticalItems]);

  // Overall KPI metrics
  const totalCriticalCount = criticalItems.length;
  const outOfStockCount = useMemo(() => criticalItems.filter((m) => m.isOutOfStock).length, [criticalItems]);
  const orderedCount = useMemo(() => criticalItems.filter((m) => m.isOrdered).length, [criticalItems]);
  const pendingOrderCount = totalCriticalCount - orderedCount;
  const totalDeficitPacks = useMemo(() => criticalItems.reduce((acc, m) => acc + m.deficit, 0), [criticalItems]);
  const totalEstimatedCost = useMemo(() => criticalItems.reduce((acc, m) => acc + m.reorderCost, 0), [criticalItems]);

  // Filtered critical items based on active controls
  const filteredItems = useMemo(() => {
    return criticalItems.filter((m) => {
      // Category filter
      if (selectedCategory !== 'All' && m.category !== selectedCategory) {
        return false;
      }

      // Department filter
      if (selectedDepartment !== 'all') {
        if (selectedDepartment === 'pharmacy') {
          const isOther =
            m.department === 'personal_care' ||
            m.department === 'mother_baby' ||
            m.department === 'general_store' ||
            m.department === 'surgical' ||
            m.category === 'Personal Care & Sexual Wellness' ||
            m.category === 'Baby & Mother Care' ||
            m.category === 'General Store & FMCG';
          if (isOther) return false;
        } else if (selectedDepartment === 'personal_care') {
          const match = m.department === 'personal_care' || m.category === 'Personal Care & Sexual Wellness';
          if (!match) return false;
        } else if (selectedDepartment === 'mother_baby') {
          const match = m.department === 'mother_baby' || m.category === 'Baby & Mother Care';
          if (!match) return false;
        } else if (selectedDepartment === 'general_store') {
          const match = m.department === 'general_store' || m.category === 'General Store & FMCG';
          if (!match) return false;
        }
      }

      // Urgency filter
      if (urgencyFilter === 'out_of_stock' && !m.isOutOfStock) return false;
      if (urgencyFilter === 'severe' && m.percentOfThreshold > 50) return false;

      // Reorder status filter
      if (reorderStatusFilter === 'needed' && m.isOrdered) return false;
      if (reorderStatusFilter === 'ordered' && !m.isOrdered) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          (m.supplier && m.supplier.toLowerCase().includes(q)) ||
          (m.shelfLocation && m.shelfLocation.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [criticalItems, selectedCategory, selectedDepartment, urgencyFilter, reorderStatusFilter, searchTerm]);

  // Toggle single item reorder status
  const handleToggleOrdered = async (med: MedicineItem) => {
    const nextOrdered = med.reorderStatus !== 'ordered';
    soundService.click();
    await onUpdateMedicine(med.id, {
      reorderStatus: nextOrdered ? 'ordered' : 'needed',
      orderedAt: nextOrdered ? new Date().toISOString() : undefined,
    });
  };

  // Toggle all currently filtered items
  const allFilteredOrdered = useMemo(
    () => filteredItems.length > 0 && filteredItems.every((m) => m.isOrdered),
    [filteredItems]
  );

  const handleToggleAllFiltered = async () => {
    if (filteredItems.length === 0) return;
    soundService.click();
    const targetStatus: 'needed' | 'ordered' = allFilteredOrdered ? 'needed' : 'ordered';
    const nowIso = targetStatus === 'ordered' ? new Date().toISOString() : undefined;

    for (const item of filteredItems) {
      if ((item.reorderStatus === 'ordered') !== (targetStatus === 'ordered')) {
        await onUpdateMedicine(item.id, {
          reorderStatus: targetStatus,
          orderedAt: nowIso,
        });
      }
    }
  };

  // Grouped items by category if grouping is active
  const groupedItems = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, typeof filteredItems>();
    filteredItems.forEach((item) => {
      const cat = item.category || 'General';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    });
    return map;
  }, [filteredItems, groupByCategory]);

  const handleExportExcel = () => {
    soundService.click();
    exportCriticalStockToExcel(filteredItems, selectedCategory);
  };

  const handleExportCSV = () => {
    soundService.click();
    exportCriticalStockToCSV(filteredItems, selectedCategory);
  };

  return (
    <div className="space-y-5">
      {/* 1. Header Card with Title and Export Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-600/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Critical Stock Alerts & Reorder List
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                  {totalCriticalCount} Below Threshold
                </span>
                {outOfStockCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                    {outOfStockCount} Out of Stock
                  </span>
                )}
                {orderedCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" />
                    <span>{orderedCount} Ordered</span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Track supplier purchase orders, mark requested items as ordered, and export category reorder sheets.
              </p>
            </div>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && filteredItems.length > 0 && (
              <button
                type="button"
                onClick={handleToggleAllFiltered}
                className={`px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition shadow-2xs ${
                  allFilteredOrdered
                    ? 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700'
                    : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                }`}
                title={
                  allFilteredOrdered
                    ? 'Reset ordered status on all shown items'
                    : 'Mark all shown items as Ordered from supplier'
                }
              >
                {allFilteredOrdered ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Ordered ({filteredItems.length})</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Mark All Shown Ordered</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundService.click();
                generatePurchaseOrderPDF(filteredItems, selectedCategory);
              }}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
              title="Generate printable A4 Supplier Purchase Order (Demand List) PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Purchase Order PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs disabled:opacity-50"
              title="Download reorder list as CSV for supplier messaging or distributor ERP"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredItems.length === 0}
              className="px-4 py-2 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-emerald-950/20 disabled:opacity-50"
              title="Download reorder workbook (.xlsx) organized by category"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 2. KPI Summary Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
              Items Below Buffer
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-900 font-mono mt-0.5 block">
              {totalCriticalCount}
            </span>
          </div>

          <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
              Completely Out (0 Stock)
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-800 font-mono mt-0.5 block">
              {outOfStockCount}
            </span>
          </div>

          <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-300">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
              Counter Short Book
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl sm:text-2xl font-black text-amber-900 font-mono">
                {shortBookItems.length}
              </span>
              <span className="text-xs font-bold text-amber-800">
                patient wants
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
              Total Deficit Quantity
            </span>
            <span className="text-xl sm:text-2xl font-black text-blue-950 font-mono mt-0.5 block">
              +{totalDeficitPacks} packs
            </span>
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
              Est. Reorder Budget
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-950 font-mono mt-0.5 block">
              Rs {totalEstimatedCost.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Sub-Tab Switcher: Auto Low-Stock Threshold vs. Counter Short Book (Want List) */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('threshold');
              soundService.click();
            }}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'threshold'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Auto Low-Stock Threshold ({totalCriticalCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('short_book');
              refreshShortBook();
              soundService.click();
            }}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'short_book'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Counter Short Book / Want List ({shortBookItems.length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'short_book' ? (
        <div className="space-y-4">
          {/* Quick-Add Bar for Counter Short Book */}
          <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-600" />
                  <span>Counter "Short Book" / Order Booker Demand Register</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Medicines requested by patients at the POS counter that were out of stock or not yet in your catalog. Ready for distributor order bookers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {shortBookItems.some((i) => i.status === 'ordered') && (
                  <button
                    type="button"
                    onClick={() => {
                      syncEngine.clearOrderedShortBookEntries();
                      refreshShortBook();
                      soundService.click();
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Ordered</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    soundService.click();
                    generateShortBookPDF(shortBookItems);
                  }}
                  disabled={shortBookItems.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Short Book PDF</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={handleAddShortBookItem}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-slate-100 text-xs"
            >
              <input
                type="text"
                value={sbName}
                onChange={(e) => setSbName(e.target.value)}
                placeholder="Medicine / Brand requested by patient (e.g. Risek 40mg, Glucophage XR)..."
                className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
              <input
                type="text"
                value={sbStrength}
                onChange={(e) => setSbStrength(e.target.value)}
                placeholder="Strength / Form (e.g. 40mg Cap)"
                className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="text"
                value={sbSupplier}
                onChange={(e) => setSbSupplier(e.target.value)}
                placeholder="Distributor / Company (optional)"
                className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="sm:col-span-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={sbPacks}
                  onChange={(e) => setSbPacks(e.target.value)}
                  className="w-20 px-2.5 py-2 rounded-xl border border-slate-300 font-mono font-bold text-center"
                  title="Packs to order"
                />
                <label className="flex items-center gap-1 text-xs font-bold text-rose-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sbUrgent}
                    onChange={(e) => setSbUrgent(e.target.checked)}
                    className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Urgent</span>
                </label>
              </div>
              <button
                type="submit"
                className="sm:col-span-2 py-2 px-3 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add to Short Book</span>
              </button>
            </form>
          </div>

          {/* Short Book Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            {shortBookItems.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <ClipboardList className="w-10 h-10 mx-auto text-amber-400 mb-2 stroke-1" />
                <p className="text-sm font-bold text-slate-800">Counter Short Book is Empty</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  When a patient asks for a medicine not in stock, click "+ Add to Short Book" from the POS search bar or add it above.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                      <th className="py-3 px-3 w-10 text-center">Ordered</th>
                      <th className="py-3 px-3.5">Requested Medicine / Item</th>
                      <th className="py-3 px-3">Distributor / Supplier</th>
                      <th className="py-3 px-3 text-center">Patient Demand</th>
                      <th className="py-3 px-3 text-center">Packs to Order</th>
                      <th className="py-3 px-3">Logged By</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shortBookItems.map((entry) => {
                      const isOrd = entry.status === 'ordered';
                      return (
                        <tr
                          key={entry.id}
                          className={`transition ${
                            isOrd ? 'bg-emerald-50/30' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isOrd}
                              onChange={() => {
                                syncEngine.updateShortBookEntry(entry.id, {
                                  status: isOrd ? 'pending' : 'ordered',
                                  orderedAt: !isOrd ? new Date().toISOString() : undefined,
                                });
                                refreshShortBook();
                                soundService.click();
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer accent-emerald-600"
                            />
                          </td>

                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-bold text-xs sm:text-sm ${
                                  isOrd ? 'line-through text-slate-500' : 'text-slate-900'
                                }`}
                              >
                                {entry.itemName}
                              </span>
                              {entry.priority === 'urgent' && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase flex items-center gap-0.5">
                                  <Flame className="w-3 h-3" />
                                  <span>Urgent</span>
                                </span>
                              )}
                              {isOrd && (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                                  Ordered
                                </span>
                              )}
                            </div>
                            {entry.strengthOrPack && (
                              <div className="text-[11px] text-slate-500 font-mono">
                                {entry.strengthOrPack}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-slate-600">
                            {entry.supplierName || 'Any Distributor / Order Booker'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono font-bold text-xs">
                                Asked {entry.requestCount}x
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  syncEngine.updateShortBookEntry(entry.id, {
                                    requestCount: (entry.requestCount || 1) + 1,
                                    priority:
                                      (entry.requestCount || 1) + 1 >= 3 ? 'urgent' : entry.priority,
                                  });
                                  refreshShortBook();
                                  soundService.click();
                                }}
                                className="px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-50 text-amber-900 font-bold text-[10px] cursor-pointer"
                                title="Another patient asked for this item (+1)"
                              >
                                +1 Ask
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5 font-mono">
                              <button
                                type="button"
                                onClick={() => {
                                  syncEngine.updateShortBookEntry(entry.id, {
                                    requestedPacks: Math.max(1, entry.requestedPacks - 1),
                                  });
                                  refreshShortBook();
                                  soundService.click();
                                }}
                                className="p-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-bold text-slate-900 w-12 text-center">
                                {entry.requestedPacks} pk
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  syncEngine.updateShortBookEntry(entry.id, {
                                    requestedPacks: entry.requestedPacks + 1,
                                  });
                                  refreshShortBook();
                                  soundService.click();
                                }}
                                className="p-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-[11px] text-slate-500">
                            <div className="font-semibold text-slate-700">{entry.addedBy}</div>
                            <div>{new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  syncEngine.updateShortBookEntry(entry.id, {
                                    status: isOrd ? 'pending' : 'ordered',
                                    orderedAt: !isOrd ? new Date().toISOString() : undefined,
                                  });
                                  refreshShortBook();
                                  soundService.click();
                                }}
                                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                                  isOrd
                                    ? 'bg-emerald-600 text-white'
                                    : 'border border-slate-300 hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isOrd ? 'Ordered' : 'Mark Ordered'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  syncEngine.deleteShortBookEntry(entry.id);
                                  refreshShortBook();
                                  soundService.click();
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Remove from Short Book"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>

      {/* 3. Filter Bar & Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product, formula, supplier, shelf location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* Group by category toggle & Category Selector */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => {
                setGroupByCategory(!groupByCategory);
                soundService.click();
              }}
              className={`px-3 py-2 rounded-xl border font-semibold flex items-center gap-1.5 transition ${
                groupByCategory
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Group by Category</span>
            </button>

            {/* Category Filter Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sub-Filters: Urgency & Reorder Status */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Urgency Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Urgency:</span>
              </span>
              {[
                { id: 'all', label: 'All Critical' },
                { id: 'out_of_stock', label: `Out of Stock (${outOfStockCount})` },
                { id: 'severe', label: 'Severe (<50%)' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setUrgencyFilter(id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    urgencyFilter === id
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="hidden sm:inline-block text-slate-300">|</span>

            {/* Reorder Status Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Truck className="w-3 h-3" />
                <span>Order Status:</span>
              </span>
              {[
                { id: 'all', label: 'All' },
                { id: 'needed', label: `Needs Order (${pendingOrderCount})` },
                { id: 'ordered', label: `Ordered (${orderedCount})` },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReorderStatusFilter(id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    reorderStatusFilter === id
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-900 font-mono">{filteredItems.length}</strong> of {totalCriticalCount} critical items
          </div>
        </div>
      </div>

      {/* 4. Table / List of Critical Items */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-2xs">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3 stroke-1" />
          <h3 className="text-base font-bold text-slate-900">No Matching Critical Stock Items</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            No items match your active category, order status, or search filter.
          </p>
        </div>
      ) : groupByCategory && groupedItems ? (
        // Grouped by Category View
        <div className="space-y-4">
          {Array.from(groupedItems.entries()).map(([catName, items]) => {
            const catCost = items.reduce((sum, item) => sum + item.reorderCost, 0);
            const catDeficit = items.reduce((sum, item) => sum + item.deficit, 0);
            const catOrdered = items.filter((item) => item.isOrdered).length;

            return (
              <div key={catName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <h3 className="font-bold text-slate-900 text-sm">{catName}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                    {catOrdered > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        {catOrdered} ordered
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 font-medium">
                      Order: <strong className="text-rose-700 font-mono">+{catDeficit} packs</strong>
                    </span>
                    <span className="text-slate-500 font-medium">
                      Budget: <strong className="text-slate-900 font-mono">Rs {catCost.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                        <th className="py-2.5 px-3 w-10 text-center">Ordered</th>
                        <th className="py-2.5 px-3">Product Description</th>
                        <th className="py-2.5 px-3">Location & Supplier</th>
                        <th className="py-2.5 px-3 text-center">Stock / Buffer</th>
                        <th className="py-2.5 px-3 text-right">Reorder Qty</th>
                        <th className="py-2.5 px-3 text-right">Est. Cost</th>
                        <th className="py-2.5 px-3 text-center">Reorder Status & Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((med) =>
                        renderTableRow(med, onOpenMedicineModal, handleToggleOrdered, false)
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Flat Table View
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredOrdered}
                      onChange={handleToggleAllFiltered}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                      title="Toggle ordered status for all visible items"
                    />
                  </th>
                  <th className="py-3 px-3.5">Product Description</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Location & Supplier</th>
                  <th className="py-3 px-3 text-center">Current / Safety Threshold</th>
                  <th className="py-3 px-3 text-right">Deficit to Order</th>
                  <th className="py-3 px-3 text-right">Est. Budget</th>
                  <th className="py-3 px-3 text-center">Reorder Status & Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((med) =>
                  renderTableRow(med, onOpenMedicineModal, handleToggleOrdered, true)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

function renderTableRow(
  med: MedicineItem & {
    threshold: number;
    current: number;
    deficit: number;
    percentOfThreshold: number;
    isOutOfStock: boolean;
    reorderCost: number;
    isOrdered: boolean;
  },
  onOpenMedicineModal: (med: MedicineItem) => void,
  onToggleOrdered: (med: MedicineItem) => void,
  showCategory: boolean = false
) {
  const isOut = med.isOutOfStock;
  const isOrdered = med.isOrdered;
  const percent = Math.min(100, Math.max(0, med.percentOfThreshold));
  const barColor = isOut ? 'bg-rose-600' : percent <= 35 ? 'bg-rose-500' : 'bg-amber-500';

  const formattedOrderDate = med.orderedAt
    ? new Date(med.orderedAt).toLocaleDateString('en-PK', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <tr
      key={med.id}
      className={`transition ${
        isOrdered ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-slate-50/70'
      }`}
    >
      {/* Checkbox Column */}
      <td className="py-3 px-3 text-center">
        <input
          type="checkbox"
          checked={isOrdered}
          onChange={() => onToggleOrdered(med)}
          aria-label={`Mark ${med.name} as ordered`}
          className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
        />
      </td>

      {/* Product Description */}
      <td className="py-3 px-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center">
            {med.imageUrl ? (
              <img src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-slate-400">
                {med.category === 'Personal Care & Sexual Wellness' || med.department === 'personal_care' ? (
                  <Heart className="w-4 h-4 text-rose-500" />
                ) : med.category === 'Baby & Mother Care' ? (
                  <Baby className="w-4 h-4 text-amber-500" />
                ) : med.category === 'General Store & FMCG' ? (
                  <ShoppingBag className="w-4 h-4 text-blue-500" />
                ) : (
                  <Pill className="w-4 h-4 text-emerald-600" />
                )}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`font-bold text-xs sm:text-sm ${
                  isOrdered ? 'text-slate-700 line-through decoration-emerald-500/60' : 'text-slate-900'
                }`}
              >
                {med.name}
              </span>
              {isOrdered && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                  Ordered{formattedOrderDate ? ` · ${formattedOrderDate}` : ''}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {med.genericName} &bull; {med.strength} ({med.dosageForm})
            </div>
          </div>
        </div>
      </td>

      {/* Optional Category */}
      {showCategory && (
        <td className="py-3 px-3">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
            {med.category}
          </span>
        </td>
      )}

      {/* Shelf Location & Supplier */}
      <td className="py-3 px-3">
        <div className="text-slate-800 font-medium text-xs">
          📍 {med.shelfLocation || 'Main Counter'}
        </div>
        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
          🏢 {med.supplier || 'Standard Distributor'}
        </div>
      </td>

      {/* Current Stock vs Safety Threshold */}
      <td className="py-3 px-3">
        <div className="w-40 mx-auto space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className={isOut ? 'text-rose-600 font-bold' : 'text-slate-900 font-semibold'}>
              {med.currentStockPacks} packs {med.currentStockLoose ? `+${med.currentStockLoose}` : ''}
            </span>
            <span className="text-slate-400 font-mono text-[10px]">
              Min: {med.threshold}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </td>

      {/* Deficit to Order */}
      <td className="py-3 px-3 text-right">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-md font-mono font-bold text-xs ${
            isOrdered
              ? 'bg-emerald-100 text-emerald-800'
              : isOut
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-amber-100 text-amber-900'
          }`}
        >
          +{med.deficit} packs
        </span>
      </td>

      {/* Est. Budget Cost */}
      <td className="py-3 px-3 text-right">
        <div className="font-mono font-bold text-slate-900 text-xs">
          Rs {med.reorderCost.toLocaleString()}
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          @ Rs {med.unitCostPrice}/pk
        </div>
      </td>

      {/* Reorder Status Toggle & Restock Action */}
      <td className="py-3 px-3">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleOrdered(med)}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition whitespace-nowrap ${
              isOrdered
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
            }`}
            title={
              isOrdered
                ? 'Item marked as ordered from supplier. Click to revert to Needs Order.'
                : 'Mark this item as Ordered from supplier'
            }
          >
            {isOrdered ? (
              <>
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Ordered</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Mark as Ordered</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenMedicineModal(med)}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1 transition"
            title="Open modal to restock received quantity or update batch"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Restock</span>
          </button>
        </div>
      </td>
    </tr>
  );
}
