export type DosageForm = 
  | 'Tablet'
  | 'Capsule'
  | 'Syrup'
  | 'Suspension'
  | 'Injection'
  | 'Drops'
  | 'Ointment'
  | 'Cream'
  | 'Inhaler'
  | 'Sachet'
  | 'Patch'
  | 'Infusion'
  | 'Other';

export type MedicineCategory = 
  | 'Antibiotics'
  | 'Analgesics & Pain'
  | 'Analgesics & Antipyretics'
  | 'Cardiovascular'
  | 'Gastrointestinal'
  | 'Respiratory'
  | 'Anti-Diabetic'
  | 'Endocrine & Diabetes'
  | 'Vitamins & Supplements'
  | 'Dermatology'
  | 'Psychiatric & Neuro'
  | 'Pediatric'
  | 'Gynecology'
  | 'Ophthalmology'
  | 'ENT'
  | 'General / Other';

export type UserRole = 'owner' | 'pharmacist' | 'cashier';

export interface UserAccount {
  id: string;
  name: string;
  role: UserRole;
  pin: string; // 4-6 digit numeric PIN
  phone?: string;
  isActive: boolean;
  lastLogin?: string;
}

export interface MedicineItem {
  id: string;
  name: string;
  genericName: string;
  barcode: string;
  sku: string;
  category: MedicineCategory;
  dosageForm: DosageForm;
  strength: string;
  unitsPerPack: number; // e.g. 20 tablets per pack / 1 bottle per pack
  unitCostPrice: number; // Cost price per pack in PKR
  unitRetailPrice: number; // Retail price per pack in PKR
  looseCostPrice: number; // Cost price per single piece/strip
  looseRetailPrice: number; // Retail price per single piece/strip
  currentStockPacks: number; // Packs on shelf
  currentStockLoose: number; // Loose pieces on shelf
  minThresholdPacks: number; // Alert threshold
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  shelfLocation: string; // e.g., 'Rack A-2', 'Fridge 1'
  manufacturer: string;
  requiresPrescription: boolean;
  supplier?: string;
  sideEffects?: string;
  precautions?: string;
  notes?: string;
  created?: string;
  updated?: string;
}

// Backward-compatibility alias for PocketBase table mapping
export interface MedicineRecord {
  id: string;
  name: string;
  generic_name: string;
  sku: string;
  barcode: string;
  category: string;
  dosage_form: string;
  strength: string;
  units_per_pack?: number;
  unit_price: number;
  cost_price: number;
  loose_price?: number;
  stock_quantity: number;
  loose_quantity?: number;
  min_threshold: number;
  expiry_date: string;
  batch_number: string;
  location_shelf: string;
  manufacturer?: string;
  is_prescription_required: boolean;
  notes?: string;
  created?: string;
  updated?: string;
}

export interface TransactionItem {
  medicine_id: string;
  medicine_name: string;
  generic_name: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface TransactionRecord {
  id: string;
  transaction_number: string;
  customer_name: string;
  customer_phone?: string;
  pharmacist_name: string;
  payment_method: 'Cash' | 'Card' | 'Insurance' | 'Mobile Payment' | 'EasyPaisa' | 'JazzCash' | 'Credit';
  items: TransactionItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total_amount: number;
  notes?: string;
  created: string;
}

export interface StockAdjustmentRecord {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  previous_stock: number;
  new_stock: number;
  change_amount: number;
  reason: 'Sale' | 'Restock' | 'Damaged' | 'Expired' | 'Inventory Count Correction';
  pharmacist_name: string;
  created: string;
}

export interface SaleItem {
  medicineId: string;
  medicineName: string;
  genericName: string;
  dosageForm: DosageForm;
  unitType: 'pack' | 'loose';
  unitsPerPack: number;
  quantity: number;
  pricePerUnit: number; // PKR
  costPerUnit: number; // PKR
  subtotal: number;
  profit: number;
  batchNumber: string;
  expiryDate: string;
}

export type PaymentMethod = 'Cash' | 'Card' | 'EasyPaisa' | 'JazzCash' | 'Credit';

export interface SaleTransaction {
  id: string;
  invoiceNumber: string; // e.g., ZMS-2026-0042
  customerName: string;
  customerPhone?: string;
  staffName: string;
  staffRole: UserRole;
  paymentMethod: PaymentMethod;
  items: SaleItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  totalProfit: number;
  receivedAmount: number;
  changeAmount: number;
  status: 'completed' | 'refunded';
  notes?: string;
  createdAt: string;
}

export interface StockAlert {
  id: string;
  medicineId: string;
  name: string;
  batchNumber: string;
  type: 'expired' | 'expiring_soon' | 'out_of_stock' | 'low_stock';
  urgency: 'high' | 'medium' | 'low';
  message: string;
  daysRemaining?: number;
  currentStock: number;
  threshold: number;
}

export interface PharmacyDetails {
  name: string;
  address: string;
  city: string;
  drugLicenceNumber: string;
  phone: string;
  emergencyPhone?: string;
  taxNumber?: string;
  tagline: string;
  thankYouMessage: string;
}

export const ZAHID_PHARMACY_DETAILS: PharmacyDetails = {
  name: 'Zahid Medical Store',
  address: 'Main Bazar Ghazipur Jalalpur Pirwala',
  city: 'Multan, Punjab, Pakistan',
  drugLicenceNumber: '04-361-0047-139936M',
  phone: '03067617080',
  emergencyPhone: '03007307080',
  tagline: 'Your Trusted Health & Community Pharmacy',
  thankYouMessage: 'Thank you for your visit. Medicines once sold can only be exchanged within 3 days with receipt under safe storage conditions.',
};

export type PrintFormat = 'thermal-80' | 'thermal-58' | 'a4';

export interface ConnectionStatus {
  isConnected: boolean;
  isPocketBaseLive: boolean;
  origin: string;
  lastChecked: string;
  pendingSyncCount: number;
  errorMessage?: string;
}
