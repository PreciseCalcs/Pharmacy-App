import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  SlidersHorizontal, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Package, 
  Calendar, 
  DollarSign, 
  Layers, 
  MapPin, 
  ShoppingCart,
  Edit3,
  RefreshCw,
  Download
} from 'lucide-react';
import { MedicineRecord, MedicineCategory, DosageForm, StockAdjustmentRecord } from '../types/pharmacy';
import { pharmacyService } from '../services/pharmacyService';

interface InventoryViewProps {
  medicines: MedicineRecord[];
  onRefresh: () => void;
  onAddToCart: (medicine: MedicineRecord) => void;
  isLoading: boolean;
}

const CATEGORIES: ('All' | MedicineCategory)[] = [
  'All',
  'Antibiotics',
  'Analgesics & Antipyretics',
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Endocrine & Diabetes',
  'Dermatology',
  'Vitamins & Supplements',
];

export const InventoryView: React.FC<InventoryViewProps> = ({
  medicines,
  onRefresh,
  onAddToCart,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | MedicineCategory>('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'out' | 'in'>('all');
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [adjustingMed, setAdjustingMed] = useState<MedicineRecord | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<StockAdjustmentRecord['reason']>('Restock');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  // New Medicine Form State
  const [formData, setFormData] = useState({
    name: '',
    generic_name: '',
    sku: '',
    barcode: '',
    category: 'Antibiotics' as MedicineCategory,
    dosage_form: 'Tablet' as DosageForm,
    strength: '',
    unit_price: 10,
    cost_price: 6,
    stock_quantity: 50,
    min_threshold: 20,
    expiry_date: '2027-12-31',
    batch_number: `BAT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    location_shelf: 'Aisle 1 - Shelf A',
    is_prescription_required: false,
    notes: '',
  });

  // Filter medicines
  const filteredMedicines = medicines.filter(med => {
    // Search query match
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q || (
      med.name.toLowerCase().includes(q) ||
      med.generic_name.toLowerCase().includes(q) ||
      med.sku.toLowerCase().includes(q) ||
      med.barcode.includes(q) ||
      med.batch_number.toLowerCase().includes(q)
    );

    // Category match
    const matchesCat = selectedCategory === 'All' || med.category === selectedCategory;

    // Stock status match
    let matchesStock = true;
    if (stockStatusFilter === 'low') {
      matchesStock = med.stock_quantity > 0 && med.stock_quantity <= med.min_threshold;
    } else if (stockStatusFilter === 'out') {
      matchesStock = med.stock_quantity === 0;
    } else if (stockStatusFilter === 'in') {
      matchesStock = med.stock_quantity > med.min_threshold;
    }

    return matchesSearch && matchesCat && matchesStock;
  });

  const lowStockCount = medicines.filter(m => m.stock_quantity > 0 && m.stock_quantity <= m.min_threshold).length;
  const outOfStockCount = medicines.filter(m => m.stock_quantity === 0).length;

  const handleStockAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingMed) return;
    setIsSubmittingAdjustment(true);
    try {
      let finalStock = adjustingMed.stock_quantity;
      if (adjustmentReason === 'Restock') {
        finalStock = adjustingMed.stock_quantity + Math.abs(adjustmentAmount);
      } else {
        // Damaged, Expired, Inventory Count Correction
        finalStock = Math.max(0, adjustingMed.stock_quantity - Math.abs(adjustmentAmount));
      }

      await pharmacyService.adjustStock(
        adjustingMed.id,
        finalStock,
        adjustmentReason,
        'Staff Pharmacist'
      );
      setAdjustingMed(null);
      setAdjustmentAmount(0);
      onRefresh();
    } catch (err) {
      console.error('Failed to adjust stock:', err);
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await pharmacyService.createMedicine(formData);
      setIsAddModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to create medicine:', err);
    }
  };

  const exportToJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(medicines, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pharmacy_inventory_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6 text-emerald-600" />
              Medicine Inventory & Stock Control
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Real-time stock monitoring backed by PocketBase offline-first storage and instant POS integration.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={exportToJson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium transition shadow-sm"
              title="Export Inventory as JSON"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Export JSON</span>
            </button>

            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium transition shadow-sm"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm shadow-emerald-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Medicine</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Status Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <button
            onClick={() => setStockStatusFilter('all')}
            className={`p-3 rounded-lg border text-left transition ${
              stockStatusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <div className="text-xs font-medium text-slate-400">Total Formulations</div>
            <div className="text-xl font-bold mt-0.5">{medicines.length}</div>
          </button>

          <button
            onClick={() => setStockStatusFilter('in')}
            className={`p-3 rounded-lg border text-left transition ${
              stockStatusFilter === 'in'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                : 'bg-emerald-50/60 hover:bg-emerald-100/60 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="text-xs font-medium text-emerald-600">Optimal Stock</div>
            <div className="text-xl font-bold mt-0.5">
              {medicines.filter(m => m.stock_quantity > m.min_threshold).length}
            </div>
          </button>

          <button
            onClick={() => setStockStatusFilter('low')}
            className={`p-3 rounded-lg border text-left transition ${
              stockStatusFilter === 'low'
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-amber-900'
            }`}
          >
            <div className="text-xs font-medium text-amber-600 flex items-center justify-between">
              <span>Low Stock Alerts</span>
              {lowStockCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
            </div>
            <div className="text-xl font-bold mt-0.5">{lowStockCount}</div>
          </button>

          <button
            onClick={() => setStockStatusFilter('out')}
            className={`p-3 rounded-lg border text-left transition ${
              stockStatusFilter === 'out'
                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                : 'bg-rose-50 hover:bg-rose-100/80 border-rose-200 text-rose-900'
            }`}
          >
            <div className="text-xs font-medium text-rose-600">Out of Stock</div>
            <div className="text-xl font-bold mt-0.5">{outOfStockCount}</div>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by brand name, generic formulation, barcode (UPC/EAN), or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-slate-50/50 focus:bg-white transition"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-slate-400 font-medium flex items-center gap-1 pr-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Category:
          </span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-all font-medium ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Medicine Inventory Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Medicine Details</th>
                <th className="py-3 px-4">Category / Form</th>
                <th className="py-3 px-4">Batch / Expiry</th>
                <th className="py-3 px-4">Pricing</th>
                <th className="py-3 px-4">Stock Level</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredMedicines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto text-slate-300 mb-2 stroke-1" />
                    <p className="font-medium text-slate-600">No medicines matched your criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search terms or filter selection</p>
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((med) => {
                  const isLow = med.stock_quantity > 0 && med.stock_quantity <= med.min_threshold;
                  const isOut = med.stock_quantity === 0;
                  const percent = Math.min(100, Math.round((med.stock_quantity / (med.min_threshold * 2.5)) * 100));

                  return (
                    <tr 
                      key={med.id} 
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Name & Generic */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          {med.name}
                          {med.is_prescription_required && (
                            <span 
                              title="Prescription Required (Rx)" 
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200"
                            >
                              Rx
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {med.generic_name} &bull; <span className="font-semibold text-slate-600">{med.strength}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
                          <span>SKU: {med.sku}</span>
                          <span>|</span>
                          <span className="font-mono">{med.barcode}</span>
                        </div>
                      </td>

                      {/* Category & Dosage Form */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 mb-1">
                          {med.category}
                        </span>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>{med.dosage_form}</span>
                        </div>
                        {med.location_shelf && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{med.location_shelf}</span>
                          </div>
                        )}
                      </td>

                      {/* Batch & Expiry */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs font-medium text-slate-700">
                          {med.batch_number}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Exp: {med.expiry_date}</span>
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{med.unit_price.toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Cost: ${med.cost_price.toFixed(2)}
                        </div>
                      </td>

                      {/* Stock Level */}
                      <td className="py-3.5 px-4 min-w-[170px]">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-slate-800 text-sm">{med.stock_quantity} units</span>
                          {isOut ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              <XCircle className="w-3 h-3" /> Out
                            </span>
                          ) : isLow ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="w-3 h-3" /> Low
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3" /> In Stock
                            </span>
                          )}
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              isOut ? 'bg-rose-500 w-0' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Min safety threshold: {med.min_threshold} units
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setAdjustingMed(med);
                              setAdjustmentAmount(10);
                              setAdjustmentReason('Restock');
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                            title="Adjust or Restock Stock"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => onAddToCart(med)}
                            disabled={med.stock_quantity === 0}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                              med.stock_quantity === 0
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                            title="Dispense this medicine"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Dispense</span>
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

      {/* Stock Adjustment Modal */}
      {adjustingMed && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-600" />
                Adjust Stock Level
              </h3>
              <button 
                onClick={() => setAdjustingMed(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleStockAdjustSubmit} className="space-y-4 mt-4">
              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Target Medicine</span>
                <p className="font-bold text-slate-800 text-base">{adjustingMed.name}</p>
                <p className="text-xs text-slate-500 font-mono">
                  Batch: {adjustingMed.batch_number} &bull; Current Stock: <strong className="text-slate-900">{adjustingMed.stock_quantity}</strong> units
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adjustment Reason
                </label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value as StockAdjustmentRecord['reason'])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Restock">Restock (Received shipment)</option>
                  <option value="Inventory Count Correction">Physical Inventory Count Correction</option>
                  <option value="Damaged">Damaged / Broken in store</option>
                  <option value="Expired">Expired formulation write-off</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {adjustmentReason === 'Restock' ? 'Units to Add (+)' : 'Units to Deduct (-)'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={adjustmentAmount || ''}
                  onChange={(e) => setAdjustmentAmount(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600">
                <span>Calculated New Stock: </span>
                <strong className="text-emerald-700 text-sm font-bold">
                  {adjustmentReason === 'Restock'
                    ? adjustingMed.stock_quantity + adjustmentAmount
                    : Math.max(0, adjustingMed.stock_quantity - adjustmentAmount)}
                </strong> units
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingMed(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjustment}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm shadow-emerald-600/30"
                >
                  {isSubmittingAdjustment ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Medicine Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Add Medicine to PocketBase Inventory
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateMedicine} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Augmentin 625 Duo"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Generic Chemical Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Amoxicillin + Clavulanate"
                    value={formData.generic_name}
                    onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as MedicineCategory })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {CATEGORIES.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dosage Form *
                  </label>
                  <select
                    value={formData.dosage_form}
                    onChange={(e) => setFormData({ ...formData, dosage_form: e.target.value as DosageForm })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Ointment', 'Drops', 'Inhaler'].map(form => (
                      <option key={form} value={form}>{form}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Strength / Dose *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 500mg, 10ml"
                    value={formData.strength}
                    onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AUG-625-TAB"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Barcode (EAN/UPC)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8901234567899"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.batch_number}
                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.unit_price}
                    onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cost Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Stock *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Safety Min *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.min_threshold}
                    onChange={(e) => setFormData({ ...formData, min_threshold: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shelf Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aisle 2 - Shelf B"
                    value={formData.location_shelf}
                    onChange={(e) => setFormData({ ...formData, location_shelf: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rx_checkbox"
                  checked={formData.is_prescription_required}
                  onChange={(e) => setFormData({ ...formData, is_prescription_required: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <label htmlFor="rx_checkbox" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Requires Doctor's Prescription (Rx Only)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm shadow-emerald-600/30"
                >
                  Save to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
