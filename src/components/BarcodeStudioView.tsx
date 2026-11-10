import React, { useState, useMemo, useEffect } from 'react';
import {
  Barcode,
  Printer,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Search,
  Sparkles,
  Package,
  Tag,
  Layers,
  Sliders,
  CheckCircle2,
  Edit3,
  Save,
  Copy,
  ShoppingBag,
  Pill,
  FileText,
} from 'lucide-react';
import {
  MedicineItem,
  PharmacyDetails,
  MedicineCategory,
  DosageForm,
} from '../types/pharmacy';
import {
  BarcodeGenerator,
  BarcodeFormatPreset,
  generateSmartBarcode,
  isCustomOrMissingBarcode,
} from './BarcodeGenerator';
import {
  BarcodeLabelPaperLayout,
  BarcodeLabelPrintJobItem,
  generateBarcodeLabelsPDF,
} from '../services/pdfGenerator';
import { formatPKR, getPieceRetailPrice } from '../utils/pharmacyHelpers';
import { soundService } from '../services/soundAlerts';

interface BarcodeStudioViewProps {
  medicines: MedicineItem[];
  pharmacyDetails: PharmacyDetails;
  canEdit: boolean;
  initialSelectedMedicine?: MedicineItem | null;
  onInitialMedicineConsumed?: () => void;
  onUpdateMedicine: (id: string, updates: Partial<MedicineItem>) => Promise<MedicineItem>;
  onAddMedicine: (item: Omit<MedicineItem, 'id' | 'updatedAt'>) => Promise<MedicineItem>;
}

