import { UserRole } from '../types/pharmacy';

export interface RoleDetail {
  role: UserRole;
  label: string;
  badgeColor: string;
  description: string;
  permissions: {
    canDispense: boolean;
    canViewInventory: boolean;
    canEditInventory: boolean;
    canDeleteInventory: boolean;
    canViewReports: boolean;
    canViewProfits: boolean;
    canManageStaff: boolean;
    canExportExcel: boolean;
    canPrintLabels: boolean;
    canAccessSettings: boolean;
  };
}

export const ROLE_INFO: Record<UserRole, RoleDetail> = {
  owner: {
    role: 'owner',
    label: 'Chief Pharmacist / Owner',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'Full administrative access: pricing, profit analysis, stock adjustment, audits, and staff management.',
    permissions: {
      canDispense: true,
      canViewInventory: true,
      canEditInventory: true,
      canDeleteInventory: true,
      canViewReports: true,
      canViewProfits: true,
      canManageStaff: true,
      canExportExcel: true,
      canPrintLabels: true,
      canAccessSettings: true,
    },
  },
  pharmacist: {
    role: 'pharmacist',
    label: 'Registered Pharmacist',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Clinical dispense, stock editing, receipt printing, and expiry management.',
    permissions: {
      canDispense: true,
      canViewInventory: true,
      canEditInventory: true,
      canDeleteInventory: false,
      canViewReports: true,
      canViewProfits: false,
      canManageStaff: false,
      canExportExcel: true,
      canPrintLabels: true,
      canAccessSettings: false,
    },
  },
  cashier: {
    role: 'cashier',
    label: 'Counter Cashier',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'POS sales, barcode scanning, cash tender, and receipt generation only.',
    permissions: {
      canDispense: true,
      canViewInventory: true,
      canEditInventory: false,
      canDeleteInventory: false,
      canViewReports: false,
      canViewProfits: false,
      canManageStaff: false,
      canExportExcel: false,
      canPrintLabels: false,
      canAccessSettings: false,
    },
  },
};

export function can(role: UserRole, action: keyof RoleDetail['permissions']): boolean {
  const detail = ROLE_INFO[role];
  if (!detail) return false;
  return !!detail.permissions[action];
}

export function canOpenTab(role: UserRole, tab: string): boolean {
  if (role === 'owner') return true;
  if (role === 'pharmacist') {
    return ['dashboard', 'pos', 'inventory', 'reports'].includes(tab);
  }
  if (role === 'cashier') {
    return ['pos', 'inventory'].includes(tab);
  }
  return false;
}

export function defaultTabFor(role: UserRole): string {
  if (role === 'cashier') return 'pos';
  return 'dashboard';
}
