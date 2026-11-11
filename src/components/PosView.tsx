import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  Receipt,
  Search,
  CreditCard,
  Banknote,
  Smartphone,
  Camera,
  AlertCircle,
  Percent,
  Sparkles,
  Users,
  Heart,
  Baby,
  ShoppingBag,
  Pill,
  ClipboardList,
  Check,
  X,
  RotateCcw,
  ScanLine,
  Printer,
  LayoutGrid,
  List,
  Clock,
  ChevronLeft,
  ChevronRight,
  Tag,
} from 'lucide-react';
import {
  MedicineItem,
  PaymentMethod,
  SaleItem,
  SaleTransaction,
  UserAccount,
} from '../types/pharmacy';
import {
  formatPKR,
  getDaysUntilExpiry,
  getDiscountedPackPrice,
  getDiscountedPiecePrice,
  getEarliestActiveBatch,
  getExpiryBadgeMeta,
  getMedicineStockBatches,
  getNearExpiryBatches,
  getPieceRetailPrice,
  getPieceUnitName,
  getSpecialDiscountPercent,
  getTotalPiecesInStock,
  getUnitsPerPack,
  hasSpecialDiscount,
  isExpired,
  isExpiringSoon,
} from '../utils/pharmacyHelpers';
import { findSaleByReceiptCode, parseScannedCode } from '../utils/codeParser';
import { formatDateTime, isToday } from '../utils/dates';
import { generateInvoiceBarcodeSvg } from '../utils/receiptTemplate';
import { soundService } from '../services/soundAlerts';
import { syncEngine } from '../services/syncEngine';

const POS_RETURN_REASONS = [
  'Customer return / Changed mind',
  'Doctor changed prescription',
  'Wrong strength or item dispensed',
  'Damaged packaging / Near expiry exchange',
];

interface PosViewProps {
  medicines: MedicineItem[];
  currentUser: UserAccount;
  onProcessSale: (saleData: {
    items: SaleItem[];
    customerName: string;
    customerPhone?: string;
    customerId?: string;
    counterName?: string;
    staffName: string;
    staffRole: any;
    paymentMethod: PaymentMethod;
    discountPercent: number;
    discountAmount?: number;
    receivedAmount: number;
    notes?: string;
  }) => Promise<SaleTransaction>;
  onOpenScanner: () => void;
  onSaleCompleted: (txn: SaleTransaction) => void;
  externalScannedItem?: { medicine: MedicineItem; scanId: number } | null;
  onExternalScanConsumed?: () => void;
  externalScannedReceipt?: { transaction: SaleTransaction; scanId: number } | null;
  onExternalReceiptScanConsumed?: () => void;
  onUnrecognizedBarcode?: (code: string) => void;
}