export const BarcodeStudioView: React.FC<BarcodeStudioViewProps> = ({
  medicines,
  pharmacyDetails,
  canEdit,
  initialSelectedMedicine,
  onInitialMedicineConsumed,
  onUpdateMedicine,
  onAddMedicine,
}) => {
  const [activeMode, setActiveMode] = useState<'catalog' | 'custom'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<
    'all' | 'custom_or_missing' | 'pharmacy' | 'personal_care' | 'surgical' | 'general_store'
  >('all');
  const [formatPreset, setFormatPreset] = useState<BarcodeFormatPreset>('ean13_pk');

  // Inline barcode editing state for catalog items
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editingBarcodeVal, setEditingBarcodeVal] = useState('');
  const [savingMedId, setSavingMedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Status banner
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'info';
    title: string;
    detail: string;
  } | null>(null);

  // Label Print Configuration
  const [paperLayout, setPaperLayout] = useState<BarcodeLabelPaperLayout>('a4_40');
  const [priceDisplayMode, setPriceDisplayMode] = useState<'pack' | 'unit' | 'both' | 'none'>('pack');
  const [showStoreHeader, setShowStoreHeader] = useState(true);
  const [showBatchAndExpiry, setShowBatchAndExpiry] = useState(true);
  const [showShelfLocation, setShowShelfLocation] = useState(false);
  const [showCutBorders, setShowCutBorders] = useState(true);

  // Print Queue State
  const [printQueue, setPrintQueue] = useState<BarcodeLabelPrintJobItem[]>(() => {
    const firstMed = medicines[0];
    if (!firstMed) return [];
    return [
      {
        id: firstMed.id,
        productName: firstMed.name,
        genericOrStrength: `${firstMed.genericName} ${firstMed.strength}`.trim(),
        barcodeValue: firstMed.barcode || firstMed.sku,
        sku: firstMed.sku,
        packPrice: firstMed.unitRetailPrice,
        unitPrice: getPieceRetailPrice(firstMed),
        priceDisplayMode: 'pack',
        batchNumber: firstMed.batchNumber,
        expiryDate: firstMed.expiryDate,
        shelfLocation: firstMed.shelfLocation,
        copies: 4,
      },
    ];
  });

  // Preview item index
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>(
    medicines[0]?.id || ''
  );

  // Custom / Ad-Hoc Product Barcode Builder Form
  const existingBarcodesSet = useMemo(() => {
    const s = new Set<string>();
    medicines.forEach((m) => {
      if (m.barcode) s.add(m.barcode.trim());
      if (m.sku) s.add(m.sku.trim());
    });
    return s;
  }, [medicines]);

  const [customName, setCustomName] = useState('');
  const [customGeneric, setCustomGeneric] = useState('');
  const [customStrength, setCustomStrength] = useState('1 Pack');
  const [customCategory, setCustomCategory] = useState<MedicineCategory>('Medical Devices & Surgical');
  const [customDosageForm, setCustomDosageForm] = useState<DosageForm>('Pack');
  const [customBarcode, setCustomBarcode] = useState(() =>
    generateSmartBarcode('zms_sku', undefined, 'ITM')
  );
  const [customSku, setCustomSku] = useState(() => `SKU-${Date.now().toString().slice(-5)}`);
  const [customPackCost, setCustomPackCost] = useState('100');
  const [customPackPrice, setCustomPackPrice] = useState('150');
  const [customUnitsPerPack, setCustomUnitsPerPack] = useState('1');
  const [customStockPacks, setCustomStockPacks] = useState('10');
  const [customBatch, setCustomBatch] = useState(`B-${Math.floor(100 + Math.random() * 900)}`);
  const [customExpiry, setCustomExpiry] = useState('2027-12-31');
  const [customShelf, setCustomShelf] = useState('Rack C-01');
  const [customCopies, setCustomCopies] = useState('8');
  const [isSavingCustomToStock, setIsSavingCustomToStock] = useState(false);

  // Consume initialSelectedMedicine when navigated from Inventory / Modal
  useEffect(() => {
    if (initialSelectedMedicine) {
      addMedicineToPrintQueue(initialSelectedMedicine, 6);
      setSelectedPreviewId(initialSelectedMedicine.id);
      onInitialMedicineConsumed?.();
    }
  }, [initialSelectedMedicine]);

  const addMedicineToPrintQueue = (med: MedicineItem, copiesCount: number = 4) => {
    const codeVal = med.barcode || med.sku;
    setPrintQueue((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === med.id);
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          barcodeValue: codeVal,
          packPrice: med.unitRetailPrice,
          unitPrice: getPieceRetailPrice(med),
          copies: updated[existingIdx].copies + copiesCount,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: med.id,
          productName: med.name,
          genericOrStrength: med.strength || med.genericName,
          barcodeValue: codeVal,
          sku: med.sku,
          packPrice: med.unitRetailPrice,
          unitPrice: getPieceRetailPrice(med),
          priceDisplayMode,
          batchNumber: med.batchNumber,
          expiryDate: med.expiryDate,
          shelfLocation: med.shelfLocation,
          copies: Math.max(1, copiesCount),
        },
      ];
    });
    setSelectedPreviewId(med.id);
    soundService.click();
  };

  // Filtered catalog list
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const meta = isCustomOrMissingBarcode(m.barcode);
      if (departmentFilter === 'custom_or_missing') {
        if (!meta.isMissing && !meta.isStoreGenerated) return false;
      } else if (departmentFilter === 'pharmacy') {
        if (m.department && m.department !== 'pharmacy') return false;
      } else if (departmentFilter === 'personal_care') {
        if (
          m.department !== 'personal_care' &&
          m.category !== 'Personal Care & Sexual Wellness' &&
          m.category !== 'Feminine Hygiene & Care' &&
          m.category !== 'Personal Hygiene & Grooming'
        )
          return false;
      } else if (departmentFilter === 'surgical') {
        if (m.department !== 'surgical' && m.category !== 'Medical Devices & Surgical')
          return false;
      } else if (departmentFilter === 'general_store') {
        if (
          m.department !== 'general_store' &&
          m.department !== 'mother_baby' &&
          m.category !== 'General Store & FMCG' &&
          m.category !== 'Baby & Mother Care'
        )
          return false;
      }

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        (m.barcode || '').toLowerCase().includes(q) ||
        (m.sku || '').toLowerCase().includes(q) ||
        (m.shelfLocation || '').toLowerCase().includes(q)
      );
    });
  }, [medicines, departmentFilter, searchQuery]);

  // Generate & immediately save a new barcode for an inventory product
  const handleGenerateAndAssignBarcode = async (
    med: MedicineItem,
    overrideFormat?: BarcodeFormatPreset
  ) => {
    if (!canEdit) return;
    setSavingMedId(med.id);
    try {
      const chosenFormat = overrideFormat || formatPreset;
      const newCode = generateSmartBarcode(chosenFormat, existingBarcodesSet, med.name);
      const updated = await onUpdateMedicine(med.id, { barcode: newCode });

      // Also update in print queue if present
      setPrintQueue((prev) =>
        prev.map((q) => (q.id === med.id ? { ...q, barcodeValue: newCode } : q))
      );
      setSelectedPreviewId(updated.id);
      soundService.scanSuccess();
      setStatusNotice({
        type: 'success',
        title: `Assigned new barcode ${newCode} to ${med.name}`,
        detail:
          'Saved to inventory database. Scanning this barcode at the POS will now immediately dispense this item.',
      });
    } finally {
      setSavingMedId(null);
    }
  };

  const handleSaveManualBarcode = async (med: MedicineItem) => {
    const clean = editingBarcodeVal.trim();
    if (!clean) return;
    setSavingMedId(med.id);
    try {
      await onUpdateMedicine(med.id, { barcode: clean });
      setPrintQueue((prev) =>
        prev.map((q) => (q.id === med.id ? { ...q, barcodeValue: clean } : q))
      );
      setEditingMedId(null);
      soundService.cashRegister();
      setStatusNotice({
        type: 'success',
        title: `Updated barcode for ${med.name} to ${clean}`,
        detail: 'Inventory record updated and ready for POS scanning.',
      });
    } finally {
      setSavingMedId(null);
    }
  };

  // Bulk generate for any item missing a barcode
  const missingBarcodeItems = useMemo(
    () => medicines.filter((m) => isCustomOrMissingBarcode(m.barcode).isMissing),
    [medicines]
  );

  const handleBulkGenerateMissing = async () => {
    if (!canEdit || missingBarcodeItems.length === 0) return;
    for (const item of missingBarcodeItems) {
      const code = generateSmartBarcode(formatPreset, existingBarcodesSet, item.name);
      existingBarcodesSet.add(code);
      await onUpdateMedicine(item.id, { barcode: code });
    }
    soundService.cashRegister();
    setStatusNotice({
      type: 'success',
      title: `Generated barcodes for ${missingBarcodeItems.length} products`,
      detail: 'All products now have unique scanner-ready barcodes.',
    });
  };

  // Custom Barcode Form Handlers
  const handleAddCustomToQueueOnly = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customBarcode.trim()) return;
    const packPriceNum = parseFloat(customPackPrice) || 0;
    const unitsNum = Math.max(1, parseInt(customUnitsPerPack, 10) || 1);
    const copiesNum = Math.max(1, parseInt(customCopies, 10) || 1);

    const newItem: BarcodeLabelPrintJobItem = {
      id: `custom_${Date.now()}`,
      productName: customName.trim(),
      genericOrStrength: customStrength.trim() || customGeneric.trim(),
      barcodeValue: customBarcode.trim(),
      sku: customSku.trim(),
      packPrice: packPriceNum,
      unitPrice: Number((packPriceNum / unitsNum).toFixed(2)),
      priceDisplayMode,
      batchNumber: customBatch.trim(),
      expiryDate: customExpiry,
      shelfLocation: customShelf.trim(),
      copies: copiesNum,
    };

    setPrintQueue((prev) => [...prev, newItem]);
    setSelectedPreviewId(newItem.id);
    soundService.scanSuccess();
    setStatusNotice({
      type: 'info',
      title: `Added "${newItem.productName}" (${copiesNum} stickers) to Print Queue`,
      detail: `Barcode ${newItem.barcodeValue} is ready to print on the right panel.`,
    });
  };

  const handleSaveCustomToInventoryAndQueue = async () => {
    if (!customName.trim() || !customBarcode.trim() || !canEdit) return;
    setIsSavingCustomToStock(true);
    try {
      const packCostNum = parseFloat(customPackCost) || 0;
      const packPriceNum = parseFloat(customPackPrice) || 0;
      const unitsNum = Math.max(1, parseInt(customUnitsPerPack, 10) || 1);
      const stockPacksNum = Math.max(0, parseInt(customStockPacks, 10) || 0);
      const copiesNum = Math.max(1, parseInt(customCopies, 10) || 1);

      const created = await onAddMedicine({
        name: customName.trim(),
        genericName: customGeneric.trim() || 'Store Registered Item',
        barcode: customBarcode.trim(),
        sku: customSku.trim() || `ZMS-${Date.now().toString().slice(-5)}`,
        category: customCategory,
        department:
          customCategory === 'Medical Devices & Surgical'
            ? 'surgical'
            : customCategory === 'General Store & FMCG'
            ? 'general_store'
            : customCategory === 'Baby & Mother Care'
            ? 'mother_baby'
            : customCategory === 'Personal Care & Sexual Wellness'
            ? 'personal_care'
            : 'pharmacy',
        dosageForm: customDosageForm,
        strength: customStrength.trim() || 'Standard',
        unitsPerPack: unitsNum,
        unitCostPrice: packCostNum,
        unitRetailPrice: packPriceNum,
        looseCostPrice: Number((packCostNum / unitsNum).toFixed(2)),
        looseRetailPrice: Number((packPriceNum / unitsNum).toFixed(2)),
        currentStockPacks: stockPacksNum,
        currentStockLoose: 0,
        minThresholdPacks: 5,
        batchNumber: customBatch.trim() || 'B-101',
        expiryDate: customExpiry || '2027-12-31',
        shelfLocation: customShelf.trim() || 'Rack C-01',
        manufacturer: pharmacyDetails.name || 'Zahid Medical Store',
        requiresPrescription: false,
      });

      addMedicineToPrintQueue(created, copiesNum);
      soundService.cashRegister();
      setStatusNotice({
        type: 'success',
        title: `Saved "${created.name}" to Medicine Stock & Queued ${copiesNum} Stickers!`,
        detail: `Barcode ${created.barcode} is now live in Point of Sale and ready to print.`,
      });

      // Reset for next item
      setCustomName('');
      setCustomGeneric('');
      setCustomBarcode(generateSmartBarcode(formatPreset, existingBarcodesSet, 'ZMS'));
      setCustomSku(`SKU-${Date.now().toString().slice(-5)}`);
    } finally {
      setIsSavingCustomToStock(false);
    }
  };

  // Total stickers in queue
  const totalStickersInQueue = useMemo(
    () => printQueue.reduce((sum, item) => sum + (item.copies || 0), 0),
    [printQueue]
  );

  // Active item for live preview card
  const activePreviewItem: BarcodeLabelPrintJobItem = useMemo(() => {
    if (activeMode === 'custom' && customName.trim()) {
      const packPriceNum = parseFloat(customPackPrice) || 0;
      const unitsNum = Math.max(1, parseInt(customUnitsPerPack, 10) || 1);
      return {
        id: 'custom_preview',
        productName: customName.trim(),
        genericOrStrength: customStrength.trim() || customGeneric.trim(),
        barcodeValue: customBarcode.trim() || 'ZMS-100001',
        packPrice: packPriceNum,
        unitPrice: Number((packPriceNum / unitsNum).toFixed(2)),
        priceDisplayMode,
        batchNumber: customBatch,
        expiryDate: customExpiry,
        shelfLocation: customShelf,
        copies: parseInt(customCopies, 10) || 1,
      };
    }

    const fromQueue = printQueue.find((q) => q.id === selectedPreviewId) || printQueue[0];
    if (fromQueue) {
      return { ...fromQueue, priceDisplayMode };
    }

    const fallbackMed =
      medicines.find((m) => m.id === selectedPreviewId) || medicines[0];
    return {
      id: fallbackMed?.id || 'preview',
      productName: fallbackMed?.name || 'Panadol 500mg',
      genericOrStrength: fallbackMed?.strength || '500mg',
      barcodeValue: fallbackMed?.barcode || '8964000102348',
      packPrice: fallbackMed?.unitRetailPrice || 640,
      unitPrice: fallbackMed ? getPieceRetailPrice(fallbackMed) : 3.2,
      priceDisplayMode,
      batchNumber: fallbackMed?.batchNumber || 'B-1042',
      expiryDate: fallbackMed?.expiryDate || '2027-08-15',
      shelfLocation: fallbackMed?.shelfLocation || 'Rack A-01',
      copies: 4,
    };
  }, [
    activeMode,
    customName,
    customStrength,
    customGeneric,
    customBarcode,
    customPackPrice,
    customUnitsPerPack,
    customBatch,
    customExpiry,
    customShelf,
    customCopies,
    printQueue,
    selectedPreviewId,
    priceDisplayMode,
    medicines,
  ]);

  const handleDownloadBarcodePDF = () => {
    if (printQueue.length === 0) return;
    const syncedQueue = printQueue.map((item) => ({
      ...item,
      priceDisplayMode,
    }));
    const result = generateBarcodeLabelsPDF(syncedQueue, {
      layout: paperLayout,
      showStoreHeader,
      showBatchAndExpiry,
      showShelfLocation,
      showCutBorders,
    });
    soundService.cashRegister();
    setStatusNotice({
      type: 'success',
      title: `Downloaded ${result.totalStickers} Vector Barcode Stickers (${result.fileName})`,
      detail:
        'Ready to print at 100% scale on your thermal label printer or A4 adhesive sticker sheet.',
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Studio Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#072418] text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
            <Barcode className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Barcode Generator &amp; Label Studio
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                Code-128 &amp; GS1 EAN-13
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate unique store barcodes for unpacked medicines, loose strips, surgical supplies, and general store items, and print scannable thermal or A4 stickers.
            </p>
          </div>
        </div>

        {/* Mode Switcher & Format Preset */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveMode('catalog');
                soundService.click();
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeMode === 'catalog'
                  ? 'bg-[#072418] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Inventory Products ({medicines.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('custom');
                soundService.click();
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeMode === 'custom'
                  ? 'bg-[#072418] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Custom / Unlisted Product</span>
            </button>
          </div>

          {missingBarcodeItems.length > 0 && canEdit && (
            <button
              type="button"
              onClick={handleBulkGenerateMissing}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Fill {missingBarcodeItems.length} Missing Barcodes</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {statusNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <span className="font-bold">{statusNotice.title}</span>
              <span className="text-emerald-800/90 ml-2">{statusNotice.detail}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-[11px] font-bold text-emerald-800 hover:underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 12-Column Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT 7 COLUMNS: Product Barcode Manager OR Custom Product Creator */}
        <div className="lg:col-span-7 space-y-4">
          {/* Default Barcode Format Selector Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                Barcode Numbering Standard
              </span>
              <span className="text-xs text-slate-500">
                Choose the format used when clicking &ldquo;Generate Barcode&rdquo;
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                {
                  id: 'ean13_pk' as BarcodeFormatPreset,
                  label: '13-Digit GS1 PK (8964...)',
                  desc: 'Standard retail EAN/Code128',
                },
                {
                  id: 'short_8' as BarcodeFormatPreset,
                  label: '8-Digit Compact (20...)',
                  desc: 'Best for small labels & strips',
                },
                {
                  id: 'zms_sku' as BarcodeFormatPreset,
                  label: 'Store Code (ZMS-...)',
                  desc: 'Custom pharmacy SKU prefix',
                },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => {
                    setFormatPreset(fmt.id);
                    soundService.click();
                  }}
                  title={fmt.desc}
                  className={`px-3 py-1.5 rounded-xl border font-bold transition cursor-pointer ${
                    formatPreset === fmt.id
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {activeMode === 'catalog' ? (
            /* MODE 1: INVENTORY PRODUCT BARCODE GENERATOR & ASSIGNER */
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
              {/* Search & Department Filters */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search medicine name, generic formula, current barcode, or shelf rack..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  {[
                    { id: 'all', label: `All Items (${medicines.length})` },
                    { id: 'custom_or_missing', label: 'Store / Custom Barcodes' },
                    { id: 'pharmacy', label: 'Medicines' },
                    { id: 'surgical', label: 'Surgical & Devices' },
                    { id: 'personal_care', label: 'Personal Care' },
                    { id: 'general_store', label: 'Baby & General Store' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDepartmentFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                        departmentFilter === tab.id
                          ? 'bg-[#072418] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product List */}
              <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto pr-1">
                {filteredMedicines.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No matching products found. Switch to &ldquo;Custom / Unlisted Product&rdquo; to create a new item with a barcode.
                  </div>
                ) : (
                  filteredMedicines.map((med) => {
                    const codeStatus = isCustomOrMissingBarcode(med.barcode);
                    const isEditingThis = editingMedId === med.id;
                    const isSelectedPreview = selectedPreviewId === med.id;
                    const piecePrice = getPieceRetailPrice(med);

                    return (
                      <div
                        key={med.id}
                        onClick={() => setSelectedPreviewId(med.id)}
                        className={`py-3.5 px-3 rounded-xl transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                          isSelectedPreview
                            ? 'bg-emerald-50/60 border border-emerald-200'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                              {med.name}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {med.strength} &bull; {med.dosageForm}
                            </span>
                            {codeStatus.isStoreGenerated && (
                              <span className="px-2 py-0.2 rounded-md bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                                Store Barcode
                              </span>
                            )}
                            {codeStatus.isMissing && (
                              <span className="px-2 py-0.2 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                                Needs Barcode
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-mono">
                            <span className="font-bold text-emerald-800">
                              Pack: Rs. {med.unitRetailPrice}
                            </span>
                            <span>Unit: Rs. {piecePrice.toFixed(1)}</span>
                            <span>Stock: {med.currentStockPacks}p</span>
                            <span>Loc: {med.shelfLocation}</span>
                          </div>

                          {/* Barcode Value & Inline Editor */}
                          <div
                            className="pt-1 flex flex-wrap items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isEditingThis ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingBarcodeVal}
                                  onChange={(e) => setEditingBarcodeVal(e.target.value)}
                                  placeholder="Enter or scan barcode..."
                                  className="px-2.5 py-1 rounded-lg border border-emerald-500 bg-white font-mono text-xs font-bold w-44 focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveManualBarcode(med)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Save className="w-3 h-3" />
                                  <span>Save</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingMedId(null)}
                                  className="px-2 py-1 rounded-lg border border-slate-300 text-slate-600 text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-emerald-300 font-mono text-xs font-bold tracking-wider">
                                  <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{med.barcode || med.sku}</span>
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(med.barcode || med.sku);
                                    setCopiedId(med.id);
                                    soundService.click();
                                    setTimeout(() => setCopiedId(null), 1500);
                                  }}
                                  className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                                  title="Copy barcode number"
                                >
                                  {copiedId === med.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>

                                {canEdit && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={savingMedId === med.id}
                                      onClick={() => handleGenerateAndAssignBarcode(med)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                                      title="Generate a new unique barcode and save it to this product"
                                    >
                                      <RefreshCw
                                        className={`w-3 h-3 ${
                                          savingMedId === med.id ? 'animate-spin' : ''
                                        }`}
                                      />
                                      <span>Generate New Code</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMedId(med.id);
                                        setEditingBarcodeVal(med.barcode || med.sku);
                                      }}
                                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                                      title="Type custom barcode manually"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right: Mini Barcode Preview & Add to Sticker Queue Buttons */}
                        <div
                          className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => addMedicineToPrintQueue(med, 4)}
                              className="px-2.5 py-1.5 rounded-xl bg-[#072418] hover:bg-[#0c3927] text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                              title="Add 4 barcode stickers to print queue"
                            >
                              <Plus className="w-3 h-3 text-emerald-400" />
                              <span>+4 Stickers</span>
                            </button>

                            {med.currentStockPacks > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  addMedicineToPrintQueue(med, med.currentStockPacks)
                                }
                                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                                title={`Add ${med.currentStockPacks} stickers matching current pack stock`}
                              >
                                +Stock ({med.currentStockPacks})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* MODE 2: CUSTOM / UNLISTED PRODUCT BARCODE CREATOR */
            <form
              onSubmit={handleAddCustomToQueueOnly}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Create User-Generated Product Barcode
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ideal for unpacked items, loose tablet pouches, surgical dressings, cosmetics, or new counter items without a manufacturer barcode.
                  </p>
                </div>
              </div>

              {/* Barcode Generator Box */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="font-extrabold text-emerald-950 text-xs uppercase tracking-wider">
                    Generated Barcode String (Code-128 / EAN-13)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomBarcode(
                          generateSmartBarcode('ean13_pk', existingBarcodesSet, customName)
                        );
                        soundService.click();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>13-Digit GS1</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomBarcode(
                          generateSmartBarcode('short_8', existingBarcodesSet, customName)
                        );
                        soundService.click();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>8-Digit Short</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomBarcode(
                          generateSmartBarcode('zms_sku', existingBarcodesSet, customName || 'ZMS')
                        );
                        soundService.click();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>ZMS-SKU Code</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      required
                      value={customBarcode}
                      onChange={(e) => setCustomBarcode(e.target.value)}
                      placeholder="e.g. 8964123456789 or ZMS-1042"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-400 bg-white font-mono text-sm font-black tracking-wider text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={customSku}
                      onChange={(e) => setCustomSku(e.target.value)}
                      placeholder="Internal SKU"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-mono text-xs text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Product Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Product / Item Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Cotton Crepe Bandage 4 Inch / Loose Disprin Pouch"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Generic / Formula / Description
                  </label>
                  <input
                    type="text"
                    value={customGeneric}
                    onChange={(e) => setCustomGeneric(e.target.value)}
                    placeholder="e.g. Surgical Cotton / Pain Relief"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Size / Strength / Pack Spec
                  </label>
                  <input
                    type="text"
                    value={customStrength}
                    onChange={(e) => setCustomStrength(e.target.value)}
                    placeholder="e.g. 10cm x 4.5m, 10 Tabs, Large"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value as MedicineCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    <option value="Medical Devices & Surgical">Medical Devices &amp; Surgical</option>
                    <option value="General Store & FMCG">General Store &amp; FMCG</option>
                    <option value="Personal Care & Sexual Wellness">Personal Care &amp; Sexual Wellness</option>
                    <option value="Baby & Mother Care">Baby &amp; Mother Care</option>
                    <option value="Analgesics & Pain">Analgesics &amp; Pain</option>
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Vitamins & Supplements">Vitamins &amp; Supplements</option>
                    <option value="General / Other">General / Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Pack Cost Price (Rs.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={customPackCost}
                    onChange={(e) => setCustomPackCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Retail Selling Price MRP (Rs.) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    required
                    value={customPackPrice}
                    onChange={(e) => setCustomPackPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-emerald-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Units per Pack
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={customUnitsPerPack}
                    onChange={(e) => setCustomUnitsPerPack(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Opening Stock (Packs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={customStockPacks}
                    onChange={(e) => setCustomStockPacks(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Batch # &amp; Shelf Rack
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customBatch}
                      onChange={(e) => setCustomBatch(e.target.value)}
                      placeholder="Batch #"
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-mono"
                    />
                    <input
                      type="text"
                      value={customShelf}
                      onChange={(e) => setCustomShelf(e.target.value)}
                      placeholder="Rack C-01"
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Expiry Date &amp; Stickers Count
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={customExpiry}
                      onChange={(e) => setCustomExpiry(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-mono"
                    />
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={customCopies}
                      onChange={(e) => setCustomCopies(e.target.value)}
                      placeholder="Stickers"
                      className="w-full px-2.5 py-2 rounded-xl border border-emerald-400 bg-emerald-50/40 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Dual Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-emerald-700" />
                  <span>Add Stickers to Print Queue Only</span>
                </button>

                {canEdit && (
                  <button
                    type="button"
                    disabled={isSavingCustomToStock || !customName.trim()}
                    onClick={handleSaveCustomToInventoryAndQueue}
                    className="px-5 py-2.5 rounded-xl bg-[#072418] hover:bg-[#0c3927] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4 text-emerald-400" />
                    <span>
                      {isSavingCustomToStock
                        ? 'Saving...'
                        : 'Save Product to Stock & Queue Stickers'}
                    </span>
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* RIGHT 5 COLUMNS: LIVE STICKER PREVIEW & BATCH PRINT QUEUE */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: Live Sticker Preview & Format Controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-700" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Live Barcode Sticker Preview
                </h3>
              </div>
              <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                100% Scanner Verified
              </span>
            </div>

            {/* Visual Sticker Simulation Box */}
            <div className="p-5 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <div className="bg-white border-2 border-slate-900 rounded-xl p-3.5 shadow-md w-full max-w-[270px] text-center space-y-1">
                {showStoreHeader && (
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1">
                    {pharmacyDetails.name || 'ZAHID MEDICAL STORE'}
                  </div>
                )}

                <div className="font-black text-slate-950 text-sm leading-tight truncate pt-0.5">
                  {activePreviewItem.productName}
                </div>

                <div className="text-[11px] font-bold text-emerald-900 flex items-center justify-center gap-1.5 flex-wrap">
                  {activePreviewItem.genericOrStrength && (
                    <span className="text-slate-600 font-semibold">
                      {activePreviewItem.genericOrStrength}
                    </span>
                  )}
                  {priceDisplayMode === 'pack' && (
                    <span className="bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      MRP: Rs. {activePreviewItem.packPrice}
                    </span>
                  )}
                  {priceDisplayMode === 'unit' && (
                    <span className="bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Rs. {(activePreviewItem.unitPrice ?? activePreviewItem.packPrice).toFixed(1)} / Unit
                    </span>
                  )}
                  {priceDisplayMode === 'both' && (
                    <span className="bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Rs. {activePreviewItem.packPrice} (
                      {(activePreviewItem.unitPrice ?? activePreviewItem.packPrice).toFixed(1)}/u)
                    </span>
                  )}
                </div>

                <div className="py-1 flex justify-center">
                  <BarcodeGenerator
                    value={activePreviewItem.barcodeValue}
                    type="code128"
                    width={210}
                    height={44}
                    showText={true}
                    className="w-full"
                  />
                </div>

                {(showBatchAndExpiry || showShelfLocation) && (
                  <div className="text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-center gap-2 flex-wrap">
                    {showBatchAndExpiry && activePreviewItem.batchNumber && (
                      <span>B: {activePreviewItem.batchNumber}</span>
                    )}
                    {showBatchAndExpiry && activePreviewItem.expiryDate && (
                      <span>EXP: {activePreviewItem.expiryDate}</span>
                    )}
                    {showShelfLocation && activePreviewItem.shelfLocation && (
                      <span>{activePreviewItem.shelfLocation}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Paper / Thermal Roll Layout Selection */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Sticker Paper / Thermal Printer Roll Size
                </label>
                <select
                  value={paperLayout}
                  onChange={(e) => setPaperLayout(e.target.value as BarcodeLabelPaperLayout)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <optgroup label="Thermal Barcode Roll Printers (Xprinter / Zebra / Speed-X)">
                    <option value="thermal_50x25">
                      Thermal Sticker Roll — 50 × 25 mm (Standard Pharmacy Roll)
                    </option>
                    <option value="thermal_40x30">
                      Thermal Sticker Roll — 40 × 30 mm (Medium Label Roll)
                    </option>
                  </optgroup>
                  <optgroup label="A4 Adhesive Sticker Sheets (Laser / Inkjet Printer)">
                    <option value="a4_40">
                      A4 Sticker Sheet — 40 Labels per Page (4 × 10 Grid, 50×28mm)
                    </option>
                    <option value="a4_65">
                      A4 Mini Sticker Sheet — 65 Labels per Page (5 × 13 Grid, 38×21mm)
                    </option>
                    <option value="a4_24">
                      A4 Large Shelf Sheet — 24 Labels per Page (3 × 8 Grid, 66×35mm)
                    </option>
                  </optgroup>
                </select>
              </div>

              {/* Price Display Mode */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Price Printed on Sticker
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'pack', label: 'Pack MRP' },
                    { id: 'unit', label: 'Unit Rate' },
                    { id: 'both', label: 'Both' },
                    { id: 'none', label: 'No Price' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPriceDisplayMode(mode.id as any)}
                      className={`py-1.5 px-2 rounded-lg border font-bold text-[11px] transition cursor-pointer ${
                        priceDisplayMode === mode.id
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showStoreHeader}
                    onChange={(e) => setShowStoreHeader(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Store Name Header</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showBatchAndExpiry}
                    onChange={(e) => setShowBatchAndExpiry(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Batch &amp; Expiry Date</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showShelfLocation}
                    onChange={(e) => setShowShelfLocation(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Shelf Rack Location</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showCutBorders}
                    onChange={(e) => setShowCutBorders(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Sticker Cut Borders</span>
                </label>
              </div>
            </div>
          </div>

          {/* Card 2: Batch Print Queue */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <span>Sticker Print Queue ({printQueue.length} items)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Total of <span className="font-bold text-slate-800">{totalStickersInQueue}</span> barcode stickers ready to export
                </p>
              </div>

              {printQueue.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPrintQueue([]);
                    soundService.click();
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {printQueue.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                Queue is empty. Click <span className="font-bold text-slate-600">+4 Stickers</span> or <span className="font-bold text-slate-600">+Stock</span> on any product on the left to add stickers.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
                {printQueue.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPreviewId(item.id)}
                    className={`py-2.5 px-2.5 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer ${
                      selectedPreviewId === item.id ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">{item.productName}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {item.barcodeValue} &bull; Rs. {item.packPrice}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] text-slate-400">Qty:</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={item.copies}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setPrintQueue((prev) =>
                            prev.map((q) => (q.id === item.id ? { ...q, copies: val } : q))
                          );
                        }}
                        className="w-14 px-1.5 py-1 rounded-lg border border-slate-300 bg-white text-center font-mono font-bold text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPrintQueue((prev) => prev.filter((q) => q.id !== item.id))
                        }
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Primary Export / Print Actions */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={printQueue.length === 0}
                onClick={handleDownloadBarcodePDF}
                className="flex-1 py-3 px-4 rounded-xl bg-[#072418] hover:bg-[#0c3927] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download Vector PDF ({totalStickersInQueue} Stickers)</span>
              </button>

              <button
                type="button"
                disabled={printQueue.length === 0}
                onClick={() => {
                  soundService.click();
                  window.print();
                }}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
