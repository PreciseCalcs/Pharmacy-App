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

export interface MedicineStockBatchEntry {
  id: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  stockPacks: number;
  stockLoose?: number;
  receivedAt?: string;
  notes?: string;
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
  stockBatches?: MedicineStockBatchEntry[]; // Optional per-stock-entry batch number & expiry date tracking (FEFO)
  shelfLocation: string;
  manufacturer: string;
  requiresPrescription: boolean;
  supplier?: string;
  sideEffects?: string;
  precautions?: string;
  notes?: string;
  imageUrl?: string; // Product photo URL / base64 image data
  specialDiscountPercent?: number; // Product-specific wholesale / special discount % (e.g., 10 for 10% off)
  specialDiscountMinPacks?: number; // Minimum packs required for wholesale discount (default 1)
  specialDiscountLabel?: string; // Tag label shown with product name (e.g., 'Wholesale', 'Trade Offer', 'Special')
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
  originalPricePerUnit?: number;
  specialDiscountPercent?: number;
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

export type ExpiryHorizon = 'expired' | '30_days' | '60_days' | '90_days';

export interface StockAlert {
  id: string;
  medicineId: string;
  name: string;
  batchNumber: string;
  expiryDate?: string;
  expiryWindow?: ExpiryHorizon;
  shelfLocation?: string;
  atRiskValue?: number;
  type: 'expired' | 'expiring_soon' | 'out_of_stock' | 'low_stock';
  urgency: 'high' | 'medium' | 'low';
  message: string;
  daysRemaining?: number;
  currentStock: number;
  threshold: number;
}

export type PharmacyThemeId =
  | 'emerald_clinical'
  | 'cobalt_hospital'
  | 'teal_surgical'
  | 'apothecary_indigo'
  | 'herbal_olive'
  | 'burgundy_care';

export type PharmacyFontId =
  | 'default_system'
  | 'plus_jakarta'
  | 'ibm_plex'
  | 'dm_sans'
  | 'outfit'
  | 'source_sans';

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
  urduRefundPolicy?: string;
  marketingFooter?: string;
  pocketBaseUrl?: string;
  themeColorScheme?: PharmacyThemeId;
  fontFamily?: PharmacyFontId;
}

export interface PharmacyCounter {
  id: string;
  name: string;
  locationNote: string;
  isDefault?: boolean;
}

export interface KhataOrderItem {
  medicineId?: string;
  medicineName: string;
  quantity: number;
  unitType: 'pack' | 'loose';
  pricePerUnit: number;
  subtotal: number;
}

