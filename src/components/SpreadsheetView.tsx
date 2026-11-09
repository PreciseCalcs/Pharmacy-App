import React, { useState, useMemo, useRef } from 'react';
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Printer, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  Check, 
  Camera, 
  Filter, 
  RefreshCw, 
  Tag,
  Package,
  Pill,
  Heart,
  Baby,
  ShoppingBag,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { DosageForm, MedicineCategory, MedicineItem } from '../types/pharmacy';
import { formatPKR, getPieceRetailPrice, isExpired, isExpiringSoon } from '../utils/pharmacyHelpers';
import { formatDate } from '../utils/dates';
import { 
  exportInventoryToExcel, 
  exportExpiryAuditToExcel, 
  downloadMedicineImportTemplate, 
  parseMedicineExcelFile 
} from '../services/excelExporter';
import { soundService } from '../services/soundAlerts';
import { syncEngine } from '../services/syncEngine';

interface SpreadsheetViewProps {
  medicines: MedicineItem[];
  onUpdateMedicine: (id: string, updates: Partial<MedicineItem>) => Promise<MedicineItem>;
  onDeleteMedicine: (id: string) => Promise<boolean>;
  onOpenMedicineModal: (med?: MedicineItem) => void;
  onOpenScanner: () => void;
  onOpenPrintLabel: (med: MedicineItem) => void;
  canEdit: boolean;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  medicines,
  onUpdateMedicine,
  onDeleteMedicine,
  onOpenMedicineModal,
  onOpenScanner,
  onOpenPrintLabel,
  canEdit,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDosageForm, setSelectedDosageForm] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'expiring' | 'expired'>('all');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Department counts
  const deptCounts = useMemo(() => {
    return {
      all: medicines.length,
      pharmacy: medicines.filter((m) => !m.department || m.department === 'pharmacy').length,
      personal_care: medicines.filter((m) => m.department === 'personal_care' || m.category === 'Personal Care & Sexual Wellness' || m.category === 'Feminine Hygiene & Care' || m.category === 'Personal Hygiene & Grooming').length,
      mother_baby: medicines.filter((m) => m.department === 'mother_baby' || m.category === 'Baby & Mother Care').length,
      general_store: medicines.filter((m) => m.department === 'general_store' || m.category === 'General Store & FMCG').length,
      surgical: medicines.filter((m) => m.department === 'surgical' || m.category === 'Medical Devices & Surgical').length,
    };
  }, [medicines]);

  // Filtered dataset
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      // 0. Department filter
      if (selectedDepartment !== 'all') {
        if (selectedDepartment === 'personal_care') {
          const match = m.department === 'personal_care' || 
            m.category === 'Personal Care & Sexual Wellness' || 
            m.category === 'Feminine Hygiene & Care' || 
            m.category === 'Personal Hygiene & Grooming';
          if (!match) return false;
        } else if (selectedDepartment === 'mother_baby') {
          const match = m.department === 'mother_baby' || m.category === 'Baby & Mother Care';
          if (!match) return false;
        } else if (selectedDepartment === 'general_store') {
          const match = m.department === 'general_store' || m.category === 'General Store & FMCG';
          if (!match) return false;
        } else if (selectedDepartment === 'surgical') {
          const match = m.department === 'surgical' || m.category === 'Medical Devices & Surgical';
          if (!match) return false;
        } else if (selectedDepartment === 'pharmacy') {
          const isOther = m.department === 'personal_care' || 
            m.department === 'mother_baby' || 
            m.department === 'general_store' || 
            m.department === 'surgical' ||
            m.category === 'Personal Care & Sexual Wellness' ||
            m.category === 'Baby & Mother Care' ||
            m.category === 'General Store & FMCG' ||
            m.category === 'Medical Devices & Surgical';
          if (isOther) return false;
        }
      }

      // 1. Search filter
      const q = searchTerm.toLowerCase().trim();
      if (q) {
        const matches =
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.barcode.includes(q) ||
          m.sku.toLowerCase().includes(q) ||
          m.shelfLocation.toLowerCase().includes(q) ||
          m.batchNumber.toLowerCase().includes(q) ||
          (m.category && m.category.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Category
      if (selectedCategory !== 'All' && m.category !== selectedCategory) return false;

      // 3. Dosage Form
      if (selectedDosageForm !== 'All' && m.dosageForm !== selectedDosageForm) return false;

      // 4. Stock alert state
      if (stockFilter === 'low' && m.currentStockPacks > m.minThresholdPacks) return false;
      if (stockFilter === 'expiring' && !isExpiringSoon(m.expiryDate, 90)) return false;
      if (stockFilter === 'expired' && !isExpired(m.expiryDate)) return false;

      return true;
    });
  }, [medicines, searchTerm, selectedDepartment, selectedCategory, selectedDosageForm, stockFilter]);

  // Inline cell edit handlers
  const handleStartEdit = (id: string, field: string, currentValue: any) => {
    if (!canEdit) return;
    setEditingCell({ id, field });
    setTempValue(String(currentValue ?? ''));
  };

  const handleSaveEdit = async (id: string, field: string) => {
    if (!editingCell) return;
    const med = medicines.find((m) => m.id === id);
    if (!med) return;

    let parsedVal: any = tempValue;
    if (['currentStockPacks', 'currentStockLoose', 'minThresholdPacks', 'unitsPerPack'].includes(field)) {
      parsedVal = Math.max(0, parseInt(tempValue) || 0);
    } else if (['unitRetailPrice', 'unitCostPrice', 'looseRetailPrice', 'looseCostPrice'].includes(field)) {
      parsedVal = Math.max(0, parseFloat(tempValue) || 0);
    }

    try {
      await onUpdateMedicine(id, { [field]: parsedVal });
      soundService.click();
    } catch {
      soundService.errorTone();
    } finally {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id, field);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Import handler
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const items = await parseMedicineExcelFile(file);
      const { added, updated } = await syncEngine.bulkUpsertMedicines(items);
      soundService.cashRegister();
      alert(
        `Import complete: ${added} new items added, ${updated} existing items updated.`
      );
    } catch (err: any) {
      soundService.errorTone();
      alert(`Failed to import file: ${err?.message || 'Invalid Excel format'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            <span>Interactive Medicine Stock Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Click any table cell to edit stock, prices, or batch in real-time. Changes sync automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scanner Button */}
          <button
            onClick={onOpenScanner}
            className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <Camera className="w-4 h-4 text-emerald-600" />
            <span>Scan Camera</span>
          </button>

          {/* Export Menu */}
          <button
            onClick={() => exportInventoryToExcel(medicines)}
            className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
            title="Download full inventory workbook (.xlsx)"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => exportExpiryAuditToExcel(medicines)}
            className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs flex items-center gap-1.5 transition"
            title="Export items nearing expiry or expired"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Expiry Audit</span>
          </button>

          {/* Import Button */}
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                title="Import Excel inventory sheet"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>{isImporting ? 'Importing...' : 'Import'}</span>
              </button>
            </>
          )}

          {/* Add New Product / Medicine */}
          {canEdit && (
            <button
              onClick={() => onOpenMedicineModal()}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/20 transition"
              title="Register new medicine, personal care, or general store item (Ctrl+N)"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-emerald-900/60 text-[10px] text-emerald-200 font-mono">
                Ctrl+N
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Department Tabs (Medicines, Personal Care / Condoms, Mother & Baby, General Store, Surgical) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', label: 'All Stock', count: deptCounts.all, icon: Package },
          { id: 'pharmacy', label: 'Medicines', count: deptCounts.pharmacy, icon: Pill },
          { id: 'personal_care', label: 'Personal Care & Condoms', count: deptCounts.personal_care, icon: Heart },
          { id: 'mother_baby', label: 'Mother & Baby', count: deptCounts.mother_baby, icon: Baby },
          { id: 'general_store', label: 'General Store & FMCG', count: deptCounts.general_store, icon: ShoppingBag },
          { id: 'surgical', label: 'Devices & Surgical', count: deptCounts.surgical, icon: Sparkles },
        ].map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSelectedDepartment(id)}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap shadow-2xs ${
              selectedDepartment === id
                ? 'bg-[#083322] text-white shadow-emerald-950/20'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              selectedDepartment === id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search brand, formula, condoms, general items, barcode, SKU, shelf..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
        </div>

        {/* Quick Filter Badges */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 text-xs">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'low', label: 'Low Stock' },
            { id: 'expiring', label: 'Expiring Soon' },
            { id: 'expired', label: 'Expired' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStockFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition ${
                stockFilter === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                <th className="py-3 px-3 w-14 text-center">Photo</th>
                <th className="py-3 px-3">Product Name & Formula</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Packs</th>
                <th className="py-3 px-3">Loose</th>
                <th className="py-3 px-3">Pack Retail (Rs.)</th>
                <th className="py-3 px-3">Unit Retail (Rs.)</th>
                <th className="py-3 px-3">Pack Cost (Rs.)</th>
                <th className="py-3 px-3">Batch</th>
                <th className="py-3 px-3">Expiry</th>
                <th className="py-3 px-3">Shelf</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {filteredMedicines.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 font-sans">
                    No products match the selected filter or query.
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((m) => {
                  const isLow = m.currentStockPacks <= m.minThresholdPacks;
                  const isExp = isExpired(m.expiryDate);
                  const isExpSoon = isExpiringSoon(m.expiryDate, 90);

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-50/80 transition group ${
                        isExp ? 'bg-rose-50/30' : isLow ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Photo Thumbnail */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onOpenMedicineModal(m)}
                          className="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center hover:opacity-80 transition shadow-2xs group relative mx-auto"
                          title="Click to view or upload product photo"
                        >
                          {m.imageUrl ? (
                            <img src={m.imageUrl} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-slate-400 group-hover:text-emerald-700">
                              {m.category === 'Personal Care & Sexual Wellness' || m.department === 'personal_care' ? (
                                <Heart className="w-4 h-4 text-rose-500" />
                              ) : m.category === 'Baby & Mother Care' ? (
                                <Baby className="w-4 h-4 text-amber-500" />
                              ) : m.category === 'General Store & FMCG' ? (
                                <ShoppingBag className="w-4 h-4 text-blue-500" />
                              ) : (
                                <Pill className="w-4 h-4 text-emerald-600" />
                              )}
                            </div>
                          )}
                        </button>
                      </td>

                      {/* Name & Formula */}
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <span>{m.name}</span>
                          {m.requiresPrescription && (
                            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800">
                              Rx
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {m.genericName} &bull; {m.strength}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3 font-sans text-slate-600">
                        {m.category}
                      </td>

                      {/* Stock Packs (Editable) */}
                      <td
                        onClick={() => handleStartEdit(m.id, 'currentStockPacks', m.currentStockPacks)}
                        className={`py-2.5 px-3 cursor-pointer ${
                          editingCell?.id === m.id && editingCell?.field === 'currentStockPacks'
                            ? 'bg-emerald-50'
                            : ''
                        }`}
                      >
                        {editingCell?.id === m.id && editingCell?.field === 'currentStockPacks' ? (
                          <input
                            type="number"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() => handleSaveEdit(m.id, 'currentStockPacks')}
                            onKeyDown={(e) => handleKeyDown(e, m.id, 'currentStockPacks')}
                            className="w-16 px-1.5 py-0.5 border border-emerald-500 rounded bg-white text-xs font-bold"
                            autoFocus
                          />
                        ) : (
                          <span className={`font-bold ${isLow ? 'text-rose-600 font-extrabold' : 'text-slate-800'}`}>
                            {m.currentStockPacks}
                          </span>
                        )}
                      </td>

                      {/* Stock Loose (Editable) */}
                      <td
                        onClick={() => handleStartEdit(m.id, 'currentStockLoose', m.currentStockLoose || 0)}
                        className={`py-2.5 px-3 cursor-pointer ${
                          editingCell?.id === m.id && editingCell?.field === 'currentStockLoose'
                            ? 'bg-emerald-50'
                            : ''
                        }`}
                      >
                        {editingCell?.id === m.id && editingCell?.field === 'currentStockLoose' ? (
                          <input
                            type="number"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() => handleSaveEdit(m.id, 'currentStockLoose')}
                            onKeyDown={(e) => handleKeyDown(e, m.id, 'currentStockLoose')}
                            className="w-16 px-1.5 py-0.5 border border-emerald-500 rounded bg-white text-xs font-bold"
                            autoFocus
                          />
                        ) : (
                          <span className="text-slate-600">
                            {m.currentStockLoose || 0}
                          </span>
                        )}
                      </td>

                      {/* Pack Retail Price (Editable) */}
                      <td
                        onClick={() => handleStartEdit(m.id, 'unitRetailPrice', m.unitRetailPrice)}
                        className={`py-2.5 px-3 cursor-pointer ${
                          editingCell?.id === m.id && editingCell?.field === 'unitRetailPrice'
                            ? 'bg-emerald-50'
                            : ''
                        }`}
                      >
                        {editingCell?.id === m.id && editingCell?.field === 'unitRetailPrice' ? (
                          <input
                            type="number"
                            step={0.1}
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() => handleSaveEdit(m.id, 'unitRetailPrice')}
                            onKeyDown={(e) => handleKeyDown(e, m.id, 'unitRetailPrice')}
                            className="w-20 px-1.5 py-0.5 border border-emerald-500 rounded bg-white text-xs font-bold"
                            autoFocus
                          />
                        ) : (
                          <span className="font-bold text-emerald-800">
                            Rs. {m.unitRetailPrice}
                          </span>
                        )}
                      </td>

                      {/* Unit Loose Retail */}
                      <td className="py-2.5 px-3 text-slate-700">
                        Rs. {getPieceRetailPrice(m).toFixed(1)}
                      </td>

                      {/* Pack Cost Price */}
                      <td className="py-2.5 px-3 text-slate-500">
                        Rs. {m.unitCostPrice}
                      </td>

                      {/* Batch */}
                      <td className="py-2.5 px-3 text-slate-600">
                        {m.batchNumber}
                      </td>

                      {/* Expiry Date */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-semibold ${
                            isExp ? 'text-rose-600 font-bold' : isExpSoon ? 'text-amber-600' : 'text-slate-600'
                          }`}
                        >
                          {m.expiryDate}
                        </span>
                      </td>

                      {/* Shelf */}
                      <td className="py-2.5 px-3 text-slate-600 font-sans">
                        {m.shelfLocation}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onOpenPrintLabel(m)}
                            className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
                            title="Print Shelf Tag & Barcode"
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>

                          {canEdit && (
                            <button
                              onClick={() => onOpenMedicineModal(m)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              title="Edit Full Record"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canEdit && (
                            <button
                              onClick={() => {
                                if (confirm(`Remove ${m.name} from catalog?`)) {
                                  onDeleteMedicine(m.id);
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Showing <strong className="text-slate-800">{filteredMedicines.length}</strong> of{' '}
            <strong className="text-slate-800">{medicines.length}</strong> total medicines
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadMedicineImportTemplate}
              className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>Download Import Template (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
