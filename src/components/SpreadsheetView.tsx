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
  Image as ImageIcon,
  Barcode,
  Percent,
  X
} from 'lucide-react';
import { DosageForm, MedicineCategory, MedicineItem } from '../types/pharmacy';
import {
  formatPKR,
  getDaysUntilExpiry,
  getDiscountedPackPrice,
  getExpiryBadgeMeta,
  getPieceRetailPrice,
  hasSpecialDiscount,
  isExpired,
  isExpiringSoon,
} from '../utils/pharmacyHelpers';
import { formatDate } from '../utils/dates';
import { 
  exportInventoryToCSV,
  exportInventoryToExcel, 
  exportExpiryAuditToExcel, 
  downloadMedicineImportTemplate, 
  parseMedicineExcelFile 
} from '../services/excelExporter';
import { soundService } from '../services/soundAlerts';
import { syncEngine } from '../services/syncEngine';
import { generatePurchaseOrderPDF } from '../services/pdfGenerator';

export type InventoryStockFilter =
  | 'all'
  | 'wholesale'
  | 'low'
  | 'expiring'
  | 'exp_30'
  | 'exp_60'
  | 'exp_90'
  | 'expired';

interface SpreadsheetViewProps {
  medicines: MedicineItem[];
  onUpdateMedicine: (id: string, updates: Partial<MedicineItem>) => Promise<MedicineItem>;
  onDeleteMedicine: (id: string) => Promise<boolean>;
  onOpenMedicineModal: (med?: MedicineItem) => void;
  onOpenScanner: () => void;
  onOpenPrintLabel: (med: MedicineItem) => void;
  onOpenBarcodeStudio?: (med?: MedicineItem) => void;
  onScanBarcode?: (code: string) => void;
  canEdit: boolean;
  externalStockFilter?: InventoryStockFilter | null;
  onExternalFilterConsumed?: () => void;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  medicines,
  onUpdateMedicine,
  onDeleteMedicine,
  onOpenMedicineModal,
  onOpenScanner,
  onOpenPrintLabel,
  onOpenBarcodeStudio,
  onScanBarcode,
  canEdit,
  externalStockFilter,
  onExternalFilterConsumed,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDosageForm, setSelectedDosageForm] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<InventoryStockFilter>('all');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  // Inline Special / Wholesale Discount Tag Configurator state
  const [discountConfigMedId, setDiscountConfigMedId] = useState<string | null>(null);
  const [draftDiscountPct, setDraftDiscountPct] = useState<string>('10');
  const [draftDiscountMinPacks, setDraftDiscountMinPacks] = useState<number>(1);
  const [draftDiscountLabel, setDraftDiscountLabel] = useState<string>('Wholesale');

  const wholesaleCount = useMemo(
    () => medicines.filter((m) => hasSpecialDiscount(m)).length,
    [medicines]
  );

  const handleOpenDiscountConfig = (med: MedicineItem) => {
    if (!canEdit) return;
    if (discountConfigMedId === med.id) {
      setDiscountConfigMedId(null);
      return;
    }
    setDiscountConfigMedId(med.id);
    setDraftDiscountPct(
      med.specialDiscountPercent && med.specialDiscountPercent > 0
        ? String(med.specialDiscountPercent)
        : '10'
    );
    setDraftDiscountMinPacks(med.specialDiscountMinPacks || 1);
    setDraftDiscountLabel(med.specialDiscountLabel || 'Wholesale');
    soundService.click();
  };

  const handleSaveSpecialDiscount = async (medId: string, clearDiscount = false) => {
    const pct = clearDiscount
      ? 0
      : Math.max(0, Math.min(90, parseFloat(draftDiscountPct) || 0));
    try {
      await onUpdateMedicine(medId, {
        specialDiscountPercent: pct,
        specialDiscountMinPacks: pct > 0 ? Math.max(1, draftDiscountMinPacks || 1) : 1,
        specialDiscountLabel: pct > 0 ? draftDiscountLabel || 'Wholesale' : '',
      });
      soundService.click();
    } catch {
      soundService.errorTone();
    } finally {
      setDiscountConfigMedId(null);
    }
  };

  React.useEffect(() => {
    if (externalStockFilter) {
      setStockFilter(externalStockFilter);
      onExternalFilterConsumed?.();
    }
  }, [externalStockFilter, onExternalFilterConsumed]);

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

      // 4. Stock, Wholesale Special Discount & Near-Expiry (30 / 60 / 90 days) alert state
      const daysToExpiry = getDaysUntilExpiry(m.expiryDate);
      if (stockFilter === 'wholesale' && !hasSpecialDiscount(m)) return false;
      if (stockFilter === 'low' && m.currentStockPacks > m.minThresholdPacks) return false;
      if (stockFilter === 'expiring' && !isExpiringSoon(m.expiryDate, 90)) return false;
      if (stockFilter === 'exp_30' && !(daysToExpiry > 0 && daysToExpiry <= 30)) return false;
      if (stockFilter === 'exp_60' && !(daysToExpiry > 30 && daysToExpiry <= 60)) return false;
      if (stockFilter === 'exp_90' && !(daysToExpiry > 60 && daysToExpiry <= 90)) return false;
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
            className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Camera className="w-4 h-4 text-emerald-600" />
            <span>Scan Camera</span>
          </button>

          {/* Barcode Generator Studio Button */}
          {onOpenBarcodeStudio && (
            <button
              onClick={() => onOpenBarcodeStudio()}
              className="px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Open Barcode Generator & Label Studio (Ctrl+B)"
            >
              <Barcode className="w-4 h-4 text-emerald-700" />
              <span>Barcode Studio</span>
            </button>
          )}

          {/* Export Menu */}
          <button
            onClick={() => {
              soundService.cashRegister();
              exportInventoryToCSV(filteredMedicines);
            }}
            className="px-3 py-2 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Export medicine inventory list to a CSV file for physical stock & financial auditing"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>Audit CSV</span>
          </button>

          <button
            onClick={() => exportInventoryToExcel(medicines)}
            className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Download full inventory workbook (.xlsx)"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => {
              soundService.click();
              generatePurchaseOrderPDF(medicines);
            }}
            className="px-3 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Generate printable Supplier Purchase Order (Demand List) PDF for all items below reorder threshold"
          >
            <Printer className="w-4 h-4 text-rose-600" />
            <span>Demand List PDF</span>
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
            placeholder="Scan barcode to dispense in POS, or search brand, formula, barcode, SKU, shelf..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchTerm.trim() && onScanBarcode) {
                const raw = searchTerm.trim();
                // Trigger global barcode routing if it looks like a barcode, 2D GS1 code, or has 0/1 exact barcode match
                if (
                  /^(\(01\)|01)\d{14}/.test(raw) ||
                  /^\d{6,14}$/.test(raw) ||
                  /^ZMS-/i.test(raw) ||
                  filteredMedicines.length === 0
                ) {
                  e.preventDefault();
                  setSearchTerm('');
                  onScanBarcode(raw);
                }
              }
            }}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
        </div>

        {/* Quick Filter Badges (including Wholesale Offers & 30, 60, 90-Day Near Expiry Windows) */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 text-xs">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'wholesale', label: `Wholesale % (${wholesaleCount})` },
            { id: 'low', label: 'Low Stock' },
            { id: 'expiring', label: 'All Near Expiry (≤90d)' },
            { id: 'exp_30', label: '≤ 30 Days' },
            { id: 'exp_60', label: '31–60 Days' },
            { id: 'exp_90', label: '61–90 Days' },
            { id: 'expired', label: 'Expired' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStockFilter(f.id as InventoryStockFilter)}
              className={`px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
                stockFilter === f.id
                  ? f.id === 'exp_30' || f.id === 'expired'
                    ? 'bg-rose-600 text-white'
                    : f.id === 'exp_60' || f.id === 'expiring'
                    ? 'bg-amber-600 text-white'
                    : f.id === 'exp_90'
                    ? 'bg-sky-600 text-white'
                    : f.id === 'wholesale'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-white'
                  : f.id === 'wholesale'
                  ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
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

                      {/* Name, Formula & Inline Wholesale / Special Discount Tag */}
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-900 text-xs flex flex-wrap items-center gap-1.5">
                          <span>{m.name}</span>
                          {m.requiresPrescription && (
                            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800">
                              Rx
                            </span>
                          )}

                          {/* Wholesale / Special Product Discount Tag with Product Name */}
                          {hasSpecialDiscount(m) ? (
                            <button
                              type="button"
                              onClick={() => handleOpenDiscountConfig(m)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold transition cursor-pointer"
                              title={
                                canEdit
                                  ? `Special ${m.specialDiscountLabel || 'Wholesale'} Discount: -${m.specialDiscountPercent}% (Net Pack Rate: Rs. ${getDiscountedPackPrice(m)}). Click to configure.`
                                  : `Special ${m.specialDiscountLabel || 'Wholesale'} Discount: -${m.specialDiscountPercent}% (Net Pack Rate: Rs. ${getDiscountedPackPrice(m)})`
                              }
                            >
                              <Tag className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                              <span>
                                {m.specialDiscountLabel || 'Wholesale'} -{m.specialDiscountPercent}%
                              </span>
                              <span className="font-mono tabular-nums text-indigo-950 bg-white/80 px-1 rounded text-[9px]">
                                Rs. {Math.round(getDiscountedPackPrice(m))}
                              </span>
                              {(m.specialDiscountMinPacks || 1) > 1 && (
                                <span className="text-[9px] font-mono text-indigo-600">
                                  &ge;{m.specialDiscountMinPacks}p
                                </span>
                              )}
                            </button>
                          ) : (
                            canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenDiscountConfig(m)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded border border-dashed border-slate-300 hover:border-indigo-400 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50/60 text-[9px] font-semibold opacity-60 group-hover:opacity-100 transition cursor-pointer"
                                title="Configure Wholesale / Special Discount tag for this product"
                              >
                                <Percent className="w-2.5 h-2.5" />
                                <span>+ Special %</span>
                              </button>
                            )
                          )}
                        </div>

                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                          <span>{m.genericName} &bull; {m.strength}</span>
                          <button
                            type="button"
                            onClick={() => onOpenPrintLabel(m)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 text-[9px] font-mono font-bold transition cursor-pointer"
                            title="Click to generate barcode or print sticker"
                          >
                            <Barcode className="w-2.5 h-2.5 text-emerald-700" />
                            <span>{m.barcode || m.sku}</span>
                          </button>
                        </div>

                        {/* Inline Special / Wholesale Discount Configurator Strip */}
                        {discountConfigMedId === m.id && canEdit && (
                          <div className="mt-2 p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2 text-[11px] max-w-md shadow-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-indigo-950 flex items-center gap-1">
                                <Tag className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Configure Wholesale / Special Discount</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setDiscountConfigMedId(null)}
                                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Quick % Presets */}
                            <div className="flex flex-wrap items-center gap-1">
                              {[5, 8, 10, 12, 15, 20].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => setDraftDiscountPct(String(pct))}
                                  className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] border transition cursor-pointer ${
                                    Number(draftDiscountPct) === pct
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                  }`}
                                >
                                  {pct}%
                                </button>
                              ))}
                              <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-indigo-300 ml-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={90}
                                  step={0.5}
                                  value={draftDiscountPct}
                                  onChange={(e) => setDraftDiscountPct(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveSpecialDiscount(m.id, false);
                                    } else if (e.key === 'Escape') {
                                      setDiscountConfigMedId(null);
                                    }
                                  }}
                                  className="w-12 font-mono font-bold text-[11px] text-indigo-950 focus:outline-none"
                                  placeholder="%"
                                />
                                <span className="text-[10px] font-bold text-indigo-700">%</span>
                              </div>
                            </div>

                            {/* Tag Label & Min Packs */}
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="block text-[9px] font-bold uppercase text-indigo-900/70 mb-0.5">
                                  Tag Label
                                </label>
                                <select
                                  value={draftDiscountLabel}
                                  onChange={(e) => setDraftDiscountLabel(e.target.value)}
                                  className="w-full px-2 py-1 rounded-lg border border-indigo-200 bg-white text-[11px] font-semibold text-slate-800"
                                >
                                  <option value="Wholesale">Wholesale</option>
                                  <option value="Trade Offer">Trade Offer</option>
                                  <option value="Bulk Deal">Bulk Deal</option>
                                  <option value="Clinic Rate">Clinic Rate</option>
                                  <option value="Special">Special</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold uppercase text-indigo-900/70 mb-0.5">
                                  Min Packs Required
                                </label>
                                <select
                                  value={draftDiscountMinPacks}
                                  onChange={(e) =>
                                    setDraftDiscountMinPacks(parseInt(e.target.value, 10) || 1)
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-indigo-200 bg-white text-[11px] font-mono font-semibold text-slate-800"
                                >
                                  <option value={1}>1+ Pack (Any Pack)</option>
                                  <option value={2}>2+ Packs</option>
                                  <option value={3}>3+ Packs</option>
                                  <option value={5}>5+ Packs (Bulk)</option>
                                  <option value={10}>10+ Packs (Carton)</option>
                                </select>
                              </div>
                            </div>

                            {/* Live Wholesale Rate & Margin Check */}
                            {(() => {
                              const pct = Math.max(
                                0,
                                Math.min(90, parseFloat(draftDiscountPct) || 0)
                              );
                              const netPack = Number(
                                (m.unitRetailPrice * (1 - pct / 100)).toFixed(2)
                              );
                              const profitPerPack = Number(
                                (netPack - m.unitCostPrice).toFixed(2)
                              );
                              return (
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-indigo-200/70">
                                  <div className="text-[10px] font-mono tabular-nums">
                                    <span className="text-slate-600">Net Pack: </span>
                                    <strong className="text-indigo-950">Rs. {netPack}</strong>
                                    <span
                                      className={`ml-1.5 font-bold ${
                                        profitPerPack < 0
                                          ? 'text-rose-600'
                                          : 'text-emerald-700'
                                      }`}
                                    >
                                      ({profitPerPack >= 0 ? `+Rs. ${profitPerPack}` : `Loss Rs. ${profitPerPack}`} vs Cost Rs. {m.unitCostPrice})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {hasSpecialDiscount(m) && (
                                      <button
                                        type="button"
                                        onClick={() => handleSaveSpecialDiscount(m.id, true)}
                                        className="px-2 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px] cursor-pointer"
                                      >
                                        Remove
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleSaveSpecialDiscount(m.id, false)}
                                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Save Tag</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
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
                          <div className="flex flex-col">
                            <span className="font-bold text-emerald-800">
                              Rs. {m.unitRetailPrice}
                            </span>
                            {hasSpecialDiscount(m) && (
                              <span className="text-[9px] text-indigo-700 font-bold">
                                Net: Rs. {getDiscountedPackPrice(m)}
                              </span>
                            )}
                          </div>
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

                      {/* Expiry Date (Inline Editable + 30/60/90-Day Badge) */}
                      <td
                        onClick={() => handleStartEdit(m.id, 'expiryDate', m.expiryDate)}
                        className={`py-2.5 px-3 cursor-pointer ${
                          editingCell?.id === m.id && editingCell?.field === 'expiryDate'
                            ? 'bg-emerald-50'
                            : ''
                        }`}
                        title="Click to edit Expiry Date (YYYY-MM-DD)"
                      >
                        {editingCell?.id === m.id && editingCell?.field === 'expiryDate' ? (
                          <input
                            type="date"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() => handleSaveEdit(m.id, 'expiryDate')}
                            onKeyDown={(e) => handleKeyDown(e, m.id, 'expiryDate')}
                            className="w-32 px-1.5 py-0.5 border border-emerald-500 rounded bg-white text-xs font-bold"
                            autoFocus
                          />
                        ) : (
                          (() => {
                            const expMeta = getExpiryBadgeMeta(m.expiryDate);
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className={expMeta.textClass}>
                                  {m.expiryDate || 'Not set'}
                                </span>
                                {expMeta.window !== 'safe' && (
                                  <span
                                    className={`inline-block w-fit text-[9px] font-sans font-bold px-1.5 py-0.2 rounded ${expMeta.badgeClass}`}
                                  >
                                    {expMeta.horizonLabel} &bull; {expMeta.shortLabel}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        )}
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
