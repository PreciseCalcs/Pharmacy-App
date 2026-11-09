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
  | 'Pack'
  | 'Piece'
  | 'Bottle'
  | 'Tube'
  | 'Box'
  | 'Roll'
  | 'Kit'
  | 'Other';

export type ProductDepartment = 
  | 'pharmacy' 
  | 'personal_care' 
  | 'general_store' 
  | 'mother_baby' 
  | 'surgical';

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
  | 'Personal Care & Sexual Wellness'
  | 'Feminine Hygiene & Care'
  | 'Baby & Mother Care'
  | 'Personal Hygiene & Grooming'
  | 'General Store & FMCG'
  | 'Medical Devices & Surgical'
  | 'General / Other';

export type UserRole = 'owner' | 'pharmacist' | 'cashier';

export interface UserAccount {
  id: string;
  name: string;
  role: UserRole;
  pin: string; // 4-6 digit numeric PIN / password
  phone?: string;
  email?: string;
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
  department?: ProductDepartment;
  dosageForm: DosageForm;
  strength: string;
  unitsPerPack: number;
  unitCostPrice: number;
  unitRetailPrice: number;
  looseCostPrice: number;
  looseRetailPrice: number;
  currentStockPacks: number;
  currentStockLoose: number;
  minThresholdPacks: number;
  batchNumber: string;
  expiryDate: string;
  shelfLocation: string;
  manufacturer: string;
  requiresPrescription: boolean;
  supplier?: string;
  sideEffects?: string;
  precautions?: string;
  notes?: string;
  imageUrl?: string; // Product photo URL / base64 image data
  reorderStatus?: 'needed' | 'ordered';
  orderedAt?: string;
  created?: string;
  updated?: string;
}

export interface MedicineRecord {
  id: string;
  name: string;
  generic_name: string;
  sku: string;
  barcode: string;
  category: string;
  department?: string;
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
  image_url?: string;
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
  counter_name?: string;
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
  pricePerUnit: number;
  costPerUnit: number;
  subtotal: number;
  profit: number;
  batchNumber: string;
  expiryDate: string;
}

export type PaymentMethod = 'Cash' | 'Card' | 'EasyPaisa' | 'JazzCash' | 'Credit';

export interface SaleTransaction {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerId?: string;
  counterName?: string;
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
  refundedAt?: string;
  refundedBy?: string;
  refundReason?: string;
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
  ntnNumber?: string;
  phone: string;
  emergencyPhone?: string;
  ownerName?: string;
  ownerTitle?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  logoUrl?: string;
  tagline: string;
  thankYouMessage: string;
  pocketBaseUrl?: string;
}

export interface PharmacyCounter {
  id: string;
  name: string;
  locationNote: string;
  isDefault?: boolean;
}

export interface KhataEntry {
  id: string;
  type: 'sale' | 'payment' | 'refund';
  invoiceNumber?: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  date: string;
  note?: string;
}

export interface CustomerKhata {
  id: string;
  name: string;
  phone: string;
  address?: string;
  balanceDue: number; // >0 means customer owes pharmacy
  history: KhataEntry[];
  updatedAt: string;
  createdAt: string;
}

export const DEFAULT_PHARMACY_DETAILS: PharmacyDetails = {
  name: 'Zahid Medical Store',
  address: 'Main Bazar Ghazipur Jalalpur Pirwala',
  city: 'Multan, Punjab, Pakistan',
  drugLicenceNumber: '04-361-0047-139936M',
  ntnNumber: '7482910-4',
  phone: '03067617080',
  emergencyPhone: '03007307080',
  ownerName: 'Dr. Zahid Hussain',
  ownerTitle: 'Owner / Pharmacist',
  ownerPhone: '03067617080',
  ownerEmail: 'zahid.pharmacy.multan@gmail.com',
  tagline: 'Your Trusted Health & Community Pharmacy',
  thankYouMessage: 'Thank you for your visit. Medicines once sold can only be exchanged within 3 days with receipt under safe storage conditions.',
  pocketBaseUrl: 'http://127.0.0.1:8090',
};

