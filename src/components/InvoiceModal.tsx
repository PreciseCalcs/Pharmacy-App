import React, { useState, useEffect } from 'react';
import { X, Printer, CheckCircle2, MessageSquare, RotateCcw, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  PharmacyDetails,
  PrintFormat,
  SaleTransaction,
  ZAHID_PHARMACY_DETAILS,
} from '../types/pharmacy';
import {
  DEFAULT_URDU_REFUND_POLICY,
  generateReceiptHtml,
  RECEIPT_MARKETING_FOOTER,
} from '../utils/receiptTemplate';
import { formatDateTime } from '../utils/dates';
import { formatPKR } from '../utils/pharmacyHelpers';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: SaleTransaction | null;
  pharmacyDetails?: PharmacyDetails;
  currentStaffName?: string;
  onTransactionUpdated?: (updated: SaleTransaction) => void;
}

const QUICK_REFUND_REASONS = [
  'Customer return / Changed mind',
  'Doctor changed prescription',
  'Wrong strength or item dispensed',
  'Packaging issue / Near expiry exchange',
];

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  transaction,
  pharmacyDetails,
  currentStaffName = 'Counter Staff',
  onTransactionUpdated,
}) => {
  const [printFormat, setPrintFormat] = useState<PrintFormat>('thermal-80');
  const [showRefundPanel, setShowRefundPanel] = useState(false);
  const [refundReason, setRefundReason] = useState(QUICK_REFUND_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [liveTxn, setLiveTxn] = useState<SaleTransaction | null>(transaction);

  useEffect(() => {
    setLiveTxn(transaction);
    setShowRefundPanel(false);
    setRefundError(null);
  }, [transaction, isOpen]);

  useEffect(() => {
    if (isOpen && transaction && transaction.status !== 'refunded') {
      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {}
    }
  }, [isOpen, transaction]);

  if (!isOpen || !liveTxn) return null;

  const details =
    pharmacyDetails || syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;

  const handlePrint = () => {
    window.print();
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liveTxn.status === 'refunded') return;
    setIsRefunding(true);
    setRefundError(null);
    try {
      const finalReason = customReason.trim()
        ? `${refundReason} - ${customReason.trim()}`
        : refundReason;
      const updated = await syncEngine.refundSale(
        liveTxn.id,
        currentStaffName,
        finalReason
      );
      soundService.cashRegister();
      setLiveTxn(updated);
      setShowRefundPanel(false);
      onTransactionUpdated?.(updated);
    } catch (err: any) {
      soundService.errorTone();
      setRefundError(err?.message || 'Failed to process receipt return.');
    } finally {
      setIsRefunding(false);
    }
  };

  const handleWhatsAppShare = () => {
    const phone = liveTxn.customerPhone
      ? liveTxn.customerPhone.replace(/[^0-9]/g, '')
      : '';
    const cleanPhone = phone.startsWith('0') ? `92${phone.slice(1)}` : phone;
    const urduPolicy =
      details.urduRefundPolicy?.trim() || DEFAULT_URDU_REFUND_POLICY;

    let text = `*${details.name}*\n`;
    text += `${details.address}, ${details.city}\n`;
    text += `Licence: ${details.drugLicenceNumber}${
      details.ntnNumber ? ` | NTN: ${details.ntnNumber}` : ''
    }\n`;
    if (details.phone) {
      text += `Phone: ${details.phone}\n`;
    }
    text += `--------------------------------\n`;
    text += `Invoice: ${liveTxn.invoiceNumber}\n`;
    if (liveTxn.status === 'refunded') {
      text += `STATUS: REFUNDED / RETURNED\n`;
    }
    text += `Date: ${formatDateTime(liveTxn.createdAt)}\n`;
    text += `Customer: ${liveTxn.customerName}\n`;
    text += `--------------------------------\n`;
    liveTxn.items.forEach((item, i) => {
      text += `${i + 1}. ${item.medicineName} (${item.quantity} ${item.unitType}) - Rs. ${item.subtotal}\n`;
    });
    text += `--------------------------------\n`;
    text += `Subtotal: Rs. ${liveTxn.subtotal}\n`;
    if (liveTxn.discountAmount > 0) {
      text += `Discount (${liveTxn.discountPercent}%): -Rs. ${liveTxn.discountAmount}\n`;
    }
    text += `*Net Total: Rs. ${liveTxn.totalAmount}*\n`;
    text += `Payment: ${liveTxn.paymentMethod}\n`;
    text += `Receipt Barcode: *${liveTxn.invoiceNumber}*\n`;
    text += `--------------------------------\n`;
    text += `*ہدایات برائے واپسی و تبدیلی:*\n${urduPolicy}\n`;
    text += `--------------------------------\n`;
    text += `_Wishing you speedy recovery & good health_\n`;
    text += `${RECEIPT_MARKETING_FOOTER}`;

    const encoded = encodeURIComponent(text);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const receiptHtml = generateReceiptHtml(liveTxn, printFormat, details);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {liveTxn.status === 'refunded' ? (
              <RotateCcw className="w-5 h-5 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  {liveTxn.status === 'refunded'
                    ? 'Returned & Refunded Receipt'
                    : 'Sale Dispensed & Invoiced'}
                </h3>
                {liveTxn.status === 'refunded' && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase">
                    Refunded
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Receipt Barcode / Invoice #{liveTxn.invoiceNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector & Quick Actions */}
        <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Print Paper:</span>
            {(['thermal-80', 'thermal-58', 'a4'] as PrintFormat[]).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setPrintFormat(fmt)}
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition cursor-pointer ${
                  printFormat === fmt
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {fmt.replace('-', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {liveTxn.status !== 'refunded' && (
              <button
                type="button"
                onClick={() => setShowRefundPanel(!showRefundPanel)}
                className={`px-2.5 py-1 rounded-md border font-bold flex items-center gap-1 transition cursor-pointer ${
                  showRefundPanel
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                }`}
                title="Process return & restore stock for this receipt"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return / Refund</span>
              </button>
            )}
            <button
              onClick={handleWhatsAppShare}
              className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-medium flex items-center gap-1 cursor-pointer"
              title="Share digital receipt on WhatsApp"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Inline Return / Refund Confirmation Drawer inside Receipt Modal */}
        {showRefundPanel && liveTxn.status !== 'refunded' && (
          <form
            onSubmit={handleProcessRefund}
            className="p-4 bg-rose-50/90 border-b border-rose-200 space-y-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-900 font-extrabold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Confirm Counter Return for Invoice #{liveTxn.invoiceNumber} (
                  {formatPKR(liveTxn.totalAmount)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowRefundPanel(false)}
                className="text-rose-600 hover:text-rose-900 font-bold"
              >
                Cancel
              </button>
            </div>

            <p className="text-[11px] text-rose-800">
              Restores all {liveTxn.items.length} line item(s) back into medicine stock
              {liveTxn.paymentMethod === 'Credit'
                ? ` and deducts ${formatPKR(liveTxn.totalAmount)} from ${liveTxn.customerName}'s Credit Khata.`
                : ` and logs ${formatPKR(liveTxn.totalAmount)} refund (${liveTxn.paymentMethod}).`}
            </p>

            {refundError && (
              <div className="p-2 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 font-bold">
                {refundError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white font-semibold text-slate-900"
              >
                {QUICK_REFUND_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Optional note (e.g., returned intact pack)..."
                className="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-slate-900"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isRefunding}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold flex items-center gap-1.5 shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {isRefunding
                    ? 'Restoring Stock...'
                    : `Confirm Return & Refund ${formatPKR(liveTxn.totalAmount)}`}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Live Thermal / Paper Receipt View (Print Container) */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-200/50 flex items-center justify-center">
          <div
            id="printable-zahid-invoice"
            className="bg-white p-5 rounded-xl shadow-md border border-slate-300 my-auto"
            dangerouslySetInnerHTML={{ __html: receiptHtml }}
          />
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice Receipt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
