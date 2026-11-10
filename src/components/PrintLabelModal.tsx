import React, { useState, useEffect } from 'react';
import { X, Printer, Tag, Download, RefreshCw, Barcode, ExternalLink } from 'lucide-react';
import { MedicineItem, ZAHID_PHARMACY_DETAILS } from '../types/pharmacy';
import { BarcodeGenerator, generateSmartBarcode } from './BarcodeGenerator';
import { formatPKR, getPieceRetailPrice } from '../utils/pharmacyHelpers';
import { formatDate } from '../utils/dates';
import { syncEngine } from '../services/syncEngine';
import { generateBarcodeLabelsPDF, BarcodeLabelPaperLayout } from '../services/pdfGenerator';
import { soundService } from '../services/soundAlerts';

interface PrintLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: MedicineItem | null;
  onOpenInBarcodeStudio?: (med: MedicineItem) => void;
  onMedicineUpdated?: () => void;
}

export const PrintLabelModal: React.FC<PrintLabelModalProps> = ({
  isOpen,
  onClose,
  medicine,
  onOpenInBarcodeStudio,
  onMedicineUpdated,
}) => {
  const [copies, setCopies] = useState(4);
  const [includeQR, setIncludeQR] = useState(false);
  const [includePrice, setIncludePrice] = useState(true);
  const [paperLayout, setPaperLayout] = useState<BarcodeLabelPaperLayout>('thermal_50x25');
  const [activeBarcode, setActiveBarcode] = useState('');
  const [isUpdatingBarcode, setIsUpdatingBarcode] = useState(false);

  const pharmacyDetails = syncEngine.getPharmacyDetails() || ZAHID_PHARMACY_DETAILS;

  useEffect(() => {
    if (medicine) {
      setActiveBarcode(medicine.barcode || medicine.sku);
    }
  }, [medicine]);

  if (!isOpen || !medicine) return null;

  const piecePrice = getPieceRetailPrice(medicine);

  const handleGenerateNewBarcode = async () => {
    setIsUpdatingBarcode(true);
    try {
      const generated = generateSmartBarcode('ean13_pk', undefined, medicine.name);
      await syncEngine.updateMedicine(medicine.id, { barcode: generated });
      setActiveBarcode(generated);
      onMedicineUpdated?.();
      soundService.scanSuccess();
    } finally {
      setIsUpdatingBarcode(false);
    }
  };

  const handleDownloadPdf = () => {
    generateBarcodeLabelsPDF(
      [
        {
          id: medicine.id,
          productName: medicine.name,
          genericOrStrength: `${medicine.strength}`,
          barcodeValue: activeBarcode,
          sku: medicine.sku,
          packPrice: medicine.unitRetailPrice,
          unitPrice: piecePrice,
          priceDisplayMode: includePrice ? 'pack' : 'none',
          batchNumber: medicine.batchNumber,
          expiryDate: medicine.expiryDate,
          shelfLocation: medicine.shelfLocation,
          copies,
        },
      ],
      {
        layout: paperLayout,
        showStoreHeader: true,
        showBatchAndExpiry: true,
        showShelfLocation: true,
        showCutBorders: true,
      }
    );
    soundService.cashRegister();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#072418] text-emerald-400 flex items-center justify-center shrink-0">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Product Barcode &amp; Shelf Sticker Printer
              </h3>
              <p className="text-xs text-slate-500">
                Generate a user barcode or print thermal / A4 stickers for {medicine.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenInBarcodeStudio && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInBarcodeStudio({ ...medicine, barcode: activeBarcode });
                }}
                className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <Barcode className="w-3.5 h-3.5" />
                <span>Full Barcode Studio</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barcode Assignment & Customization Controls */}
        <div className="p-4 bg-slate-100/70 border-b border-slate-200 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Active Barcode:</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-emerald-300 font-mono font-bold tracking-wider">
                {activeBarcode}
              </span>
              <button
                type="button"
                disabled={isUpdatingBarcode}
                onClick={handleGenerateNewBarcode}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-300 text-slate-800 font-bold flex items-center gap-1 transition cursor-pointer"
                title="Generate a new unique 13-digit barcode and save it to this product"
              >
                <RefreshCw className={`w-3 h-3 text-emerald-700 ${isUpdatingBarcode ? 'animate-spin' : ''}`} />
                <span>Generate &amp; Save New Barcode</span>
              </button>
            </div>

            <select
              value={paperLayout}
              onChange={(e) => setPaperLayout(e.target.value as BarcodeLabelPaperLayout)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700"
            >
              <option value="thermal_50x25">Thermal Roll 50 × 25 mm</option>
              <option value="thermal_40x30">Thermal Roll 40 × 30 mm</option>
              <option value="a4_40">A4 Sheet (40 Stickers)</option>
              <option value="a4_65">A4 Mini Sheet (65 Stickers)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                <span>Copies:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white text-center font-mono font-bold"
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-3.5 py-2 rounded-xl bg-[#072418] hover:bg-[#0c3927] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download PDF ({copies})</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>

        {/* Label Preview Grid (print target) */}
        <div className="p-6 overflow-y-auto bg-slate-50/50">
          <div id="printable-shelf-label" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: Math.min(copies, 24) }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border-2 border-slate-800 rounded-xl p-3.5 shadow-xs flex flex-col justify-between text-left"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
                    <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-800">
                      {pharmacyDetails.name}
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
                      value={activeBarcode}
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
