import React, { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  CheckCircle2,
  Plus,
  Trash2,
  Phone,
  MapPin,
  Receipt,
  FileDown,
  MessageCircle,
  Package,
  Calendar,
  FileText,
  ExternalLink,
  Share2,
} from 'lucide-react';
import {
  CustomerKhata,
  KhataEntry,
  KhataOrderItem,
  SaleTransaction,
  ZAHID_PHARMACY_DETAILS,
} from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';
import { formatDateTime } from '../utils/dates';
import { generateCustomerKhataPDF } from '../services/pdfGenerator';

interface CreditKhataViewProps {
  customers: CustomerKhata[];
  sales?: SaleTransaction[];
  onCustomerUpdated: () => void;
  onSelectInvoice?: (txn: SaleTransaction) => void;
}

export const CreditKhataView: React.FC<CreditKhataViewProps> = ({
  customers,
  sales = [],
  onCustomerUpdated,
  onSelectInvoice,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'owing'>('all');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'orders' | 'payments'>('all');

  // Payment Input States
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'EasyPaisa' | 'JazzCash' | 'Card'>('Cash');
  const [paymentNote, setPaymentNote] = useState<string>('');

  // Manual Credit Sale Input States
  const [showAddCreditModal, setShowAddCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditInvoice, setCreditInvoice] = useState('');
  const [creditNote, setCreditNote] = useState('');

  // New Customer Modal States
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerOpeningBalance, setNewCustomerOpeningBalance] = useState('0');

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lastGeneratedPdf, setLastGeneratedPdf] = useState<{
    file: File;
    customerName: string;
    waUrl: string;
  } | null>(null);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4500);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (filterMode === 'owing' && c.balanceDue <= 0) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.address && c.address.toLowerCase().includes(q))
      );
    });
  }, [customers, searchQuery, filterMode]);

  const selectedCustomer = useMemo(() => {
    return (
      customers.find((c) => c.id === selectedCustomerId) ||
      filteredCustomers[0] ||
      null
    );
  }, [customers, selectedCustomerId, filteredCustomers]);

  const totalOutstanding = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.balanceDue > 0 ? c.balanceDue : 0), 0);
  }, [customers]);

  const owingCount = useMemo(() => {
    return customers.filter((c) => c.balanceDue > 0).length;
  }, [customers]);

  // Helper to resolve purchased items for any KhataEntry (from entry.items or linked SaleTransaction)
  const getEntryItems = (entry: KhataEntry): KhataOrderItem[] => {
    if (entry.items && entry.items.length > 0) {
      return entry.items;
    }
    if (entry.invoiceNumber) {
      const matchedSale = sales.find((s) => s.invoiceNumber === entry.invoiceNumber);
      if (matchedSale && matchedSale.items?.length > 0) {
        return matchedSale.items.map((it) => ({
          medicineId: it.medicineId,
          medicineName: it.medicineName,
          quantity: it.quantity,
          unitType: it.unitType,
          pricePerUnit: it.pricePerUnit,
          subtotal: it.subtotal,
        }));
      }
    }
    return [];
  };

  // Customer order & payment metrics
  const customerStats = useMemo(() => {
    if (!selectedCustomer) {
      return { totalOrdersAmount: 0, orderCount: 0, totalPaidAmount: 0, paymentCount: 0 };
    }
    const orderEntries = selectedCustomer.history.filter((h) => h.type === 'sale');
    const paymentEntries = selectedCustomer.history.filter(
      (h) => h.type === 'payment' || h.type === 'refund'
    );
    return {
      totalOrdersAmount: orderEntries.reduce((sum, h) => sum + h.amount, 0),
      orderCount: orderEntries.length,
      totalPaidAmount: paymentEntries.reduce((sum, h) => sum + h.amount, 0),
      paymentCount: paymentEntries.length,
    };
  }, [selectedCustomer]);

  const filteredHistory = useMemo(() => {
    if (!selectedCustomer) return [];
    return selectedCustomer.history.filter((entry) => {
      if (historyFilter === 'orders') return entry.type === 'sale' || entry.type === 'refund';
      if (historyFilter === 'payments') return entry.type === 'payment';
      return true;
    });
  }, [selectedCustomer, historyFilter]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) return;

    await syncEngine.recordKhataPayment(
      selectedCustomer.id,
      amt,
      paymentMethod,
      paymentNote.trim() || undefined
    );
    soundService.cashRegister();
    setPaymentAmount('');
    setPaymentNote('');
    onCustomerUpdated();
    triggerToast(`Rs. ${amt.toLocaleString()} payment recorded for ${selectedCustomer.name}`);
  };

  const handlePayFullBalance = async () => {
    if (!selectedCustomer || selectedCustomer.balanceDue <= 0) return;
    const fullAmt = selectedCustomer.balanceDue;
    await syncEngine.recordKhataPayment(
      selectedCustomer.id,
      fullAmt,
      paymentMethod,
      'Full settlement'
    );
    soundService.cashRegister();
    setPaymentAmount('');
    setPaymentNote('');
    onCustomerUpdated();
    triggerToast(`Full balance of Rs. ${fullAmt.toLocaleString()} settled for ${selectedCustomer.name}`);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;

    const created = await syncEngine.addKhataCustomer({
      name: newCustomerName,
      phone: newCustomerPhone || '0300 000 0000',
      address: newCustomerAddress,
      initialBalance: Number(newCustomerOpeningBalance) || 0,
    });
    soundService.cashRegister();
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerAddress('');
    setNewCustomerOpeningBalance('0');
    setShowNewCustomerModal(false);
    onCustomerUpdated();
    setSelectedCustomerId(created.id);
    triggerToast(`Customer account created for ${created.name}`);
  };

  const handleAddCreditSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amt = Number(creditAmount);
    if (!amt || amt <= 0) return;

    const inv = creditInvoice.trim() || `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    await syncEngine.recordKhataCreditSale(
      selectedCustomer.id,
      inv,
      amt,
      creditNote.trim() || undefined
    );
    soundService.click();
    setCreditAmount('');
    setCreditInvoice('');
    setCreditNote('');
    setShowAddCreditModal(false);
    onCustomerUpdated();
    triggerToast(`Rs. ${amt.toLocaleString()} added to ${selectedCustomer.name}'s khata`);
  };

  const handleDeleteCustomer = async (customer: CustomerKhata) => {
    await syncEngine.deleteKhataCustomer(customer.id);
    soundService.click();
    onCustomerUpdated();
    triggerToast(`Removed ${customer.name} from Khata`);
  };

  // Format Pakistani phone number for WhatsApp (e.g. 0300 123 4567 -> 923001234567)
  const formatWhatsAppPhone = (rawPhone: string): string => {
    const digits = (rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('92') && digits.length >= 11) return digits;
    if (digits.startsWith('0') && digits.length >= 10) return `92${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('3')) return `92${digits}`;
    return digits;
  };

  // Build itemized WhatsApp reminder text
  const buildWhatsAppKhataMessage = (customer: CustomerKhata, pdfFileName: string): string => {
    const details = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;
    const creditSales = customer.history.filter((h) => h.type === 'sale');
    const recentPayments = customer.history.filter((h) => h.type === 'payment').slice(0, 3);

    const lines: string[] = [
      `*${details.name.toUpperCase()}*`,
      `${details.address}, ${details.city}`,
      `Phone: ${details.phone}`,
      `--------------------------------`,
      `*CUSTOMER KHATA REMINDER / کھاتہ بل یاد دہانی*`,
      `Customer: *${customer.name}*`,
      `Date: ${new Date().toLocaleDateString('en-PK')}`,
      ``,
      `*CURRENT NET BALANCE DUE: Rs. ${customer.balanceDue.toLocaleString()}*`,
      `--------------------------------`,
    ];

    if (creditSales.length > 0) {
      lines.push(`*PURCHASED ORDERS & INVOICES (${creditSales.length}):*`);
      creditSales.slice(0, 8).forEach((sale) => {
        const dateOnly = new Date(sale.date).toLocaleDateString('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        const items = getEntryItems(sale);
        const itemSummary =
          items.length > 0
            ? items
                .map(
                  (it) =>
                    `${it.medicineName} (${it.quantity} ${it.unitType === 'pack' ? 'Pack' : 'Loose'} - Rs.${it.subtotal})`
                )
                .join(', ')
            : sale.description;
        lines.push(
          `• *${sale.invoiceNumber || 'Credit Bill'}* (${dateOnly}) — *Rs. ${sale.amount.toLocaleString()}*\n   Items: ${itemSummary}`
        );
      });
      lines.push(``);
    }

    if (recentPayments.length > 0) {
      lines.push(`*RECENT PAYMENTS RECEIVED:*`);
      recentPayments.forEach((p) => {
        const dateOnly = new Date(p.date).toLocaleDateString('en-PK', {
          day: '2-digit',
          month: 'short',
        });
        lines.push(`• ${dateOnly}: -Rs. ${p.amount.toLocaleString()} (${p.paymentMethod || 'Cash'})`);
      });
      lines.push(``);
    }

    lines.push(
      `📄 *PDF Statement Generated:* ${pdfFileName}`,
      `براہ کرم اپنا بقایا کھاتہ بل (*Rs. ${customer.balanceDue.toLocaleString()}*) جلد از جلد جمع کروا دیں۔ مکمل پی ڈی ایف کھاتہ سٹیٹمنٹ ساتھ منسلک ہے۔ شکریہ!`,
      `_${details.tagline}_`
    );

    return lines.join('\n');
  };

  const handleDownloadKhataPDF = () => {
    if (!selectedCustomer) return;
    soundService.click();
    const { fileName } = generateCustomerKhataPDF(selectedCustomer, { autoDownload: true });
    triggerToast(`Downloaded Khata Statement PDF: ${fileName}`);
  };

  const handleWhatsAppShareReminder = async () => {
    if (!selectedCustomer) return;
    soundService.click();

    // 1. Generate and download the Customer Khata PDF Statement
    const { blob, fileName } = generateCustomerKhataPDF(selectedCustomer, { autoDownload: true });
    const pdfFile = new File([blob], fileName, { type: 'application/pdf' });
    const message = buildWhatsAppKhataMessage(selectedCustomer, fileName);
    const waPhone = formatWhatsAppPhone(selectedCustomer.phone);
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    setLastGeneratedPdf({
      file: pdfFile,
      customerName: selectedCustomer.name,
      waUrl,
    });

    // 2. If native Web Share API with files is supported (mobile / modern OS), trigger native share sheet
    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      try {
        await navigator.share({
          title: `${selectedCustomer.name} - Khata Statement`,
          text: message,
          files: [pdfFile],
        });
        triggerToast(`Khata PDF & reminder shared for ${selectedCustomer.name}`);
        return;
      } catch {
        // Fallback to opening WhatsApp link directly if user cancels native share sheet
      }
    }

    // 3. Open WhatsApp chat via anchor click (iframe-safe, no window.open)
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerToast(
      `PDF downloaded (${fileName}) & WhatsApp reminder opened for ${selectedCustomer.name}! Attach the downloaded PDF in WhatsApp.`
    );
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-950 text-white px-4 py-3 rounded-xl shadow-xl border border-emerald-700 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Total Outstanding Payment Container */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl px-5 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                TOTAL OUTSTANDING PAYMENT
              </p>
              <span className="text-xs font-bold text-amber-800" dir="rtl">
                کل واجب الادا کھاتہ
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-900 font-mono tabular-nums mt-1">
              Rs. {totalOutstanding.toLocaleString()}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800/90 mt-1 font-medium tabular-nums">
              <span>{owingCount} accounts with balance due</span>
              <span aria-hidden="true">&middot;</span>
              <span>{Math.max(0, customers.length - owingCount)} settled</span>
              <span aria-hidden="true">&middot;</span>
              <span>{customers.length} total Khata customers</span>
            </div>
          </div>

          <div className="hidden xl:block space-y-1 text-xs text-slate-600">
            <p className="font-bold text-slate-800">
              Customer Credit Ledger &amp; Order History (کھاتہ اور بل ریکارڈ)
            </p>
            <p className="text-slate-500">
              Inspect itemized medicine purchases by date &amp; invoice number, record cash or digital recoveries, and share Khata PDF statements on WhatsApp.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
          <button
            onClick={() => setShowNewCustomerModal(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ New Customer</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Customer List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or phone..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/80 border border-slate-200/90 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition"
            />
          </div>

          {/* Filter Pills */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setFilterMode('all')}
              className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({customers.length})
            </button>
            <button
              onClick={() => setFilterMode('owing')}
              className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterMode === 'owing'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Owing ({owingCount})
            </button>
          </div>

          {/* Customer Cards List */}
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {filteredCustomers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No customer accounts match your filter.
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = selectedCustomer?.id === cust.id;
                const orderCount = cust.history.filter((h) => h.type === 'sale').length;
                return (
                  <button
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomerId(cust.id);
                      setLastGeneratedPdf(null);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-600/60 shadow-xs'
                        : 'bg-white border-slate-200/70 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {cust.name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5 tabular-nums">
                        {cust.phone}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {cust.address || 'Local customer'} &middot; {orderCount} {orderCount === 1 ? 'order' : 'orders'}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {cust.balanceDue > 0 ? (
                        <div>
                          <p className="text-sm font-black text-amber-800 font-mono tabular-nums">
                            Rs. {cust.balanceDue.toLocaleString()}
                          </p>
                          <p className="text-[10px] font-semibold text-amber-700 uppercase">
                            due
                          </p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Settled
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Customer Details, WhatsApp PDF Share & Order History (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          {!selectedCustomer ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              Select a customer from the left list or create a new customer Khata account.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Customer Header + WhatsApp & PDF Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-black text-slate-900">
                      {selectedCustomer.name}
                    </h2>
                    {selectedCustomer.balanceDue > 0 ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px]">
                        Owing Account
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                        Clear / Settled
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {selectedCustomer.phone}
                    </span>
                    {selectedCustomer.address && (
                      <>
                        <span>&middot;</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {selectedCustomer.address}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Action Buttons: WhatsApp PDF Reminder, Download PDF, Add Manual Credit Bill */}
                  <div className="flex flex-wrap items-center gap-2 mt-3.5">
                    <button
                      onClick={handleWhatsAppShareReminder}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#128C7E] hover:bg-[#075E54] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      title="Download Customer Khata Statement PDF and send itemized reminder on WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp PDF Reminder</span>
                    </button>

                    <button
                      onClick={handleDownloadKhataPDF}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                      title="Download A4 PDF statement of this customer's Khata order history"
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Download Khata PDF</span>
                    </button>

                    <button
                      onClick={() => setShowAddCreditModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 text-amber-900 font-bold text-xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Credit Bill</span>
                    </button>

                    {selectedCustomer.balanceDue === 0 && (
                      <button
                        onClick={() => handleDeleteCustomer(selectedCustomer)}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs transition cursor-pointer"
                        title="Delete settled customer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right bg-slate-50/90 border border-slate-200/80 rounded-2xl px-4 py-3 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    BALANCE DUE
                  </p>
                  <p
                    className={`text-2xl font-black font-mono tabular-nums mt-0.5 ${
                      selectedCustomer.balanceDue > 0
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    Rs. {selectedCustomer.balanceDue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    {customerStats.orderCount} credit {customerStats.orderCount === 1 ? 'order' : 'orders'} &middot;{' '}
                    {customerStats.paymentCount} {customerStats.paymentCount === 1 ? 'payment' : 'payments'}
                  </p>
                </div>
              </div>

              {/* Quick WhatsApp PDF Ready Banner (appears right after clicking WhatsApp PDF Reminder) */}
              {lastGeneratedPdf && (
                <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold text-emerald-950">
                        Khata PDF Downloaded: <span className="font-mono">{lastGeneratedPdf.file.name}</span>
                      </p>
                      <p className="text-emerald-800 mt-0.5">
                        WhatsApp chat is ready with the itemized order reminder. Attach the downloaded PDF file in WhatsApp to send both together.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {typeof navigator !== 'undefined' &&
                      navigator.canShare &&
                      navigator.canShare({ files: [lastGeneratedPdf.file] }) && (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.share({
                                files: [lastGeneratedPdf.file],
                                title: `${lastGeneratedPdf.customerName} Khata PDF`,
                              });
                            } catch {}
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 text-white font-bold text-xs hover:bg-emerald-900 transition cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share PDF File</span>
                        </button>
                      )}
                    <a
                      href={lastGeneratedPdf.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#128C7E] text-white font-bold text-xs hover:bg-[#075E54] transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open WhatsApp Again</span>
                    </a>
                  </div>
                </div>
              )}

              {/* 3-Column Customer Account Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    TOTAL CREDIT ORDERS
                  </p>
                  <p className="text-base font-black text-slate-900 font-mono tabular-nums mt-0.5">
                    Rs. {customerStats.totalOrdersAmount.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Across {customerStats.orderCount} {customerStats.orderCount === 1 ? 'invoice' : 'invoices'}
                  </p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    TOTAL PAYMENTS RECEIVED
                  </p>
                  <p className="text-base font-black text-emerald-800 font-mono tabular-nums mt-0.5">
                    Rs. {customerStats.totalPaidAmount.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    {customerStats.paymentCount} {customerStats.paymentCount === 1 ? 'settlement entry' : 'settlement entries'}
                  </p>
                </div>

                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    CURRENT NET PAYABLE
                  </p>
                  <p className="text-base font-black text-amber-900 font-mono tabular-nums mt-0.5">
                    Rs. {selectedCustomer.balanceDue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-amber-800">
                    {selectedCustomer.balanceDue > 0 ? 'Pending customer recovery' : 'All bills settled'}
                  </p>
                </div>
              </div>

              {/* Record Payment Box */}
              <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                  RECORD PAYMENT (وصولی درج کریں)
                </p>

                <form onSubmit={handleRecordPayment} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-5">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="Amount in Rs."
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono tabular-nums focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
                      >
                        <option value="Cash">Cash</option>
                        <option value="EasyPaisa">EasyPaisa</option>
                        <option value="JazzCash">JazzCash</option>
                        <option value="Card">Card / Bank</option>
                      </select>
                    </div>

                    <div className="sm:col-span-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePayFullBalance}
                        disabled={selectedCustomer.balanceDue <= 0}
                        className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold text-slate-700 transition cursor-pointer shrink-0"
                      >
                        Full
                      </button>

                      <button
                        type="submit"
                        disabled={!paymentAmount || Number(paymentAmount) <= 0}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Record</span>
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Optional note (e.g. Paid by brother, EasyPaisa TID...)"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-emerald-600"
                  />
                </form>
              </div>

              {/* Customer Order History & Account Ledger Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      CUSTOMER ORDER HISTORY &amp; ACCOUNT LEDGER ({filteredHistory.length})
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Complete itemized record of what {selectedCustomer.name} purchased, on which date, and under which invoice number
                    </p>
                  </div>

                  {/* Filter Tabs for Ledger */}
                  <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start">
                    <button
                      onClick={() => setHistoryFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        historyFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({selectedCustomer.history.length})
                    </button>
                    <button
                      onClick={() => setHistoryFilter('orders')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        historyFilter === 'orders'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Orders &amp; Invoices ({customerStats.orderCount})
                    </button>
                    <button
                      onClick={() => setHistoryFilter('payments')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        historyFilter === 'payments'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Payments ({customerStats.paymentCount})
                    </button>
                  </div>
                </div>

                {filteredHistory.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    No entries match the selected filter.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                    {filteredHistory.map((entry) => {
                      const isSale = entry.type === 'sale';
                      const isRefund = entry.type === 'refund';
                      const entryItems = getEntryItems(entry);
                      const linkedSale = entry.invoiceNumber
                        ? sales.find((s) => s.invoiceNumber === entry.invoiceNumber)
                        : undefined;

                      return (
                        <div
                          key={entry.id}
                          className={`p-3.5 rounded-xl border transition ${
                            isSale
                              ? 'border-amber-200/90 bg-amber-50/25 hover:bg-amber-50/40'
                              : isRefund
                              ? 'border-blue-200/80 bg-blue-50/30'
                              : 'border-slate-200/70 bg-slate-50/60 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                                  isSale
                                    ? 'bg-amber-500'
                                    : isRefund
                                    ? 'bg-blue-500'
                                    : 'bg-emerald-500'
                                }`}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-extrabold text-slate-900">
                                    {isSale
                                      ? 'Credit Purchase Order'
                                      : isRefund
                                      ? 'Credit Sale Refund'
                                      : entry.description}
                                  </span>

                                  {entry.invoiceNumber && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[11px] font-bold tabular-nums">
                                      <Receipt className="w-3 h-3 text-emerald-400" />
                                      {entry.invoiceNumber}
                                    </span>
                                  )}

                                  {linkedSale && onSelectInvoice && (
                                    <button
                                      onClick={() => onSelectInvoice(linkedSale)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold transition cursor-pointer"
                                      title="Open full thermal invoice receipt"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>View / Print Receipt</span>
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 flex-wrap tabular-nums">
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-slate-400" />
                                    {formatDateTime(entry.date)}
                                  </span>
                                  {entry.counterName && (
                                    <>
                                      <span>&middot;</span>
                                      <span className="font-medium text-slate-600">
                                        {entry.counterName}
                                      </span>
                                    </>
                                  )}
                                  {entry.paymentMethod && (
                                    <>
                                      <span>&middot;</span>
                                      <span>{entry.paymentMethod}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={`text-sm font-black font-mono tabular-nums ${
                                  isSale ? 'text-amber-700' : 'text-emerald-700'
                                }`}
                              >
                                {isSale ? '+' : '-'}Rs. {entry.amount.toLocaleString()}
                              </span>
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                {isSale ? 'Credit Bill' : isRefund ? 'Refunded' : 'Paid'}
                              </p>
                            </div>
                          </div>

                          {/* Itemized Purchased Medicines Table for Credit Sales / Refunds */}
                          {entryItems.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-amber-200/60">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                                  <Package className="w-3 h-3 text-emerald-700" />
                                  Purchased Items ({entryItems.length} {entryItems.length === 1 ? 'item' : 'items'})
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  Qty &times; Rate = Subtotal
                                </span>
                              </div>
                              <div className="bg-white/90 rounded-lg border border-slate-200/80 divide-y divide-slate-100">
                                {entryItems.map((item, idx) => (
                                  <div
                                    key={`${entry.id}_item_${idx}`}
                                    className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                                        {idx + 1}
                                      </span>
                                      <span className="font-bold text-slate-800 truncate">
                                        {item.medicineName}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px] uppercase shrink-0">
                                        {item.quantity} {item.unitType === 'pack' ? (item.quantity > 1 ? 'Packs' : 'Pack') : 'Loose'}
                                      </span>
                                    </div>
                                    <div className="text-right font-mono text-xs shrink-0 tabular-nums">
                                      <span className="text-slate-400 text-[11px] mr-2">
                                        @ Rs. {item.pricePerUnit.toLocaleString()}
                                      </span>
                                      <span className="font-bold text-slate-900">
                                        Rs. {item.subtotal.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {entry.note && (
                            <p className="mt-2 text-[11px] text-slate-600 italic bg-white/60 px-2.5 py-1 rounded-lg border border-slate-200/60">
                              Note: {entry.note}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Customer Khata Account */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                New Customer Khata Account
              </h3>
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Customer Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="e.g. Nadeem Ahmed"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Phone / WhatsApp Number
                </label>
                <input
                  type="text"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="0300 123 4567"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono tabular-nums focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Mohallah / Address
                </label>
                <input
                  type="text"
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                  placeholder="e.g. Ghazipur Jalalpur Pirwala"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Opening Balance Due (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newCustomerOpeningBalance}
                  onChange={(e) => setNewCustomerOpeningBalance(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono tabular-nums focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Manual Credit Bill */}
      {showAddCreditModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                Add Credit Bill &middot; {selectedCustomer.name}
              </h3>
              <button
                onClick={() => setShowAddCreditModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleAddCreditSale} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Credit Bill Amount (Rs.) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 850"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono tabular-nums focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Invoice / Reference Number
                </label>
                <input
                  type="text"
                  value={creditInvoice}
                  onChange={(e) => setCreditInvoice(e.target.value)}
                  placeholder="e.g. DEMO-1049"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Medicine / Bill Note
                </label>
                <input
                  type="text"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="e.g. Insulin + BP tablets"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCreditModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Add to Khata
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