export const ZAHID_PHARMACY_DETAILS: PharmacyDetails = DEFAULT_PHARMACY_DETAILS;

export const DEFAULT_COUNTERS: PharmacyCounter[] = [
  { id: 'cnt_main', name: 'Main Counter', locationNote: 'Front register', isDefault: true },
  { id: 'cnt_02', name: 'Counter 02', locationNote: 'Second register' },
  { id: 'cnt_03', name: 'Counter 3', locationNote: 'Dispense counter' },
];

export const INITIAL_KHATA_CUSTOMERS: CustomerKhata[] = [
  {
    id: 'kht_nadeem_01',
    name: 'Nadeem Ahmed',
    phone: '0300 123 4567',
    address: 'Ghazipur Jalalpur Pirwala',
    balanceDue: 1630,
    updatedAt: '2026-11-08T09:30:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    history: [
      {
        id: 'ent_01',
        type: 'payment',
        description: 'Payment · Cash',
        amount: 100,
        paymentMethod: 'Cash',
        date: '2026-11-08T09:30:00.000Z',
        note: 'Counter payment',
      },
      {
        id: 'ent_02',
        type: 'sale',
        invoiceNumber: 'DEMO-1042',
        description: 'Credit sale · DEMO-1042',
        amount: 940,
        paymentMethod: 'Credit',
        date: '2026-11-08T08:15:00.000Z',
      },
      {
        id: 'ent_03',
        type: 'sale',
        invoiceNumber: 'DEMO-1035',
        description: 'Credit sale · DEMO-1035',
        amount: 1440,
        paymentMethod: 'Credit',
        date: '2026-11-07T14:20:00.000Z',
      },
      {
        id: 'ent_04',
        type: 'payment',
        description: 'Payment · Cash · Part payment',
        amount: 250,
        paymentMethod: 'Cash',
        date: '2026-11-07T11:00:00.000Z',
        note: 'Part payment',
      },
    ],
  },
  {
    id: 'kht_yasmeen_02',
    name: 'Yasmeen Bibi',
    phone: '0301 234 5678',
    address: 'Mohallah Shaikhan',
    balanceDue: 0,
    updatedAt: '2026-11-08T10:00:00.000Z',
    createdAt: '2026-11-02T11:00:00.000Z',
    history: [
      {
        id: 'ent_05',
        type: 'sale',
        invoiceNumber: 'DEMO-1041',
        description: 'Credit sale · DEMO-1041',
        amount: 640,
        paymentMethod: 'Credit',
        date: '2026-11-08T07:45:00.000Z',
      },
      {
        id: 'ent_06',
        type: 'payment',
        description: 'Payment · Cash · Full settlement',
        amount: 640,
        paymentMethod: 'Cash',
        date: '2026-11-08T10:00:00.000Z',
      },
    ],
  },
  {
    id: 'kht_hamza_03',
    name: 'Hamza Ali',
    phone: '0302 345 6789',
    address: 'Main Bazar',
    balanceDue: 0,
    updatedAt: '2026-11-06T16:00:00.000Z',
    createdAt: '2026-11-03T09:00:00.000Z',
    history: [
      {
        id: 'ent_07',
        type: 'payment',
        description: 'Payment · EasyPaisa',
        amount: 450,
        paymentMethod: 'EasyPaisa',
        date: '2026-11-06T16:00:00.000Z',
      },
    ],
  },
];

export type PrintFormat = 'thermal-80' | 'thermal-58' | 'a4';

export interface ConnectionStatus {
  isConnected: boolean;
  isPocketBaseLive: boolean;
  origin: string;
  lastChecked: string;
  pendingSyncCount: number;
  errorMessage?: string;
}
