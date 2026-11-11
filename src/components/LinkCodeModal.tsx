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

interface FuzzyMedicineSuggestion {
  medicine: MedicineItem;
  score: number; // 0 - 100
  matchReason: string;
}

const PHARMA_STOP_WORDS = new Set([
  'tablet',
  'tablets',
  'tab',
  'tabs',
  'capsule',
  'capsules',
  'cap',
  'caps',
  'syrup',
  'syp',
  'suspension',
  'susp',
  'drops',
  'drop',
  'injection',
  'inj',
  'spray',
  'nasal',
  'cream',
  'ointment',
  'gel',
  'sachet',
  'pack',
  'packof',
  'oral',
  'solution',
  'liquid',
  'infusion',
  'inhaler',
]);

function normalizeProductString(input: string): string {
  return input
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCoreTokens(input: string): string[] {
  const norm = normalizeProductString(input);
  if (!norm) return [];
  return norm
    .split(' ')
    .filter(
      (t) =>
        t.length >= 2 &&
        !PHARMA_STOP_WORDS.has(t) &&
        !/^\d+(mg|ml|mcg|g|iu|sp|s)?$/i.test(t)
    );
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function diceCoefficient(a: string, b: string): number {
  const s1 = a.replace(/\s+/g, '').toLowerCase();
  const s2 = b.replace(/\s+/g, '').toLowerCase();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (s1.length - 1 + (s2.length - 1));
}

function computeFuzzyMedicineMatch(
  queryName: string,
  queryStrength: string,
  queryDosageForm: string | undefined,
  scannedBarcode: string,
  med: MedicineItem
): FuzzyMedicineSuggestion | null {
  const cleanQuery = queryName.trim();
  const queryTokens = extractCoreTokens(cleanQuery);
  const medNameTokens = extractCoreTokens(med.name);
  const medGenericTokens = extractCoreTokens(med.genericName || '');

  let bestScore = 0;
  let reason = '';

  if (queryTokens.length > 0 && medNameTokens.length > 0) {
    const primaryQueryBrand = queryTokens[0];
    const primaryMedBrand = medNameTokens[0];

    // 1. Exact or Prefix Brand Token Match
    if (primaryQueryBrand === primaryMedBrand && primaryQueryBrand.length >= 3) {
      bestScore = 84;
      reason = 'Exact brand name match';
    } else if (
      primaryQueryBrand.length >= 4 &&
      primaryMedBrand.length >= 4 &&
      (primaryMedBrand.startsWith(primaryQueryBrand) ||
        primaryQueryBrand.startsWith(primaryMedBrand))
    ) {
      bestScore = 76;
      reason = 'Brand prefix match';
    }

    // 2. Levenshtein Similarity on primary brand word (catches typos / OCR / GS1 abbreviations)
    const brandMaxLen = Math.max(primaryQueryBrand.length, primaryMedBrand.length);
    if (brandMaxLen >= 4) {
      const dist = levenshteinDistance(primaryQueryBrand, primaryMedBrand);
      const brandLevRatio = 1 - dist / brandMaxLen;
      const levScore = Math.round(brandLevRatio * 88);
      if (levScore > bestScore && dist <= Math.ceil(brandMaxLen * 0.35)) {
        bestScore = levScore;
        reason = dist <= 1 ? 'Near-exact brand spelling match' : 'Fuzzy brand name match';
      }
    }

    // 3. Sørensen-Dice bigram similarity across full core name & generic formula
    const queryJoined = queryTokens.join(' ');
    const medJoined = medNameTokens.join(' ');
    const diceName = diceCoefficient(queryJoined, medJoined);
    const diceScore = Math.round(diceName * 86);
    if (diceScore > bestScore && diceName >= 0.48) {
      bestScore = diceScore;
      reason = 'Similar product name';
    }

    if (medGenericTokens.length > 0) {
      const genericJoined = medGenericTokens.join(' ');
      const diceGen = diceCoefficient(queryJoined, genericJoined);
      const genScore = Math.round(diceGen * 78);
      if (genScore > bestScore && diceGen >= 0.52) {
        bestScore = genScore;
        reason = 'Matches generic formula';
      }
    }

    // 4. Multi-token overlap boost
    const sharedTokens = queryTokens.filter((qt) =>
      medNameTokens.some(
        (mt) =>
          mt === qt ||
          (qt.length >= 4 && mt.length >= 4 && levenshteinDistance(qt, mt) <= 1)
      )
    );
    if (sharedTokens.length >= 2) {
      bestScore = Math.min(96, Math.max(bestScore, 80) + sharedTokens.length * 4);
      reason = 'Multi-word product match';
    }

    // 5. Strength & Dosage Form alignment boost
    if (bestScore >= 52) {
      const normQueryStrength = queryStrength.replace(/\s+/g, '').toLowerCase();
      const normMedStrength = (med.strength || '').replace(/\s+/g, '').toLowerCase();
      if (
        normQueryStrength &&
        normMedStrength &&
        normQueryStrength !== '1pack' &&
        normQueryStrength !== 'standard' &&
        (normMedStrength.includes(normQueryStrength) ||
          normQueryStrength.includes(normMedStrength))
      ) {
        bestScore = Math.min(99, bestScore + 10);
        reason = `${reason} + strength (${med.strength})`;
      }
      if (
        queryDosageForm &&
        med.dosageForm &&
        queryDosageForm.toLowerCase() === med.dosageForm.toLowerCase()
      ) {
        bestScore = Math.min(99, bestScore + 4);
      }
    }
  }

  // 6. Barcode near-match / manufacturer prefix fallback (when barcode is numeric or close to existing barcode)
  const cleanScannedCode = scannedBarcode.trim();
  const cleanMedBarcode = (med.barcode || '').trim();
  if (cleanScannedCode.length >= 6 && cleanMedBarcode.length >= 6 && cleanScannedCode !== cleanMedBarcode) {
    const codeDist = levenshteinDistance(cleanScannedCode, cleanMedBarcode);
    if (codeDist <= 2 && Math.abs(cleanScannedCode.length - cleanMedBarcode.length) <= 1) {
      const codeScore = codeDist === 1 ? 78 : 66;
      if (codeScore > bestScore) {
        bestScore = codeScore;
        reason = `Similar barcode (${codeDist} digit diff)`;
      }
    } else if (
      bestScore >= 50 &&
      cleanScannedCode.slice(0, 7) === cleanMedBarcode.slice(0, 7)
    ) {
      bestScore = Math.min(98, bestScore + 6);
      reason = `${reason} + same manufacturer GTIN prefix`;
    }
  }

  if (bestScore < 52) return null;

  return {
    medicine: med,
    score: Math.min(99, bestScore),
    matchReason: reason || 'Fuzzy catalog match',
  };
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

  // Extract a candidate product name from 2D scan, alphanumeric barcode/SKU, or typed input
  const candidateFuzzyQuery = useMemo(() => {
    if (searchTerm.trim().length >= 2) return searchTerm.trim();
    if (quickName.trim().length >= 2) return quickName.trim();
    if (parsed?.productName && parsed.productName.trim().length >= 2) {
      return parsed.productName.trim();
    }
    // Check if the raw scanned code contains alphabetic brand letters (e.g. SKU / internal label)
    const alphaChunks = (scannedCode || '')
      .replace(/[^a-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (alphaChunks.length >= 3) return alphaChunks;
    return '';
  }, [searchTerm, quickName, parsed?.productName, scannedCode]);

  // Automatically compute fuzzy matches against existing catalog medicines
  const fuzzySuggestions = useMemo<FuzzyMedicineSuggestion[]>(() => {
    if (outOfStockMedicine) return [];
    const results: FuzzyMedicineSuggestion[] = [];
    const strengthHint = quickStrength || parsed?.strength || '';
    const formHint = parsed?.dosageForm || quickDosageForm;

    for (const med of medicines) {
      const suggestion = computeFuzzyMedicineMatch(
        candidateFuzzyQuery,
        strengthHint,
        formHint,
        effectiveBarcode,
        med
      );
      if (suggestion) {
        results.push(suggestion);
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [
    outOfStockMedicine,
    medicines,
    candidateFuzzyQuery,
    quickStrength,
    parsed?.strength,
    parsed?.dosageForm,
    quickDosageForm,
    effectiveBarcode,
  ]);

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

  // Auto-select the top fuzzy suggestion for quick linking if none is manually selected yet
  useEffect(() => {
    if (!isOpen || outOfStockMedicine) return;
    if (!selectedMedId && fuzzySuggestions.length > 0) {
      setSelectedMedId(fuzzySuggestions[0].medicine.id);
    }
  }, [isOpen, outOfStockMedicine, fuzzySuggestions, selectedMedId]);

  if (!isOpen) return null;

  const fuzzyScoreByMedId = new Map<string, FuzzyMedicineSuggestion>(
    fuzzySuggestions.map((s) => [s.medicine.id, s])
  );

  const filteredMedicines = medicines
    .filter((m) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      if (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.barcode.toLowerCase().includes(q)
      ) {
        return true;
      }
      return fuzzyScoreByMedId.has(m.id);
    })
    .sort((a, b) => {
      const scoreA = fuzzyScoreByMedId.get(a.id)?.score || 0;
      const scoreB = fuzzyScoreByMedId.get(b.id)?.score || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.localeCompare(b.name);
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

  // Handler 4: Link Barcode (and optionally update decoded batch/expiry/MRP) to an Existing Catalog Medicine
  const handleLinkAndUpdateMedicine = async (
    targetMed: MedicineItem,
    updateScannedDetails: boolean
  ) => {
    setIsLinking(true);
    setErrorMsg(null);
    try {
      const patch: Partial<MedicineItem> = {
        barcode: effectiveBarcode,
      };

      if (updateScannedDetails && parsed) {
        if (parsed.batchNumber) patch.batchNumber = parsed.batchNumber;
        if (parsed.expiryDate) patch.expiryDate = parsed.expiryDate;
        if (parsed.unitRetailPrice && parsed.unitRetailPrice > 0) {
          const units =
            parsed.unitsPerPack && parsed.unitsPerPack > 0
              ? parsed.unitsPerPack
              : targetMed.unitsPerPack || 1;
          patch.unitRetailPrice = parsed.unitRetailPrice;
          patch.looseRetailPrice = Number((parsed.unitRetailPrice / units).toFixed(2));
        }
        if (parsed.unitsPerPack && parsed.unitsPerPack > 0) {
          patch.unitsPerPack = parsed.unitsPerPack;
        }
      }

      const updated = await syncEngine.updateMedicine(targetMed.id, patch);
      soundService.cashRegister();
      if (getTotalPiecesInStock(updated) > 0) {
        onQuickListedAndDispense(updated);
      } else {
        onLinked(updated);
      }
      onClose();
    } catch (err: any) {
      soundService.errorTone();
      setErrorMsg(err?.message || 'Failed to link and update medicine.');
    } finally {
      setIsLinking(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!selectedMedId) return;
    const targetMed = medicines.find((m) => m.id === selectedMedId);
    if (!targetMed) return;
    await handleLinkAndUpdateMedicine(targetMed, Boolean(parsed?.isGS1DataMatrix));
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

          {/* Automatic Fuzzy Match Suggestions Card */}
          {!outOfStockMedicine && fuzzySuggestions.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="text-[11px] font-extrabold text-emerald-950">
                    Possible Catalog Matches Found ({fuzzySuggestions.length})
                  </span>
                </div>
                {candidateFuzzyQuery && (
                  <span className="text-[10px] font-mono text-emerald-800 bg-white/90 px-2 py-0.5 rounded-md border border-emerald-200">
                    Matched against: &ldquo;{candidateFuzzyQuery}&rdquo;
                  </span>
                )}
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                {fuzzySuggestions.slice(0, 3).map(({ medicine: sugMed, score, matchReason }) => {
                  const hasStock = getTotalPiecesInStock(sugMed) > 0;
                  return (
                    <div
                      key={sugMed.id}
                      className="p-2 rounded-lg bg-white border border-emerald-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-xs truncate">
                            {sugMed.name}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-slate-600">
                            ({sugMed.strength})
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-mono font-extrabold text-[10px]">
                            {score}% Match
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold ${
                              hasStock
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {sugMed.currentStockPacks}p stock
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-emerald-700 font-semibold">{matchReason}</span>
                          <span>&bull;</span>
                          <span className="font-mono">{formatPKR(sugMed.unitRetailPrice)}</span>
                          {sugMed.barcode && (
                            <>
                              <span>&bull;</span>
                              <span className="font-mono text-slate-400">
                                Current Code: {sugMed.barcode}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isLinking}
                          onClick={() => handleLinkAndUpdateMedicine(sugMed, true)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                          title="Attach this scanned barcode and update decoded batch/expiry/MRP on this product"
                        >
                          <Link2 className="w-3 h-3 text-emerald-300" />
                          <span>{hasStock ? 'Link & Dispense' : 'Link & Update'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenListMedicineModal(scannedCode, sugMed);
                          }}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[10px] transition cursor-pointer whitespace-nowrap"
                          title="Open full product editor pre-filled with this medicine and the newly scanned barcode"
                        >
                          Edit &amp; Update
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              <span>
                3. Link Existing
                {fuzzySuggestions.length > 0 ? ` (${fuzzySuggestions.length})` : ''}
              </span>
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
                    const fuzzyMatch = fuzzyScoreByMedId.get(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMedId(m.id)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                            : fuzzyMatch
                              ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                            <span>{m.name}</span>
                            {fuzzyMatch && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 text-[10px] font-mono font-extrabold">
                                {fuzzyMatch.score}% Match
                              </span>
                            )}
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
                            {fuzzyMatch ? ` • ${fuzzyMatch.matchReason}` : ''}
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

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedMedId || isLinking}
                  onClick={() => {
                    const targetMed = medicines.find((m) => m.id === selectedMedId);
                    if (!targetMed) return;
                    onClose();
                    onOpenListMedicineModal(scannedCode, targetMed);
                  }}
                  className="py-2.5 px-3.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold disabled:opacity-50 cursor-pointer"
                >
                  Edit &amp; Update Product
                </button>
                <button
                  type="button"
                  onClick={handleLinkExisting}
                  disabled={!selectedMedId || isLinking}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
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
