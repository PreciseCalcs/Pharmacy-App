import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  Download, 
  FileSpreadsheet, 
  Search, 
  Edit3, 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Heart, 
  Baby, 
  ShoppingBag, 
  Pill, 
  Building2, 
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { MedicineItem } from '../types/pharmacy';
import { formatPKR } from '../utils/pharmacyHelpers';
import { exportCriticalStockToExcel, exportCriticalStockToCSV } from '../services/excelExporter';
import { soundService } from '../services/soundAlerts';

interface CriticalStockViewProps {
  medicines: MedicineItem[];
  onOpenMedicineModal: (med: MedicineItem) => void;
  canEdit: boolean;
}

export const CriticalStockView: React.FC<CriticalStockViewProps> = ({
  medicines,
  onOpenMedicineModal,
  canEdit,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'out_of_stock' | 'severe'>('all');
  const [groupByCategory, setGroupByCategory] = useState(false);

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
          const isOther = m.department === 'personal_care' || 
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
  }, [criticalItems, selectedCategory, selectedDepartment, urgencyFilter, searchTerm]);

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
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Generate and export supplier purchase orders for items below their safety reorder buffer.
              </p>
            </div>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCSV}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs disabled:opacity-50"
              title="Download reorder list as CSV for supplier messaging or distributor ERP"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>

            <button
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
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

          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
              Total Deficit Quantity
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-0.5 block">
              +{totalDeficitPacks} packs
            </span>
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
              Est. Reorder Budget
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-950 font-mono mt-0.5 block">
              Rs {totalEstimatedCost.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

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

        {/* Sub-Filters: Urgency & Departments */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              <span>Urgency:</span>
            </span>
            {[
              { id: 'all', label: 'All Critical' },
              { id: 'out_of_stock', label: `Out of Stock (${outOfStockCount})` },
              { id: 'severe', label: 'Severe (<50% Threshold)' },
            ].map(({ id, label }) => (
              <button
                key={id}
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

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-900 font-mono">{filteredItems.length}</strong> of {totalCriticalCount} critical items
          </div>
        </div>
      </div>

      {/* 4. Table / List of Critical Items */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-2xs">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3 stroke-1" />
          <h3 className="text-base font-bold text-slate-900">No Critical Stock Alerts Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            All items matching your active category and search filter have stock levels safely above their reorder thresholds.
          </p>
        </div>
      ) : groupByCategory && groupedItems ? (
        // Grouped by Category View
        <div className="space-y-4">
          {Array.from(groupedItems.entries()).map(([catName, items]) => {
            const catCost = items.reduce((sum, item) => sum + item.reorderCost, 0);
            const catDeficit = items.reduce((sum, item) => sum + item.deficit, 0);

            return (
              <div key={catName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <h3 className="font-bold text-slate-900 text-sm">{catName}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
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
                        <th className="py-2.5 px-3">Product Description</th>
                        <th className="py-2.5 px-3">Location & Supplier</th>
                        <th className="py-2.5 px-3 text-center">Stock / Buffer</th>
                        <th className="py-2.5 px-3 text-right">Reorder Qty</th>
                        <th className="py-2.5 px-3 text-right">Est. Cost</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((med) => renderTableRow(med, onOpenMedicineModal))}
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
                  <th className="py-3 px-3.5">Product Description</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Location & Supplier</th>
                  <th className="py-3 px-3 text-center">Current / Safety Threshold</th>
                  <th className="py-3 px-3 text-right">Deficit to Order</th>
                  <th className="py-3 px-3 text-right">Est. Budget</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((med) => renderTableRow(med, onOpenMedicineModal, true))}
              </tbody>
            </table>
          </div>
        </div>
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
  },
  onOpenMedicineModal: (med: MedicineItem) => void,
  showCategory: boolean = false
) {
  const isOut = med.isOutOfStock;
  const percent = Math.min(100, Math.max(0, med.percentOfThreshold));
  const barColor = isOut ? 'bg-rose-600' : percent <= 35 ? 'bg-rose-500' : 'bg-amber-500';

  return (
    <tr key={med.id} className="hover:bg-slate-50/70 transition">
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
            <div className="font-bold text-slate-900 text-xs sm:text-sm">
              {med.name}
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
        <span className={`inline-block px-2.5 py-0.5 rounded-md font-mono font-bold text-xs ${
          isOut ? 'bg-rose-600 text-white shadow-2xs' : 'bg-amber-100 text-amber-900'
        }`}>
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

      {/* Actions */}
      <td className="py-3 px-3 text-center">
        <button
          onClick={() => onOpenMedicineModal(med)}
          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1 mx-auto transition"
          title="Open modal to restock received quantity or update batch"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Restock</span>
        </button>
      </td>
    </tr>
  );
}
