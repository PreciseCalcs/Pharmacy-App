import React, { useState } from 'react';
import { X, Printer, Tag, Sliders } from 'lucide-react';
import { MedicineItem, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { BarcodeGenerator } from './BarcodeGenerator';
import { formatPKR, getPieceRetailPrice } from '../utils/pharmacyHelpers';
import { formatDate } from '../utils/dates';

interface PrintLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: MedicineItem | null;
}

export const PrintLabelModal: React.FC<PrintLabelModalProps> = ({
  isOpen,
  onClose,
  medicine,
}) => {
  const [copies, setCopies] = useState(4);
  const [includeQR, setIncludeQR] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);

  if (!isOpen || !medicine) return null;

  const piecePrice = getPieceRetailPrice(medicine);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Shelf Label & Barcode Printer</h3>
              <p className="text-xs text-slate-500">Generate adhesive shelf tags and unit pricing labels</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Customization controls */}
        <div className="p-4 bg-slate-100/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 font-semibold text-slate-700">
              <span>Copies:</span>
              <input
                type="number"
                min={1}
                max={24}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-1 rounded border border-slate-300 bg-white text-center font-mono"
              />
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={includeQR}
                onChange={(e) => setIncludeQR(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Include QR Code</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={includePrice}
                onChange={(e) => setIncludePrice(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Include Retail Price</span>
            </label>
          </div>

          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print {copies} Shelf Labels</span>
          </button>
        </div>

        {/* Label Preview Grid (print target) */}
        <div className="p-6 overflow-y-auto bg-slate-50/50">
          <div id="printable-shelf-label" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: copies }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border-2 border-slate-800 rounded-xl p-3.5 shadow-xs flex flex-col justify-between text-left"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
                    <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-800">
                      {ZAHID_PHARMACY_DETAILS.name}
                    </span>
                    <span className="font-mono text-[9px] bg-slate-100 px-1 py-0.5 rounded text-slate-700">
                      Loc: {medicine.shelfLocation || 'Main'}
                    </span>
                  </div>

                  <h4 className="font-black text-slate-900 text-sm leading-tight">
                    {medicine.name}
                  </h4>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {medicine.genericName} &bull; {medicine.strength}
                  </div>

                  {includePrice && (
                    <div className="my-2 p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Pack MRP</span>
                        <span className="font-extrabold text-sm text-emerald-800">
                          {formatPKR(medicine.unitRetailPrice)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Per Unit / Strip</span>
                        <span className="font-bold text-xs text-slate-800">
                          Rs. {piecePrice.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <BarcodeGenerator
                      value={medicine.barcode || medicine.sku}
                      type={includeQR ? 'both' : 'code128'}
                      width={120}
                      height={32}
                      showText={true}
                    />
                  </div>
                  <div className="text-right text-[9px] text-slate-500 font-mono leading-tight">
                    <div>B: {medicine.batchNumber}</div>
                    <div className="font-bold text-slate-800">EXP: {formatDate(medicine.expiryDate)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
