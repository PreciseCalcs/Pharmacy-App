import React, { useState, useEffect, useRef } from 'react';
import { X, Pill, Save, Sparkles, AlertCircle, Upload, Trash2, Image as ImageIcon, ShoppingBag, Heart, RefreshCw, Barcode } from 'lucide-react';
import { DosageForm, MedicineCategory, MedicineItem, ProductDepartment } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';
import { getExpiryBadgeMeta } from '../utils/pharmacyHelpers';
import { BarcodeGenerator, generateSmartBarcode } from './BarcodeGenerator';

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
  'Personal Care & Sexual Wellness',
  'Feminine Hygiene & Care',
  'Baby & Mother Care',
  'Personal Hygiene & Grooming',
  'General Store & FMCG',
  'Medical Devices & Surgical',
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
  'Pack',
  'Piece',
  'Bottle',
  'Tube',
  'Box',
  'Roll',
  'Kit',
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
    department: 'pharmacy',
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
    imageUrl: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        department: 'pharmacy',
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
        imageUrl: '',
      });
    }
  }, [medicine, isOpen]);

  // Handle product photo upload as base64
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('Please select a valid image file (JPG, PNG, WEBP, SVG)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImageError('Image must be under 2MB in size');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const base64 = loadEvent.target?.result as string;
      setFormData((prev) => ({ ...prev, imageUrl: base64 }));
      soundService.click();
    };
    reader.readAsDataURL(file);
  };

  // Auto-set department when category changes
  const handleCategoryChange = (category: MedicineCategory) => {
    let dept: ProductDepartment = 'pharmacy';
    if (category === 'Personal Care & Sexual Wellness' || category === 'Feminine Hygiene & Care' || category === 'Personal Hygiene & Grooming') {
      dept = 'personal_care';
    } else if (category === 'Baby & Mother Care') {
      dept = 'mother_baby';
    } else if (category === 'General Store & FMCG') {
      dept = 'general_store';
    } else if (category === 'Medical Devices & Surgical') {
      dept = 'surgical';
    }
    setFormData((prev) => ({ ...prev, category, department: dept }));
  };

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

          {/* Product Image & Department Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden flex items-center justify-center shadow-2xs">
                {formData.imageUrl ? (
                  <img
                    src={formData.imageUrl}
                    alt="Product preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-2 text-slate-400">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                    <span className="text-[10px] leading-tight block">No Photo</span>
                  </div>
                )}
              </div>
              {formData.imageUrl && (
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, imageUrl: '' }))}
                  className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1 shadow-xs"
                  title="Remove image"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex-1 w-full space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Product Image (Medicines & General Store Items)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Upload photo of medicine pack, condoms, personal care, baby products, or FMCG item.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 shadow-2xs"
                  >
                    <Upload className="w-3 h-3 text-slate-500" />
                    <span>Upload photo</span>
                  </button>
                </div>
              </div>

              {imageError && (
                <p className="text-[11px] text-rose-600">{imageError}</p>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Or paste image URL (https://...)"
                  value={formData.imageUrl || ''}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Clinical & Brand Details */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-emerald-800">
                1. Item Classification & Brand
              </h4>
              <span className="text-[10px] text-slate-500 font-medium">
                Supports Medicines, Condoms, Baby items & General FMCG
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Product / Brand Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Durex Extra Safe / Panadol 500mg"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Generic Formula / Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Natural Rubber Latex / Paracetamol"
                  value={formData.genericName || ''}
                  onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Strength / Spec / Size</label>
                <input
                  type="text"
                  placeholder="e.g. 500mg, 3s Pack, 250ml, Large"
                  value={formData.strength || ''}
                  onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => handleCategoryChange(e.target.value as MedicineCategory)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <optgroup label="General Store & Personal Items">
                    <option value="Personal Care & Sexual Wellness">Personal Care & Sexual Wellness (Condoms, Lube, Tests)</option>
                    <option value="Feminine Hygiene & Care">Feminine Hygiene & Care (Sanitary Pads)</option>
                    <option value="Baby & Mother Care">Baby & Mother Care (Diapers, Formula Milk)</option>
                    <option value="Personal Hygiene & Grooming">Personal Hygiene & Grooming (Razors, Soaps)</option>
                    <option value="General Store & FMCG">General Store & FMCG (Shampoos, Drinks, First Aid)</option>
                    <option value="Medical Devices & Surgical">Medical Devices & Surgical (Strips, BP, Syringes)</option>
                  </optgroup>
                  <optgroup label="Clinical Pharmacy Medicines">
                    <option value="Analgesics & Pain">Analgesics & Pain</option>
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Gastrointestinal">Gastrointestinal</option>
                    <option value="Respiratory">Respiratory</option>
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Anti-Diabetic">Anti-Diabetic</option>
                    <option value="Vitamins & Supplements">Vitamins & Supplements</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Pediatric">Pediatric</option>
                    <option value="Gynecology">Gynecology</option>
                    <option value="ENT">ENT</option>
                    <option value="Ophthalmology">Ophthalmology</option>
                    <option value="Psychiatric & Neuro">Psychiatric & Neuro</option>
                    <option value="General / Other">General / Other</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unit / Packaging Form</label>
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
                <label className="block font-semibold text-slate-700 mb-1">Manufacturer / Brand Owner</label>
                <input
                  type="text"
                  placeholder="e.g. Reckitt, P&G, GSK, Nestle"
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

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">
                    Expiry Date (YYYY-MM-DD) <span className="text-rose-500">*</span>
                  </label>
                  {formData.expiryDate && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        getExpiryBadgeMeta(formData.expiryDate).badgeClass
                      }`}
                    >
                      {getExpiryBadgeMeta(formData.expiryDate).horizonLabel} (
                      {getExpiryBadgeMeta(formData.expiryDate).shortLabel})
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  required
                  value={formData.expiryDate || ''}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-slate-400 mr-1">Quick set:</span>
                  {[
                    { label: '+25d (≤30d)', days: 25 },
                    { label: '+45d (≤60d)', days: 45 },
                    { label: '+75d (≤90d)', days: 75 },
                    { label: '+6 Months', days: 180 },
                    { label: '+1 Year', days: 365 },
                    { label: '+2 Years', days: 730 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + preset.days);
                        setFormData({
                          ...formData,
                          expiryDate: d.toISOString().slice(0, 10),
                        });
                        soundService.click();
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium border border-slate-200 transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="block font-semibold text-slate-700 flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Barcode / GTIN (Scan or Generate)</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          barcode: generateSmartBarcode('ean13_pk', undefined, formData.name),
                        });
                        soundService.click();
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-0.5 cursor-pointer"
                      title="Generate 13-Digit GS1 Pakistan Barcode"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>13-Digit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          barcode: generateSmartBarcode('short_8', undefined, formData.name),
                        });
                        soundService.click();
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 text-slate-700 font-bold border border-slate-200 cursor-pointer"
                      title="Generate 8-Digit Compact Store Barcode"
                    >
                      8-Digit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          barcode: generateSmartBarcode('zms_sku', undefined, formData.name || 'ZMS'),
                        });
                        soundService.click();
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 text-slate-700 font-bold border border-slate-200 cursor-pointer"
                      title="Generate ZMS-SKU Custom Store Barcode"
                    >
                      ZMS-Code
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Scan factory barcode or click a generator button above"
                  value={formData.barcode || ''}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900"
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

              <div className=" flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200 p-1.5">
                <BarcodeGenerator
                  value={formData.barcode || formData.sku || '8964000000000'}
                  type="code128"
                  width={130}
                  height={28}
                  showText={true}
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
