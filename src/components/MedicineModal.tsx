import React, { useState, useEffect } from 'react';
import { X, Pill, Save, Sparkles, AlertCircle } from 'lucide-react';
import { DosageForm, MedicineCategory, MedicineItem } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';

interface MedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: MedicineItem | null; // null for new medicine
  onSave: (data: Partial<MedicineItem>) => Promise<void>;
}

const CATEGORIES: MedicineCategory[] = [
  'Antibiotics',
  'Analgesics & Pain',
  'Cardiovascular',
  'Gastrointestinal',
  'Respiratory',
  'Anti-Diabetic',
  'Vitamins & Supplements',
  'Dermatology',
  'Psychiatric & Neuro',
  'Pediatric',
  'Gynecology',
  'Ophthalmology',
  'ENT',
  'General / Other',
];

const DOSAGE_FORMS: DosageForm[] = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Drops',
  'Ointment',
  'Cream',
  'Inhaler',
  'Sachet',
  'Patch',
  'Infusion',
  'Other',
];

export const MedicineModal: React.FC<MedicineModalProps> = ({
  isOpen,
  onClose,
  medicine,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<MedicineItem>>({
    name: '',
    genericName: '',
    barcode: '',
    sku: '',
    category: 'Analgesics & Pain',
    dosageForm: 'Tablet',
    strength: '500mg',
    unitsPerPack: 10,
    unitCostPrice: 100,
    unitRetailPrice: 130,
    looseCostPrice: 10,
    looseRetailPrice: 13,
    currentStockPacks: 10,
    currentStockLoose: 0,
    minThresholdPacks: 5,
    batchNumber: 'B-101',
    expiryDate: '2027-12-31',
    shelfLocation: 'Rack A-1',
    manufacturer: 'Local Pharma',
    requiresPrescription: false,
    supplier: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (medicine) {
      setFormData({ ...medicine });
    } else {
      // Default new medicine template
      const randomCode = `8964${Math.floor(10000000 + Math.random() * 90000000)}`;
      setFormData({
        name: '',
        genericName: '',
        barcode: randomCode,
        sku: `MED-${Date.now().toString().slice(-6)}`,
        category: 'Analgesics & Pain',
        dosageForm: 'Tablet',
        strength: '500mg',
        unitsPerPack: 20,
        unitCostPrice: 200,
        unitRetailPrice: 260,
        looseCostPrice: 10,
        looseRetailPrice: 13,
        currentStockPacks: 10,
        currentStockLoose: 0,
        minThresholdPacks: 5,
        batchNumber: `B-${Math.floor(1000 + Math.random() * 9000)}`,
        expiryDate: '2027-12-31',
        shelfLocation: 'Rack A-01',
        manufacturer: 'GSK Pakistan',
        requiresPrescription: false,
        supplier: 'Multan Distributors',
        notes: '',
      });
    }
  }, [medicine, isOpen]);

  // Recalculate loose prices when pack price or units per pack changes
  const handlePackPriceChange = (cost: number, retail: number, units: number) => {
    const validUnits = units > 0 ? units : 1;
    setFormData((prev) => ({
      ...prev,
      unitCostPrice: cost,
      unitRetailPrice: retail,
      unitsPerPack: validUnits,
      looseCostPrice: Number((cost / validUnits).toFixed(2)),
      looseRetailPrice: Number((retail / validUnits).toFixed(2)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name?.trim()) {
      setError('Medicine name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      soundService.cashRegister();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save medicine');
      soundService.errorTone();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {medicine ? 'Edit Medicine Inventory Record' : 'Register New Medicine Item'}
              </h3>
              <p className="text-xs text-slate-500">
                Configure brand, formula, barcode, pricing (PKR), and stock levels
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section: Clinical & Brand Details */}
          <div>
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 text-emerald-800">
              1. Brand & Formulation
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Brand Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Panadol Extra"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Generic Formula <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paracetamol + Caffeine"
                  value={formData.genericName || ''}
                  onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Strength / Potency</label>
                <input
                  type="text"
                  placeholder="e.g. 500mg, 10mg/5ml"
                  value={formData.strength || ''}
                  onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Therapeutic Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as MedicineCategory })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dosage Form</label>
                <select
                  value={formData.dosageForm}
                  onChange={(e) => setFormData({ ...formData, dosageForm: e.target.value as DosageForm })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {DOSAGE_FORMS.map((form) => (
                    <option key={form} value={form}>
                      {form}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Manufacturer</label>
                <input
                  type="text"
                  placeholder="e.g. GSK, Abbott, Getz"
                  value={formData.manufacturer || ''}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Pricing & Pack Breakdown */}
          <div className="pt-2 border-t border-slate-200">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 text-emerald-800">
              2. Packaging & Pakistani Rupee (PKR) Rates
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Units per Pack</label>
                <input
                  type="number"
                  min={1}
                  value={formData.unitsPerPack || 1}
                  onChange={(e) => {
                    const u = parseInt(e.target.value) || 1;
                    handlePackPriceChange(formData.unitCostPrice || 0, formData.unitRetailPrice || 0, u);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pack Cost (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formData.unitCostPrice || 0}
                  onChange={(e) => {
                    const c = parseFloat(e.target.value) || 0;
                    handlePackPriceChange(c, formData.unitRetailPrice || 0, formData.unitsPerPack || 1);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pack Retail MRP (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formData.unitRetailPrice || 0}
                  onChange={(e) => {
                    const r = parseFloat(e.target.value) || 0;
                    handlePackPriceChange(formData.unitCostPrice || 0, r, formData.unitsPerPack || 1);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loose Retail (Rs./Unit)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.looseRetailPrice || 0}
                  onChange={(e) => setFormData({ ...formData, looseRetailPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono bg-emerald-50/50"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loose Cost (Rs./Unit)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.looseCostPrice || 0}
                  onChange={(e) => setFormData({ ...formData, looseCostPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Section: Stock, Batch & Expiry */}
          <div className="pt-2 border-t border-slate-200">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 text-emerald-800">
              3. Stock Inventory, Batch & Shelf Location
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Packs on Shelf</label>
                <input
                  type="number"
                  min={0}
                  value={formData.currentStockPacks || 0}
                  onChange={(e) => setFormData({ ...formData, currentStockPacks: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loose Units on Shelf</label>
                <input
                  type="number"
                  min={0}
                  value={formData.currentStockLoose || 0}
                  onChange={(e) => setFormData({ ...formData, currentStockLoose: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Low-Stock Alert Level</label>
                <input
                  type="number"
                  min={1}
                  value={formData.minThresholdPacks || 5}
                  onChange={(e) => setFormData({ ...formData, minThresholdPacks: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Shelf Location Rack</label>
                <input
                  type="text"
                  placeholder="e.g. Rack A-02"
                  value={formData.shelfLocation || ''}
                  onChange={(e) => setFormData({ ...formData, shelfLocation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Batch Number</label>
                <input
                  type="text"
                  placeholder="e.g. B-7041"
                  value={formData.batchNumber || ''}
                  onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Expiry Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  required
                  value={formData.expiryDate || ''}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Barcode / GTIN</label>
                <input
                  type="text"
                  value={formData.barcode || ''}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Internal SKU</label>
                <input
                  type="text"
                  value={formData.sku || ''}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={formData.requiresPrescription || false}
                  onChange={(e) => setFormData({ ...formData, requiresPrescription: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Requires Doctor Prescription (Schedule G/H)</span>
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Medicine Record'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
