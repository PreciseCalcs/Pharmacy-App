import React, { useState, useRef, useEffect } from 'react';
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
  ArrowRight
} from 'lucide-react';
import { 
  DosageForm, 
  MedicineItem, 
  PaymentMethod, 
  SaleItem, 
  SaleTransaction, 
  UserAccount 
} from '../types/pharmacy';
import { formatPKR, getPieceRetailPrice, getPieceUnitName, getTotalPiecesInStock } from '../utils/pharmacyHelpers';
import { soundService } from '../services/soundAlerts';

interface PosViewProps {
  medicines: MedicineItem[];
  currentUser: UserAccount;
  onProcessSale: (saleData: {
    items: SaleItem[];
    customerName: string;
    customerPhone?: string;
    staffName: string;
    staffRole: any;
    paymentMethod: PaymentMethod;
    discountPercent: number;
    receivedAmount: number;
    notes?: string;
  }) => Promise<SaleTransaction>;
  onOpenScanner: () => void;
  onSaleCompleted: (txn: SaleTransaction) => void;
}

export const PosView: React.FC<PosViewProps> = ({
  medicines,
  currentUser,
  onProcessSale,
  onOpenScanner,
  onSaleCompleted,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Available medicines for fast catalog select
  const availableMedicines = medicines.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    const totalPieces = getTotalPiecesInStock(m);
    if (totalPieces <= 0) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.barcode.includes(q) ||
      m.sku.toLowerCase().includes(q)
    );
  });

  const addToCart = (med: MedicineItem, unitType: 'pack' | 'loose' = 'pack') => {
    setErrorNotice(null);
    const existingIndex = cart.findIndex(
      (item) => item.medicineId === med.id && item.unitType === unitType
    );

    const price = unitType === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
    const cost = unitType === 'pack' ? med.unitCostPrice : (med.looseCostPrice || Number((med.unitCostPrice / (med.unitsPerPack || 1)).toFixed(2)));

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].subtotal = Number((updated[existingIndex].quantity * price).toFixed(2));
      updated[existingIndex].profit = Number(((price - cost) * updated[existingIndex].quantity).toFixed(2));
      setCart(updated);
    } else {
      const newItem: SaleItem = {
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        dosageForm: med.dosageForm,
        unitType,
        unitsPerPack: med.unitsPerPack || 1,
        quantity: 1,
        pricePerUnit: price,
        costPerUnit: cost,
        subtotal: price,
        profit: Number((price - cost).toFixed(2)),
        batchNumber: med.batchNumber,
        expiryDate: med.expiryDate,
      };
      setCart([...cart, newItem]);
    }
    soundService.click();
  };

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    const updated = [...cart];
    const item = updated[index];
    item.quantity = newQty;
    item.subtotal = Number((newQty * item.pricePerUnit).toFixed(2));
    item.profit = Number(((item.pricePerUnit - item.costPerUnit) * newQty).toFixed(2));
    setCart(updated);
    soundService.click();
  };

  const toggleItemUnit = (index: number) => {
    const updated = [...cart];
    const item = updated[index];
    const med = medicines.find((m) => m.id === item.medicineId);
    if (!med) return;

    const nextUnit: 'pack' | 'loose' = item.unitType === 'pack' ? 'loose' : 'pack';
    const price = nextUnit === 'pack' ? med.unitRetailPrice : getPieceRetailPrice(med);
    const cost = nextUnit === 'pack' ? med.unitCostPrice : (med.looseCostPrice || Number((med.unitCostPrice / (med.unitsPerPack || 1)).toFixed(2)));

    item.unitType = nextUnit;
    item.pricePerUnit = price;
    item.costPerUnit = cost;
    item.subtotal = Number((item.quantity * price).toFixed(2));
    item.profit = Number(((price - cost) * item.quantity).toFixed(2));
    setCart(updated);
    soundService.click();
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
    soundService.click();
  };

  const clearCart = () => {
    setCart([]);
  };

  // Financial calculations
  const subtotal = Number(cart.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const netTotal = Math.max(0, subtotal - discountAmount);

  const numReceived = parseFloat(receivedAmount) || netTotal;
  const changeAmount = Math.max(0, numReceived - netTotal);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    setIsProcessing(true);
    try {
      const txn = await onProcessSale({
        items: cart,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || undefined,
        staffName: currentUser.name,
        staffRole: currentUser.role,
        paymentMethod,
        discountPercent,
        receivedAmount: numReceived,
      });

      setCart([]);
      setReceivedAmount('');
      setDiscountPercent(0);
      onSaleCompleted(txn);
    } catch (err: any) {
      soundService.errorTone();
      setErrorNotice(err?.message || 'Failed to complete transaction.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Medicine Catalog & Fast Scan (7 Cols) */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-700" />
                <span>POS Dispense Register Counter</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan barcode gun or tap items to dispense whole packs or loose tablets/ampoules.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenScanner}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                <span>Camera Scanner</span>
              </button>
            </div>
          </div>

          {/* Quick Search / Hardware Gun Input */}
          <div className="relative mb-4">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan Barcode gun or search medicine / formula / SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm bg-slate-50/50 focus:bg-white transition"
              autoFocus
            />
          </div>

          {/* Medicines Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
            {availableMedicines.length === 0 ? (
              <div className="col-span-2 py-12 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm">No in-stock medicines match your search.</p>
              </div>
            ) : (
              availableMedicines.map((med) => {
                const totalPieces = getTotalPiecesInStock(med);
                const piecePrice = getPieceRetailPrice(med);
                const unitPieceName = getPieceUnitName(med.dosageForm);

                return (
                  <div
                    key={med.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-xs transition flex flex-col justify-between text-left group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm group-hover:text-emerald-700 transition">
                            {med.name}
                          </h4>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {med.genericName} &bull; {med.strength}
                          </div>
                        </div>
                        <span className="font-black text-emerald-800 text-xs sm:text-sm whitespace-nowrap">
                          {formatPKR(med.unitRetailPrice)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100 font-mono">
                        <span>Shelf: {med.shelfLocation}</span>
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
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5">
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
                const med = medicines.find((m) => m.id === item.medicineId);
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
                  onChange={(e) => setCustomerName(e.target.value)}
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
                  { id: 'Credit', icon: Receipt },
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

            {/* Discount Quick Select */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">Special Discount</label>
                <span className="font-mono text-emerald-700 font-bold">
                  {discountPercent > 0 ? `-${discountPercent}% (Rs. ${discountAmount})` : 'None'}
                </span>
              </div>
              <div className="flex gap-1.5">
                {[0, 5, 7.5, 10, 15].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDiscountPercent(pct)}
                    className={`flex-1 py-1 rounded-md border text-[11px] font-semibold transition ${
                      discountPercent === pct
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {pct === 0 ? '0%' : `${pct}%`}
                  </button>
                ))}
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
                  <span>Discount Applied</span>
                  <span className="font-mono">-Rs. {discountAmount}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-black text-base pt-2 border-t border-slate-200">
                <span>Net Payable Total</span>
                <span className="text-emerald-800 font-mono">Rs. {netTotal}</span>
              </div>

              {/* Cash Tendered & Change */}
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
            </div>

            {/* Complete Sale Button */}
            <button
              type="submit"
              disabled={cart.length === 0 || isProcessing}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
