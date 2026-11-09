import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Layers,
  Users,
  Heart,
  Baby,
  ShoppingBag,
  Pill,
  Image as ImageIcon,
  ClipboardList,
  Flame,
  Check,
  X,
  RotateCcw,
  ScanLine,
  Printer,
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
  getExpiryBadgeMeta,
  getPieceRetailPrice,
  getPieceUnitName,
  getTotalPiecesInStock,
  getUnitsPerPack,
  isExpired,
} from '../utils/pharmacyHelpers';
import { findSaleByReceiptCode, parseScannedCode } from '../utils/codeParser';
import { formatDateTime } from '../utils/dates';
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
  const [cart, setCart] = useState<SaleItem[]>([]);
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
  const [showReceiptReturnDrawer, setShowReceiptReturnDrawer] = useState(false);
  const [receiptLookupInput, setReceiptLookupInput] = useState('');
  const [matchedReceiptForReturn, setMatchedReceiptForReturn] =
    useState<SaleTransaction | null>(null);
  const [returnLookupError, setReturnLookupError] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState<string>(POS_RETURN_REASONS[0]);
  const [returnCustomNote, setReturnCustomNote] = useState<string>('');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [returnSuccessBanner, setReturnSuccessBanner] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const receiptScanInputRef = useRef<HTMLInputElement>(null);
  const activeCounter = syncEngine.getActiveCounter();
  const khataCustomers = syncEngine.getKhataCustomers();

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
    (med: MedicineItem, unitType: 'pack' | 'loose' = 'pack') => {
      setErrorNotice(null);

      // 1. Block expired medicines immediately
      if (isExpired(med.expiryDate)) {
        soundService.errorTone();
        setErrorNotice(
          `Cannot dispense expired medicine: ${med.name} (Expired: ${med.expiryDate})`
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

        const price =
          unitType === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
        const cost =
          unitType === 'pack'
            ? med.unitCostPrice
            : med.looseCostPrice ||
              Number((med.unitCostPrice / unitsPerPack).toFixed(2));

        if (existingIndex > -1) {
          const updated = [...prevCart];
          const nextQty = updated[existingIndex].quantity + 1;
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: nextQty,
            subtotal: Number((nextQty * price).toFixed(2)),
            profit: Number(((price - cost) * nextQty).toFixed(2)),
          };
          return updated;
        } else {
          const newItem: SaleItem = {
            medicineId: med.id,
            medicineName: med.name,
            genericName: med.genericName,
            dosageForm: med.dosageForm,
            unitType,
            unitsPerPack,
            quantity: 1,
            pricePerUnit: price,
            costPerUnit: cost,
            subtotal: price,
            profit: Number((price - cost).toFixed(2)),
            batchNumber: med.batchNumber,
            expiryDate: med.expiryDate,
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

  // Consume external hardware gun or camera barcode scans
  useEffect(() => {
    if (externalScannedItem) {
      addToCart(externalScannedItem.medicine, 'pack');
      onExternalScanConsumed?.();
    }
  }, [externalScannedItem, addToCart, onExternalScanConsumed]);

  // Consume external receipt barcode scans (from Camera Scanner or global Hardware Gun)
  useEffect(() => {
    if (externalScannedReceipt) {
      setShowReceiptReturnDrawer(true);
      setShowShortBookDrawer(false);
      setMatchedReceiptForReturn(externalScannedReceipt.transaction);
      setReceiptLookupInput(externalScannedReceipt.transaction.invoiceNumber);
      setReturnLookupError(null);
      onExternalReceiptScanConsumed?.();
    }
  }, [externalScannedReceipt, onExternalReceiptScanConsumed]);

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
        return;
      }

      if (parsed.matchedMedicine) {
        addToCart(parsed.matchedMedicine, 'pack');
        setSearchQuery('');
        return;
      }

      if (availableMedicines.length === 1) {
        addToCart(availableMedicines[0], 'pack');
        setSearchQuery('');
        return;
      }

      if (/^\d{6,14}$/.test(raw) && onUnrecognizedBarcode) {
        setSearchQuery('');
        onUnrecognizedBarcode(raw);
      }
    }
  };

  // Available medicines for fast catalog select (excludes out-of-stock and expired items)
  const availableMedicines = medicines.filter((m) => {
    const totalPieces = getTotalPiecesInStock(m);
    if (totalPieces <= 0) return false;
    if (isExpired(m.expiryDate)) return false;

    // Department filtering
    if (posDepartment !== 'all') {
      if (posDepartment === 'personal_care') {
        const match =
          m.department === 'personal_care' ||
          m.category === 'Personal Care & Sexual Wellness' ||
          m.category === 'Feminine Hygiene & Care' ||
          m.category === 'Personal Hygiene & Grooming';
        if (!match) return false;
      } else if (posDepartment === 'mother_baby') {
        const match =
          m.department === 'mother_baby' || m.category === 'Baby & Mother Care';
        if (!match) return false;
      } else if (posDepartment === 'general_store') {
        const match =
          m.department === 'general_store' ||
          m.category === 'General Store & FMCG';
        if (!match) return false;
      } else if (posDepartment === 'surgical') {
        const match =
          m.department === 'surgical' ||
          m.category === 'Medical Devices & Surgical';
        if (!match) return false;
      } else if (posDepartment === 'pharmacy') {
        const isOther =
          m.department === 'personal_care' ||
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

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.barcode.includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.category && m.category.toLowerCase().includes(q))
    );
  });

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
    updated[index] = {
      ...item,
      quantity: newQty,
      subtotal: Number((newQty * item.pricePerUnit).toFixed(2)),
      profit: Number(((item.pricePerUnit - item.costPerUnit) * newQty).toFixed(2)),
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

    const price =
      nextUnit === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Medicine Catalog & Fast Scan (7 Cols) */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-semibold text-emerald-800">{activeCounter}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-700" />
                <span>POS Dispense Register Counter</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan barcode gun or tap items to dispense whole packs or loose tablets/ampoules.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  showReceiptReturnDrawer
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200'
                }`}
                title="Scan customer receipt barcode or enter Invoice # to process a sale return / refund"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return / Scan Receipt</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !showShortBookDrawer;
                  setShowShortBookDrawer(next);
                  if (next) setShowReceiptReturnDrawer(false);
                  soundService.click();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  showShortBookDrawer
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                }`}
                title="Open 2-Second Counter Short Book (Want List) for requested or out-of-stock medicines"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Short Book</span>
                {pendingShortBookCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono ${
                      showShortBookDrawer
                        ? 'bg-white text-amber-900'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {pendingShortBookCount}
                  </span>
                )}
              </button>

              <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 font-bold">F2</kbd>
              </span>
              <button
                type="button"
                onClick={onOpenScanner}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                title="Camera Barcode Scanner (F4) — Scans Medicine or Receipt Barcodes"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                <span>Scanner</span>
              </button>
            </div>
          </div>

          {/* Return Success Confirmation Banner */}
          {returnSuccessBanner && (
            <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center justify-between gap-2 shadow-2xs">
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

          {/* Collapsible Counter Receipt Return & Refund Drawer (By Receipt Barcode or Invoice #) */}
          {showReceiptReturnDrawer && (
            <div className="mb-4 p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-rose-700" />
                  <div>
                    <span className="font-extrabold text-slate-900 block">
                      Counter Receipt Return &amp; Refund (Scan Barcode or Enter Invoice #)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Cashiers &amp; Pharmacists can scan the printed receipt barcode or enter the
                      Invoice # to restore stock and issue a refund
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
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Find Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  title="Use Camera to scan the 1D Barcode on the printed receipt"
                >
                  <Camera className="w-3.5 h-3.5 text-rose-600" />
                  <span>Scan Camera</span>
                </button>
              </div>

              {/* Quick Recent Receipts Strip (For 1-click testing or recent walk-in returns) */}
              {salesList.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 shrink-0">
                    Recent Counter Receipts:
                  </span>
                  {salesList.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setReceiptLookupInput(s.invoiceNumber);
                        handleLookupReceipt(s.invoiceNumber);
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer ${
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
                <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-slate-900">
                          Invoice #{matchedReceiptForReturn.invoiceNumber}
                        </span>
                        {matchedReceiptForReturn.status === 'refunded' ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase">
                            Already Refunded
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                            Eligible for Return
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formatDateTime(matchedReceiptForReturn.createdAt)} · Customer:{' '}
                        <strong className="text-slate-700">
                          {matchedReceiptForReturn.customerName}
                        </strong>{' '}
                        · Paid via{' '}
                        <strong className="text-slate-700">
                          {matchedReceiptForReturn.paymentMethod}
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSaleCompleted(matchedReceiptForReturn)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>View / Print Receipt</span>
                      </button>
                    </div>
                  </div>

                  {/* Dispensed Items in this Receipt */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                      Dispensed Items on Receipt (Will be restored to stock):
                    </span>
                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                      {matchedReceiptForReturn.items.map((item, idx) => (
                        <div
                          key={`${item.medicineId}-${idx}`}
                          className="px-3 py-2 bg-slate-50/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">
                              {idx + 1}. {item.medicineName}
                            </span>
                            <span className="text-slate-500 ml-2">
                              ({item.quantity} {item.unitType === 'pack' ? 'pack' : 'loose'} ×{' '}
                              {formatPKR(item.pricePerUnit)})
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">
                            {formatPKR(item.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Barcode Preview & Total Summary */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-center">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: generateInvoiceBarcodeSvg(
                            matchedReceiptForReturn.invoiceNumber,
                            26
                          ),
                        }}
                      />
                      <span className="text-[10px] font-mono font-bold text-slate-600 block mt-0.5">
                        *{matchedReceiptForReturn.invoiceNumber}*
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 block">
                        {matchedReceiptForReturn.paymentMethod === 'Credit'
                          ? 'Khata Balance Reduction:'
                          : `Refund Amount (${matchedReceiptForReturn.paymentMethod}):`}
                      </span>
                      <span className="text-lg font-black font-mono text-rose-700">
                        {formatPKR(matchedReceiptForReturn.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {matchedReceiptForReturn.status === 'refunded' ? (
                    <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold">
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
                      className="pt-2 border-t border-slate-100 space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Return Reason
                          </label>
                          <select
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
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
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
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
                          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
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
            <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center justify-between gap-2 shadow-2xs">
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
            <div className="mb-4 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-700" />
                  <span className="font-extrabold text-slate-900">
                    Counter Short Book · Fast Want List
                  </span>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    Log any medicine a patient asks for that is out of stock or not in catalog
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
                  className="sm:col-span-5 px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
                <input
                  type="text"
                  value={customShortStrength}
                  onChange={(e) => setCustomShortStrength(e.target.value)}
                  placeholder="Strength / Form (optional)"
                  className="sm:col-span-3 px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="sm:col-span-2 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300">
                  <span className="text-[10px] text-slate-500 font-semibold">Packs:</span>
                  <input
                    type="number"
                    min={1}
                    value={customShortPacks}
                    onChange={(e) => setCustomShortPacks(e.target.value)}
                    className="w-full font-mono font-bold text-xs text-slate-900 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="sm:col-span-2 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Item</span>
                </button>
              </form>

              {shortBookList.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 shrink-0">
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
                      className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 hover:border-amber-400 text-[11px] font-semibold text-slate-800 flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                      title="Click to increment patient request count (+1 Ask)"
                    >
                      <span>{sb.itemName}</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-mono font-bold text-[10px]">
                        {sb.requestCount}x · {sb.requestedPacks}p
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Department Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-xs">
            {[
              { id: 'all', label: 'All Items' },
              { id: 'pharmacy', label: 'Medicines' },
              { id: 'personal_care', label: 'Condoms & Personal Care' },
              { id: 'mother_baby', label: 'Mother & Baby' },
              { id: 'general_store', label: 'General Store & FMCG' },
              { id: 'surgical', label: 'Devices & Surgical' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPosDepartment(id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                  posDepartment === id
                    ? 'bg-[#083322] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Quick Search / Hardware Gun Input */}
          <div className="relative mb-3">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan Barcode gun or search brand, formula, condoms, soap, baby items... (F2)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm bg-slate-50/50 focus:bg-white transition"
              autoFocus
            />
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
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer shrink-0"
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
                        0 Packs in Stock · {med.supplier || med.manufacturer}
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
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 shrink-0 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Short Book</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
            {availableMedicines.length === 0 ? (
              <div className="col-span-2 py-10 text-center text-slate-400 space-y-3">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    No in-stock items found matching "{searchQuery || posDepartment}".
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add it to the Counter Short Book in 1 click so it's ready for the distributor's order booker.
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>+ Add "{searchQuery.trim()}" to Short Book</span>
                  </button>
                )}
              </div>
            ) : (
              availableMedicines.map((med) => {
                const totalPieces = getTotalPiecesInStock(med);
                const piecePrice = getPieceRetailPrice(med);
                const unitPieceName = getPieceUnitName(med.dosageForm);

                return (
                  <div
                    key={med.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-xs transition flex flex-col justify-between text-left group"
                  >
                    <div>
                      <div className="flex items-start gap-2.5">
                        {/* Product Photo Thumbnail */}
                        <div className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center shadow-2xs">
                          {med.imageUrl ? (
                            <img src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-slate-400">
                              {med.category === 'Personal Care & Sexual Wellness' || med.department === 'personal_care' ? (
                                <Heart className="w-5 h-5 text-rose-500" />
                              ) : med.category === 'Baby & Mother Care' ? (
                                <Baby className="w-5 h-5 text-amber-500" />
                              ) : med.category === 'General Store & FMCG' ? (
                                <ShoppingBag className="w-5 h-5 text-blue-500" />
                              ) : (
                                <Pill className="w-5 h-5 text-emerald-600" />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm group-hover:text-emerald-700 transition truncate">
                              {med.name}
                            </h4>
                            <span className="font-black text-emerald-800 text-xs sm:text-sm whitespace-nowrap ml-1">
                              {formatPKR(med.unitRetailPrice)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            {med.genericName} &bull; {med.strength}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 font-mono">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate max-w-[100px]">{med.category}</span>
                          {med.expiryDate && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-sans font-bold ${
                                getExpiryBadgeMeta(med.expiryDate).window !== 'safe'
                                  ? getExpiryBadgeMeta(med.expiryDate).badgeClass
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                              title={`Batch ${med.batchNumber} · Expiry Date: ${med.expiryDate}`}
                            >
                              Exp: {med.expiryDate}
                              {getExpiryBadgeMeta(med.expiryDate).window !== 'safe'
                                ? ` (${getExpiryBadgeMeta(med.expiryDate).shortLabel})`
                                : ''}
                            </span>
                          )}
                        </div>
                        <span className={med.currentStockPacks <= med.minThresholdPacks ? 'text-amber-600 font-bold' : 'text-slate-600'}>
                          {med.currentStockPacks} packs ({med.currentStockLoose || 0} loose)
                        </span>
                      </div>
                    </div>

                    {/* Quick Dispense Buttons: Pack vs Loose Unit */}
                    <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => addToCart(med, 'pack')}
                        className="py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-800 font-bold text-[11px] transition text-center flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Pack (Rs. {med.unitRetailPrice})</span>
                      </button>

                      <button
                        onClick={() => addToCart(med, 'loose')}
                        className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-800 font-semibold text-[11px] transition text-center flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>1 {unitPieceName} (Rs. {piecePrice.toFixed(1)})</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Checkout Cart & Billing Register (5 Cols) */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-700" />
              <span>Current Dispensing Cart</span>
            </h3>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium"
              >
                Clear Cart
              </button>
            )}
          </div>

          {errorNotice && (
            <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* Cart Items List */}
          {cart.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <ShoppingCart className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
              <p className="text-sm font-medium text-slate-700">Counter Cart is Empty</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Scan barcode or select medicines from the catalog to dispense.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {cart.map((item, index) => {
                const unitLabel = item.unitType === 'pack' ? 'Pack' : 'Loose';

                return (
                  <div
                    key={`${item.medicineId}_${item.unitType}`}
                    className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {item.medicineName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                        <button
                          onClick={() => toggleItemUnit(index)}
                          className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 transition"
                          title="Click to toggle Pack vs Loose pieces"
                        >
                          {unitLabel}
                        </button>
                        <span>Rs. {item.pricePerUnit} each</span>
                      </div>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                        className="p-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-bold text-xs text-slate-900 w-6 text-center font-mono">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                        className="p-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-right min-w-[70px]">
                      <div className="font-bold text-slate-900 text-xs font-mono">
                        Rs. {item.subtotal}
                      </div>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="text-slate-400 hover:text-rose-600 transition"
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
          <form onSubmit={handleCheckout} className="mt-4 pt-4 border-t border-slate-200 space-y-3 text-xs">
            {/* Customer Information */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customer / Patient</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setSelectedCustomerId('');
                  }}
                  placeholder="Walk-in Customer"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone / WhatsApp</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0300-0000000"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Payment Method</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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
                    className={`py-1.5 px-1 rounded-lg border text-center font-medium transition flex flex-col items-center justify-center ${
                      paymentMethod === id
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 mb-0.5 text-slate-500" />
                    <span className="text-[10px] truncate w-full">{id}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* If Credit is selected, show Khata Customer Quick Select */}
            {paymentMethod === 'Credit' && (
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1.5">
                <span className="font-semibold text-amber-900 flex items-center gap-1 text-[11px]">
                  <Users className="w-3.5 h-3.5" />
                  <span>Link to Credit Khata Customer Account:</span>
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {khataCustomers.map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelectKhataCustomer(cust)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition ${
                        selectedCustomerId === cust.id
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-100'
                      }`}
                    >
                      {cust.name} (Due: Rs {cust.balanceDue})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Discount (% Presets + Custom % + Custom PKR Rs.) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Discount (% or Custom PKR)</span>
                </label>
                <span className="font-mono text-emerald-700 font-bold">
                  {discountAmount > 0
                    ? `-Rs. ${discountAmount} (${effectiveDiscountPercent}%)`
                    : 'None'}
                </span>
              </div>

              {/* Quick Percentage Buttons */}
              <div className="flex gap-1.5">
                {[0, 5, 7.5, 10, 15].map((pct) => {
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
                      className={`flex-1 py-1 rounded-md border text-[11px] font-semibold transition cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {pct === 0 ? '0%' : `${pct}%`}
                    </button>
                  );
                })}
              </div>

              {/* Custom PKR (Rs.) Input & Custom % Input */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`flex items-center rounded-lg border px-2.5 py-1.5 transition ${
                    discountMode === 'pkr' && discountAmount > 0
                      ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <span className="text-[11px] font-bold text-emerald-800 mr-1.5 shrink-0">
                    Rs.
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={subtotal > 0 ? subtotal : undefined}
                    step="1"
                    placeholder="Custom PKR off"
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
                    className="w-full text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
                  />
                </div>

                <div
                  className={`flex items-center rounded-lg border px-2.5 py-1.5 transition ${
                    discountMode === 'percent' && discountPercent > 0
                      ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    placeholder="Custom %"
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
                    className="w-full text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
                  />
                  <span className="text-[11px] font-bold text-slate-500 ml-1 shrink-0">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Cart Subtotal</span>
                <span className="font-mono">Rs. {subtotal}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>
                    Discount Applied ({effectiveDiscountPercent}%)
                  </span>
                  <span className="font-mono">-Rs. {discountAmount}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-black text-base pt-2 border-t border-slate-200">
                <span>Net Payable Total</span>
                <span className="text-emerald-800 font-mono">Rs. {netTotal}</span>
              </div>

              {/* Cash Tendered & Change */}
              {paymentMethod !== 'Credit' && (
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] text-slate-500 block mb-0.5">Cash Received (Rs.)</span>
                    <input
                      type="number"
                      min={0}
                      placeholder={String(netTotal)}
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      className="w-full px-2 py-1 rounded border border-slate-300 font-mono text-xs bg-white"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block mb-0.5">Change Due</span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      Rs. {changeAmount}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Complete Sale Button */}
            <button
              type="submit"
              disabled={cart.length === 0 || isProcessing}
              className="w-full py-3 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-sm shadow-md shadow-emerald-950/20 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Deducting Stock & Dispensing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Dispense & Print Receipt (Rs. {netTotal})</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
