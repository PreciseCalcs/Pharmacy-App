import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Link2,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  ClipboardList,
  PackagePlus,
  ShoppingCart,
  Sparkles,
  QrCode,
  ArrowRight,
} from 'lucide-react';
import { DosageForm, MedicineCategory, MedicineItem } from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';
import { parseScannedCode } from '../utils/codeParser';
import { formatPKR, getTotalPiecesInStock } from '../utils/pharmacyHelpers';

interface LinkCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedCode: string;
  medicines: MedicineItem[];
  currentUserName?: string;
  activeCounter?: string;
  outOfStockMedicine?: MedicineItem | null;
  onLinked: (medicine: MedicineItem) => void;
  onOpenListMedicineModal: (rawCode: string, existingMedicine?: MedicineItem | null) => void;
  onAddedToShortBook: (itemName: string, requestedPacks: number) => void;
  onQuickListedAndDispense: (medicine: MedicineItem) => void;
}

export const LinkCodeModal: React.FC<LinkCodeModalProps> = ({
  isOpen,
  onClose,
  scannedCode,
  medicines,
  currentUserName = 'Pharmacist',
  activeCounter = 'Main Counter',
  outOfStockMedicine = null,
  onLinked,
  onOpenListMedicineModal,
  onAddedToShortBook,
  onQuickListedAndDispense,
}) => {
  const [activeMode, setActiveMode] = useState<'list_new' | 'short_book' | 'link_existing'>('list_new');

  // Quick List New Item state
  const [quickName, setQuickName] = useState('');
  const [quickGeneric, setQuickGeneric] = useState('');
  const [quickStrength, setQuickStrength] = useState('500mg');
  const [quickDosageForm, setQuickDosageForm] = useState<DosageForm>('Tablet');
  const [quickCategory, setQuickCategory] = useState<MedicineCategory>('General / Other');
  const [quickRetailPrice, setQuickRetailPrice] = useState('250');
  const [quickCostPrice, setQuickCostPrice] = useState('210');
  const [quickUnitsPerPack, setQuickUnitsPerPack] = useState('10');
  const [quickStockPacks, setQuickStockPacks] = useState('10');
  const [quickBatch, setQuickBatch] = useState('B-101');
  const [quickExpiry, setQuickExpiry] = useState('2027-12-31');
  const [isSavingQuickList, setIsSavingQuickList] = useState(false);

  // Add to Short Book state
  const [shortBookName, setShortBookName] = useState('');
  const [shortBookStrength, setShortBookStrength] = useState('');
  const [shortBookSupplier, setShortBookSupplier] = useState('');
  const [shortBookPacks, setShortBookPacks] = useState('5');
  const [shortBookUrgent, setShortBookUrgent] = useState(true);
  const [isSavingShortBook, setIsSavingShortBook] = useState(false);

  // Link to Existing state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMedId, setSelectedMedId] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Decode scanned code (supports 1D EAN/UPC/Code128 and 2D GS1 DataMatrix)
  const parsed = useMemo(() => {
    if (!scannedCode) return null;
    return parseScannedCode(scannedCode, medicines);
  }, [scannedCode, medicines]);

  const effectiveBarcode = parsed?.barcode || scannedCode;

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSearchTerm('');
    setSelectedMedId('');

    if (outOfStockMedicine) {
      setActiveMode('short_book');
      setShortBookName(outOfStockMedicine.name);
      setShortBookStrength(`${outOfStockMedicine.strength} (${outOfStockMedicine.dosageForm})`);
      setShortBookSupplier(outOfStockMedicine.supplier || outOfStockMedicine.manufacturer || '');
      setShortBookPacks(String(Math.max(5, outOfStockMedicine.minThresholdPacks || 5)));
      setShortBookUrgent(true);
      return;
    }

    setActiveMode('list_new');

    const decodedName = parsed?.productName || '';
    const decodedStrength = parsed?.strength || '1 Pack';
    const decodedForm = parsed?.dosageForm || 'Tablet';
    const decodedCategory = parsed?.category || 'General / Other';
    const decodedUnits = parsed?.unitsPerPack && parsed.unitsPerPack > 0 ? parsed.unitsPerPack : 10;
    const decodedRetail =
      parsed?.unitRetailPrice && parsed.unitRetailPrice > 0 ? parsed.unitRetailPrice : 250;
    const decodedCost = Math.round(decodedRetail * 0.85 * 100) / 100;

    setQuickName(decodedName);
    setQuickGeneric(
      decodedName
        ? `${decodedName}${parsed?.dosageFormLabel ? ` (${parsed.dosageFormLabel})` : ''}`
        : ''
    );
    setQuickStrength(decodedStrength);
    setQuickDosageForm(decodedForm);
    setQuickCategory(decodedCategory);
    setQuickRetailPrice(String(decodedRetail));
    setQuickCostPrice(String(decodedCost));
    setQuickUnitsPerPack(String(decodedUnits));
    setQuickStockPacks('10');
    setQuickBatch(parsed?.batchNumber || `B-${Math.floor(100 + Math.random() * 900)}`);
    setQuickExpiry(parsed?.expiryDate || '2027-12-31');

    // Also pre-populate Short Book fields
    setShortBookName(decodedName || '');
    setShortBookStrength(
      decodedName && parsed?.strength
        ? `${parsed.strength}${parsed.dosageFormLabel ? ` (${parsed.dosageFormLabel})` : ''}`
        : `Barcode: ${effectiveBarcode}`
    );
    setShortBookSupplier('');
    setShortBookPacks('5');
    setShortBookUrgent(true);
  }, [isOpen, scannedCode, outOfStockMedicine, parsed, effectiveBarcode]);

  if (!isOpen) return null;

  const filteredMedicines = medicines.filter((m) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      m.barcode.toLowerCase().includes(q)
    );
  });

  // Handler 1: Quick List New Item & Immediately Dispense in POS
  const handleQuickListSubmit = async (e: React.FormEvent, sendToPos: boolean) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmedName = quickName.trim();
    if (!trimmedName) {
      soundService.errorTone();
      setErrorMsg('Please enter the medicine or product name to list it.');
      return;
    }

    setIsSavingQuickList(true);
    try {
      const units = Math.max(1, parseInt(quickUnitsPerPack, 10) || 1);
      const retail = Math.max(1, parseFloat(quickRetailPrice) || 0);
      const cost = Math.max(0, parseFloat(quickCostPrice) || Math.round(retail * 0.85));
      const packs = Math.max(1, parseInt(quickStockPacks, 10) || 1);

      const created = await syncEngine.addMedicine({
        name: trimmedName,
        genericName: quickGeneric.trim() || trimmedName,
        barcode: effectiveBarcode,
        sku: `MED-${Date.now().toString().slice(-6)}`,
        category: quickCategory,
        department: 'pharmacy',
        dosageForm: quickDosageForm,
        strength: quickStrength.trim() || 'Standard',
        unitsPerPack: units,
        unitCostPrice: cost,
        unitRetailPrice: retail,
        looseCostPrice: Number((cost / units).toFixed(2)),
        looseRetailPrice: Number((retail / units).toFixed(2)),
        currentStockPacks: packs,
        currentStockLoose: 0,
        minThresholdPacks: 5,
        batchNumber: quickBatch.trim() || 'B-101',
        expiryDate: quickExpiry || '2027-12-31',
        shelfLocation: 'Rack A-01',
        manufacturer: 'Local Pharma',
        requiresPrescription: false,
        supplier: 'Local Distributor',
        notes: parsed?.isGS1DataMatrix ? `Auto-listed via 2D DataMatrix scan` : `Listed via barcode scan`,
      });

      soundService.cashRegister();
      if (sendToPos) {
        onQuickListedAndDispense(created);
      } else {
        onLinked(created);
      }
      onClose();
    } catch (err: any) {
      soundService.errorTone();
      setErrorMsg(err?.message || 'Failed to list medicine in inventory.');
    } finally {
      setIsSavingQuickList(false);
    }
  };

  // Handler 2: Add to Counter Short Book (Want List)
  const handleAddToShortBook = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const finalName =
      shortBookName.trim() ||
      outOfStockMedicine?.name ||
      parsed?.productName ||
      `Unlisted Barcode (${effectiveBarcode})`;

    setIsSavingShortBook(true);
    try {
      const packs = Math.max(1, parseInt(shortBookPacks, 10) || 5);
      syncEngine.addToShortBook({
        itemName: finalName,
        strengthOrPack:
          shortBookStrength.trim() ||
          (effectiveBarcode ? `Barcode: ${effectiveBarcode}` : undefined),
        supplierName: shortBookSupplier.trim() || undefined,
        requestedPacks: packs,
        priority: shortBookUrgent ? 'urgent' : 'normal',
        addedBy: currentUserName,
        counterName: activeCounter,
        linkedMedicineId: outOfStockMedicine?.id,
      });

      soundService.cashRegister();
      onAddedToShortBook(finalName, packs);
      onClose();
    } catch (err: any) {
      soundService.errorTone();
      setErrorMsg(err?.message || 'Failed to add item to Short Book.');
    } finally {
      setIsSavingShortBook(false);
    }
  };

  // Handler 3: Restock an Out-of-Stock Listed Medicine & Send to POS
  const handleQuickRestockAndDispense = async () => {
    if (!outOfStockMedicine) return;
    setIsSavingQuickList(true);
    try {
      const updated = await syncEngine.updateMedicine(outOfStockMedicine.id, {
        currentStockPacks: Math.max(10, outOfStockMedicine.minThresholdPacks * 2 || 10),
      });
      soundService.cashRegister();
      onQuickListedAndDispense(updated);
      onClose();
    } catch (err: any) {
      soundService.errorTone();
      setErrorMsg(err?.message || 'Failed to restock medicine.');
    } finally {
      setIsSavingQuickList(false);
    }
  };

  // Handler 4: Link Barcode to Existing Catalog Medicine
  const handleLinkExisting = async () => {
    if (!selectedMedId) return;
    setIsLinking(true);
    setErrorMsg(null);
    try {
      const updated = await syncEngine.linkBarcode(selectedMedId, effectiveBarcode);
      soundService.cashRegister();
      if (getTotalPiecesInStock(updated) > 0) {
        onQuickListedAndDispense(updated);
      } else {
        onLinked(updated);
      }
      onClose();
    } catch (err: any) {
      soundService.errorTone();
      setErrorMsg(err?.message || 'Failed to link barcode to medicine.');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#072418] to-[#0c3927] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              {parsed?.isGS1DataMatrix ? (
                <QrCode className="w-4 h-4" />
              ) : (
                <PackagePlus className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white leading-tight">
                {outOfStockMedicine
                  ? 'Scanned Item is Out of Stock (0 Packs)'
                  : 'Scanned Barcode Not Listed in Stock'}
              </h3>
              <p className="text-[11px] text-emerald-200/85">
                {outOfStockMedicine
                  ? 'Add to Counter Short Book for reorder or restock immediately to dispense in POS'
                  : 'List this item in Medicine Stock, add it to the Counter Short Book, or link to existing'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Scanned Barcode / 2D DataMatrix Callout Banner */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-800 block">
                  {parsed?.isGS1DataMatrix ? 'Scanned 2D GS1 DataMatrix GTIN' : 'Scanned Barcode'}
                </span>
                <span className="font-mono text-sm font-black text-slate-900">
                  {effectiveBarcode}
                </span>
              </div>
              <span className="text-[11px] bg-amber-200/80 text-amber-950 px-2.5 py-0.5 rounded-lg font-bold">
                {outOfStockMedicine ? '0 Packs in Stock' : 'Not Listed in Catalog'}
              </span>
            </div>

            {/* If 2D GS1 DataMatrix was decoded, show extracted metadata */}
            {parsed?.isGS1DataMatrix && (
              <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-md">
                  2D Auto-Decoded
                </span>
                {parsed.productName && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 font-bold text-slate-900">
                    Name: {parsed.productName}
                  </span>
                )}
                {parsed.strength && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 font-mono text-slate-700">
                    Strength: {parsed.strength}
                  </span>
                )}
                {parsed.unitRetailPrice !== undefined && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 font-mono font-bold text-emerald-800">
                    MRP: Rs. {parsed.unitRetailPrice}
                  </span>
                )}
                {parsed.batchNumber && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 font-mono text-slate-600">
                    Batch: {parsed.batchNumber}
                  </span>
                )}
                {parsed.expiryDate && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 font-mono text-slate-600">
                    Exp: {parsed.expiryDate}
                  </span>
                )}
              </div>
            )}

            {/* If Out-of-Stock existing medicine, show quick restock banner */}
            {outOfStockMedicine && (
              <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900 text-xs">
                    {outOfStockMedicine.name} ({outOfStockMedicine.strength})
                  </span>
                  <span className="text-[11px] text-slate-600 block">
                    Retail: {formatPKR(outOfStockMedicine.unitRetailPrice)} &middot; Shelf:{' '}
                    {outOfStockMedicine.shelfLocation || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickRestockAndDispense}
                    disabled={isSavingQuickList}
                    className="px-3 py-1.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>+10 Packs &amp; Dispense in POS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenListMedicineModal(scannedCode, outOfStockMedicine);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-slate-800 font-bold text-[11px] transition cursor-pointer whitespace-nowrap"
                  >
                    Edit Stock
                  </button>
                </div>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 3-Option Segmented Switcher */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setActiveMode('list_new');
                soundService.click();
              }}
              className={`py-2 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeMode === 'list_new'
                  ? 'bg-[#083322] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5 shrink-0" />
              <span>1. List in Stock</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveMode('short_book');
                soundService.click();
              }}
              className={`py-2 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeMode === 'short_book'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
              <span>2. Add Short Book</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveMode('link_existing');
                soundService.click();
              }}
              className={`py-2 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeMode === 'link_existing'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span>3. Link Existing</span>
            </button>
          </div>

          {/* ============================================================== */}
          {/* MODE 1: LIST NEW ITEM IN STOCK (& OPTIONAL INSTANT POS DISPENSE) */}
          {/* ============================================================== */}
          {activeMode === 'list_new' && (
            <form
              onSubmit={(e) => handleQuickListSubmit(e, true)}
              className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-xs">
                    Quick List Product in Inventory
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Register this scanned barcode into stock and jump straight to POS
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenListMedicineModal(scannedCode, null);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Full Medicine Form</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Medicine / Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="e.g. Flutiaze Nasal Spray, Panadol..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Strength / Pack Size
                  </label>
                  <input
                    type="text"
                    value={quickStrength}
                    onChange={(e) => setQuickStrength(e.target.value)}
                    placeholder="e.g. 500mg, 120sp, 100ml"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Pack Retail (Rs.) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={quickRetailPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuickRetailPrice(val);
                      const num = parseFloat(val);
                      if (!isNaN(num) && num > 0) {
                        setQuickCostPrice(String(Math.round(num * 0.85 * 100) / 100));
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-mono tabular-nums font-bold text-emerald-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Pack Cost (Rs.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={quickCostPrice}
                    onChange={(e) => setQuickCostPrice(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-mono tabular-nums font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Units / Pack
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={quickUnitsPerPack}
                    onChange={(e) => setQuickUnitsPerPack(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-mono tabular-nums font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Stock Packs *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quickStockPacks}
                    onChange={(e) => setQuickStockPacks(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50/50 font-mono tabular-nums font-black text-emerald-950"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingQuickList}
                  onClick={(e) => handleQuickListSubmit(e, false)}
                  className="py-2.5 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                >
                  List in Stock Only
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickList}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4 text-emerald-300" />
                  <span>
                    {isSavingQuickList
                      ? 'Listing Item...'
                      : 'List Item & Add to POS Cart Automatically'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* MODE 2: ADD TO COUNTER SHORT BOOK (WANT LIST)                  */}
          {/* ============================================================== */}
          {activeMode === 'short_book' && (
            <form
              onSubmit={handleAddToShortBook}
              className="space-y-3 bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200"
            >
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-amber-700" />
                  <span>Add Unlisted / Out-of-Stock Item to Counter Short Book</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Record customer demand so this item is ordered from the distributor on the next visit.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7">
                  <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                    Medicine / Item Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={shortBookName}
                    onChange={(e) => setShortBookName(e.target.value)}
                    placeholder={`e.g. Requested medicine (${effectiveBarcode})`}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                    Strength / Barcode Note
                  </label>
                  <input
                    type="text"
                    value={shortBookStrength}
                    onChange={(e) => setShortBookStrength(e.target.value)}
                    placeholder="e.g. 500mg or Barcode"
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                    Supplier / Distributor (Optional)
                  </label>
                  <input
                    type="text"
                    value={shortBookSupplier}
                    onChange={(e) => setShortBookSupplier(e.target.value)}
                    placeholder="e.g. Muller & Phipps, Multan Dist..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                    Packs to Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={shortBookPacks}
                    onChange={(e) => setShortBookPacks(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-amber-300 bg-white font-mono tabular-nums font-bold text-slate-900"
                  />
                </div>

                <div className="sm:col-span-4">
                  <button
                    type="button"
                    onClick={() => setShortBookUrgent(!shortBookUrgent)}
                    className={`w-full py-1.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      shortBookUrgent
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <span>{shortBookUrgent ? 'Urgent Priority' : 'Normal Priority'}</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingShortBook}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {isSavingShortBook ? 'Saving...' : 'Add to Counter Short Book'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* MODE 3: LINK BARCODE TO EXISTING MEDICINE IN CATALOG           */}
          {/* ============================================================== */}
          {activeMode === 'link_existing' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search existing medicine name, formula, or SKU to attach barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                  autoFocus
                />
              </div>

              <div className="max-h-52 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/30">
                {filteredMedicines.length === 0 ? (
                  <div className="py-6 text-center text-slate-400">
                    No matching medicines found in catalog.
                  </div>
                ) : (
                  filteredMedicines.map((m) => {
                    const isSelected = selectedMedId === m.id;
                    const inStock = getTotalPiecesInStock(m) > 0;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMedId(m.id)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{m.name}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                                inStock
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {m.currentStockPacks}p stock
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {m.genericName} &bull; {m.strength} &bull; {formatPKR(m.unitRetailPrice)}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLinkExisting}
                  disabled={!selectedMedId || isLinking}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isLinking ? 'Linking...' : 'Link Barcode & Open in POS'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
