import React, { useState, useEffect } from 'react';
import { X, Printer, Download, Share2, CheckCircle2, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';
import { PrintFormat, SaleTransaction, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { generateReceiptHtml } from '../utils/receiptTemplate';
import { formatDateTime } from '../utils/dates';
import { formatPKR } from '../utils/pharmacyHelpers';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: SaleTransaction | null;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  const [printFormat, setPrintFormat] = useState<PrintFormat>('thermal-80');

  useEffect(() => {
    if (isOpen && transaction) {
      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {}
    }
  }, [isOpen, transaction]);

  if (!isOpen || !transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    const phone = transaction.customerPhone ? transaction.customerPhone.replace(/[^0-9]/g, '') : '';
    const cleanPhone = phone.startsWith('0') ? `92${phone.slice(1)}` : phone;

    let text = `*${ZAHID_PHARMACY_DETAILS.name}*\n`;
    text += `Ghazipur Jalalpur Pirwala, Multan\n`;
    text += `Licence: ${ZAHID_PHARMACY_DETAILS.drugLicenceNumber}\n`;
    text += `--------------------------------\n`;
    text += `Invoice: ${transaction.invoiceNumber}\n`;
    text += `Date: ${formatDateTime(transaction.createdAt)}\n`;
    text += `Customer: ${transaction.customerName}\n`;
    text += `--------------------------------\n`;
    transaction.items.forEach((item, i) => {
      text += `${i + 1}. ${item.medicineName} (${item.quantity} ${item.unitType}) - Rs. ${item.subtotal}\n`;
    });
    text += `--------------------------------\n`;
    text += `Subtotal: Rs. ${transaction.subtotal}\n`;
    if (transaction.discountAmount > 0) {
      text += `Discount (${transaction.discountPercent}%): -Rs. ${transaction.discountAmount}\n`;
    }
    text += `*Net Total: Rs. ${transaction.totalAmount}*\n`;
    text += `Payment: ${transaction.paymentMethod}\n`;
    text += `--------------------------------\n`;
    text += `Thank you for visiting ${ZAHID_PHARMACY_DETAILS.name}!`;

    const encoded = encodeURIComponent(text);
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const receiptHtml = generateReceiptHtml(transaction, printFormat);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Sale Dispensed & Invoiced
              </h3>
              <p className="text-xs text-slate-500 font-mono">Invoice #{transaction.invoiceNumber}</p>
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
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition ${
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
            <button
              onClick={handleWhatsAppShare}
              className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-medium flex items-center gap-1"
              title="Share digital receipt on WhatsApp"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

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
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
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
