import React, { useState } from 'react';
import { X, Link2, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { MedicineItem } from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';

interface LinkCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedCode: string;
  medicines: MedicineItem[];
  onLinked: (medicine: MedicineItem) => void;
}

export const LinkCodeModal: React.FC<LinkCodeModalProps> = ({
  isOpen,
  onClose,
  scannedCode,
  medicines,
  onLinked,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMedId, setSelectedMedId] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  if (!isOpen) return null;

  const filteredMedicines = medicines.filter((m) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q)
    );
  });

  const handleLink = async () => {
    if (!selectedMedId) return;
    setIsLinking(true);
    try {
      const updated = await syncEngine.linkBarcode(selectedMedId, scannedCode);
      soundService.cashRegister();
      onLinked(updated);
      onClose();
    } catch (e) {
      soundService.errorTone();
      alert('Failed to link barcode');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Link Unrecognized Barcode
              </h3>
              <p className="text-xs text-slate-500">Attach scanned code to an existing catalog medicine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Scanned code callout */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800 block">Scanned Code</span>
              <span className="font-mono text-sm font-bold text-slate-900">{scannedCode}</span>
            </div>
            <span className="text-xs bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded font-medium">
              Not in catalog
            </span>
          </div>

          {/* Medicine Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search medicine name, formula, or SKU to link..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              autoFocus
            />
          </div>

          {/* Medicines Selection List */}
          <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/30">
            {filteredMedicines.length === 0 ? (
              <div className="py-6 text-center text-slate-400">
                No matching medicines found in catalog.
              </div>
            ) : (
              filteredMedicines.map((m) => {
                const isSelected = selectedMedId === m.id;
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
                      <div className="font-bold text-slate-900">{m.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {m.genericName} &bull; {m.strength} &bull; SKU: {m.sku}
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

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleLink}
              disabled={!selectedMedId || isLinking}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs disabled:opacity-50"
            >
              {isLinking ? 'Linking...' : 'Confirm & Save Barcode'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