export const PosView: React.FC<PosViewProps> = ({
  medicines,
  currentUser,
  onProcessSale,
  onOpenScanner,
  onSaleCompleted,
  externalScannedItem,
  onExternalScanConsumed,
  externalScannedReceipt,
  onExternalReceiptScanConsumed,
  onUnrecognizedBarcode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [posDepartment, setPosDepartment] = useState<string>('all');
  const [catalogViewMode, setCatalogViewMode] = useState<'grid' | 'compact'>('grid');
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const [showAllCatalog, setShowAllCatalog] = useState<boolean>(false);

  const [cart, setCart] = useState<SaleItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('zahid_pos_active_cart_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('zahid_pos_active_cart_v1', JSON.stringify(cart));
    } catch {
      // ignore storage errors
    }
  }, [cart]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'percent' | 'pkr'>('percent');
  const [customDiscountPkr, setCustomDiscountPkr] = useState<string>('');
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Counter Short Book (Want List) 2-second quick-add state
  const [shortBookBanner, setShortBookBanner] = useState<string | null>(null);
  const [showShortBookDrawer, setShowShortBookDrawer] = useState(false);
  const [customShortName, setCustomShortName] = useState('');
  const [customShortStrength, setCustomShortStrength] = useState('');
  const [customShortPacks, setCustomShortPacks] = useState('5');
  const [customShortUrgent, setCustomShortUrgent] = useState(false);
  const [shortBookList, setShortBookList] = useState(() => syncEngine.getShortBook());

  // Counter Receipt Return / Refund by Barcode or Invoice # state
  const [salesList, setSalesList] = useState<SaleTransaction[]>(() => syncEngine.getSales());
  const [recentActivityFilter, setRecentActivityFilter] = useState<'all' | 'completed' | 'credit' | 'refunded'>('all');
  const [showReceiptReturnDrawer, setShowReceiptReturnDrawer] = useState(false);
  const [receiptLookupInput, setReceiptLookupInput] = useState('');
  const [matchedReceiptForReturn, setMatchedReceiptForReturn] =
    useState<SaleTransaction | null>(null);
  const [returnLookupError, setReturnLookupError] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState<string>(POS_RETURN_REASONS[0]);
  const [returnCustomNote, setReturnCustomNote] = useState<string>('');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [returnSuccessBanner, setReturnSuccessBanner] = useState<string | null>(null);

  const [scanFlash, setScanFlash] = useState<{
    id: number;
    label: string;
    variant: 'emerald' | 'rose';
  } | null>(null);
  const scanFlashTimerRef = useRef<number | null>(null);

  const triggerScanFlash = useCallback(
    (label: string, variant: 'emerald' | 'rose' = 'emerald') => {
      if (scanFlashTimerRef.current !== null) {
        window.clearTimeout(scanFlashTimerRef.current);
      }
      setScanFlash({
        id: Date.now(),
        label,
        variant,
      });
      scanFlashTimerRef.current = window.setTimeout(() => {
        setScanFlash(null);
        scanFlashTimerRef.current = null;
      }, 900);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (scanFlashTimerRef.current !== null) {
        window.clearTimeout(scanFlashTimerRef.current);
      }
    };
  }, []);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const receiptScanInputRef = useRef<HTMLInputElement>(null);
  const returnDrawerRef = useRef<HTMLDivElement>(null);
  const recentSalesWidgetRef = useRef<HTMLDivElement>(null);
  const activeCounter = syncEngine.getActiveCounter();
  const khataCustomers = syncEngine.getKhataCustomers();

  const itemsPerPage = catalogViewMode === 'grid' ? 6 : 8;

  useEffect(() => {
    const unsub = syncEngine.subscribe(() => {
      setShortBookList(syncEngine.getShortBook());
      setSalesList(syncEngine.getSales());
    });
    return unsub;
  }, []);

  const handleQuickAddShortBook = (opts: {
    itemName: string;
    strengthOrPack?: string;
    supplierName?: string;
    requestedPacks?: number;
    priority?: 'normal' | 'urgent';
    linkedMedicineId?: string;
  }) => {
    if (!opts.itemName.trim()) return;
    const { entry, incrementedExisting } = syncEngine.addToShortBook({
      ...opts,
      addedBy: currentUser.name,
      counterName: activeCounter,
    });
    setShortBookList(syncEngine.getShortBook());
    soundService.cashRegister();
    setShortBookBanner(
      incrementedExisting
        ? `Updated "${entry.itemName}" in Short Book — Asked ${entry.requestCount}x (${entry.requestedPacks} packs to order)`
        : `Added "${entry.itemName}" (+${entry.requestedPacks} packs) to Counter Short Book!`
    );
    setTimeout(() => {
      setShortBookBanner(null);
    }, 4500);
  };

  const handleCustomShortBookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customShortName.trim()) return;
    handleQuickAddShortBook({
      itemName: customShortName.trim(),
      strengthOrPack: customShortStrength.trim() || undefined,
      requestedPacks: Math.max(1, parseInt(customShortPacks, 10) || 5),
      priority: customShortUrgent ? 'urgent' : 'normal',
    });
    setCustomShortName('');
    setCustomShortStrength('');
    setCustomShortPacks('5');
    setCustomShortUrgent(false);
  };

  // F2 focus shortcut for fast counter dispensing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Helper: Total pieces already in cart for a specific medicine
   * (Accounts for both 'pack' and 'loose' rows of the same medicine)
   */
  const getCartPiecesForMedicine = (
    cartItems: SaleItem[],
    medId: string,
    excludeIndex = -1
  ): number => {
    return cartItems.reduce((sum, item, idx) => {
      if (idx === excludeIndex || item.medicineId !== medId) return sum;
      const unitsPerPack = Math.max(1, item.unitsPerPack || 1);
      return (
        sum + (item.unitType === 'pack' ? item.quantity * unitsPerPack : item.quantity)
      );
    }, 0);
  };

  const addToCart = useCallback(
    (
      med: MedicineItem,
      unitType: 'pack' | 'loose' = 'pack',
      forceSpecialDiscount = false
    ) => {
      setErrorNotice(null);

      // Determine FEFO active stock batch entry
      const activeBatch = getEarliestActiveBatch(med);
      const effectiveBatchNumber = activeBatch?.batchNumber || med.batchNumber;
      const effectiveExpiryDate = activeBatch?.expiryDate || med.expiryDate;

      // 1. Block expired medicines immediately
      if (effectiveExpiryDate && isExpired(effectiveExpiryDate)) {
        soundService.errorTone();
        setErrorNotice(
          `Cannot dispense expired medicine: ${med.name} (Batch ${effectiveBatchNumber} · Expired: ${effectiveExpiryDate})`
        );
        return;
      }

      const unitsPerPack = getUnitsPerPack(med);
      const addedPieces = unitType === 'pack' ? unitsPerPack : 1;
      const availablePieces = getTotalPiecesInStock(med);

      let stockError: string | null = null;

      setCart((prevCart) => {
        const currentCartPieces = getCartPiecesForMedicine(prevCart, med.id);
        if (currentCartPieces + addedPieces > availablePieces) {
          stockError = `Insufficient stock for ${med.name}. Only ${med.currentStockPacks} packs (${availablePieces} total units) available.`;
          return prevCart;
        }

        const existingIndex = prevCart.findIndex(
          (item) => item.medicineId === med.id && item.unitType === unitType
        );

        const basePrice =
          unitType === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
        const cost =
          unitType === 'pack'
            ? med.unitCostPrice
            : med.looseCostPrice ||
              Number((med.unitCostPrice / unitsPerPack).toFixed(2));

        const specialPct = getSpecialDiscountPercent(med);
        const minPacks = Math.max(1, med.specialDiscountMinPacks || 1);

        if (existingIndex > -1) {
          const updated = [...prevCart];
          const nextQty = updated[existingIndex].quantity + 1;
          const shouldApplySpecial =
            specialPct > 0 &&
            (forceSpecialDiscount ||
              Boolean(updated[existingIndex].specialDiscountPercent) ||
              (unitType === 'pack' && nextQty >= minPacks));

          const effectivePrice = shouldApplySpecial
            ? unitType === 'pack'
              ? getDiscountedPackPrice(med)
              : getDiscountedPiecePrice(med)
            : basePrice;

          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: nextQty,
            pricePerUnit: effectivePrice,
            originalPricePerUnit: shouldApplySpecial ? basePrice : undefined,
            specialDiscountPercent: shouldApplySpecial ? specialPct : undefined,
            subtotal: Number((nextQty * effectivePrice).toFixed(2)),
            profit: Number(((effectivePrice - cost) * nextQty).toFixed(2)),
          };
          return updated;
        } else {
          const shouldApplySpecial =
            specialPct > 0 &&
            (forceSpecialDiscount || (unitType === 'pack' && 1 >= minPacks));

          const effectivePrice = shouldApplySpecial
            ? unitType === 'pack'
              ? getDiscountedPackPrice(med)
              : getDiscountedPiecePrice(med)
            : basePrice;

          const newItem: SaleItem = {
            medicineId: med.id,
            medicineName: med.name,
            genericName: med.genericName,
            dosageForm: med.dosageForm,
            unitType,
            unitsPerPack,
            quantity: 1,
            pricePerUnit: effectivePrice,
            originalPricePerUnit: shouldApplySpecial ? basePrice : undefined,
            specialDiscountPercent: shouldApplySpecial ? specialPct : undefined,
            costPerUnit: cost,
            subtotal: effectivePrice,
            profit: Number((effectivePrice - cost).toFixed(2)),
            batchNumber: effectiveBatchNumber,
            expiryDate: effectiveExpiryDate,
          };
          return [...prevCart, newItem];
        }
      });

      if (stockError) {
        soundService.errorTone();
        setErrorNotice(stockError);
      } else {
        soundService.click();
      }
    },
    []
  );

  const changeItemBatch = (index: number, batchNumber: string, expiryDate: string) => {
    if (expiryDate && isExpired(expiryDate)) {
      soundService.errorTone();
      setErrorNotice(
        `Cannot select expired batch ${batchNumber} (Expired: ${expiryDate}).`
      );
      return;
    }
    setErrorNotice(null);
    setCart((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = {
        ...next[index],
        batchNumber,
        expiryDate,
      };
      return next;
    });
    soundService.click();
  };

  // Consume external hardware gun or camera barcode scans
  useEffect(() => {
    if (externalScannedItem) {
      console.log('[PosView] Consuming externalScannedItem:', {
        scanId: externalScannedItem.scanId,
        medicine: externalScannedItem.medicine.name,
        barcode: externalScannedItem.medicine.barcode,
      });
      setSearchQuery('');
      addToCart(externalScannedItem.medicine, 'pack');
      triggerScanFlash(
        `${externalScannedItem.medicine.name} (${externalScannedItem.medicine.strength})`,
        'emerald'
      );
      onExternalScanConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalScannedItem, addToCart, triggerScanFlash]);

  // Consume external receipt barcode scans (from Camera Scanner or global Hardware Gun)
  useEffect(() => {
    if (externalScannedReceipt) {
      setShowReceiptReturnDrawer(true);
      setShowShortBookDrawer(false);
      setMatchedReceiptForReturn(externalScannedReceipt.transaction);
      setReceiptLookupInput(externalScannedReceipt.transaction.invoiceNumber);
      setReturnLookupError(null);
      triggerScanFlash(
        `Receipt #${externalScannedReceipt.transaction.invoiceNumber}`,
        'rose'
      );
      onExternalReceiptScanConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalScannedReceipt, triggerScanFlash]);

  const handleLookupReceipt = (rawQuery?: string) => {
    const query = (rawQuery ?? receiptLookupInput).trim();
    setReturnLookupError(null);
    if (!query) {
      setReturnLookupError('Please scan the receipt barcode or enter the Invoice #.');
      return;
    }

    const latestSales = syncEngine.getSales();
    setSalesList(latestSales);
    const found = findSaleByReceiptCode(query, latestSales);
    if (found) {
      soundService.scanSuccess();
      setMatchedReceiptForReturn(found);
      setReceiptLookupInput(found.invoiceNumber);
      setReturnLookupError(null);
    } else {
      soundService.errorTone();
      setMatchedReceiptForReturn(null);
      setReturnLookupError(
        `No sale receipt found matching "${query}". Check the Invoice # (e.g. ZMS-2026... or last 4 digits).`
      );
    }
  };

  const handleInitiateReturnFromActivity = (txn: SaleTransaction) => {
    soundService.click();
    setShowReceiptReturnDrawer(true);
    setShowShortBookDrawer(false);
    setMatchedReceiptForReturn(txn);
    setReceiptLookupInput(txn.invoiceNumber);
    setReturnLookupError(null);
    setTimeout(() => {
      returnDrawerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleProcessCounterReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedReceiptForReturn || matchedReceiptForReturn.status === 'refunded') return;
    setIsProcessingReturn(true);
    setReturnLookupError(null);

    try {
      const finalReason = returnCustomNote.trim()
        ? `${returnReason} - ${returnCustomNote.trim()}`
        : returnReason;
      const updated = await syncEngine.refundSale(
        matchedReceiptForReturn.id,
        currentUser.name,
        finalReason
      );
      soundService.cashRegister();
      setMatchedReceiptForReturn(updated);
      setReturnCustomNote('');
      setReturnSuccessBanner(
        `Processed Return for Invoice #${updated.invoiceNumber} (${formatPKR(
          updated.totalAmount
        )}) — Stock restored to shelf!`
      );
      setTimeout(() => setReturnSuccessBanner(null), 6000);
    } catch (err: any) {
      soundService.errorTone();
      setReturnLookupError(err?.message || 'Failed to process receipt return.');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  // Department helper
  const matchesDepartment = useCallback((m: MedicineItem, dept: string) => {
    if (dept === 'all') return true;
    if (dept === 'personal_care') {
      return (
        m.department === 'personal_care' ||
        m.category === 'Personal Care & Sexual Wellness' ||
        m.category === 'Feminine Hygiene & Care' ||
        m.category === 'Personal Hygiene & Grooming'
      );
    }
    if (dept === 'mother_baby') {
      return m.department === 'mother_baby' || m.category === 'Baby & Mother Care';
    }
    if (dept === 'general_store') {
      return m.department === 'general_store' || m.category === 'General Store & FMCG';
    }
    if (dept === 'surgical') {
      return m.department === 'surgical' || m.category === 'Medical Devices & Surgical';
    }
    if (dept === 'pharmacy') {
      const isOther =
        m.department === 'personal_care' ||
        m.department === 'mother_baby' ||
        m.department === 'general_store' ||
        m.department === 'surgical' ||
        m.category === 'Personal Care & Sexual Wellness' ||
        m.category === 'Baby & Mother Care' ||
        m.category === 'General Store & FMCG' ||
        m.category === 'Medical Devices & Surgical';
      return !isOther;
    }
    return true;
  }, []);

  // In-stock valid medicines base list
  const inStockValidMedicines = useMemo(
    () =>
      medicines.filter(
        (m) => getTotalPiecesInStock(m) > 0 && !isExpired(m.expiryDate)
      ),
    [medicines]
  );

  // Department counts for pills
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: inStockValidMedicines.length,
      pharmacy: 0,
      personal_care: 0,
      mother_baby: 0,
      general_store: 0,
      surgical: 0,
    };
    inStockValidMedicines.forEach((m) => {
      if (matchesDepartment(m, 'pharmacy')) counts.pharmacy += 1;
      if (matchesDepartment(m, 'personal_care')) counts.personal_care += 1;
      if (matchesDepartment(m, 'mother_baby')) counts.mother_baby += 1;
      if (matchesDepartment(m, 'general_store')) counts.general_store += 1;
      if (matchesDepartment(m, 'surgical')) counts.surgical += 1;
    });
    return counts;
  }, [inStockValidMedicines, matchesDepartment]);

  // Available medicines for fast catalog select (excludes out-of-stock and expired items)
  const availableMedicines = useMemo(() => {
    const rawTrimmed = searchQuery.trim();
    const q = rawTrimmed.toLowerCase();
    // If search query looks like a 2D GS1 DataMatrix string, extract its GTIN/product name for live filtering
    const gs1Parsed =
      rawTrimmed.length >= 16 && /^(\(01\)|01)\d{14}/.test(rawTrimmed)
        ? parseScannedCode(rawTrimmed, inStockValidMedicines)
        : null;

    return inStockValidMedicines.filter((m) => {
      if (!matchesDepartment(m, posDepartment)) return false;
      if (!q) return true;

      if (gs1Parsed?.matchedMedicine && gs1Parsed.matchedMedicine.id === m.id) {
        return true;
      }
      if (
        gs1Parsed?.productName &&
        m.name.toLowerCase().includes(gs1Parsed.productName.toLowerCase())
      ) {
        return true;
      }

      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.barcode.toLowerCase().includes(q) ||
        (m.barcode.length >= 8 && q.includes(m.barcode.toLowerCase())) ||
        m.sku.toLowerCase().includes(q) ||
        (m.category && m.category.toLowerCase().includes(q))
      );
    });
  }, [inStockValidMedicines, matchesDepartment, posDepartment, searchQuery]);

  // Paginated or full catalog slice (6 items in Grid = 3 clean rows; 8 items in Compact)
  const totalPages = Math.max(1, Math.ceil(availableMedicines.length / itemsPerPage));
  const safeCatalogPage = Math.min(catalogPage, totalPages);
  const displayedMedicines = useMemo(() => {
    if (showAllCatalog || searchQuery.trim().length > 0) {
      return availableMedicines;
    }
    const start = (safeCatalogPage - 1) * itemsPerPage;
    return availableMedicines.slice(start, start + itemsPerPage);
  }, [availableMedicines, safeCatalogPage, showAllCatalog, searchQuery, itemsPerPage]);

  // Handle Enter key inside the POS search box (for barcode guns or fast Enter dispensing)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      const raw = searchQuery.trim();
      const parsed = parseScannedCode(raw, medicines, salesList);

      // 1. If the cashier scanned a Receipt Barcode or typed an Invoice # in POS search
      if (parsed.matchedSale) {
        soundService.scanSuccess();
        setSearchQuery('');
        setShowReceiptReturnDrawer(true);
        setShowShortBookDrawer(false);
        setMatchedReceiptForReturn(parsed.matchedSale);
        setReceiptLookupInput(parsed.matchedSale.invoiceNumber);
        setReturnLookupError(null);
        triggerScanFlash(`Receipt #${parsed.matchedSale.invoiceNumber}`, 'rose');
        return;
      }

      if (parsed.matchedMedicine) {
        if (
          getTotalPiecesInStock(parsed.matchedMedicine) > 0 &&
          !isExpired(parsed.matchedMedicine.expiryDate)
        ) {
          addToCart(parsed.matchedMedicine, 'pack');
          triggerScanFlash(
            `${parsed.matchedMedicine.name} (${parsed.matchedMedicine.strength})`,
            'emerald'
          );
          setSearchQuery('');
          return;
        }
        // Matched item is out of stock -> show modal to add to Short Book or restock
        if (onUnrecognizedBarcode) {
          setSearchQuery('');
          onUnrecognizedBarcode(raw);
          return;
        }
      }

      if (availableMedicines.length === 1) {
        addToCart(availableMedicines[0], 'pack');
        triggerScanFlash(
          `${availableMedicines[0].name} (${availableMedicines[0].strength})`,
          'emerald'
        );
        setSearchQuery('');
        return;
      }

      if (
        (parsed.isGS1DataMatrix ||
          /^[A-Za-z0-9\-_.()\/]{4,}$/.test(raw) ||
          availableMedicines.length === 0) &&
        onUnrecognizedBarcode
      ) {
        setSearchQuery('');
        onUnrecognizedBarcode(raw);
      }
    }
  };

  // Out-of-stock catalog items matching the active search query so cashier can add them to Short Book in 1 click
  const outOfStockMatches = searchQuery.trim()
    ? medicines.filter((m) => {
        if (getTotalPiecesInStock(m) > 0) return false;
        const q = searchQuery.toLowerCase().trim();
        return (
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.barcode.includes(q) ||
          m.sku.toLowerCase().includes(q)
        );
      })
    : [];

  const pendingShortBookCount = shortBookList.filter((i) => i.status === 'pending').length;

  const updateQuantity = (index: number, newQty: number) => {
    setErrorNotice(null);
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }

    const item = cart[index];
    const med = medicines.find((m) => m.id === item.medicineId);
    if (med) {
      const unitsPerPack = getUnitsPerPack(med);
      const otherPieces = getCartPiecesForMedicine(cart, med.id, index);
      const requestedPieces =
        item.unitType === 'pack' ? newQty * unitsPerPack : newQty;
      const availablePieces = getTotalPiecesInStock(med);

      if (otherPieces + requestedPieces > availablePieces) {
        soundService.errorTone();
        setErrorNotice(
          `Stock limit reached for ${med.name}. Max available: ${med.currentStockPacks} packs (${availablePieces} units).`
        );
        return;
      }
    }

    const updated = [...cart];
    let nextPrice = item.pricePerUnit;
    let nextOrigPrice = item.originalPricePerUnit;
    let nextSpecialPct = item.specialDiscountPercent;

    if (med && hasSpecialDiscount(med) && item.unitType === 'pack') {
      const minPacks = Math.max(1, med.specialDiscountMinPacks || 1);
      const specialPct = getSpecialDiscountPercent(med);
      if (newQty >= minPacks) {
        nextPrice = getDiscountedPackPrice(med);
        nextOrigPrice = med.unitRetailPrice;
        nextSpecialPct = specialPct;
      }
    }

    updated[index] = {
      ...item,
      quantity: newQty,
      pricePerUnit: nextPrice,
      originalPricePerUnit: nextOrigPrice,
      specialDiscountPercent: nextSpecialPct,
      subtotal: Number((newQty * nextPrice).toFixed(2)),
      profit: Number(((nextPrice - item.costPerUnit) * newQty).toFixed(2)),
    };
    setCart(updated);
    soundService.click();
  };

  const toggleItemSpecialDiscount = (index: number) => {
    const item = cart[index];
    const med = medicines.find((m) => m.id === item.medicineId);
    if (!med || !hasSpecialDiscount(med)) return;

    const basePrice =
      item.unitType === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
    const discountedPrice =
      item.unitType === 'pack'
        ? getDiscountedPackPrice(med)
        : getDiscountedPiecePrice(med);
    const isCurrentlyDiscounted = Boolean(
      item.specialDiscountPercent && item.specialDiscountPercent > 0
    );

    const nextPrice = isCurrentlyDiscounted ? basePrice : discountedPrice;
    const specialPct = getSpecialDiscountPercent(med);

    const updated = [...cart];
    updated[index] = {
      ...item,
      pricePerUnit: nextPrice,
      originalPricePerUnit: isCurrentlyDiscounted ? undefined : basePrice,
      specialDiscountPercent: isCurrentlyDiscounted ? undefined : specialPct,
      subtotal: Number((item.quantity * nextPrice).toFixed(2)),
      profit: Number(((nextPrice - item.costPerUnit) * item.quantity).toFixed(2)),
    };
    setCart(updated);
    soundService.click();
  };

  const toggleItemUnit = (index: number) => {
    setErrorNotice(null);
    const item = cart[index];
    const med = medicines.find((m) => m.id === item.medicineId);
    if (!med) return;

    const nextUnit: 'pack' | 'loose' =
      item.unitType === 'pack' ? 'loose' : 'pack';
    const unitsPerPack = getUnitsPerPack(med);
    const otherPieces = getCartPiecesForMedicine(cart, med.id, index);
    const requestedPieces =
      nextUnit === 'pack' ? item.quantity * unitsPerPack : item.quantity;
    const availablePieces = getTotalPiecesInStock(med);

    if (otherPieces + requestedPieces > availablePieces) {
      soundService.errorTone();
      setErrorNotice(
        `Cannot switch ${med.name} to ${nextUnit.toUpperCase()}: requires ${
          otherPieces + requestedPieces
        } units, but only ${availablePieces} in stock.`
      );
      return;
    }

    const basePrice =
      nextUnit === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
    const shouldApplySpecial =
      nextUnit === 'pack' &&
      hasSpecialDiscount(med) &&
      item.quantity >= Math.max(1, med.specialDiscountMinPacks || 1);
    const price = shouldApplySpecial ? getDiscountedPackPrice(med) : basePrice;
    const cost =
      nextUnit === 'pack'
        ? med.unitCostPrice
        : med.looseCostPrice ||
          Number((med.unitCostPrice / unitsPerPack).toFixed(2));

    const updated = [...cart];
    updated[index] = {
      ...item,
      unitType: nextUnit,
      pricePerUnit: price,
      originalPricePerUnit: shouldApplySpecial ? basePrice : undefined,
      specialDiscountPercent: shouldApplySpecial
        ? getSpecialDiscountPercent(med)
        : undefined,
      costPerUnit: cost,
      subtotal: Number((item.quantity * price).toFixed(2)),
      profit: Number(((price - cost) * item.quantity).toFixed(2)),
    };
    setCart(updated);
    soundService.click();
  };

  const removeFromCart = (index: number) => {
    setErrorNotice(null);
    setCart(cart.filter((_, i) => i !== index));
    soundService.click();
  };

  const clearCart = () => {
    setErrorNotice(null);
    setCart([]);
  };

  const handleSelectKhataCustomer = (cust: (typeof khataCustomers)[0]) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    soundService.click();
  };

  // Financial calculations (supports both Percentage % and Custom PKR Rs. discount)
  const subtotal = Number(
    cart.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
  );
  const discountAmount =
    discountMode === 'pkr'
      ? Math.min(subtotal, Math.max(0, Math.round(parseFloat(customDiscountPkr) || 0)))
      : Math.min(subtotal, Math.round((subtotal * discountPercent) / 100));
  const effectiveDiscountPercent =
    subtotal > 0
      ? discountMode === 'pkr'
        ? Number(((discountAmount / subtotal) * 100).toFixed(1))
        : discountPercent
      : 0;
  const netTotal = Math.max(0, subtotal - discountAmount);

  const numReceived = parseFloat(receivedAmount) || netTotal;
  const changeAmount = Math.max(0, numReceived - netTotal);
  const totalCartUnits = cart.reduce((acc, i) => acc + i.quantity, 0);

  // Recent 10 Sales Activity Widget computations
  const recent10Sales = useMemo(() => {
    return salesList
      .filter((s) => {
        if (recentActivityFilter === 'completed') return s.status !== 'refunded';
        if (recentActivityFilter === 'credit') return s.paymentMethod === 'Credit';
        if (recentActivityFilter === 'refunded') return s.status === 'refunded';
        return true;
      })
      .slice(0, 10);
  }, [salesList, recentActivityFilter]);

  const todayCompletedSales = useMemo(
    () => salesList.filter((s) => s.status !== 'refunded' && isToday(s.createdAt)),
    [salesList]
  );
  const todayShiftTotal = useMemo(
    () => todayCompletedSales.reduce((acc, s) => acc + s.totalAmount, 0),
    [todayCompletedSales]
  );

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (
      paymentMethod === 'Credit' &&
      (!customerName.trim() ||
        customerName.trim().toLowerCase() === 'walk-in customer')
    ) {
      soundService.errorTone();
      setErrorNotice(
        'Please select a Khata customer or enter the customer name for Credit sales.'
      );
      return;
    }

    setIsProcessing(true);
    setErrorNotice(null);
    try {
      const txn = await onProcessSale({
        items: cart,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || undefined,
        customerId: selectedCustomerId || undefined,
        counterName: activeCounter,
        staffName: currentUser.name,
        staffRole: currentUser.role,
        paymentMethod,
        discountPercent: effectiveDiscountPercent,
        discountAmount,
        receivedAmount: numReceived,
      });

      setCart([]);
      setReceivedAmount('');
      setDiscountPercent(0);
      setCustomDiscountPkr('');
      setDiscountMode('percent');
      onSaleCompleted(txn);
    } catch (err: any) {
      soundService.errorTone();
      setErrorNotice(err?.message || 'Failed to complete transaction.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-5 relative">
      {/* Subtle Screen-Edge Flash Animation when an External / Barcode Scan is Processed */}
      {scanFlash && (
        <div
          key={scanFlash.id}
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 z-50 transition-opacity duration-500 animate-in fade-in ${
            scanFlash.variant === 'rose'
              ? 'border-[3px] border-rose-400/75 shadow-[inset_0_0_52px_rgba(244,63,94,0.26)]'
              : 'border-[3px] border-emerald-400/80 shadow-[inset_0_0_52px_rgba(16,185,129,0.28)]'
          }`}
        >
          {/* Top / Bottom / Side Subtle Edge Glow Strips */}
          <div
            className={`absolute top-0 inset-x-0 h-1.5 ${
              scanFlash.variant === 'rose'
                ? 'bg-gradient-to-r from-transparent via-rose-400 to-transparent'
                : 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent'
            }`}
          />
          <div
            className={`absolute bottom-0 inset-x-0 h-1.5 ${
              scanFlash.variant === 'rose'
                ? 'bg-gradient-to-r from-transparent via-rose-400 to-transparent'
                : 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent'
            }`}
          />
          <div
            className={`absolute inset-y-0 left-0 w-1.5 ${
              scanFlash.variant === 'rose'
                ? 'bg-gradient-to-b from-transparent via-rose-400 to-transparent'
                : 'bg-gradient-to-b from-transparent via-emerald-400 to-transparent'
            }`}
          />
          <div
            className={`absolute inset-y-0 right-0 w-1.5 ${
              scanFlash.variant === 'rose'
                ? 'bg-gradient-to-b from-transparent via-rose-400 to-transparent'
                : 'bg-gradient-to-b from-transparent via-emerald-400 to-transparent'
            }`}
          />
        </div>
      )}

      {/* Main POS Workspace: 7 Cols Catalog & Drawers + 5 Cols Sticky Register */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Medicine Catalog & Fast Scan (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div
            className={`bg-white rounded-2xl border p-4 shadow-2xs transition-all duration-300 ${
              scanFlash
                ? scanFlash.variant === 'rose'
                  ? 'border-rose-400 ring-2 ring-rose-300/60'
                  : 'border-emerald-400 ring-2 ring-emerald-300/60'
                : 'border-slate-200'
            }`}
          >
            {/* Sleek Single-Row POS Header (No Awkward Multi-Line Wrapping) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
                      POS Register
                    </h2>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono tabular-nums text-[11px] font-bold whitespace-nowrap">
                      Today: {todayCompletedSales.length} ({formatPKR(todayShiftTotal)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Single-Line Action Toolbar */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = !showReceiptReturnDrawer;
                    setShowReceiptReturnDrawer(next);
                    if (next) {
                      setShowShortBookDrawer(false);
                      setTimeout(() => receiptScanInputRef.current?.focus(), 60);
                    }
                    soundService.click();
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition cursor-pointer whitespace-nowrap shrink-0 ${
                    showReceiptReturnDrawer
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200'
                  }`}
                  title="Scan customer receipt barcode or enter Invoice # to process a sale return / refund"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Return / Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !showShortBookDrawer;
                    setShowShortBookDrawer(next);
                    if (next) setShowReceiptReturnDrawer(false);
                    soundService.click();
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition cursor-pointer whitespace-nowrap shrink-0 ${
                    showShortBookDrawer
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                  }`}
                  title="Open 2-Second Counter Short Book (Want List) for requested or out-of-stock medicines"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Short Book</span>
                  {pendingShortBookCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono tabular-nums ${
                        showShortBookDrawer
                          ? 'bg-white text-amber-900'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      {pendingShortBookCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundService.click();
                    recentSalesWidgetRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Jump to Recent 10 Counter Sales Activity"
                >
                  <Clock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Recent ({ Math.min(10, salesList.length) })</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Camera Barcode Scanner (F4) — Scans Medicine or Receipt Barcodes"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Scanner</span>
                </button>
              </div>
            </div>

            {/* Return Success Confirmation Banner */}
            {returnSuccessBanner && (
              <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{returnSuccessBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReturnSuccessBanner(null)}
                  className="text-emerald-700 hover:text-emerald-950 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Collapsible Counter Receipt Return & Refund Drawer */}
            {showReceiptReturnDrawer && (
              <div
                ref={returnDrawerRef}
                className="mb-3.5 p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ScanLine className="w-4 h-4 text-rose-700" />
                    <div>
                      <span className="font-extrabold text-slate-900 block">
                        Counter Receipt Return &amp; Refund (Scan Barcode or Enter Invoice #)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Scan the printed receipt barcode or enter the Invoice # to restore stock and issue a refund
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReceiptReturnDrawer(false)}
                    className="text-slate-400 hover:text-slate-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search / Barcode Scan Form */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <ScanLine className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-rose-600" />
                    <input
                      ref={receiptScanInputRef}
                      type="text"
                      data-scanner-local="true"
                      value={receiptLookupInput}
                      onChange={(e) => setReceiptLookupInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLookupReceipt();
                        }
                      }}
                      placeholder="Scan Receipt Barcode or enter Invoice # (e.g. ZMS-20261109-1042 or last 4 digits)..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-rose-300 bg-white text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLookupReceipt()}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Find Receipt</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenScanner}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    title="Use Camera to scan the 1D Barcode on the printed receipt"
                  >
                    <Camera className="w-3.5 h-3.5 text-rose-600" />
                    <span>Scan Camera</span>
                  </button>
                </div>

                {/* Quick Recent Receipts Strip */}
                {salesList.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 shrink-0 mr-1">
                      Recent Receipts:
                    </span>
                    {salesList.slice(0, 5).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setReceiptLookupInput(s.invoiceNumber);
                          handleLookupReceipt(s.invoiceNumber);
                        }}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-mono tabular-nums font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          matchedReceiptForReturn?.id === s.id
                            ? 'bg-rose-600 text-white border-rose-600'
                            : s.status === 'refunded'
                            ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                            : 'bg-white border-rose-200 hover:border-rose-400 text-slate-800'
                        }`}
                      >
                        <span>{s.invoiceNumber}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] ${
                            matchedReceiptForReturn?.id === s.id
                              ? 'bg-rose-800 text-white'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {formatPKR(s.totalAmount)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {returnLookupError && (
                  <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>{returnLookupError}</span>
                  </div>
                )}

                {/* Matched Receipt Details & Return Processor */}
                {matchedReceiptForReturn && (
                  <div className="p-3.5 rounded-2xl bg-white border border-rose-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums font-black text-sm text-slate-900">
                            Invoice #{matchedReceiptForReturn.invoiceNumber}
                          </span>
                          {matchedReceiptForReturn.status === 'refunded' ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase">
                              Already Refunded
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                              Eligible for Return
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDateTime(matchedReceiptForReturn.createdAt)} &middot; Customer:{' '}
                          <strong className="text-slate-700">
                            {matchedReceiptForReturn.customerName}
                          </strong>{' '}
                          &middot; Paid via{' '}
                          <strong className="text-slate-700">
                            {matchedReceiptForReturn.paymentMethod}
                          </strong>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSaleCompleted(matchedReceiptForReturn)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>View / Print Receipt</span>
                      </button>
                    </div>

                    {/* Dispensed Items in this Receipt */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                        Dispensed Items on Receipt (Will be restored to stock):
                      </span>
                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                        {matchedReceiptForReturn.items.map((item, idx) => (
                          <div
                            key={`${item.medicineId}-${idx}`}
                            className="px-3 py-1.5 bg-slate-50/60 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-900">
                                {idx + 1}. {item.medicineName}
                              </span>
                              <span className="text-slate-500 ml-2 font-mono tabular-nums">
                                ({item.quantity} {item.unitType === 'pack' ? 'pack' : 'loose'} &times;{' '}
                                {formatPKR(item.pricePerUnit)})
                              </span>
                            </div>
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              {formatPKR(item.subtotal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Barcode Preview & Total Summary */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-center">
                        <div
                          dangerouslySetInnerHTML={{
                            __html: generateInvoiceBarcodeSvg(
                              matchedReceiptForReturn.invoiceNumber,
                              24
                            ),
                          }}
                        />
                        <span className="text-[10px] font-mono tabular-nums font-bold text-slate-600 block mt-0.5">
                          *{matchedReceiptForReturn.invoiceNumber}*
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-slate-500 block">
                          {matchedReceiptForReturn.paymentMethod === 'Credit'
                            ? 'Khata Balance Reduction:'
                            : `Refund Amount (${matchedReceiptForReturn.paymentMethod}):`}
                        </span>
                        <span className="text-base font-black font-mono tabular-nums text-rose-700">
                          {formatPKR(matchedReceiptForReturn.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {matchedReceiptForReturn.status === 'refunded' ? (
                      <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold">
                        This receipt was already refunded by{' '}
                        <strong>{matchedReceiptForReturn.refundedBy || 'Staff'}</strong>
                        {matchedReceiptForReturn.refundReason
                          ? ` (${matchedReceiptForReturn.refundReason})`
                          : ''}
                        .
                      </div>
                    ) : (
                      <form
                        onSubmit={handleProcessCounterReturn}
                        className="pt-2 border-t border-slate-100 space-y-2"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Return Reason
                            </label>
                            <select
                              value={returnReason}
                              onChange={(e) => setReturnReason(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                            >
                              {POS_RETURN_REASONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Additional Note (Optional)
                            </label>
                            <input
                              type="text"
                              value={returnCustomNote}
                              onChange={(e) => setReturnCustomNote(e.target.value)}
                              placeholder="e.g., Intact strips verified at counter..."
                              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-slate-500">
                            Processed by: <strong>{currentUser.name}</strong> ({currentUser.role})
                          </span>
                          <button
                            type="submit"
                            disabled={isProcessingReturn}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>
                              {isProcessingReturn
                                ? 'Restoring Stock...'
                                : `Process Return & Refund ${formatPKR(
                                    matchedReceiptForReturn.totalAmount
                                  )}`}
                            </span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Short Book Confirmation Toast Banner */}
            {shortBookBanner && (
              <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{shortBookBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShortBookBanner(null)}
                  className="text-amber-700 hover:text-amber-950 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Collapsible 2-Second Counter Short Book Drawer */}
            {showShortBookDrawer && (
              <div className="mb-3.5 p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-700" />
                    <span className="font-extrabold text-slate-900">
                      Counter Short Book &middot; Fast Want List
                    </span>
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      Log any medicine a patient asks for that is out of stock
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowShortBookDrawer(false)}
                    className="text-slate-400 hover:text-slate-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={handleCustomShortBookSubmit}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                >
                  <input
                    type="text"
                    value={customShortName}
                    onChange={(e) => setCustomShortName(e.target.value)}
                    placeholder="Medicine / Brand name (e.g. Augmentin 1g, Concor 5mg)..."
                    className="sm:col-span-5 px-3 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                  <input
                    type="text"
                    value={customShortStrength}
                    onChange={(e) => setCustomShortStrength(e.target.value)}
                    placeholder="Strength / Form (optional)"
                    className="sm:col-span-3 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="sm:col-span-2 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300">
                    <span className="text-[10px] text-slate-500 font-semibold">Packs:</span>
                    <input
                      type="number"
                      min={1}
                      value={customShortPacks}
                      onChange={(e) => setCustomShortPacks(e.target.value)}
                      className="w-full font-mono tabular-nums font-bold text-xs text-slate-900 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="sm:col-span-2 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </form>

                {shortBookList.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 shrink-0 mr-1">
                      Recent Wants:
                    </span>
                    {shortBookList.slice(0, 5).map((sb) => (
                      <button
                        key={sb.id}
                        type="button"
                        onClick={() =>
                          handleQuickAddShortBook({
                            itemName: sb.itemName,
                            strengthOrPack: sb.strengthOrPack,
                            requestedPacks: 2,
                            linkedMedicineId: sb.linkedMedicineId,
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-white border border-amber-200 hover:border-amber-400 text-[11px] font-semibold text-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                        title="Click to increment patient request count (+1 Ask)"
                      >
                        <span>{sb.itemName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-mono tabular-nums font-bold text-[10px]">
                          {sb.requestCount}x &middot; {sb.requestedPacks}p
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quick Search / Hardware Gun Input + View Mode Switcher */}
            <div className="flex items-center gap-2 mb-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder="Scan barcode gun or search medicine, generic formula, item... (F2)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full pl-9 pr-14 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm bg-slate-50/60 focus:bg-white transition"
                  autoFocus
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      barcodeInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold"
                  >
                    Clear
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-mono font-bold">
                    F2
                  </kbd>
                )}
              </div>

              {/* View Density Switcher (Cards vs Compact Table Rows) */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogViewMode('grid');
                    setCatalogPage(1);
                    soundService.click();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                    catalogViewMode === 'grid'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="2-Column Product Cards"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogViewMode('compact');
                    setCatalogPage(1);
                    soundService.click();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                    catalogViewMode === 'compact'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="High-Density Fast Dispense List"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Compact</span>
                </button>
              </div>
            </div>

            {/* Department Filter Bar (Concise labels so all 6 fit on 1 clean line) */}
            <div className="flex items-center gap-1.5 flex-wrap pb-2.5 mb-3 border-b border-slate-100 text-xs">
              {[
                { id: 'all', label: 'All', count: departmentCounts.all },
                { id: 'pharmacy', label: 'Medicines', count: departmentCounts.pharmacy },
                { id: 'personal_care', label: 'Personal Care', count: departmentCounts.personal_care },
                { id: 'mother_baby', label: 'Mother & Baby', count: departmentCounts.mother_baby },
                { id: 'general_store', label: 'FMCG', count: departmentCounts.general_store },
                { id: 'surgical', label: 'Surgical', count: departmentCounts.surgical },
              ].map(({ id, label, count }) => {
                const active = posDepartment === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPosDepartment(id);
                      setCatalogPage(1);
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#083322] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`font-mono tabular-nums text-[10px] px-1.5 py-0.1 rounded ${
                        active ? 'bg-emerald-800/80 text-emerald-100' : 'bg-white text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Instant 2-Second "Add to Short Book" Bar when Cashier searches any medicine */}
            {searchQuery.trim().length >= 2 && (
              <div className="mb-3 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-amber-950">
                  <ClipboardList className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Not in stock or new patient demand for{' '}
                    <strong className="font-mono underline">"{searchQuery.trim()}"</strong>?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleQuickAddShortBook({
                      itemName: searchQuery.trim(),
                      requestedPacks: 5,
                    });
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add "{searchQuery.trim().slice(0, 22)}" to Short Book</span>
                </button>
              </div>
            )}

            {/* Out-of-Stock Catalog Matches (1-Click Add to Short Book) */}
            {outOfStockMatches.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
                  Out of Stock in Catalog — Click to Add to Short Book:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {outOfStockMatches.slice(0, 4).map((med) => (
                    <div
                      key={med.id}
                      className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {med.name} ({med.strength})
                        </div>
                        <div className="text-[10px] text-rose-700 font-semibold">
                          0 Packs in Stock &middot; {med.supplier || med.manufacturer}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleQuickAddShortBook({
                            itemName: med.name,
                            strengthOrPack: `${med.strength} (${med.dosageForm})`,
                            supplierName: med.supplier || med.manufacturer,
                            requestedPacks: Math.max(5, med.minThresholdPacks || 5),
                            priority: 'urgent',
                            linkedMedicineId: med.id,
                          });
                          setSearchQuery('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 shrink-0 transition cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Short Book</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Catalog Display (6 Cards per Page = 3 Clean Rows matching Register height!) */}
            {availableMedicines.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-2.5">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    No in-stock items found matching "{searchQuery || posDepartment}".
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add it to the Counter Short Book in 1 click so it is ready for the distributor's order booker.
                  </p>
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      handleQuickAddShortBook({
                        itemName: searchQuery.trim(),
                        requestedPacks: 5,
                      });
                      setSearchQuery('');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>+ Add "{searchQuery.trim()}" to Short Book</span>
                  </button>
                )}
              </div>
            ) : catalogViewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {displayedMedicines.map((med) => {
                  const piecePrice = getPieceRetailPrice(med);
                  const unitPieceName = getPieceUnitName(med.dosageForm);
                  const expMeta = getExpiryBadgeMeta(med.expiryDate);
                  const inCartQty = cart
                    .filter((c) => c.medicineId === med.id)
                    .reduce((acc, c) => acc + c.quantity, 0);

                  return (
                    <div
                      key={med.id}
                      className={`p-3 rounded-xl border transition flex flex-col justify-between text-left group ${
                        inCartQty > 0
                          ? 'border-emerald-500 bg-emerald-50/20'
                          : 'border-slate-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-start gap-2.5">
                          {/* Product Photo Thumbnail */}
                          <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center">
                            {med.imageUrl ? (
                              <img
                                src={med.imageUrl}
                                alt={med.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-slate-400">
                                {med.category === 'Personal Care & Sexual Wellness' ||
                                med.department === 'personal_care' ? (
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

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex flex-wrap items-center gap-1">
                                <h4 className="font-bold text-slate-900 text-xs sm:text-sm group-hover:text-emerald-800 transition truncate">
                                  {med.name}
                                </h4>
                                {hasSpecialDiscount(med) && (
                                  <button
                                    type="button"
                                    onClick={() => addToCart(med, 'pack', true)}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-50 hover:bg-indigo-600 text-indigo-800 hover:text-white border border-indigo-200 text-[9px] font-bold transition cursor-pointer"
                                    title={`Click to dispense with ${med.specialDiscountLabel || 'Wholesale'} -${med.specialDiscountPercent}% discount (Rs. ${getDiscountedPackPrice(med)})`}
                                  >
                                    <Tag className="w-2.5 h-2.5 shrink-0" />
                                    <span>
                                      {med.specialDiscountLabel || 'Wholesale'} -{med.specialDiscountPercent}%
                                    </span>
                                  </button>
                                )}
                              </div>
                              <div className="text-right shrink-0 ml-1">
                                <span className="font-black font-mono tabular-nums text-emerald-800 text-xs sm:text-sm whitespace-nowrap block">
                                  {formatPKR(
                                    hasSpecialDiscount(med) && (med.specialDiscountMinPacks || 1) <= 1
                                      ? getDiscountedPackPrice(med)
                                      : med.unitRetailPrice
                                  )}
                                </span>
                                {hasSpecialDiscount(med) && (
                                  <span className="text-[9px] font-mono tabular-nums text-indigo-700 font-bold block">
                                    {(med.specialDiscountMinPacks || 1) <= 1
                                      ? `MRP Rs. ${med.unitRetailPrice}`
                                      : `Wholesale Rs. ${Math.round(getDiscountedPackPrice(med))} (≥${med.specialDiscountMinPacks}p)`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {med.genericName} &middot; {med.strength}
                            </div>
                          </div>
                        </div>

                        {/* Unboxed Metadata Line with · Separators & Batch Expiry Warning */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
                          <div className="flex items-center gap-1 min-w-0 truncate">
                            {med.shelfLocation && (
                              <span className="font-mono text-slate-600">
                                {med.shelfLocation} &middot;
                              </span>
                            )}
                            {(() => {
                              const nearBatches = getNearExpiryBatches(med, 90);
                              const allBatches = getMedicineStockBatches(med);
                              if (nearBatches.length > 0) {
                                const earliest = nearBatches[0];
                                return (
                                  <span
                                    className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono tabular-nums font-bold truncate"
                                    title={`Near-Expiry Warning: Batch ${earliest.batchNumber} expires on ${earliest.expiryDate} (${earliest.shortLabel})`}
                                  >
                                    Batch {earliest.batchNumber} &middot; {earliest.shortLabel}
                                  </span>
                                );
                              }
                              return (
                                med.expiryDate && (
                                  <span
                                    className="font-mono tabular-nums text-slate-500 truncate"
                                    title={`Batch ${med.batchNumber} · Expiry: ${med.expiryDate}`}
                                  >
                                    Batch {med.batchNumber} &middot; Exp {med.expiryDate}
                                    {allBatches.length > 1 ? ` (${allBatches.length} batches)` : ''}
                                  </span>
                                )
                              );
                            })()}
                          </div>
                          <span
                            className={`font-mono tabular-nums shrink-0 ${
                              med.currentStockPacks <= med.minThresholdPacks
                                ? 'text-amber-700 font-bold'
                                : 'text-slate-600 font-medium'
                            }`}
                          >
                            {med.currentStockPacks}p
                            {med.currentStockLoose ? ` + ${med.currentStockLoose}u` : ''} stock
                          </span>
                        </div>
                      </div>

                      {/* Quick Dispense Buttons: Pack vs Loose Unit */}
                      <div className="grid grid-cols-2 gap-1.5 mt-2 pt-1.5 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => addToCart(med, 'pack')}
                          className="py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-[#083322] hover:text-white text-emerald-900 font-bold text-[11px] font-mono tabular-nums transition text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3 shrink-0" />
                          <span>
                            Pack (Rs.{' '}
                            {hasSpecialDiscount(med) && (med.specialDiscountMinPacks || 1) <= 1
                              ? getDiscountedPackPrice(med)
                              : med.unitRetailPrice}
                            )
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => addToCart(med, 'loose')}
                          className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 font-semibold text-[11px] font-mono tabular-nums transition text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3 shrink-0" />
                          <span>
                            1 {unitPieceName} (Rs. {piecePrice.toFixed(1)})
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* High-Density Compact Table View */
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {displayedMedicines.map((med) => {
                  const piecePrice = getPieceRetailPrice(med);
                  const unitPieceName = getPieceUnitName(med.dosageForm);
                  const inCartQty = cart
                    .filter((c) => c.medicineId === med.id)
                    .reduce((acc, c) => acc + c.quantity, 0);

                  return (
                    <div
                      key={med.id}
                      className={`px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition ${
                        inCartQty > 0 ? 'bg-emerald-50/40' : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {med.name}
                          </span>
                          {hasSpecialDiscount(med) && (
                            <button
                              type="button"
                              onClick={() => addToCart(med, 'pack', true)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-50 hover:bg-indigo-600 text-indigo-800 hover:text-white border border-indigo-200 text-[9px] font-bold transition cursor-pointer"
                            >
                              <Tag className="w-2.5 h-2.5" />
                              <span>
                                {med.specialDiscountLabel || 'Wholesale'} -{med.specialDiscountPercent}% (Rs. {Math.round(getDiscountedPackPrice(med))})
                              </span>
                            </button>
                          )}
                          <span className="text-[11px] text-slate-500 truncate hidden md:inline">
                            &middot; {med.genericName} ({med.strength})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono tabular-nums flex items-center gap-2 mt-0.5 flex-wrap">
                          <span>
                            Stock:{' '}
                            <strong
                              className={
                                med.currentStockPacks <= med.minThresholdPacks
                                  ? 'text-amber-700'
                                  : 'text-slate-700'
                              }
                            >
                              {med.currentStockPacks} packs
                            </strong>
                          </span>
                          {med.shelfLocation && <span>&middot; {med.shelfLocation}</span>}
                          {med.batchNumber && <span>&middot; Batch {med.batchNumber}</span>}
                          {med.expiryDate && (
                            <span
                              className={
                                isExpiringSoon(med.expiryDate, 90)
                                  ? 'text-amber-700 font-bold'
                                  : ''
                              }
                            >
                              &middot; Exp {med.expiryDate}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => addToCart(med, 'pack')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-[#083322] hover:text-white text-emerald-900 font-bold text-[11px] font-mono tabular-nums transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Pack Rs. {med.unitRetailPrice}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addToCart(med, 'loose')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 font-semibold text-[11px] font-mono tabular-nums transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3" />
                          <span>
                            1 {unitPieceName} Rs. {piecePrice.toFixed(1)}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Clean Catalog Footer & Pagination (Replaces Nested Scrollbar) */}
            {availableMedicines.length > itemsPerPage && searchQuery.trim().length === 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-slate-500 font-mono tabular-nums text-[11px]">
                  Showing{' '}
                  <strong className="text-slate-800">
                    {showAllCatalog
                      ? `all ${availableMedicines.length}`
                      : `${(safeCatalogPage - 1) * itemsPerPage + 1}–${Math.min(
                          safeCatalogPage * itemsPerPage,
                          availableMedicines.length
                        )}`}
                  </strong>{' '}
                  of <strong className="text-slate-800">{availableMedicines.length}</strong> in-stock
                </div>

                <div className="flex items-center gap-1.5">
                  {!showAllCatalog && (
                    <>
                      <button
                        type="button"
                        disabled={safeCatalogPage <= 1}
                        onClick={() => setCatalogPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold flex items-center gap-0.5 text-[11px] cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <span className="px-2 py-0.5 font-mono tabular-nums font-bold text-[11px] text-slate-700">
                        {safeCatalogPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeCatalogPage >= totalPages}
                        onClick={() => setCatalogPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1))}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold flex items-center gap-0.5 text-[11px] cursor-pointer"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAllCatalog((prev) => !prev)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition cursor-pointer whitespace-nowrap"
                  >
                    {showAllCatalog
                      ? `Paginate (${itemsPerPage}/page)`
                      : `Show All (${availableMedicines.length})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Checkout Cart & Billing Register (5 Cols — Compact so Submit Button fits on 768p laptops!) */}
        <div className="lg:col-span-5 lg:sticky lg:top-16">
          <div
            className={`bg-white rounded-2xl border overflow-hidden shadow-2xs transition-all duration-300 ${
              scanFlash && scanFlash.variant === 'emerald'
                ? 'border-emerald-400 ring-2 ring-emerald-400/70 shadow-lg shadow-emerald-500/15'
                : 'border-slate-200'
            }`}
          >
            {/* High-Contrast Register Header Strip */}
            <div className="bg-[#083322] text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-300" />
                <div>
                  <h3 className="font-bold text-xs sm:text-sm leading-tight">
                    Current Dispensing Cart
                  </h3>
                  <span className="text-[10px] text-emerald-200/80 font-mono tabular-nums">
                    {cart.length} {cart.length === 1 ? 'item' : 'items'} &middot; {totalCartUnits}{' '}
                    {totalCartUnits === 1 ? 'unit' : 'units'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider text-emerald-200/80 block">
                    Net Payable
                  </span>
                  <span className="font-mono tabular-nums font-black text-sm sm:text-base text-emerald-300">
                    Rs. {netTotal.toLocaleString()}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-[10px] font-bold transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="p-4">
              {errorNotice && (
                <div className="mb-2.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorNotice}</span>
                </div>
              )}

              {/* POS Batch Near-Expiry Warning Banner for Cart Items */}
              {(() => {
                const cartBatchWarnings = cart
                  .map((item) => {
                    const medInCat = medicines.find((m) => m.id === item.medicineId);
                    const expDate = item.expiryDate || medInCat?.expiryDate || '';
                    const batchNo = item.batchNumber || medInCat?.batchNumber || 'N/A';
                    const days = expDate ? getDaysUntilExpiry(expDate) : 999;
                    if (days <= 90) {
                      return {
                        medicineName: item.medicineName,
                        batchNumber: batchNo,
                        expiryDate: expDate,
                        days,
                        meta: getExpiryBadgeMeta(expDate),
                      };
                    }
                    // Also check if another active stock batch of this medicine is near expiry
                    if (medInCat) {
                      const nearBatches = getNearExpiryBatches(medInCat, 90);
                      if (nearBatches.length > 0) {
                        const first = nearBatches[0];
                        return {
                          medicineName: item.medicineName,
                          batchNumber: first.batchNumber,
                          expiryDate: first.expiryDate,
                          days: first.daysRemaining,
                          meta: getExpiryBadgeMeta(first.expiryDate),
                        };
                      }
                    }
                    return null;
                  })
                  .filter(Boolean) as Array<{
                  medicineName: string;
                  batchNumber: string;
                  expiryDate: string;
                  days: number;
                  meta: ReturnType<typeof getExpiryBadgeMeta>;
                }>;

                if (cartBatchWarnings.length === 0) return null;

                return (
                  <div className="mb-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] space-y-1">
                    <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>
                        Near-Expiry Batch Warning ({cartBatchWarnings.length}{' '}
                        {cartBatchWarnings.length === 1 ? 'batch' : 'batches'})
                      </span>
                    </div>
                    <div className="space-y-0.5 pl-5">
                      {cartBatchWarnings.map((w, idx) => (
                        <div
                          key={`${w.medicineName}_${w.batchNumber}_${idx}`}
                          className="flex flex-wrap items-center justify-between gap-1 font-mono text-[10px]"
                        >
                          <span className="font-sans font-bold text-slate-900">
                            {w.medicineName}
                          </span>
                          <span>
                            Batch <strong>{w.batchNumber}</strong> &middot; Exp {w.expiryDate} (
                            <strong className="text-rose-700">{w.meta.shortLabel}</strong>)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Cart Items List (Sleek compact empty state so bottom button never clips on 768p laptops) */}
              {cart.length === 0 ? (
                <div className="py-3 px-3.5 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700">Counter Cart is Empty</p>
                    <p className="text-[11px] text-slate-400">
                      Scan barcode gun or tap Pack / Loose on any medicine to dispense.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {cart.map((item, index) => {
                    const unitLabel = item.unitType === 'pack' ? 'Pack' : 'Loose';
                    const medInCatalog = medicines.find((m) => m.id === item.medicineId);
                    const hasMedSpecial = Boolean(
                      medInCatalog && hasSpecialDiscount(medInCatalog)
                    );
                    const isSpecialActive = Boolean(
                      item.specialDiscountPercent && item.specialDiscountPercent > 0
                    );
                    const stockBatches = medInCatalog
                      ? getMedicineStockBatches(medInCatalog)
                      : [];
                    const itemExpMeta = item.expiryDate
                      ? getExpiryBadgeMeta(item.expiryDate)
                      : null;

                    return (
                      <div
                        key={`${item.medicineId}_${item.unitType}`}
                        className="px-3 py-2 bg-white hover:bg-slate-50/70 flex items-center justify-between gap-2 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 text-xs flex flex-wrap items-center gap-1">
                            <span className="truncate">{item.medicineName}</span>
                            {hasMedSpecial && medInCatalog && (
                              <button
                                type="button"
                                onClick={() => toggleItemSpecialDiscount(index)}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold border transition cursor-pointer ${
                                  isSpecialActive
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                                }`}
                                title="Click to toggle product-specific Wholesale / Special Discount"
                              >
                                <Tag className="w-2.5 h-2.5" />
                                <span>
                                  {isSpecialActive
                                    ? `${medInCatalog.specialDiscountLabel || 'Wholesale'} -${item.specialDiscountPercent}%`
                                    : `+ ${medInCatalog.specialDiscountLabel || 'Wholesale'} -${medInCatalog.specialDiscountPercent}%`}
                                </span>
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono tabular-nums flex flex-wrap items-center gap-1.5 mt-0.5">
                            <button
                              type="button"
                              onClick={() => toggleItemUnit(index)}
                              className={`px-1.5 py-0.2 rounded font-bold transition cursor-pointer ${
                                item.unitType === 'pack'
                                  ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                                  : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                              }`}
                              title="Click to switch between Whole Pack and Loose Tablet/Unit"
                            >
                              {unitLabel}
                            </button>
                            <span>&times; Rs. {item.pricePerUnit}</span>
                            {isSpecialActive && item.originalPricePerUnit && (
                              <span className="line-through text-slate-400 text-[9px]">
                                Rs. {item.originalPricePerUnit}
                              </span>
                            )}
                            {stockBatches.length > 1 ? (
                              <select
                                value={`${item.batchNumber || ''}|${item.expiryDate || ''}`}
                                onChange={(e) => {
                                  const [bNo, bExp] = e.target.value.split('|');
                                  changeItemBatch(index, bNo, bExp);
                                }}
                                className="px-1.5 py-0.2 rounded border border-slate-300 bg-slate-50 text-[9px] font-mono font-bold text-slate-800"
                                title="Select stock batch to dispense (FEFO)"
                              >
                                {stockBatches.map((b) => (
                                  <option
                                    key={b.id}
                                    value={`${b.batchNumber || ''}|${b.expiryDate || ''}`}
                                  >
                                    Batch {b.batchNumber || 'N/A'} · Exp {b.expiryDate || 'N/A'} (
                                    {b.stockPacks}p)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              item.batchNumber && (
                                <span className="text-[9px] text-slate-400">
                                  Batch {item.batchNumber}
                                </span>
                              )
                            )}
                            {itemExpMeta && itemExpMeta.window !== 'safe' && (
                              <span
                                className={`px-1.5 py-0.1 rounded text-[9px] font-bold ${itemExpMeta.badgeClass}`}
                                title={`Batch ${item.batchNumber} expires on ${item.expiryDate}`}
                              >
                                {itemExpMeta.shortLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-xs text-slate-900 w-6 text-center font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Line Subtotal & Delete */}
                        <div className="flex items-center gap-1.5 text-right shrink-0">
                          <span className="font-bold text-slate-900 text-xs font-mono tabular-nums min-w-[60px]">
                            Rs. {item.subtotal.toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(index)}
                            className="text-slate-400 hover:text-rose-600 p-0.5 transition cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Checkout Register Form */}
              <form
                onSubmit={handleCheckout}
                className="mt-3 pt-3 border-t border-slate-200 space-y-2.5 text-xs"
              >
                {/* Customer Information */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                      Customer / Patient
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        setSelectedCustomerId('');
                      }}
                      placeholder="Walk-in Customer"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                      Phone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="0300-0000000"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono tabular-nums text-xs"
                    />
                  </div>
                </div>

                {/* Payment Method Selector (Sleek Single-Row Inline Buttons) */}
                <div>
                  <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { id: 'Cash', icon: Banknote },
                      { id: 'Card', icon: CreditCard },
                      { id: 'EasyPaisa', icon: Smartphone },
                      { id: 'JazzCash', icon: Smartphone },
                      { id: 'Credit', icon: Users },
                    ].map(({ id, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPaymentMethod(id as PaymentMethod)}
                        className={`py-1.5 px-1.5 rounded-lg border text-center font-medium transition flex items-center justify-center gap-1 cursor-pointer ${
                          paymentMethod === id
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3 h-3 shrink-0 text-slate-500" />
                        <span className="text-[10px] truncate">{id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* If Credit is selected, show Khata Customer Selector */}
                {paymentMethod === 'Credit' && (
                  <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-900 flex items-center gap-1 text-[11px]">
                        <Users className="w-3.5 h-3.5" />
                        <span>Khata Account:</span>
                      </span>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => {
                          const cust = khataCustomers.find((c) => c.id === e.target.value);
                          if (cust) handleSelectKhataCustomer(cust);
                        }}
                        className="px-2 py-1 rounded-lg border border-amber-300 bg-white text-[11px] font-semibold text-slate-800"
                      >
                        <option value="">-- Choose Customer --</option>
                        {khataCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Due: Rs. {c.balanceDue})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {khataCustomers.slice(0, 4).map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleSelectKhataCustomer(cust)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                            selectedCustomerId === cust.id
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-100'
                          }`}
                        >
                          {cust.name} (Rs. {cust.balanceDue})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Discount (% Presets + Custom % + Custom PKR Rs.) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 text-[11px] flex items-center gap-1">
                      <Percent className="w-3 h-3 text-emerald-700" />
                      <span>Discount (% or Custom PKR)</span>
                    </label>
                    <span className="font-mono tabular-nums text-[11px] text-emerald-700 font-bold">
                      {discountAmount > 0
                        ? `-Rs. ${discountAmount} (${effectiveDiscountPercent}%)`
                        : 'None'}
                    </span>
                  </div>

                  {/* Presets + Custom PKR + Custom % */}
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-6 flex gap-1">
                      {[0, 5, 10, 15].map((pct) => {
                        const isSelected = discountMode === 'percent' && discountPercent === pct;
                        return (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setDiscountMode('percent');
                              setDiscountPercent(pct);
                              if (pct === 0) {
                                setCustomDiscountPkr('');
                              } else if (subtotal > 0) {
                                setCustomDiscountPkr(String(Math.round((subtotal * pct) / 100)));
                              }
                            }}
                            className={`flex-1 py-1.5 rounded-lg border text-[10px] font-mono tabular-nums font-bold transition cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {pct}%
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className={`col-span-3 flex items-center rounded-lg border px-2 py-1 transition ${
                        discountMode === 'pkr' && discountAmount > 0
                          ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                          : 'border-slate-300 bg-white'
                      }`}
                      title="Custom Discount in Pakistani Rupees (PKR)"
                    >
                      <span className="text-[10px] font-bold text-emerald-800 mr-1 shrink-0">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={subtotal > 0 ? subtotal : undefined}
                        step="1"
                        placeholder="PKR"
                        value={
                          discountMode === 'pkr'
                            ? customDiscountPkr
                            : discountAmount > 0
                            ? String(discountAmount)
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          setDiscountMode('pkr');
                          setCustomDiscountPkr(val);
                          const num = Math.max(0, parseFloat(val) || 0);
                          if (subtotal > 0) {
                            setDiscountPercent(
                              Number(
                                ((Math.min(subtotal, num) / subtotal) * 100).toFixed(1)
                              )
                            );
                          } else {
                            setDiscountPercent(0);
                          }
                        }}
                        className="w-full text-[11px] font-mono tabular-nums font-bold text-slate-900 bg-transparent focus:outline-none"
                      />
                    </div>

                    <div
                      className={`col-span-3 flex items-center rounded-lg border px-2 py-1 transition ${
                        discountMode === 'percent' && discountPercent > 0
                          ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                          : 'border-slate-300 bg-white'
                      }`}
                      title="Custom Discount Percentage (%)"
                    >
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        placeholder="Custom"
                        value={discountPercent > 0 ? discountPercent : ''}
                        onChange={(e) => {
                          const pct = Math.min(
                            100,
                            Math.max(0, parseFloat(e.target.value) || 0)
                          );
                          setDiscountMode('percent');
                          setDiscountPercent(pct);
                          if (subtotal > 0 && pct > 0) {
                            setCustomDiscountPkr(String(Math.round((subtotal * pct) / 100)));
                          } else {
                            setCustomDiscountPkr('');
                          }
                        }}
                        className="w-full text-[11px] font-mono tabular-nums font-bold text-slate-900 bg-transparent focus:outline-none"
                      />
                      <span className="text-[10px] font-bold text-slate-500 ml-0.5 shrink-0">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compact Financial Summary & Cash Tendered */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>
                      Subtotal{' '}
                      {discountAmount > 0 && (
                        <strong className="text-emerald-700 font-mono">
                          (-Rs. {discountAmount.toLocaleString()} disc)
                        </strong>
                      )}
                    </span>
                    <span className="font-mono tabular-nums">
                      Rs. {subtotal.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200">
                    <span>Net Payable Total</span>
                    <span className="text-emerald-800 font-mono tabular-nums text-base">
                      Rs. {netTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Cash Tendered & Change with 1-Click Note Presets */}
                  {paymentMethod !== 'Credit' && (
                    <div className="pt-1.5 border-t border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            Cash Recv:
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder={String(netTotal)}
                            value={receivedAmount}
                            onChange={(e) => setReceivedAmount(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 font-mono tabular-nums font-bold text-xs bg-white"
                          />
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-500 mr-1">Change:</span>
                          <span className="font-mono tabular-nums font-black text-xs text-slate-900">
                            Rs. {changeAmount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {netTotal > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-slate-400 mr-0.5">Quick:</span>
                          {[
                            { label: 'Exact', val: netTotal },
                            { label: '500', val: 500 },
                            { label: '1,000', val: 1000 },
                            { label: '2,000', val: 2000 },
                            { label: '5,000', val: 5000 },
                          ]
                            .filter((p) => p.val >= netTotal || p.label === 'Exact')
                            .map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setReceivedAmount(String(preset.val))}
                                className="px-1.5 py-0.5 rounded bg-white border border-slate-200 hover:border-emerald-400 text-[10px] font-mono tabular-nums font-semibold text-slate-700 cursor-pointer"
                              >
                                {preset.label === 'Exact' ? 'Exact' : `Rs.${preset.label}`}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Complete Sale Button */}
                <button
                  type="submit"
                  disabled={cart.length === 0 || isProcessing}
                  className="w-full py-2.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Deducting Stock &amp; Dispensing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        Complete Dispense &amp; Print Receipt (Rs. {netTotal.toLocaleString()})
                      </span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Widget: Up to 10 Recent Sales Activity (Full-Width High-Density Table) */}
      <div
        ref={recentSalesWidgetRef}
        className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Recent Counter Sales Activity (Up to 10)
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-[11px] font-mono tabular-nums font-bold">
                  Showing {recent10Sales.length} of {salesList.length} total
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest 10 counter receipts with 1-click receipt reprint and return initiation.
              </p>
            </div>
          </div>

          {/* Segmented Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs self-start sm:self-auto">
            {[
              { id: 'all', label: 'All Recent (10)' },
              { id: 'completed', label: 'Completed' },
              { id: 'credit', label: 'Credit Khata' },
              { id: 'refunded', label: 'Refunded' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundService.click();
                  setRecentActivityFilter(tab.id as any);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  recentActivityFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* High-Density 10 Recent Sales Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                <th className="py-2.5 px-3.5"># / INVOICE</th>
                <th className="py-2.5 px-3">DATE &amp; TIME</th>
                <th className="py-2.5 px-3">CUSTOMER</th>
                <th className="py-2.5 px-3 hidden md:table-cell">DISPENSED ITEMS</th>
                <th className="py-2.5 px-3">PAYMENT</th>
                <th className="py-2.5 px-3 text-right">NET TOTAL</th>
                <th className="py-2.5 px-3.5 text-right">COUNTER ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent10Sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No recent sales matching this filter. Complete a dispense above to see live counter activity.
                  </td>
                </tr>
              ) : (
                recent10Sales.map((txn, idx) => {
                  const isRefunded = txn.status === 'refunded';
                  const itemsPreview = txn.items
                    .map((i) => `${i.medicineName} (${i.quantity}${i.unitType === 'pack' ? 'p' : 'u'})`)
                    .join(', ');

                  return (
                    <tr
                      key={txn.id}
                      className={`transition ${
                        isRefunded ? 'bg-rose-50/20' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 w-4">
                            {idx + 1}.
                          </span>
                          <span>{txn.invoiceNumber}</span>
                          {isRefunded && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-sans font-bold text-[10px]">
                              Refunded
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                        {formatDateTime(txn.createdAt)}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 truncate max-w-[140px]">
                          {txn.customerName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {txn.counterName || activeCounter} &middot; {txn.staffName}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 hidden md:table-cell max-w-[240px]">
                        <div className="text-slate-700 font-medium truncate" title={itemsPreview}>
                          {itemsPreview}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                          {txn.items.length} {txn.items.length === 1 ? 'item' : 'items'}
                          {(txn.discountAmount ?? 0) > 0
                            ? ` · Disc: -Rs. ${txn.discountAmount}`
                            : ''}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            txn.paymentMethod === 'Credit'
                              ? 'bg-amber-100 text-amber-900'
                              : txn.paymentMethod === 'Cash'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {txn.paymentMethod}
                        </span>
                      </td>

                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-black whitespace-nowrap ${
                          isRefunded ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        Rs. {txn.totalAmount.toLocaleString()}
                      </td>

                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSaleCompleted(txn)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                            title="View or reprint thermal receipt with barcode"
                          >
                            <Printer className="w-3 h-3 text-slate-500" />
                            <span>Receipt</span>
                          </button>

                          {!isRefunded && (
                            <button
                              type="button"
                              onClick={() => handleInitiateReturnFromActivity(txn)}
                              className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                              title="Load this invoice into Counter Return & Refund processor"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Return</span>
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
      </div>
    </div>
  );
};