export interface KhataEntry {
  id: string;
  type: 'sale' | 'payment' | 'refund';
  invoiceNumber?: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  counterName?: string;
  date: string;
  note?: string;
  items?: KhataOrderItem[];
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
  tagline: 'Wishing you speedy recovery & good health',
  thankYouMessage: 'Thank you for your visit!',
  urduRefundPolicy:
    'فروخت شدہ ادویات 3 دن کے اندر اصل کمپیوٹرائزڈ رسید کے ساتھ واپس یا تبدیل ہو سکتی ہیں۔ فریج والی ادویات، کھلے پتے اور سیرپ واپس نہیں ہوں گے۔',
  marketingFooter:
    'For POS & Inventory Software, Contact: 0321-6336959 | 0306-7617080',
  pocketBaseUrl: 'http://127.0.0.1:8090',
  themeColorScheme: 'emerald_clinical',
  fontFamily: 'default_system',
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
        counterName: 'Main Counter',
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
        counterName: 'Main Counter',
        date: '2026-11-08T08:15:00.000Z',
        items: [
          {
            medicineId: 'med_augmentin_625',
            medicineName: 'Augmentin 625mg',
            quantity: 2,
            unitType: 'pack',
            pricePerUnit: 470,
            subtotal: 940,
          },
        ],
      },
      {
        id: 'ent_03',
        type: 'sale',
        invoiceNumber: 'DEMO-1035',
        description: 'Credit sale · DEMO-1035',
        amount: 1440,
        paymentMethod: 'Credit',
        counterName: 'Main Counter',
        date: '2026-11-07T14:20:00.000Z',
        items: [
          {
            medicineId: 'med_panadol_500',
            medicineName: 'Panadol 500mg',
            quantity: 1,
            unitType: 'pack',
            pricePerUnit: 640,
            subtotal: 640,
          },
          {
            medicineId: 'med_risek_20',
            medicineName: 'Risek 20mg Capsule',
            quantity: 1,
            unitType: 'pack',
            pricePerUnit: 360,
            subtotal: 360,
          },
          {
            medicineId: 'med_glucophage_500',
            medicineName: 'Glucophage 500mg',
            quantity: 2,
            unitType: 'pack',
            pricePerUnit: 220,
            subtotal: 440,
          },
        ],
      },
      {
        id: 'ent_04',
        type: 'payment',
        description: 'Payment · Cash · Part payment',
        amount: 250,
        paymentMethod: 'Cash',
        counterName: 'Main Counter',
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
        counterName: 'Counter 02',
        date: '2026-11-08T07:45:00.000Z',
        items: [
          {
            medicineId: 'med_panadol_500',
            medicineName: 'Panadol 500mg',
            quantity: 1,
            unitType: 'pack',
            pricePerUnit: 640,
            subtotal: 640,
          },
        ],
      },
      {
        id: 'ent_06',
        type: 'payment',
        description: 'Payment · Cash · Full settlement',
        amount: 640,
        paymentMethod: 'Cash',
        counterName: 'Counter 02',
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
        counterName: 'Main Counter',
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

export type ExpenseFrequency = 'daily' | 'monthly';

export type DailyExpenseCategory =
  | 'Shop Guests & Refreshments (Tea/Water)'
  | 'Generator Fuel / Petrol'
  | 'Packaging / Shoppers & Thermal Rolls'
  | 'Freight / Loading & Rickshaw'
  | 'Store Cleaning & Maintenance'
  | 'Misc Daily Counter Expense';

export type MonthlyExpenseCategory =
  | 'Shop Rent'
  | 'Electricity Bill (MEPCO)'
  | 'Staff Salaries & Wages'
  | 'Internet / Software / Phone Bill'
  | 'Drug Licence / Tax & Legal'
  | 'Misc Monthly Fixed Cost';

export interface ExpenseRecord {
  id: string;
  monthKey: string; // Format: 'YYYY-MM' (e.g. '2026-11')
  date: string; // ISO date or YYYY-MM-DD
  frequency: ExpenseFrequency;
  category: DailyExpenseCategory | MonthlyExpenseCategory | string;
  title: string;
  amount: number;
  paidBy: string;
  counterName?: string; // Counter drawer from which daily cash expense was paid
  paymentMethod: 'Cash' | 'EasyPaisa' | 'JazzCash' | 'Bank Transfer';
  note?: string;
  createdAt: string;
}

export interface MonthlyAuditSnapshot {
  monthKey: string; // 'YYYY-MM' (e.g. '2026-11')
  monthLabel: string; // e.g. 'November 2026'
  totalSalesCount: number;
  grossRevenue: number;
  grossSalesProfit: number; // Taken directly from POS sales profit
  totalDiscountsGiven: number;
  dailyExpensesTotal: number;
  monthlyExpensesTotal: number;
  totalExpenses: number;
  netTakeHomeProfit: number; // grossSalesProfit - totalExpenses
  profitMarginPercent: number;
  isClosed: boolean; // True when owner locks/archives the month
  closedAt?: string;
  notes?: string;
}

export interface ShortBookEntry {
  id: string;
  itemName: string;
  strengthOrPack?: string;
  supplierName?: string;
  requestedPacks: number;
  requestCount: number; // Number of times patients asked for this item at the counter
  priority: 'normal' | 'urgent';
  status: 'pending' | 'ordered';
  linkedMedicineId?: string;
  addedBy: string;
  counterName?: string;
  customerNote?: string;
  createdAt: string;
  updatedAt: string;
  orderedAt?: string;
}

export type SupplierPaymentMethod =
  | 'Cash'
  | 'Bank Transfer'
  | 'EasyPaisa'
  | 'JazzCash'
  | 'Cheque'
  | 'Credit';

export interface GRNLineItem {
  medicineId: string;
  medicineName: string;
  strength?: string;
  batchNumber: string;
  expiryDate: string;
  billedPacks: number; // Packs charged on distributor invoice
  bonusPacks: number; // Free trade scheme packs (e.g., +1 in a 10+1 scheme)
  totalPacksReceived: number; // billedPacks + bonusPacks added to inventory
  invoiceTradeRatePerPack: number; // Trade price per billed pack (PKR)
  tradeDiscountPercent: number; // Extra trade discount %
  lineNetTotal: number; // Total payable for this line (PKR)
  effectiveCostPerPack: number; // True unit cost after trade bonus = lineNetTotal / totalPacksReceived
  newRetailMRPPerPack?: number; // Optional updated retail MRP per pack
}

export interface SupplierLedgerEntry {
  id: string;
  type: 'grn_invoice' | 'payment' | 'purchase_return';
  grnNumber?: string;
  supplierInvoiceNumber?: string;
  date: string;
  description: string;
  totalBilledAmount: number; // Payable amount added by this GRN
  paidAmount: number; // Amount paid immediately or via partial payment
  paymentMethod?: SupplierPaymentMethod;
  orderBookerName?: string;
  items?: GRNLineItem[];
  totalBonusPacks?: number;
  totalBonusSavingsValue?: number;
  note?: string;
}

export interface SupplierAccount {
  id: string;
  distributorName: string;
  companyBrands: string;
  orderBookerName: string;
  orderBookerPhone: string;
  visitDay: string;
  address?: string;
  ntnOrLicence?: string;
  balancePayable: number; // >0 means pharmacy owes distributor
  totalPurchasedAmount: number;
  totalPaidAmount: number;
  totalBonusValueSaved: number; // Cumulative PKR saved via 10+1 / 12+2 bonus schemes
  ledger: SupplierLedgerEntry[];
  updatedAt: string;
  createdAt: string;
}

export const INITIAL_SUPPLIER_ACCOUNTS: SupplierAccount[] = [
  {
    id: 'sup_multan_pharma_01',
    distributorName: 'Multan Pharma Distributors',
    companyBrands: 'GSK Pakistan, Sanofi-Aventis, Haleon',
    orderBookerName: 'Tariq Mehmood (Medical Rep)',
    orderBookerPhone: '0300 631 4420',
    visitDay: 'Monday & Thursday',
    address: 'Nishtar Road Pharma Market, Multan',
    ntnOrLicence: 'DL-361-MPD-882',
    balancePayable: 8400,
    totalPurchasedAmount: 18400,
    totalPaidAmount: 10000,
    totalBonusValueSaved: 1560,
    updatedAt: '2026-11-08T14:30:00.000Z',
    createdAt: '2026-10-15T09:00:00.000Z',
    ledger: [
      {
        id: 'sled_mpd_02',
        type: 'payment',
        supplierInvoiceNumber: 'MPD-88410',
        date: '2026-11-08T14:30:00.000Z',
        description: 'Partial payment to Order Booker Tariq Mehmood · Cash',
        totalBilledAmount: 0,
        paidAmount: 5000,
        paymentMethod: 'Cash',
        orderBookerName: 'Tariq Mehmood',
        note: 'Collected on Thursday counter visit',
      },
      {
        id: 'sled_mpd_01',
        type: 'grn_invoice',
        grnNumber: 'GRN-20261105-101',
        supplierInvoiceNumber: 'MPD-88410',
        date: '2026-11-05T11:15:00.000Z',
        description: 'GRN Purchase Invoice · MPD-88410 (30+3 Bonus Scheme)',
        totalBilledAmount: 18400,
        paidAmount: 5000,
        paymentMethod: 'Cash',
        orderBookerName: 'Tariq Mehmood',
        totalBonusPacks: 3,
        totalBonusSavingsValue: 1560,
        note: '10+1 Trade Bonus Scheme applied on Panadol 500mg',
        items: [
          {
            medicineId: 'med_panadol_500',
            medicineName: 'Panadol 500mg',
            strength: '500mg',
            batchNumber: 'B-7041',
            expiryDate: '2027-08-15',
            billedPacks: 30,
            bonusPacks: 3,
            totalPacksReceived: 33,
            invoiceTradeRatePerPack: 520,
            tradeDiscountPercent: 0,
            lineNetTotal: 15600,
            effectiveCostPerPack: 472.73,
            newRetailMRPPerPack: 640,
          },
          {
            medicineId: 'med_flagyl_400',
            medicineName: 'Flagyl 400mg',
            strength: '400mg',
            batchNumber: 'SAN-881',
            expiryDate: '2027-09-30',
            billedPacks: 20,
            bonusPacks: 0,
            totalPacksReceived: 20,
            invoiceTradeRatePerPack: 140,
            tradeDiscountPercent: 0,
            lineNetTotal: 2800,
            effectiveCostPerPack: 140,
            newRetailMRPPerPack: 180,
          },
        ],
      },
    ],
  },
  {
    id: 'sup_ali_brothers_02',
    distributorName: 'Ali Brothers Multan',
    companyBrands: 'Pfizer, GSK Antibiotics, Acon Diagnostics',
    orderBookerName: 'Kashif Raza (Order Booker)',
    orderBookerPhone: '0301 774 9102',
    visitDay: 'Tuesday & Saturday',
    address: 'Outside Bohar Gate Medicine Market, Multan',
    ntnOrLicence: 'DL-361-ABM-419',
    balancePayable: 4680,
    totalPurchasedAmount: 11680,
    totalPaidAmount: 7000,
    totalBonusValueSaved: 780,
    updatedAt: '2026-11-07T16:10:00.000Z',
    createdAt: '2026-10-18T10:00:00.000Z',
    ledger: [
      {
        id: 'sled_abm_01',
        type: 'grn_invoice',
        grnNumber: 'GRN-20261107-102',
        supplierInvoiceNumber: 'ABM-4092',
        date: '2026-11-07T16:10:00.000Z',
        description: 'GRN Purchase Invoice · ABM-4092 (10+1 Bonus on Augmentin & Ponstan)',
        totalBilledAmount: 11680,
        paidAmount: 7000,
        paymentMethod: 'EasyPaisa',
        orderBookerName: 'Kashif Raza',
        totalBonusPacks: 2,
        totalBonusSavingsValue: 780,
        note: 'Part paid via EasyPaisa, balance on 14-day credit',
        items: [
          {
            medicineId: 'med_augmentin_625',
            medicineName: 'Augmentin 625mg',
            strength: '625mg',
            batchNumber: 'B-9912',
            expiryDate: '2027-06-30',
            billedPacks: 20,
            bonusPacks: 1,
            totalPacksReceived: 21,
            invoiceTradeRatePerPack: 390,
            tradeDiscountPercent: 0,
            lineNetTotal: 7800,
            effectiveCostPerPack: 371.43,
            newRetailMRPPerPack: 470,
          },
          {
            medicineId: 'med_ponstan_forte',
            medicineName: 'Ponstan Forte 500mg',
            strength: '500mg',
            batchNumber: 'PNS-712',
            expiryDate: '2027-11-25',
            billedPacks: 10,
            bonusPacks: 1,
            totalPacksReceived: 11,
            invoiceTradeRatePerPack: 388,
            tradeDiscountPercent: 0,
            lineNetTotal: 3880,
            effectiveCostPerPack: 352.73,
            newRetailMRPPerPack: 490,
          },
        ],
      },
    ],
  },
  {
    id: 'sup_getz_south_03',
    distributorName: 'Getz South Punjab',
    companyBrands: 'Getz Pharma (Risek, Getryl, Claritek)',
    orderBookerName: 'Zeeshan Haider (Medical Rep)',
    orderBookerPhone: '0321 681 5530',
    visitDay: 'Wednesday',
    address: 'Industrial Estate Pharma Depot, Multan',
    ntnOrLicence: 'DL-361-GTZ-104',
    balancePayable: 0,
    totalPurchasedAmount: 8700,
    totalPaidAmount: 8700,
    totalBonusValueSaved: 870,
    updatedAt: '2026-11-06T12:00:00.000Z',
    createdAt: '2026-10-20T09:00:00.000Z',
    ledger: [
      {
        id: 'sled_gtz_01',
        type: 'grn_invoice',
        grnNumber: 'GRN-20261106-103',
        supplierInvoiceNumber: 'GTZ-99201',
        date: '2026-11-06T12:00:00.000Z',
        description: 'GRN Purchase Invoice · GTZ-99201 (30+3 Trade Bonus Scheme)',
        totalBilledAmount: 8700,
        paidAmount: 8700,
        paymentMethod: 'Cash',
        orderBookerName: 'Zeeshan Haider',
        totalBonusPacks: 3,
        totalBonusSavingsValue: 870,
        note: 'Settled 100% cash on delivery with 10+1 scheme',
        items: [
          {
            medicineId: 'med_risek_20',
            medicineName: 'Risek 20mg Capsule',
            strength: '20mg',
            batchNumber: 'GET-410',
            expiryDate: '2027-05-10',
            billedPacks: 30,
            bonusPacks: 3,
            totalPacksReceived: 33,
            invoiceTradeRatePerPack: 290,
            tradeDiscountPercent: 0,
            lineNetTotal: 8700,
            effectiveCostPerPack: 263.64,
            newRetailMRPPerPack: 360,
          },
        ],
      },
    ],
  },
];

// --- Daily Galla (Cash Drawer) Closing & Shift Reconciliation ---
export type ShiftSlot = 'Morning Shift' | 'Evening / Night Closing' | 'Full Day Shift';

export type GallaVarianceStatus = 'balanced' | 'shortage' | 'surplus';

export interface GallaDenominationCount {
  n5000: number;
  n1000: number;
  n500: number;
  n100: number;
  n50: number;
  n20: number;
  n10: number;
  coins: number; // Total PKR value in coins
}

export interface LiveGallaCalculation {
  date: string; // 'YYYY-MM-DD'
  counterName: string; // e.g. 'Main Counter', 'Counter 02', or 'All Counters'
  openingFloat: number;
  cashPosSales: number;
  cashPosInvoiceCount: number;
  cashKhataRecoveries: number;
  cashKhataRecoveryCount: number;
  dailyCashExpenses: number;
  dailyCashExpenseCount: number;
  expectedPhysicalCash: number; // Opening Float + Cash POS Sales + Cash Khata Recoveries - Daily Cash Expenses
  digitalPosSales: number; // EasyPaisa / JazzCash / Bank Transfer sales (non-drawer reference)
  creditPosSales: number; // Credit Khata sales (non-drawer reference)
}

export interface GallaClosingRecord {
  id: string;
  closingNumber: string; // e.g. 'GAL-20261108-MC'
  date: string; // 'YYYY-MM-DD'
  counterName: string; // 'Main Counter' | 'Counter 02' | 'Counter 3'
  shiftSlot: ShiftSlot;
  closedByStaff: string;
  closedByRole: UserRole;
  openingFloat: number;
  cashPosSales: number;
  cashPosInvoiceCount: number;
  cashKhataRecoveries: number;
  cashKhataRecoveryCount: number;
  dailyCashExpenses: number;
  dailyCashExpenseCount: number;
  expectedPhysicalCash: number; // Opening Float + Cash POS Sales + Cash Khata Recoveries - Daily Cash Expenses
  actualCashCounted: number;
  varianceAmount: number; // actualCashCounted - expectedPhysicalCash (<0 shortage, >0 surplus, 0 balanced)
  varianceStatus: GallaVarianceStatus;
  cashHandedToOwner: number; // Safe drop / night handover to Dr. Zahid Hussain
  closingFloatKeptInDrawer: number; // Retained in drawer for next morning opening float
  denominations?: GallaDenominationCount;
  digitalSalesReference?: number;
  creditSalesReference?: number;
  note?: string;
  closedAt: string;
}

export const INITIAL_GALLA_CLOSINGS: GallaClosingRecord[] = [
  {
    id: 'gal_seed_main_01',
    closingNumber: 'GAL-20261108-01',
    date: '2026-11-08',
    counterName: 'Main Counter',
    shiftSlot: 'Evening / Night Closing',
    closedByStaff: 'Muhammad Asif (Cashier)',
    closedByRole: 'cashier',
    openingFloat: 5000,
    cashPosSales: 14850,
    cashPosInvoiceCount: 19,
    cashKhataRecoveries: 100,
    cashKhataRecoveryCount: 1,
    dailyCashExpenses: 450,
    dailyCashExpenseCount: 2,
    expectedPhysicalCash: 19500, // 5000 + 14850 + 100 - 450
    actualCashCounted: 19500,
    varianceAmount: 0,
    varianceStatus: 'balanced',
    cashHandedToOwner: 14500,
    closingFloatKeptInDrawer: 5000,
    denominations: {
      n5000: 2,
      n1000: 6,
      n500: 5,
      n100: 8,
      n50: 3,
      n20: 2,
      n10: 1,
      coins: 0,
    },
    digitalSalesReference: 2400,
    creditSalesReference: 940,
    note: 'Night Galla tallied 100% with physical count. Rs. 14,500 handed over to Dr. Zahid Hussain.',
    closedAt: '2026-11-08T22:15:00.000Z',
  },
  {
    id: 'gal_seed_cnt02_02',
    closingNumber: 'GAL-20261108-02',
    date: '2026-11-08',
    counterName: 'Counter 02',
    shiftSlot: 'Evening / Night Closing',
    closedByStaff: 'Dr. Bilal Ahmad (Pharmacist)',
    closedByRole: 'pharmacist',
    openingFloat: 3000,
    cashPosSales: 8920,
    cashPosInvoiceCount: 12,
    cashKhataRecoveries: 640,
    cashKhataRecoveryCount: 1,
    dailyCashExpenses: 200,
    dailyCashExpenseCount: 1,
    expectedPhysicalCash: 12360, // 3000 + 8920 + 640 - 200
    actualCashCounted: 12240,
    varianceAmount: -120,
    varianceStatus: 'shortage',
    cashHandedToOwner: 9240,
    closingFloatKeptInDrawer: 3000,
    denominations: {
      n5000: 1,
      n1000: 5,
      n500: 3,
      n100: 6,
      n50: 2,
      n20: 2,
      n10: 0,
      coins: 0,
    },
    digitalSalesReference: 1150,
    creditSalesReference: 640,
    note: 'Minor loose change shortage of Rs. 120 during evening rush hour on Counter 02.',
    closedAt: '2026-11-08T22:20:00.000Z',
  },
  {
    id: 'gal_seed_main_03',
    closingNumber: 'GAL-20261107-01',
    date: '2026-11-07',
    counterName: 'Main Counter',
    shiftSlot: 'Full Day Shift',
    closedByStaff: 'Dr. Zahid Hussain',
    closedByRole: 'owner',
    openingFloat: 5000,
    cashPosSales: 18400,
    cashPosInvoiceCount: 24,
    cashKhataRecoveries: 250,
    cashKhataRecoveryCount: 1,
    dailyCashExpenses: 600,
    dailyCashExpenseCount: 2,
    expectedPhysicalCash: 23050, // 5000 + 18400 + 250 - 600
    actualCashCounted: 23100,
    varianceAmount: 50,
    varianceStatus: 'surplus',
    cashHandedToOwner: 18100,
    closingFloatKeptInDrawer: 5000,
    digitalSalesReference: 3100,
    creditSalesReference: 1440,
    note: 'Rs. 50 surplus from uncollected loose coins.',
    closedAt: '2026-11-07T22:05:00.000Z',
  },
];




