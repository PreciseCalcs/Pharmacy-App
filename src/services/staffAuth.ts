import { UserAccount, UserRole } from '../types/pharmacy';

const STAFF_STORAGE_KEY = 'zahid_med_users_v2';
const ACTIVE_USER_KEY = 'zahid_active_user_v2';
const LOCK_STATE_KEY = 'zahid_screen_locked_v2';

const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'usr_owner_01',
    name: 'Dr. Zahid Hussain (RPh)',
    role: 'owner',
    pin: '7788',
    phone: '03067617080',
    isActive: true,
  },
  {
    id: 'usr_pharma_02',
    name: 'Duty Pharmacist',
    role: 'pharmacist',
    pin: '1234',
    phone: '03001234567',
    isActive: true,
  },
  {
    id: 'usr_cash_03',
    name: 'Counter Cashier',
    role: 'cashier',
    pin: '0000',
    phone: '03019876543',
    isActive: true,
  },
];

class StaffAuthService {
  private users: UserAccount[] = [];
  private currentUser: UserAccount | null = null;
  private locked: boolean = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(STAFF_STORAGE_KEY);
      if (saved) {
        this.users = JSON.parse(saved);
      } else {
        this.users = [...DEFAULT_USERS];
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(this.users));
      }

      const activeId = localStorage.getItem(ACTIVE_USER_KEY);
      if (activeId) {
        this.currentUser = this.users.find((u) => u.id === activeId) || this.users[0];
      } else {
        this.currentUser = this.users[0];
        localStorage.setItem(ACTIVE_USER_KEY, this.currentUser.id);
      }

      const lockState = localStorage.getItem(LOCK_STATE_KEY);
      this.locked = lockState === 'true';
    } catch (e) {
      this.users = [...DEFAULT_USERS];
      this.currentUser = this.users[0];
    }
  }

  public getStaffList(): UserAccount[] {
    return [...this.users];
  }

  public getCurrentUser(): UserAccount {
    if (!this.currentUser) {
      this.currentUser = this.users[0] || DEFAULT_USERS[0];
    }
    return this.currentUser;
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public setLock(state: boolean): void {
    this.locked = state;
    try {
      localStorage.setItem(LOCK_STATE_KEY, state ? 'true' : 'false');
    } catch {}
  }

  public verifyPin(pin: string): UserAccount | null {
    const user = this.users.find((u) => u.pin === pin && u.isActive);
    return user || null;
  }

  public unlock(pin: string): { success: boolean; user?: UserAccount; message?: string } {
    const user = this.verifyPin(pin);
    if (!user) {
      return { success: false, message: 'Invalid security PIN' };
    }
    this.currentUser = user;
    this.setLock(false);
    try {
      localStorage.setItem(ACTIVE_USER_KEY, user.id);
    } catch {}
    return { success: true, user };
  }

  public switchUser(pin: string): { success: boolean; user?: UserAccount; message?: string } {
    const user = this.verifyPin(pin);
    if (!user) {
      return { success: false, message: 'Incorrect PIN. Please re-enter.' };
    }
    this.currentUser = user;
    try {
      localStorage.setItem(ACTIVE_USER_KEY, user.id);
    } catch {}
    return { success: true, user };
  }

  public changePin(
    userId: string,
    oldPin: string,
    newPin: string
  ): { success: boolean; message: string } {
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    if (user.pin !== oldPin) {
      return { success: false, message: 'Current PIN is incorrect' };
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      return { success: false, message: 'New PIN must be 4 to 6 numeric digits' };
    }

    user.pin = newPin;
    this.saveUsers();
    return { success: true, message: 'Security PIN updated successfully' };
  }

  public addStaff(data: Omit<UserAccount, 'id'>): { success: boolean; message?: string } {
    if (this.users.some((u) => u.pin === data.pin)) {
      return { success: false, message: 'PIN is already in use by another staff member' };
    }

    const newUser: UserAccount = {
      ...data,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.users.push(newUser);
    this.saveUsers();
    return { success: true };
  }

  public updateStaff(user: UserAccount): { success: boolean; message?: string } {
    const conflict = this.users.some((u) => u.id !== user.id && u.pin === user.pin);
    if (conflict) {
      return { success: false, message: 'PIN is already in use by another staff member' };
    }

    this.users = this.users.map((u) => (u.id === user.id ? user : u));
    if (this.currentUser?.id === user.id) {
      this.currentUser = user;
    }
    this.saveUsers();
    return { success: true };
  }

  public deleteStaff(userId: string): { success: boolean; message?: string } {
    if (this.users.length <= 1) {
      return { success: false, message: 'Cannot delete the sole remaining staff account' };
    }
    if (this.currentUser?.id === userId) {
      return { success: false, message: 'Cannot delete the currently logged in user' };
    }

    this.users = this.users.filter((u) => u.id !== userId);
    this.saveUsers();
    return { success: true };
  }

  private saveUsers(): void {
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(this.users));
    } catch {}
  }
}

export const staffAuth = new StaffAuthService();
